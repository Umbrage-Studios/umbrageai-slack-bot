const app = require("#configs/app");
const { appLogger: logger } = require("#configs/logger");
const generateEvents = require("#events/generateEvents");
const { joinPublicChannels } = require("#helpers/slack");

generateEvents();

async function shutdown() {
  const timeout = setTimeout(() => {
    logger.error("Stop server timed out, force exit");
    process.exit(1);
  }, 3000);
  logger.log("Stopping server ...");
  await app.stop();
  clearTimeout(timeout);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGBREAK", shutdown);
process.on("unhandledRejection", (error) => {
  logger.error("Unhandled rejection: ", error);
  process.exit(1);
});

(async () => {
  // Start your app
  await app.start();

  // Join all public channels
  try {
    await joinPublicChannels(app.client);
    logger.log("🎉 Joined all accessible public channels!");
  } catch (error) {
    logger.error("Failed to join public channels:", error);
    // Don't exit - the bot can still function without joining all channels
  }

  logger.log("⚡️ Bolt app is running!");
  logger.log("log level: ", logger.level);
})();
