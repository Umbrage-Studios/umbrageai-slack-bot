const app = require("#configs/app");
const { appLogger: logger } = require("#configs/logger");

// Import the compiled TypeScript agent with full MCP integration
const { runSchedulingAgent } = require("../../dist/agent/index.js");

app.command("/schedule", async ({ command, ack, client, respond }) => {
  logger.debug("/schedule command", command);

  try {
    // Acknowledge the command immediately
    await ack();

    // Get user profile information for context
    const userProfile = await client.users.info({ user: command.user_id });
    const userContext = {
      firstName:
        userProfile.user.profile.first_name ||
        userProfile.user.real_name?.split(" ")[0] ||
        "",
      lastName:
        userProfile.user.profile.last_name ||
        userProfile.user.real_name?.split(" ").slice(1).join(" ") ||
        "",
      email: userProfile.user.profile.email || "",
    };

    logger.debug("User context extracted:", userContext);

    // Send initial loading message
    const loadingMessage = await respond({
      text: "🤔 Working on your scheduling request...",
      response_type: "ephemeral", // Only visible to the user
    });

    const scheduleText = command.text.trim();

    if (!scheduleText) {
      await respond({
        text: "❌ Please provide scheduling details. Example: `/schedule meeting with John tomorrow at 2pm EST`",
        response_type: "ephemeral",
      });
      return;
    }

    // Use the Groq-powered scheduling agent with MCP integration
    logger.debug("Running Groq scheduling agent with:", {
      scheduleText,
      userContext,
    });
    const agentResult = await runSchedulingAgent(scheduleText, userContext);
    const response = agentResult.text;

    // Send the response
    await respond({
      text: response,
      response_type: "ephemeral",
    });

    logger.debug("/schedule completed successfully");
  } catch (error) {
    logger.error("Error in /schedule command:", error);

    await respond({
      text: "❌ Sorry, something went wrong processing your scheduling request. Please try again.",
      response_type: "ephemeral",
    });
  }
});

// Also handle the schedule command as a shortcut from messages
app.shortcut("schedule", async ({ shortcut, ack, client }) => {
  logger.debug("schedule shortcut", shortcut);

  try {
    await ack();

    // Get user profile
    const userProfile = await client.users.info({ user: shortcut.user.id });
    const userContext = {
      firstName:
        userProfile.user.profile.first_name ||
        userProfile.user.real_name?.split(" ")[0] ||
        "",
      lastName:
        userProfile.user.profile.last_name ||
        userProfile.user.real_name?.split(" ").slice(1).join(" ") ||
        "",
      email: userProfile.user.profile.email || "",
    };

    // Open a modal for scheduling input
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: {
        type: "modal",
        callback_id: "schedule_submission",
        private_metadata: JSON.stringify({
          channel_id: shortcut.channel?.id,
          user_context: userContext,
        }),
        title: {
          type: "plain_text",
          text: "Schedule Meeting",
        },
        blocks: [
          {
            type: "input",
            block_id: "schedule_input",
            element: {
              type: "plain_text_input",
              multiline: true,
              action_id: "schedule_input_action",
              placeholder: {
                type: "plain_text",
                text: "Example: Schedule a team standup with John and Sarah tomorrow at 10am EST",
              },
            },
            label: {
              type: "plain_text",
              text: "Describe the meeting you want to schedule:",
              emoji: true,
            },
          },
        ],
        submit: {
          type: "plain_text",
          text: "Schedule",
        },
        close: {
          type: "plain_text",
          text: "Cancel",
        },
      },
    });
  } catch (error) {
    logger.error("Error in schedule_meeting shortcut:", error);
  }
});

// Handle the modal submission
app.view("schedule_submission", async ({ ack, body, client }) => {
  logger.debug("schedule_submission", body);

  try {
    await ack();

    const { private_metadata, state } = body.view;
    const { channel_id, user_context } = JSON.parse(private_metadata);
    const scheduleText =
      state.values["schedule_input"]["schedule_input_action"].value;

    logger.debug("Schedule submission:", { scheduleText, user_context });

    // Use the Groq-powered scheduling agent with MCP integration
    logger.debug("Running Groq scheduling agent via modal with:", {
      scheduleText,
      user_context,
    });
    const agentResult = await runSchedulingAgent(scheduleText, user_context);

    // Post result to channel or DM
    const targetChannel = channel_id || body.user.id; // Use channel or DM to user

    await client.chat.postMessage({
      channel: targetChannel,
      text: `🗓️ **Schedule Request from ${user_context.firstName} ${user_context.lastName}:**\n\n"${scheduleText}"\n\n${agentResult.text}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🗓️ **Schedule Request from ${user_context.firstName} ${user_context.lastName}:**`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Request:* "${scheduleText}"`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: agentResult.text,
          },
        },
      ],
    });

    logger.debug("Schedule submission completed");
  } catch (error) {
    logger.error("Error in schedule_submission:", error);

    // Try to send error message to user
    await client.chat.postMessage({
      channel: body.user.id,
      text: "❌ Sorry, something went wrong processing your scheduling request. Please try again.",
    });
  }
});
