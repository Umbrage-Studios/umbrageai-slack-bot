const app = require("#configs/app");
const cache = require("#configs/cache");
const { openAICommand } = require("#configs/openai");
const { appLogger: logger } = require("#configs/logger");
const { getThreadMessages } = require("#helpers/slack");

app.shortcut("ask", async ({ shortcut, ack, client }) => {
  logger.debug("/ask", shortcut);

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
        callback_id: "ask_submission",
        private_metadata: privateMetadata,
        title: {
          type: "plain_text",
          text: "Ask",
        },
        blocks: [
          {
            type: "input",
            block_id: "ask-input",
            element: {
              type: "plain_text_input",
              multiline: true,
              action_id: "ask-input-action",
            },
            label: {
              type: "plain_text",
              text: "Ask a question about the thread:",
              emoji: true,
            },
          },
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
              text: "Select response in which language:",
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
      thread_ts: threadTs,
      text: "Oops, something went wrong opening the ask dialog 😭. Please try again later.",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Oops, something went wrong opening the ask dialog 😭. Please try again later.",
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
    });
  }
});

app.view("ask_submission", async ({ ack, body, client }) => {
  logger.debug("ask_submission", body);

  const { private_metadata, state } = body.view;
  const { channelId, threadTs } = JSON.parse(private_metadata);
  const question = state.values["ask-input"]["ask-input-action"].value;
  const locale =
    state.values["select-lang-input"]["select-lang-action"].selected_option
      .value;

  try {
    await ack();

    // Send loading message
    const loadingMessage = await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: "Processing your question... 🤔",
    });

    const messages = await getThreadMessages(channelId, threadTs, {
      client,
      cache,
    });
    const answer = await openAICommand.askQuestionInTheThread(
      locale,
      question,
      messages
    );

    // Delete loading message
    await client.chat.delete({
      channel: channelId,
      ts: loadingMessage.ts,
    });

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `Question: ${question}\nAnswer: ${answer}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Question:*\n${question}\n\n*Answer:*\n${answer}`,
          },
        },
      ],
    });

    logger.debug("/ask completed");
  } catch (error) {
    logger.error(error);

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: "Oops, something went wrong answering your question 😭. Please try again later.",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Oops, something went wrong answering your question 😭. Please try again later.",
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
    });
  }
});
