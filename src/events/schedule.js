const app = require("#configs/app");
const { appLogger: logger } = require("#configs/logger");

// Import the agent wrapper that handles ESM/CommonJS compatibility
const { getSchedulingAgent } = require("../agent/wrapper.js");

/**
 * Extract user context from Slack profile with robust fallbacks
 * @param {Object} client - Slack client
 * @param {string} userId - Slack user ID
 * @returns {Promise<Object>} User context with fullName, email, and debug info
 */
async function extractUserContext(client, userId) {
  try {
    const userProfile = await client.users.info({ user: userId });
    const user = userProfile.user;

    // Extract all available name fields for fallbacks
    const profileFirstName = user.profile?.first_name;
    const profileLastName = user.profile?.last_name;
    const displayName = user.profile?.display_name;
    const realName = user.profile?.real_name || user.real_name;
    const username = user.name; // @username
    const email = user.profile?.email;

    // Log what we received for debugging
    logger.debug("Raw Slack profile data:", {
      userId,
      profileFirstName,
      profileLastName,
      displayName,
      realName,
      username,
      email: email ? `${email.substring(0, 3)}***` : "none", // Partial for privacy
      isBot: user.is_bot,
      isDeleted: user.deleted,
    });

    // Simple name extraction - prioritizing real name (matches Azure AD exactly)
    let fullName = "";
    let nameSource = "";

    if (realName) {
      // BEST: Use real name as is (matches Azure AD)
      fullName = realName.trim();
      nameSource = "real_name_AD_match";
    } else if (profileFirstName && profileLastName) {
      // Second: Combine profile first/last names
      fullName = `${profileFirstName} ${profileLastName}`.trim();
      nameSource = "profile_names_combined";
    } else if (profileFirstName) {
      // Third: Just profile first name
      fullName = profileFirstName.trim();
      nameSource = "profile_first_only";
    } else if (displayName) {
      // Fourth: Use display name
      fullName = displayName.trim();
      nameSource = "display_name";
    } else {
      // Last resort: use username
      fullName = username || "User";
      nameSource = "username_fallback";
    }

    const userContext = {
      fullName: fullName,
      email: email || "",
      // Debug info for troubleshooting
      _debug: {
        userId,
        hasEmail: !!email,
        nameSource: nameSource,
        originalRealName: realName,
        originalDisplayName: displayName,
        username,
      },
    };

    // Validation and warnings
    if (!userContext.fullName) {
      logger.warn("Could not extract any name for user:", userId);
    }

    if (!userContext.email) {
      logger.warn("No email found for user:", {
        userId,
        name: userContext.fullName,
      });
    }

    logger.debug("Final user context:", {
      fullName: userContext.fullName,
      hasEmail: !!userContext.email,
      nameSource: userContext._debug.nameSource,
    });

    return userContext;
  } catch (error) {
    logger.error("Failed to extract user context:", error);

    // Return minimal fallback context
    return {
      fullName: "User",
      email: "",
      _debug: {
        userId,
        error: error.message,
        nameSource: "error_fallback",
      },
    };
  }
}

app.command("/schedule", async ({ command, ack, client, respond }) => {
  logger.debug("/schedule command", command);

  try {
    // Acknowledge the command immediately
    await ack();

    // Get robust user profile information for context
    const userContext = await extractUserContext(client, command.user_id);

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
      userContext: {
        fullName: userContext.fullName,
        hasEmail: userContext.email || "",
        nameSource: userContext._debug?.nameSource,
      },
    });
    const agent = await getSchedulingAgent();
    const agentResult = await agent.runSchedulingAgent(
      scheduleText,
      userContext
    );
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
app.shortcut("schedule_meeting", async ({ shortcut, ack, client }) => {
  logger.debug("schedule_meeting shortcut", shortcut);

  try {
    await ack();

    // Get robust user profile information
    const userContext = await extractUserContext(client, shortcut.user.id);

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

    logger.debug("Schedule submission:", {
      scheduleText,
      userContext: {
        fullName: user_context.fullName,
        hasEmail: user_context.email || "",
        nameSource: user_context._debug?.nameSource,
      },
    });

    // Use the Groq-powered scheduling agent with MCP integration
    logger.debug("Running Groq scheduling agent via modal with:", {
      scheduleText,
      user_context,
    });
    const agent = await getSchedulingAgent();
    const agentResult = await agent.runSchedulingAgent(
      scheduleText,
      user_context
    );

    // Post result to channel or DM
    const targetChannel = channel_id || body.user.id; // Use channel or DM to user

    await client.chat.postMessage({
      channel: targetChannel,
      text: `🗓️ **Schedule Request from ${user_context.fullName}:**\n\n"${scheduleText}"\n\n${agentResult.text}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🗓️ **Schedule Request from ${user_context.fullName}:**`,
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
