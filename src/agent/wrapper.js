/**
 * CommonJS wrapper for ESM agent modules
 * This allows the CommonJS codebase to use the ESM-compiled TypeScript modules
 */

async function createAgentWrapper() {
  try {
    // Dynamic import of the ESM module
    const agentModule = await import("../../dist/agent/index.js");
    return {
      runSchedulingAgent: agentModule.runSchedulingAgent,
    };
  } catch (error) {
    console.error("Failed to load agent module:", error);
    // Return a fallback function
    return {
      runSchedulingAgent: async (userInput, userContext) => {
        return {
          text: `❌ **Agent Loading Error**

Sorry, the scheduling agent could not be loaded due to a module compatibility issue.

**Error:** ${error.message}

**Temporary workaround:** The development team is working on resolving the ESM/CommonJS compatibility issue. Please try again later or contact support.

**Your request:** "${userInput}"
**User:** ${userContext?.fullName}`,
          mcpStatus: "Agent module failed to load",
        };
      },
    };
  }
}

// Cache the agent wrapper to avoid repeated imports
let cachedAgent = null;

async function getSchedulingAgent() {
  if (!cachedAgent) {
    cachedAgent = await createAgentWrapper();
  }
  return cachedAgent;
}

module.exports = {
  getSchedulingAgent,
};
