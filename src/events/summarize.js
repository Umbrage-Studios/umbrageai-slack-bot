const app = require("#configs/app");
const cache = require("#configs/cache");
const { openAICommand } = require("#configs/openai");
const { appLogger: logger } = require("#configs/logger");
const { getThreadMessages } = require("#helpers/slack");

app.shortcut("summarize", async ({ shortcut, ack, client }) => {
  logger.debug("/summarize", shortcut);

  const channelId = shortcut.channel.id;
  const threadTs = shortcut.message.thread_ts ?? shortcut.message.ts;
  const privateMetadata = JSON.stringify({ channelId, threadTs });

  try {
    // Acknowledge shortcut request
    await ack();

    // Call the views.open method using one of the built-in WebClients
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: {
        type: "modal",
        callback_id: "summarize_submission",
        private_metadata: privateMetadata,
        title: {
          type: "plain_text",
          text: "Summarize",
        },
        blocks: [
          {
            type: "input",
            block_id: "select-lang-input",
            element: {
              type: "radio_buttons",
              options: [
                {
                  text: {
                    type: "plain_text",
                    text: "English",
                    emoji: true,
                  },
                  value: "en",
                },
                {
                  text: {
                    type: "plain_text",
                    text: "Spanish",
                    emoji: true,
                  },
                  value: "es",
                },
                {
                  text: {
                    type: "plain_text",
                    text: "Portuguese",
                    emoji: true,
                  },
                  value: "pt",
                },
                {
                  text: {
                    type: "plain_text",
                    text: "Turkish",
                    emoji: true,
                  },
                  value: "tr",
                },
              ],
              action_id: "select-lang-action",
            },
            label: {
              type: "plain_text",
              text: "Select summarizing in which language:",
              emoji: true,
            },
          },
        ],
        submit: {
          type: "plain_text",
          text: "Submit",
        },
      },
    });
  } catch (error) {
    logger.error(error);

    await client.chat.postMessage({
      channel: channelId,
      ...(threadTs && { thread_ts: threadTs }),
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Oops, something went wrong opening the summarize dialog 😭. Please try again later.",
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Error: \`${error.message || 'Unknown error'}\``
            }
          ]
        }
      ],
      text: "Oops, something went wrong opening the summarize dialog 😭. Please try again later.",
    });
  }
});

app.view("summarize_submission", async ({ ack, body, client }) => {
  logger.debug("summarize_submission", body);

  const { private_metadata, state } = body.view;
  const { channelId, threadTs } = JSON.parse(private_metadata);
  const locale =
    state.values["select-lang-input"]["select-lang-action"].selected_option
      .value;

  try {
    await ack();

    // Send loading message
    const loadingMessage = await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: "Generating summary... 🤔",
    });

    const messages = await getThreadMessages(channelId, threadTs, {
      client,
      cache,
    });
    const answer = await openAICommand.summarizeConversations(locale, messages);
    
    // Delete loading message
    await client.chat.delete({
      channel: channelId,
      ts: loadingMessage.ts,
    });

    // Get language display name
    const languageNames = {
      en: "English",
      es: "Spanish",
      pt: "Portuguese",
      tr: "Turkish"
    };

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `Summary: ${answer}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Summary* (${languageNames[locale] || locale}):\n${answer}`,
          },
        },
      ],
    });

    logger.debug("/summarize completed");
  } catch (error) {
    logger.error(error);

    // Since we're summarizing a thread, we should always have threadTs here
    // But adding a fallback just in case
    await client.chat.postMessage({
      channel: channelId,
      ...(threadTs && { thread_ts: threadTs }),
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Oops, something went wrong when summarizing the thread 😭. Please try again later.",
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Error: \`${error.message || 'Unknown error'}\``
            }
          ]
        }
      ],
      // Fallback text for notifications
      text: "Oops, something went wrong when summarizing the thread 😭. Please try again later.",
    });
  }
});
