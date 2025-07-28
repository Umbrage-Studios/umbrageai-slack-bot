/**
 * Create MCP client with proper StreamableHTTP transport
 * This connects to the Outlook MCP server for calendar operations
 * 
 * NOTE: Now using proper ESM imports since TypeScript outputs ESM
 */
export async function createMCPClient() {
  const mcpUrl = 'https://outlook-remote-mcp-server.onrender.com/mcp';
  const mcpApiKey = process.env.API_KEY;
  
  if (!mcpApiKey) {
    throw new Error('API_KEY environment variable is not set');
  }
  
  try {
    // ESM imports should work now that TypeScript outputs ESM
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index');
    
    console.log('✅ MCP SDK modules loaded successfully');
    
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

    console.log('✅ MCP transport created, attempting connection...');

    // Connect the client to the transport
    await client.connect(transport);

    console.log('✅ MCP client connected successfully');
    return client;
  } catch (error) {
    console.error('❌ MCP client creation failed:', error);
    
    // Handle module loading errors gracefully
    if (error instanceof Error && (
      error.message.includes('Cannot find module') ||
      error.message.includes('ERR_MODULE_NOT_FOUND') ||
      error.message.includes('ERR_REQUIRE_ESM')
    )) {
      console.warn('⚠️ MCP SDK module loading issue. Running without calendar integration.');
      throw new Error('MCP SDK module loading failed - check ESM/CommonJS compatibility');
    }
    
    // Network or authentication errors
    if (error instanceof Error && (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('timeout')
    )) {
      throw new Error(`MCP server connection failed: ${error.message}`);
    }
    
    // Re-throw other errors with more context
    throw new Error(`MCP client setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}