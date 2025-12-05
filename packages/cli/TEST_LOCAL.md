# Local Testing Guide

Quick guide to test your local agent changes without deploying!

## Quick Start

### Option 1: Use Test Script (Easiest) ⭐

**Mac/Linux:**
```bash
cd packages/cli
export TENANT_ID=your-tenant-id
./test-local.sh
```

**Windows:**
```bash
cd packages\cli
set TENANT_ID=your-tenant-id
test-local.bat
```

### Option 2: NPM Scripts

```bash
cd packages/cli

# Build first
npm run build

# Test with your tenant
TENANT_ID=your-tenant-id npm run test:king-mo
```

### Option 3: Manual Command

```bash
cd packages/cli
npm run build

node bin/kxagent.js chat \
  --tenantId your-tenant-id \
  --email test@local.com \
  --conversation-id test-$(date +%s) \
  --debug
```

---

## Setup

### 1. Create `.env.local` (Auto-created by script, or manual)

In project root (`kx-langchain-agent/.env.local`):

```bash
AWS_REGION=us-east-1
MESSAGES_TABLE=kx-messages
CHANNELS_TABLE=kx-channels
PERSONAS_TABLE=DelayedReplies-personas
COMPANY_INFO_TABLE=DelayedReplies-company-info
LEADS_TABLE=kx-leads
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
HISTORY_LIMIT=50
```

### 2. Set Your Tenant ID

```bash
# Mac/Linux
export TENANT_ID=your-tenant-id

# Windows
set TENANT_ID=your-tenant-id

# Or pass it inline
TENANT_ID=your-tenant-id ./test-local.sh
```

---

## What Gets Tested

✅ **Your local code changes** (no deploy needed!)
✅ **Phase C: Channel state persistence** (real DynamoDB)
✅ **Verbosity randomization** (see logs)
✅ **Goal orchestration** (from company config)
✅ **Data extraction** (email, phone, etc.)
✅ **Event emission** (EventBridge)

---

## Sample Test Session

```
🧪 KxGen Agent - Local Test Runner

🚀 Starting local test with King Mo...
   Tenant ID: your-tenant
   Email: king-mo-test@local.com
   Conversation ID: test-1732220345

💡 Tip: Type 'exit' to quit the chat

🎲 Verbosity randomized: 2 (max: 4)
📊 Channel state service initialized (table: kx-channels)
📊 Loading workflow state for channel: test-1732220345

You: Hi
King Mo: 💪 Yo what's up!

You: I want to get fit
📧 Extracted info: { goals: "get fit" }
King Mo: Hell yeah bro, let's do this! What's your email?

You: david@email.com
📧 Extracted info: { email: "david@email.com" }
✔️ Marking field captured: email = david@email.com
💾 Workflow state saved successfully
King Mo: Got it! What's your phone?

You: exit
👋 Goodbye!
```

---

## Logs to Watch For

### Verbosity Randomization:
```
🎲 Verbosity randomized: 3 (max: 4)
🎚️ Setting maxTokens=80, temperature=0.4 based on verbosity=3/4
```

### Channel State (Phase C):
```
📊 Loading workflow state for channel: test-1732220345
✅ Loaded existing workflow state: {
  "messageCount": 2,
  "isEmailCaptured": true,
  "capturedData": { "email": "david@email.com" }
}
```

### Data Extraction:
```
📧 Extracted info: { email: "david@email.com" }
✔️ Marking field captured: email = david@email.com
```

### Goal Orchestration:
```
🔍 Goal orchestration enabled (company-level): 3 goals configured
🎯 Goal recommendations: [
  { goal: "collect_contact_info", shouldPursue: true }
]
```

---

## Troubleshooting

### "AWS credentials not found"
```bash
# Check credentials
aws sts get-caller-identity

# Set profile
export AWS_PROFILE=your-profile
```

### "Table does not exist"
Update table names in `.env.local` to match your actual tables.

### "Bedrock access denied"
Ensure your AWS credentials have Bedrock permissions:
```bash
aws bedrock list-foundation-models --region us-east-1
```

---

## Clean Up Test Data

Test conversations are saved with unique IDs like `test-1732220345`.

To clean up:
```bash
# Delete from kx-channels
aws dynamodb delete-item \
  --table-name kx-channels \
  --key '{"channelId": {"S": "test-1732220345"}}'

# Delete messages (query by targetKey first, then delete)
aws dynamodb query \
  --table-name kx-messages \
  --key-condition-expression "targetKey = :key" \
  --expression-attribute-values '{":key": {"S": "channel#test-1732220345"}}'
```

---

## Pro Tips

1. **Use unique conversation IDs** to avoid polluting existing conversations
2. **Watch debug logs** to see verbosity randomization in action
3. **Test Phase C** by sending multiple messages and checking state persistence
4. **Test goals** by providing contact info and watching extraction logs
5. **Exit cleanly** with `exit` or Ctrl+C

---

**Happy Testing!** 🚀

