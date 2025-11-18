# Deployment Debug Steps

The Lambda is still showing the old error after deploying. Here's how to debug:

## Step 1: Verify Consumer Has Latest Packages

In your **kx-aws consumer** project:

```bash
# Check what version of runtime is actually installed
npm list @toldyaonce/kx-langchain-agent-runtime

# Should show:
# └─┬ @toldyaonce/kx-delayed-replies-infra@1.24.1
#   └── @toldyaonce/kx-langchain-agent-runtime@1.1.11
```

**If it shows 1.1.10 or older:**
```bash
# Force reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## Step 2: Force Lambda Code Update

Sometimes CDK caches Lambda code. Try:

```bash
# In your consumer
cdk deploy --force
```

**OR** update the Lambda environment variable to force a redeploy:

In your stack where you instantiate `LangchainAgent`, add a dummy env var:

```typescript
const langchainAgent = new LangchainAgent(this, 'LangchainAgent', {
  eventBus: notificationStack.eventBus,
  bedrockModelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0',
  existingTables: {
    messagesTableName: notificationStack.dynamoTables.messagesTable.tableName,
    leadsTableName: notificationStack.dynamoTables.leadsTable.tableName,
    personasTableName: notificationStack.dynamoTables.personasTable.tableName,
  },
});

// Add this to force Lambda update
langchainAgent.agentRouterFunction.addEnvironment('DEPLOYED_AT', Date.now().toString());
```

Then `cdk deploy` again.

---

## Step 3: Check Lambda Code Directly

After deploying, check the Lambda's actual code:

1. Go to **AWS Lambda Console**
2. Find your **agent-router-function**
3. Click **Code** tab
4. Look at the bundled `index.mjs`
5. Search for `targetKey` in the code

**If `targetKey` is NOT in the code**, the bundle didn't pick up the new runtime.

---

## Step 4: Nuclear Option - Clean Build

If all else fails:

```bash
# In your consumer
rm -rf node_modules package-lock.json cdk.out
npm install
cdk synth  # This will bundle the Lambda code
cdk deploy
```

---

## What Should Happen

After deploying with `1.1.11`, when you send the test event, you should see in CloudWatch Logs:

```
AgentRouter received event: {...}
🔍 Lambda mode - Session Key: ...
✅ Message saved with targetKey: channel#e713d8ca-a6d4-4d34-8a65-2c54f749b6bc
```

**NOT:**
```
ERROR AgentRouter error: ValidationException: Missing the key targetKey
```


