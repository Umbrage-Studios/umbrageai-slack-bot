# SLACK AGENT MIGRATION PLAN

The objective is to migrate **umbrageai-slack-bot** from direct OpenAI calls to a reusable JavaScript/TypeScript *Scheduling Agent* powered by the Vercel **AI SDK v5 Beta**.  This agent will mirror the behaviour of the existing Python Scheduling Agent and surface its responses in Slack.

---

## 1. Goals

1. **Feature parity** with the Python Scheduling Agent (system prompt, default model, tool set).
2. **Decouple** Slack command processing from raw LLM calls; all intelligence lives inside an Agent abstraction.
3. Support **MCP** tools via a **Streamable HTTP** server that is *stateless* (pure POST, no SSE); requires a **custom transport** implementation.
4. Stream responses back to Slack for real-time UX.
5. Enable incremental adoption—legacy codepaths stay until the Agent proves stable.

---

## 2. Architecture Overview

```text
umbrageai-slack-bot/
├── src/
│   ├── agent/            # new – Scheduling Agent implementation
│   │   ├── index.ts
│   │   └── mcp.ts        # custom transport + client wrapper
│   └── slack/
│       └── handlers.ts   # Bolt/event logic calling the agent
├── package.json
└── AGENT_PIVOT.md        # ← this document
```

---

## 3. Phased Plan

### Phase 1 – Discovery & Design

- Parse `chat-umbrage/backend/src/agents/scheduling/agent.py` to extract:
  - System prompt text.
  - Model choice (`llama3-70b-8192` on Groq expected).
  - Required user context (Slack profile name/email, `now`, `today`, `tomorrow`).
  - Tool schemas & usage flow.
- Decide TypeScript interfaces and directory layout (see above).
- Map Python flow → AI SDK pattern (`generateText` + `stopWhen`).

