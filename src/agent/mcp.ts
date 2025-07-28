/**
 * Create MCP client with proper StreamableHTTP transport
 * This connects to the Outlook MCP server for calendar operations
 * 
 * NOTE: Uses dynamic imports to handle ESM/CJS compatibility issues
 */
export async function createMCPClient() {
  const mcpUrl = 'https://outlook-remote-mcp-server.onrender.com/mcp';
  const mcpApiKey = process.env.API_KEY;
  
  if (!mcpApiKey) {
    throw new Error('API_KEY environment variable is not set');
  }
  
  try {
    // Dynamic imports to handle ESM/CJS compatibility
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index');
    
    // Create the MCP client using the official SDK
    const client = new Client({
      name: 'umbrage-slack-agent',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    // Set up error handler
    client.onerror = (error) => {
      console.error('MCP Client error:', error);
    };

    // Create transport with authentication headers
    const transport = new StreamableHTTPClientTransport(
      new URL(mcpUrl),
      {
        sessionId: 'slack_agent_' + Date.now(),
        requestInit: {
          headers: {
            'X-API-KEY': mcpApiKey,
            'Content-Type': 'application/json',
          },
        },
      }
    );

    // Connect the client to the transport
    await client.connect(transport);

    return client;
  } catch (error) {
    // Handle module loading errors gracefully
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      console.warn('⚠️ MCP SDK not available (likely ESM/CJS compatibility issue). Running without calendar integration.');
      throw new Error('MCP SDK not available - ESM/CJS compatibility issue');
    }
    // Re-throw other errors
    throw error;
  }
}