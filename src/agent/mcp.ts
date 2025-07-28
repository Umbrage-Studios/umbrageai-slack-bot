import { experimental_createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { Client } from '@modelcontextprotocol/sdk/client/index';

/**
 * Create MCP client with proper StreamableHTTP transport
 * This connects to the Outlook MCP server for calendar operations
 */
export async function createMCPClient() {
  const mcpUrl = 'https://outlook-remote-mcp-server.onrender.com/mcp';
  const mcpApiKey = process.env.API_KEY;
  
  if (!mcpApiKey) {
    throw new Error('API_KEY environment variable is not set');
  }
  
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
}