`agent.py`
```python
import os
from datetime import datetime, timedelta
from typing import Dict
import pytz
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStreamableHTTP
from ..stream_utils import to_data_stream_protocol, convert_vercel_messages_to_pydantic

# Timezone mapping for common US timezones
TIMEZONE_MAP: Dict[str, str] = {
    'central': 'America/Chicago',
    'eastern': 'America/New_York', 
    'pacific': 'America/Los_Angeles',
    'mountain': 'America/Denver',
    'alaska': 'America/Anchorage',
    'hawaii': 'Pacific/Honolulu',
    'utc': 'UTC'
}

def get_timezone_obj(timezone_name: str) -> pytz.BaseTzInfo:
    """Get timezone object from name, supporting both full names and abbreviations"""
    timezone_name = timezone_name.lower().strip()
    
    # Check if it's in our mapping
    if timezone_name in TIMEZONE_MAP:
        return pytz.timezone(TIMEZONE_MAP[timezone_name])
    
    # Try to use it directly as a pytz timezone name
    try:
        return pytz.timezone(timezone_name)
    except pytz.UnknownTimeZoneError:
        # Default to Central if unknown
        return pytz.timezone('America/Chicago')

def generate_system_prompt(user_context=None) -> str:
    """Generate the system prompt with current time context and user info"""
    # Get current UTC time to inject into system prompt
    current_utc = datetime.now(pytz.UTC)
    current_utc_str = current_utc.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    current_date_str = current_utc.strftime("%A, %B %d, %Y")
    tomorrow_date = (current_utc + timedelta(days=1)).strftime("%A, %B %d, %Y")
    tomorrow_iso = (current_utc.date() + timedelta(days=1)).strftime("%Y-%m-%d")

    # Prepare user context for system prompt
    user_context_prompt = ""
    if user_context:
        user_name = f"{user_context.first_name} {user_context.last_name}"
        user_context_prompt = f"""
SIGNED-IN USER CONTEXT:
- Sign-in User Details: {user_name} - {user_context.email}
- The organizer for any meetings should be assumed to be the currently signed-in user: {user_name} ({user_context.email})
- When creating calendar events, use this user as the default organizer unless specifically told otherwise
"""

    return f"""You are a calendar scheduling assistant with access to Outlook calendar tools and time conversion utilities.

CURRENT TIME CONTEXT:
- Current UTC time: {current_utc_str}
- Today: {current_date_str}
- Tomorrow: {tomorrow_date} 
- Use this as your reference for calculating relative dates
{user_context_prompt}
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
2. Tomorrow is {tomorrow_date} (date: {tomorrow_iso})
3. Check: 10:30 AM EST is within business hours (9 AM - 5 PM EST) ✓
4. Call convert_timezone("{tomorrow_iso} 10:30:00", "eastern", "utc") → get UTC time
5. Use the UTC time in calendar.create_event with john.smith@umbrage.com as attendee
6. Convert any results back to user's timezone for confirmation

Example for "tomorrow at 7:00 AM EST" (outside business hours):
1. Tomorrow is {tomorrow_date} (date: {tomorrow_iso})  
2. Check: 7:00 AM EST is before business hours (9 AM - 5 PM EST) ❌
3. SUGGEST: "I notice 7:00 AM is before typical business hours. Would you prefer 9:00 AM EST instead, or do you specifically need the 7:00 AM time?"

Default user timezone: Central Time (America/Chicago) unless otherwise specified.
Available tools:
- convert_timezone(datetime_str, from_timezone, to_timezone) - timezone conversion
- users.search - search for people in the organization by name
- calendar.create_event, calendar.update_event, calendar.remove_event, calendar.get_availability - calendar operations"""

def create_calendar_agent(user_context = None) -> Agent:
    """Create and configure the calendar scheduling agent"""
    
    # Import settings inside function to avoid circular import
    from src.settings import settings
    
    # Get API key from settings
    mcp_api_key = settings.api_key
    if not mcp_api_key:
        raise ValueError('API_KEY environment variable is not set')
    
    # Set up MCP server connection
    server = MCPServerStreamableHTTP(
        url='https://outlook-remote-mcp-server.onrender.com/mcp', 
        headers={'X-API-KEY': mcp_api_key}
    )
    
    # Generate the system prompt with current time context and user info
    system_prompt_content = generate_system_prompt(user_context)

    # Create the agent with comprehensive system prompt
    agent = Agent(
        'groq:qwen/qwen3-32b', 
        toolsets=[server],
        system_prompt=system_prompt_content
    )

    # Add custom tools to the agent
    @agent.tool_plain
    def convert_timezone(
        datetime_str: str, 
        from_timezone: str = "central", 
        to_timezone: str = "utc"
    ) -> str:
        """Convert time between any two timezones.
        
        Use this to convert user times to UTC for MCP calls, and to convert UTC results 
        back to user's timezone for display.
        
        Args:
            datetime_str: DateTime string (e.g., '2024-01-15 14:30:00' or '2024-01-15T14:30:00')
            from_timezone: Source timezone. Options: central, eastern, pacific, mountain, alaska, hawaii, utc, or any pytz timezone name (default: central)
            to_timezone: Target timezone. Options: central, eastern, pacific, mountain, alaska, hawaii, utc, or any pytz timezone name (default: utc)
        
        Returns:
            Converted time string. UTC times in ISO format (e.g., '2024-01-15T14:30:00.123456Z'), 
            other timezones in readable format (e.g., '2024-01-15 14:30:00 EST')
        """
        print(f"🌍 TOOL CALL: convert_timezone('{datetime_str}', '{from_timezone}' -> '{to_timezone}')")
        
        try:
            # Clean up the input string and parse
            clean_datetime = datetime_str.replace('T', ' ').replace('Z', '').strip()
            
            # Parse the datetime string
            if '.' in clean_datetime:
                dt = datetime.strptime(clean_datetime, "%Y-%m-%d %H:%M:%S.%f")
            else:
                dt = datetime.strptime(clean_datetime, "%Y-%m-%d %H:%M:%S")
            
            # Get timezone objects
            from_tz = get_timezone_obj(from_timezone)
            to_tz = get_timezone_obj(to_timezone)
            
            # Localize to source timezone
            if from_timezone.lower() == 'utc':
                localized_dt = pytz.UTC.localize(dt)
            else:
                localized_dt = from_tz.localize(dt)
            
            # Convert to target timezone
            converted_dt = localized_dt.astimezone(to_tz)
            
            # Format output based on target timezone
            if to_timezone.lower() == 'utc':
                result = converted_dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
            else:
                result = converted_dt.strftime("%Y-%m-%d %H:%M:%S %Z")
            
            print(f"🌍 Result: {result}")
            return result
        
        except Exception as e:
            error_msg = f"Error converting time: {str(e)}. Please provide time in format 'YYYY-MM-DD HH:MM:SS'"
            print(f"🌍 Error: {error_msg}")
            return error_msg

    return agent

async def chat_stream(messages, user_context = None):
    """Stream chat interaction with the scheduling agent.
    
    Args:
        messages: Array of message objects for the conversation history
        user_context: User context from authentication (optional)
        
    Yields:
        str: Data stream protocol formatted chunks for Vercel AI SDK
    """
    agent = create_calendar_agent(user_context)
    
    # Generate the system prompt with current time context (same as agent uses)
    system_prompt_content = generate_system_prompt(user_context)
    
    # Convert Vercel AI SDK messages - extract user prompt and message history
    # Pass user_context so it gets prepended to the latest user message
    # Pass system_prompt_content so the full agent system prompt is preserved
    user_prompt, message_history = convert_vercel_messages_to_pydantic(
        messages, 
        user_context, 
        system_prompt_content
    )
     
    async def stream_messages():            
        # Run the agent with the user prompt and message history for context
        async with agent.iter(user_prompt, message_history=message_history) as agent_run:
            async for node in agent_run:
                # Convert to data stream protocol format
                async for chunk in to_data_stream_protocol(node, agent_run):
                    yield chunk
    
    async for chunk in stream_messages():
        yield chunk 
```

