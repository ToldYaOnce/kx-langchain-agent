# 🕐 Delayed Replies System

Human-like delayed agent replies using SQS delayed messages, preserving existing EventBridge contracts and adding new read/typing events.

## 🎯 Overview

This system implements human-like timing for agent responses by:
- **Composing** replies immediately in the Agent Lambda
- **Computing** human-like timings based on persona characteristics  
- **Scheduling** delayed actions via SQS FIFO queues
- **Releasing** EventBridge events at calculated intervals

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Agent Lambda  │────│   SQS FIFO      │────│ Release Router  │
│   (Compose)     │    │   (Delayed)     │    │   (Publish)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Immediate     │    │   Ordering      │    │  EventBridge    │
│   Processing    │    │   Guaranteed    │    │   Events        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📊 Event Flow

### Chat Channel (Full Flow)
```
1. lead.message.created (inbound)
   ↓
2. Agent composes reply + schedules actions
   ↓
3. agent.message.read (after read_ms)
   ↓
4. agent.typing.started (after read_ms + 300ms)
   ↓
5. agent.typing.stopped (before final)
   ↓
6. agent.reply.created (final response)
```

### SMS/Email/API (Final Only)
```
1. lead.message.created (inbound)
   ↓
2. Agent composes reply + schedules actions
   ↓
3. agent.reply.created (after total_ms)
```

## 🎭 Persona Timings

Each persona has unique characteristics:

### Carlos (Boxing Enthusiast)
- **Read Speed**: 9-12 chars/sec
- **Type Speed**: 3-6 chars/sec  
- **Pauses**: 35% chance, 400-1200ms each
- **Personality**: Enthusiastic but thoughtful

### Alex (Professional)
- **Read Speed**: 10-14 chars/sec
- **Type Speed**: 5-8 chars/sec
- **Pauses**: 25% chance, 300-900ms each
- **Personality**: Efficient and direct

### Sam (Educational)
- **Read Speed**: 8-11 chars/sec
- **Type Speed**: 4-7 chars/sec
- **Pauses**: 30% chance, 350-1000ms each
- **Personality**: Thoughtful and detailed

## 🚀 Deployment

### Prerequisites
```bash
# Install dependencies
npm install

# Configure AWS CLI
aws configure

# Set environment variables
export EVENT_BUS_NAME="your-event-bus"
export CDK_DEFAULT_ACCOUNT="123456789012"
export CDK_DEFAULT_REGION="us-east-1"
```

### Deploy Infrastructure
```bash
# Navigate to infra package
cd packages/infra

# Install dependencies
npm install

# Deploy stack
npm run deploy

# Or use CDK directly
cdk deploy DelayedRepliesStack
```

### Environment Variables

#### For Agent Lambda
```bash
RELEASE_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/.../DelayedRepliesStack-reply-release.fifo
```

#### For Release Router Lambda
```bash
EVENT_BUS_NAME=your-event-bus-name
```

## 🔧 Integration

### In Your Agent Lambda

```typescript
import { scheduleActions, estimateTokenCount } from "@toldyaonce/kx-agent-core";

export const handler = async (event: any) => {
  // ... existing agent logic to generate replyText ...
  
  // Schedule delayed actions
  const timing = await scheduleActions({
    queueUrl: process.env.RELEASE_QUEUE_URL!,
    tenantId: event.detail.tenantId,
    contact_pk: `contact#${event.detail.email_lc || event.detail.phone_e164}`,
    conversation_id: event.detail.conversation_id,
    channel: event.detail.source, // "chat" | "sms" | "email" | "api"
    personaName: "Carlos", // or determine dynamically
    message_id: event.detail.message_id || randomUUID(),
    replyText,
    inputChars: event.detail.text.length,
    inputTokens: estimateTokenCount(event.detail.text)
  });
  
  // Log timing for telemetry
  console.log("Scheduled delayed response", { timing });
  
  // Don't emit agent.reply.created immediately - let the system handle it
  return { statusCode: 200 };
};
```

### Granting Permissions

The CDK stack automatically grants the Release Router permission to publish EventBridge events. For your existing Agent Lambda:

```typescript
// In your existing CDK stack
import { DelayedRepliesStack } from "@toldyaonce/kx-delayed-replies-infra";

const delayedReplies = new DelayedRepliesStack(this, "DelayedReplies");

// Grant your existing agent permission to send to the queue
delayedReplies.grantSendToQueue(yourExistingAgentLambda);
```

## 🧪 Testing

### Unit Tests
```bash
# Test agent-core
cd packages/agent-core
npm test

