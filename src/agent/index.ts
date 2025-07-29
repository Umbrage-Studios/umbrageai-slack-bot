import { groq } from '@ai-sdk/groq';
import { generateText, experimental_createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

/**
 * Timezone conversion tool - simplified for beta AI SDK compatibility
 */
const timezoneConversionTool = {
  description: 'Convert datetime between timezones',
  parameters: z.object({
    datetime_str: z.string(),
    from_timezone: z.string(),
    to_timezone: z.string(),
  }),
  execute: async (params: any) => {
    const { datetime_str, from_timezone, to_timezone } = params;
    try {
      // Normalize timezone names
      const timezoneMap: Record<string, string> = {
        'eastern': 'America/New_York',
        'central': 'America/Chicago', 
        'pacific': 'America/Los_Angeles',
        'utc': 'UTC',
        'est': 'America/New_York',
        'cst': 'America/Chicago',
        'pst': 'America/Los_Angeles',
      };
      
      const fromTz = timezoneMap[from_timezone.toLowerCase()] || from_timezone;
      const toTz = timezoneMap[to_timezone.toLowerCase()] || to_timezone;
      
      // Parse the input datetime
      let inputDate: Date;
      if (datetime_str.includes('T') || datetime_str.includes('Z')) {
        // ISO format
        inputDate = new Date(datetime_str);
      } else {
        // "YYYY-MM-DD HH:MM:SS" format - assume it's in the source timezone
        inputDate = new Date(datetime_str + (fromTz === 'UTC' ? 'Z' : ''));
      }
      
      if (isNaN(inputDate.getTime())) {
        return { error: `Invalid datetime format: ${datetime_str}` };
      }
      
      // Convert to target timezone
      const converted = new Intl.DateTimeFormat('en-CA', {
        timeZone: toTz,
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(inputDate);
      
      const convertedStr = `${converted.find(p => p.type === 'year')?.value}-${converted.find(p => p.type === 'month')?.value}-${converted.find(p => p.type === 'day')?.value} ${converted.find(p => p.type === 'hour')?.value}:${converted.find(p => p.type === 'minute')?.value}:${converted.find(p => p.type === 'second')?.value}`;
      
      // For UTC output, add Z suffix for ISO format
      const result = toTz === 'UTC' ? convertedStr.replace(' ', 'T') + 'Z' : convertedStr;
      
      return {
        original: datetime_str,
        from_timezone: fromTz,
        to_timezone: toTz,
        converted: result,
        iso_format: toTz === 'UTC' ? result : new Date(result).toISOString()
      };
    } catch (error) {
      return { error: `Timezone conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  },
};

/**
 * Create and run the scheduling agent with MCP integration
 */
export async function runSchedulingAgent(
  userInput: string,
  userContext?: UserContext
): Promise<{ text: string; mcpStatus?: string }> {
  let mcpClient: any = null;
  let mcpStatus = "Not connected";
  
  try {
    // Start with timezone conversion tool
    const tools: Record<string, any> = {
      convert_timezone: timezoneConversionTool,
    };
    
    // Try to create MCP client for calendar integration
    try {
      // Use StreamableHTTPClientTransport for the streamable HTTP MCP server
      const httpTransport = new StreamableHTTPClientTransport(
        new URL('https://outlook-remote-mcp-server.onrender.com/mcp'),
        {
          sessionId: 'slack_agent_' + Date.now(),
          requestInit: {
            headers: {
              'X-API-KEY': process.env.API_KEY || '',
              'Content-Type': 'application/json',
            },
          },
        }
      );
      
      mcpClient = await experimental_createMCPClient({
        transport: httpTransport,
      });
      
      mcpStatus = "✅ Connected - calendar operations available";
      console.log('✅ MCP client connected successfully');
      
      // Get MCP tools using the built-in tools() method
      try {
        const mcpTools = await mcpClient.tools();
        console.log(`✅ MCP tools available: ${Object.keys(mcpTools).join(', ')}`);
        
        // Merge MCP tools with our timezone tool
        Object.assign(tools, mcpTools);
        
        mcpStatus = `✅ Connected with tools: ${Object.keys(tools).join(', ')}`;
      } catch (error) {
        console.warn('⚠️ Failed to get MCP tools:', error);
        mcpStatus = "⚠️ Connected but MCP tools unavailable - only timezone conversion available";
      }
    } catch (error) {
      console.warn('⚠️ MCP client connection failed:', error);
      mcpStatus = `❌ MCP connection failed: ${error instanceof Error ? error.message : 'Unknown error'} - only timezone conversion available`;
    }
    
    // Generate system prompt with current context (keeping original unchanged)
    const systemPrompt = generateSystemPrompt(userContext);
    
    // Run the agent with proper AI SDK tool support
    const result = await generateText({
      model: groq('qwen/qwen3-32b'),
      system: systemPrompt,
      prompt: userInput,
      tools, // AI SDK will handle tool calling automatically
    });
    
    return { 
      text: result.text + `\n\n🔧 **System Status:** ${mcpStatus}`,
      mcpStatus 
    };
  } catch (error) {
    console.error('❌ Error in scheduling agent:', error);
    
    return {
      text: `❌ **Error Processing Request**

Sorry, I encountered an issue processing your scheduling request.

**Error details:** ${error instanceof Error ? error.message : 'Unknown error'}
**MCP Status:** ${mcpStatus}

**Please try:**
1. Rephrasing your request
2. Being more specific about time and attendees
3. Contacting support if the issue persists

**Example format:** "/schedule team meeting with John and Sarah tomorrow at 2pm EST"`,
      mcpStatus
    };
  } finally {
    // Clean up MCP client if created
    if (mcpClient) {
      try {
        await mcpClient.close();
      } catch (error) {
        console.warn('Warning: Failed to close MCP client:', error);
      }
    }
  }
}

export interface UserContext {
  fullName: string;
  email: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Generate system prompt with current time context and user info
 */
function generateSystemPrompt(userContext?: UserContext): string {
  // Get current UTC time to inject into system prompt
  const currentUtc = new Date();
  const currentUtcStr = currentUtc.toISOString();
  const currentDateStr = currentUtc.toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  
  const tomorrow = new Date(currentUtc);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateStr = tomorrow.toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  const tomorrowIso = tomorrow.toISOString().split('T')[0];

  // Prepare user context for system prompt
  let userContextPrompt = "";
  if (userContext) {
    const userName = userContext.fullName;
    userContextPrompt = `
SIGNED-IN USER CONTEXT:
- Sign-in User Details: ${userName} - ${userContext.email}
- The organizer for any meetings should be assumed to be the currently signed-in user: ${userName} (${userContext.email})
- When creating calendar events, use this user as the default organizer unless specifically told otherwise
`;
  }

  return `You are a calendar scheduling assistant with access to Outlook calendar tools and time conversion utilities.

CURRENT TIME CONTEXT:
- Current UTC time: ${currentUtcStr}
- Today: ${currentDateStr}
- Tomorrow: ${tomorrowDateStr}
- Use this as your reference for calculating relative dates
${userContextPrompt}
BUSINESS HOURS & SCHEDULING RULES:
- DEFAULT BUSINESS HOURS: 9:00 AM to 5:00 PM (user's local timezone)
- AVOID scheduling meetings before 9:00 AM or after 5:00 PM unless specifically requested
- AVOID weekends (Saturday/Sunday) unless specifically requested
- AVOID major US holidays unless specifically requested:
  * New Year's Day, MLK Day, Presidents Day, Memorial Day, Independence Day, 
  * Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas Day
- When user asks for vague times like "tomorrow morning", default to 9:00 AM-12:00 PM
- When user asks for "afternoon", default to 1:00 PM-5:00 PM
- ALWAYS suggest business-appropriate times if user requests off-hours
- Be clear that this meeting was scheduled by an AI Agent on behalf of someone at Umbrage in the body of the invite but not the title.

USER LOOKUP & EMAIL HANDLING:
- When users mention people by name without email addresses (e.g., "schedule with John", "invite Sarah"):
  * ALWAYS use users.search tool to find the person first
  * Search by the person's name (first name, last name, or full name)
- If search returns multiple matches or you're unsure which person:
  * Ask a follow-up question with the options found
  * Example: "I found 3 people named John: John Smith (Engineering), John Doe (Marketing), John Johnson (Sales). Which one did you mean?"
- If search returns no matches:
  * Ask for clarification: "I couldn't find anyone named [name] in the directory. Could you provide their email address or check the spelling?"
- Only proceed with calendar operations once you have confirmed email addresses

CRITICAL: For ANY date/time related operations, follow this workflow:

1. **Identify attendees** - If names without emails are mentioned, search for users first
2. **Calculate target dates** from the current time provided above
3. **Check business rules** - warn if outside business hours/days unless specifically requested
4. **For relative dates** (like "tomorrow", "next week", "Monday"):
   - Calculate the target date from the current time above
   - Convert user timezone to UTC using convert_timezone() before calling calendar tools
5. **ALL calendar operations use UTC time** - never pass local times to calendar tools
6. **Convert results back** to user's timezone for display (default to Central Time unless specified)

Example for "schedule a meeting with John tomorrow at 10:30 AM EST":
1. Search for "John" using users.search → find John Smith (john.smith@umbrage.com)
2. Tomorrow is ${tomorrowDateStr} (date: ${tomorrowIso})
3. Check: 10:30 AM EST is within business hours (9 AM - 5 PM EST) ✓
4. Call convert_timezone("${tomorrowIso} 10:30:00", "eastern", "utc") → get UTC time
5. Use the UTC time in calendar.create_event with john.smith@umbrage.com as attendee
6. Convert any results back to user's timezone for confirmation

Example for "tomorrow at 7:00 AM EST" (outside business hours):
1. Tomorrow is ${tomorrowDateStr} (date: ${tomorrowIso})  
2. Check: 7:00 AM EST is before business hours (9 AM - 5 PM EST) ❌
3. SUGGEST: "I notice 7:00 AM is before typical business hours. Would you prefer 9:00 AM EST instead, or do you specifically need the 7:00 AM time?"

Default user timezone: Central Time (America/Chicago) unless otherwise specified.
Available tools:
- convert_timezone(datetime_str, from_timezone, to_timezone) - timezone conversion
- users.search - search for people in the organization by name
- calendar.create_event, calendar.update_event, calendar.remove_event, calendar.get_availability - calendar operations`;
}