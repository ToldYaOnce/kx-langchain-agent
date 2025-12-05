# Chunk Validation for Interruption Handling

## Overview

This document describes how to implement chunk validation in the **chunked responder Lambda** to enable graceful interruption of agent responses when users send new messages.

## Problem

When an agent response is chunked and delivered over time:
1. User sends message A
2. Agent starts responding with 8 chunks
3. User interrupts at chunk 3 with message B
4. Chunks 4-8 from message A still fire (stale/irrelevant)
5. Goal attempt counters were already incremented
6. User experience is broken

## Solution

Use DynamoDB message tracking to validate chunks before delivery.

---

## Architecture

### Components

1. **Agent Lambda** (`kx-langchain-agent`)
   - Creates state snapshot before chunking
   - Starts message tracking in DynamoDB
   - Attaches `responseToMessageId` to all chunks
   - ✅ **IMPLEMENTED**

2. **Message Tracking Table** (DynamoDB)
   - Table: `KxGen-message-tracking`
   - PK: `{tenantId}#{channelId}`
   - SK: `CURRENT_MESSAGE`
   - TTL: 5 minutes
   - ✅ **SCHEMA DEFINED** (needs IAC deployment)

3. **Chunked Responder Lambda** (`kx-notifications-and-messaging`)
   - Validates chunks before delivery
   - Discards stale chunks
   - ❌ **NOT IMPLEMENTED** (see below)

---

## Implementation Guide for Chunked Responder

### Step 1: Add MessageTrackingService Dependency

The `MessageTrackingService` is already implemented in `@toldyaonce/kx-langchain-agent-runtime`. Add it as a dependency:

```bash
cd packages/chunked-responder
npm install @toldyaonce/kx-langchain-agent-runtime@latest
```

### Step 2: Initialize Service in Lambda

```typescript
import { MessageTrackingService } from '@toldyaonce/kx-langchain-agent-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Initialize once outside handler (for reuse across invocations)
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const messageTrackingTable = process.env.MESSAGE_TRACKING_TABLE || 'KxGen-message-tracking';
const messageTrackingService = new MessageTrackingService(docClient, messageTrackingTable);
```

### Step 3: Validate Chunk Before Delivery

```typescript
export async function handler(event: any) {
  // Parse the chunk from the event
  const chunk = JSON.parse(event.body || event);
  
  const {
    responseToMessageId,
    tenantId,
    channelId,
    text,
    index,
    total
  } = chunk;
  
  // CRITICAL: Validate chunk is still valid
  if (responseToMessageId && messageTrackingService) {
    const isValid = await messageTrackingService.isResponseValid(
      tenantId,
      channelId,
      responseToMessageId
    );
    
    if (!isValid) {
      console.log(`❌ STALE CHUNK: Chunk ${index}/${total} for message ${responseToMessageId} was interrupted`);
      return {
        statusCode: 200, // Return 200 to prevent retries
        body: JSON.stringify({ 
          message: 'Chunk discarded - response was interrupted',
          chunk: index,
          total: total
        })
      };
    }
    
    console.log(`✅ VALID CHUNK: Chunk ${index}/${total} for message ${responseToMessageId}`);
  }
  
  // Continue with normal chunk delivery
  await sendChunkToUser(text, channelId, tenantId);
  
  // Clear tracking on last chunk
  if (index === total - 1 && messageTrackingService) {
    await messageTrackingService.clearTracking(tenantId, channelId);
    console.log(`🧹 Cleared tracking after last chunk delivered`);
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Chunk delivered successfully' })
  };
}
```

### Step 4: Update IAM Permissions

Add DynamoDB permissions for the chunked responder Lambda:

```typescript
// In IAC/CDK
chunkedResponderLambda.addToRolePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    'dynamodb:GetItem',
    'dynamodb:DeleteItem'
  ],
  resources: [
    messageTrackingTable.tableArn
  ]
}));
```

### Step 5: Add Environment Variable

