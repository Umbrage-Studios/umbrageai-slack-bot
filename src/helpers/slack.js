const { log4js } = require("#configs/logger");
const logger = log4js.getLogger("slack");

const pagination = (func, params, key) => {
  const limit = 1000;
  const options = {
    limit,
    cursor: undefined,
  };
  const results = [];
  const loop = async () => {
    const res = await func({ ...params, ...options });
    results.push(...res[key]);

    const { response_metadata } = res;
    if (response_metadata && response_metadata.next_cursor) {
      options.cursor = response_metadata.next_cursor;
      await loop();
    }
  };
  return loop().then(() => results);
};

const getThreadMessages = async (channelId, threadTs, { client, cache }) => {
  // Get all replies in the thread
  const replies = await pagination(
    client.conversations.replies,
    {
      channel: channelId,
      ts: threadTs,
    },
    "messages"
  );

  // Construct messages to summarize
  const messages = await Promise.all(
    replies.map(async (message) => {
      let user = cache.get(`user_${message.user}`);
      if (!user) {
        user = await client.users.info({
          user: message.user,
        });

        cache.set(`user_${message.user}`, user, 60 * 60);
      }
      return `${user.user.profile.real_name}: ${message.text}`;
    })
  );

  return messages;
};

const joinPublicChannels = async (client) => {
  try {
    // Get all public channels
    const publicChannels = await pagination(
      client.conversations.list,
      {
        exclude_archived: true,
        types: 'public_channel'
      },
      "channels"
    );

    // Join each channel
    for (const channel of publicChannels) {
      try {
        await client.conversations.join({ channel: channel.id });
        logger.debug(`Successfully joined channel: ${channel.name}`);
      } catch (error) {
        // If we're already in the channel, that's fine - ignore the error
        if (error.data?.error === 'already_in_channel') {
          logger.debug(`Already in channel: ${channel.name}`);
          continue;
        }
        logger.error(`Failed to join channel ${channel.name}:`, error);
      }
    }
  } catch (error) {
    logger.error('Failed to list or join channels:', error);
    throw error;
  }
};

module.exports = {
  pagination,
  getThreadMessages,
  joinPublicChannels
};