### Phase 2 – Environment Setup

```bash
yarn add ai@beta @ai-sdk/groq zod @modelcontextprotocol/sdk @slack/bolt
```
- Configure TS config, eslint, jest.
- Add `dev` script for hot-reloading with ts-node-dev or nodemon.

### Phase 3 – Core Implementation

1. **Custom MCP Transport**
   - Import `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp`.
   - Instantiate:
     ```ts
     import { experimental_createMCPClient } from 'ai';
     import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
     import { groq } from '@ai-sdk/groq';

     const transport = new StreamableHTTPClientTransport(
       new URL(process.env.MCP_URL!),
       {
         sessionId: 'slack_agent',
         headers: { Authorization: `Bearer ${process.env.MCP_KEY}` },
       },
     );

     export const mcpClient = await experimental_createMCPClient({ transport });
     ```
   - The server is stateless; each call is a POST → ensure you *close* the client after use (`await mcpClient.close()`).

2. **Agent Logic (`src/agent/index.ts`)**
   - Build `messages` array with Slack user profile + timestamps.
   - Retrieve tools via `await mcpClient.tools()` (optionally pass explicit `schemas` for type-safety).
   - Call `generateText` (or `streamText`) with:
     ```ts
     const { text, steps } = await generateText({
       model: groq('qwen/qwen3-32b'),
       tools,
       stopWhen: stepCountIs(10),
       system: SCHEDULING_PROMPT,
       messages,
     });
     ```

3. **Slack Integration (`src/slack/handlers.ts`)**
   - Using Bolt listener: on `/schedule` command or relevant event → call the Agent.
   - Stream partials via `say()` updates or use chat.postMessage edits for progressive rendering.

### Phase 4 – Testing & Validation

- **Unit**: mock MCP & OpenAI, assert message construction & tool flow.
- **E2E**: spin up dev MCP server, run Slack bot locally, validate end-to-end scheduling interaction.

### Phase 5 – Roll-Out

1. Introduce feature flag; default to legacy path.
2. Dog-food internally, monitor errors & latency.
3. Make Agent the default.
4. Remove legacy OpenAI code.

---

## 4. Outstanding Questions

| # | Topic | Notes |
|---|-------|-------|
| 1 | MCP Auth | Confirm header/token requirements for prod MPC server. |
| 2 | Tool Schemas | Stick with discovery or hard-code for compile-time types? |
| 3 | Concurrency | How many Agent calls per minute are expected? Need connection pooling? |
| 4 | Monitoring | Capture `usage` & tool results for telemetry? |

---

### Ready to Slack-ify! 🎉 