```typescript
chunkedResponderLambda.addEnvironment('MESSAGE_TRACKING_TABLE', messageTrackingTable.tableName);
```

---

## Flow Diagram

### Normal Flow (No Interruption)

```
User sends message A
  ↓
Agent Lambda:
  - Loads channel state
  - Creates state snapshot
  - Starts tracking (messageId_123)
  - Generates response
  - Chunks response (all chunks have messageId_123)
  - Sends chunks to queue
  ↓
DynamoDB: Current message = messageId_123
  ↓
Chunked Responder:
  - Chunk 1: Validates messageId_123 → VALID → Delivers
  - Chunk 2: Validates messageId_123 → VALID → Delivers
  - Chunk 3: Validates messageId_123 → VALID → Delivers (LAST)
  - Clears tracking
  ↓
DynamoDB: No current message
```

### Interrupted Flow

```
User sends message A
  ↓
Agent Lambda:
  - Starts tracking (messageId_123)
  - Generates response
  - Chunks response (messageId_123)
  ↓
DynamoDB: Current message = messageId_123
  ↓
Chunked Responder:
  - Chunk 1: Validates messageId_123 → VALID → Delivers
  - Chunk 2: Validates messageId_123 → VALID → Delivers
  ↓
User sends message B (INTERRUPTION)
  ↓
Agent Lambda:
  - Detects previous messageId_123
  - Loads state snapshot
  - Rolls back channel state
  - Starts NEW tracking (messageId_456)
  - Generates NEW response
  - Chunks NEW response (messageId_456)
  ↓
DynamoDB: Current message = messageId_456
  ↓
Chunked Responder:
  - Chunk 3 (old): Validates messageId_123 → INVALID → DISCARDED ❌
  - Chunk 4 (old): Validates messageId_123 → INVALID → DISCARDED ❌
  - Chunk 1 (new): Validates messageId_456 → VALID → Delivers
  - Chunk 2 (new): Validates messageId_456 → VALID → Delivers
```

---

## Testing

### Local Testing (CLI)

The CLI already supports the new flow:

```bash
npm run test:chat -- --channel-id test-channel-001 --conversation-id conv-123
```

### Integration Testing

1. Send message A
2. Wait for 2 chunks to deliver
3. Send message B (should interrupt)
4. Verify chunks 3+ from message A are discarded
5. Verify only chunks from message B are delivered

---

## Rollback Behavior

When a response is interrupted:

1. **Goal Attempt Counters**: NOT rolled back (stored in GoalOrchestrator memory, not persisted)
   - This is acceptable - attempt count will be correct on next message
   
2. **Captured Data**: Rolled back via snapshot
   - Prevents partial data from being committed
   
3. **Completed Goals**: Rolled back via snapshot
   - Goals marked complete in interrupted response are unmarked
   
4. **Message Count**: Rolled back via snapshot
   - Accurate pacing for triggers

---

## Monitoring

Add CloudWatch metrics:

```typescript
// In chunked responder
if (!isValid) {
  await cloudwatch.putMetricData({
    Namespace: 'KxGen/Agent',
    MetricData: [{
      MetricName: 'StaleChunksDiscarded',
      Value: 1,
      Unit: 'Count',
      Dimensions: [
        { Name: 'TenantId', Value: tenantId },
        { Name: 'ChannelId', Value: channelId }
      ]
    }]
  });
}
```

---

## Next Steps

1. ✅ Agent Lambda implementation (DONE)
2. ⏳ IAC: Create `KxGen-message-tracking` table
3. ⏳ Chunked Responder: Add validation logic
4. ⏳ Test interruption flow end-to-end
5. ⏳ Deploy to staging
6. ⏳ Monitor metrics

---

## Questions?

Contact the KxGen team or see:
- `packages/runtime/src/lib/message-tracking-service.ts` - Service implementation
- `packages/runtime/src/lib/agent.ts` - State snapshot logic
- `packages/runtime/src/types/dynamodb-schemas.ts` - Schema definitions

