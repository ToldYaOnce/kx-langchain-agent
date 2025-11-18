# Agent targetKey Fix - Version 1.1.11

## Issue
The agent was failing to save messages to your DynamoDB table with error:
```
Missing the key targetKey in the item
```

## Root Cause
Your consumer's messages table uses a different schema with:
- `targetKey` (partition key): `channel#{channelId}` 
- `dateReceived` (sort key): ISO8601 timestamp

But the agent's `DynamoDBService` was using its own schema:
- `contact_pk` (partition key): `{tenantId}#{email_lc}`
- `ts` (sort key): ULID

## Fix Applied
Updated `@toldyaonce/kx-langchain-agent-runtime` version **1.1.11** to:

1. **Add `targetKey` field** when saving messages:
   ```typescript
   const targetKey = message.conversation_id 
     ? `channel#${message.conversation_id}`
     : contact_pk;
   ```

2. **Add `dateReceived` field** for sort key compatibility:
   ```typescript
   dateReceived: new Date().toISOString()
   ```

3. **Updated TypeScript types** to include these fields as optional in `MessageItemSchema`

## Published Packages
- ✅ `@toldyaonce/kx-langchain-agent-runtime@1.1.11`
- ✅ `@toldyaonce/kx-delayed-replies-infra@1.24.1`

## Update Your Consumer

### Step 1: Update Dependencies
```bash
cd /path/to/your/kx-aws
npm install @toldyaonce/kx-delayed-replies-infra@1.24.1
```

### Step 2: Redeploy
```bash
cdk deploy
```

### Step 3: Test Again
Send the same EventBridge event:

**Event bus:** `KxGen-events-bus`
**Event source:** `kxgen.messaging`
**Detail type:** `lead.message.created`
**Event detail:**
```json
{
  "tenantId": "tenant_1757418497028_g9o6mnb4m",
  "conversation_id": "e713d8ca-a6d4-4d34-8a65-2c54f749b6bc",
  "email_lc": "channel-e713d8ca-a6d4-4d34-8a65-2c54f749b6bc@anonymous.com",
  "text": "Hello from eventbridge! How are you?",
  "source": "chat",
  "timestamps": {
    "received": "2025-11-09T22:45:00.000Z",
    "processed": "2025-11-09T22:45:00.000Z"
  },
  "channel_context": {
    "chat": {
      "sessionId": "e713d8ca-a6d4-4d34-8a65-2c54f749b6bc",
      "clientId": "1478d468-d0a1-70e4-ec4f-f380529a6265",
      "userAgent": "David Glass"
    }
  },
  "channelId": "e713d8ca-a6d4-4d34-8a65-2c54f749b6bc",
  "userId": "1478d468-d0a1-70e4-ec4f-f380529a6265",
  "userName": "David Glass"
}
```

## Expected Result
- ✅ Agent receives event
- ✅ Saves to DynamoDB with `targetKey: "channel#e713d8ca-a6d4-4d34-8a65-2c54f749b6bc"`
- ✅ Generates AI response
- ✅ Emits `agent.reply.created` event
- ✅ Your chat UI receives the bot's response

## Next Steps
After successful test, wire up the actual chat flow:
1. User sends chat message → EventBridge
2. Your event-tracking service wraps it
3. Agent router processes it
4. Bot responds via `agent.reply.created` event
5. Your WebSocket handler delivers response to chat UI