# Test release-router  
cd packages/release-router
npm test

# Run with coverage
npm run test:coverage
```

### Integration Testing
```bash
# Send a test message to SQS
aws sqs send-message \
  --queue-url $RELEASE_QUEUE_URL \
  --message-body '{"releaseEventId":"test","tenantId":"t-123","contact_pk":"contact#test","threadKey":"test","channel":"chat","kind":"READ","message_id":"msg-001","dueAtMs":1699200000000}' \
  --message-group-id "t-123#test" \
  --message-deduplication-id "test-read"
```

### Local Development
```bash
# Start local EventBridge monitoring
aws events put-targets --rule "test-rule" --targets "Id"="1","Arn"="arn:aws:logs:us-east-1:123456789012:destination:test"

# Monitor CloudWatch logs
aws logs tail /aws/lambda/DelayedRepliesStack-ReleaseRouterFunction --follow
```

## 📈 Monitoring

### Key Metrics
- **SQS Queue Depth**: Monitor delayed message backlog
- **Lambda Duration**: Release Router processing time
- **EventBridge Success Rate**: Event delivery success
- **Timing Accuracy**: Actual vs expected delays

### CloudWatch Dashboards
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/SQS", "ApproximateNumberOfMessages", "QueueName", "DelayedRepliesStack-reply-release.fifo"],
          ["AWS/Lambda", "Duration", "FunctionName", "DelayedRepliesStack-ReleaseRouterFunction"],
          ["AWS/Events", "SuccessfulInvocations", "RuleName", "agent-events"]
        ]
      }
    }
  ]
}
```

## 🔒 Security

### IAM Permissions
- **Agent Lambda**: `sqs:SendMessage` on release queue
- **Release Router**: `events:PutEvents` on EventBridge
- **SQS Queue**: Encryption at rest with KMS

### Network Security
- **VPC**: Deploy in private subnets
- **Security Groups**: Restrict outbound to AWS services only
- **Endpoints**: Use VPC endpoints for SQS/EventBridge

## 🎛️ Configuration

### Timing Caps
```typescript
// Maximum total delay (45 seconds for chat UX)
total_ms: Math.min(total, 45_000)

// Minimum read time (700ms feels natural)
read_ms: Math.max(700, read)

// SQS delay limit (15 minutes maximum)
delaySeconds: Math.min(15 * 60, calculatedDelay)
```

### Channel Rules
- **Chat**: Full flow (READ → TYPING_ON → TYPING_OFF → FINAL)
- **SMS**: Final only (immediate delivery after delay)
- **Email**: Final only (immediate delivery after delay)  
- **API**: Final only (immediate delivery after delay)

## 🚨 Troubleshooting

### Common Issues

#### Messages Not Being Processed
```bash
# Check queue visibility timeout
aws sqs get-queue-attributes --queue-url $RELEASE_QUEUE_URL --attribute-names VisibilityTimeoutSeconds

# Check dead letter queue
aws sqs receive-message --queue-url $DLQ_URL
```

#### Timing Inconsistencies
```bash
# Verify seed consistency
node -e "
const { computeTiming } = require('./packages/agent-core/dist/composeAndSchedule');
const { PERSONAS } = require('./packages/agent-core/dist/personaTimings');
console.log(computeTiming('test-seed', PERSONAS.Carlos, 100, 30, 300));
"
```

#### EventBridge Delivery Failures
```bash
# Check EventBridge metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Events \
  --metric-name FailedInvocations \
  --dimensions Name=RuleName,Value=agent-events \
  --start-time 2023-11-05T00:00:00Z \
  --end-time 2023-11-05T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

## 🔄 Maintenance

### Scaling Considerations
- **SQS FIFO**: 300 TPS per message group (per conversation)
- **Lambda Concurrency**: Set reserved concurrency for Release Router
- **EventBridge**: 10,000 TPS default limit

### Cost Optimization
- **SQS**: $0.50 per million delayed messages
- **Lambda**: Minimal cost for Release Router (< 1 second execution)
- **EventBridge**: $1.00 per million events

### Backup & Recovery
- **Queue Purging**: `aws sqs purge-queue --queue-url $RELEASE_QUEUE_URL`
- **DLQ Monitoring**: Set up CloudWatch alarms for DLQ messages
- **State Recovery**: Messages are idempotent and safe to replay

## 📞 Support

- **Issues**: GitHub Issues
- **Documentation**: [Full API Reference](./api-reference.md)
- **Examples**: [Integration Examples](../examples/)
- **Monitoring**: [CloudWatch Playbook](./monitoring.md)
