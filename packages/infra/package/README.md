# @kxgen/langchain-agent-runtime

Lambda handlers and shared libraries for the KxGen LangChain agent runtime.

## Overview

This package contains the core runtime components for the LangChain agent:

- **Handler Factories**: Create your own Lambda functions with complete control
- **Services**: DynamoDB, EventBridge, and Agent services
- **Chat History**: Custom LangChain integration with DynamoDB persistence
- **Types**: Comprehensive TypeScript definitions for events and data models
- **Pre-built Handlers**: Optional reference implementations (AgentRouter, Agent, Indexer)

## Architecture

```
EventBridge → AgentRouter → Agent → EventBridge
     ↓             ↓         ↓
DynamoDB ←    DynamoDB → Bedrock
(Leads)      (Messages)
```

## Handler Factories (Recommended)

### `createApiGatewayHandler(config?)`

Create your own Lambda function for **synchronous chat requests**:

```typescript
import { createApiGatewayHandler } from '@kxgen/langchain-agent-runtime';

export const handler = createApiGatewayHandler({
  tenantId: 'my-company',
  cors: {
    allowOrigins: ['https://mycompany.com'],
  },
  middleware: [
    // Your custom authentication, logging, etc.
  ],
});
```

### `createEventBridgeHandler(config?)`

Create your own Lambda function for **asynchronous message processing**:

```typescript
import { createEventBridgeHandler } from '@kxgen/langchain-agent-runtime';

export const handler = createEventBridgeHandler({
  tenantId: 'my-company',
  invokeAgent: true,
  middleware: [
    // Your custom preprocessing, filtering, etc.
  ],
});
```

**Benefits**:
- **Complete control** over Lambda configuration and triggers
- **Custom authentication** and middleware
- **Flexible deployment** with any IaC tool (CDK, Serverless, Terraform)
- **Your own infrastructure** and security policies

See **[Consumer Lambda Patterns Guide](./docs/CONSUMER_LAMBDA_PATTERNS.md)** for detailed examples.

## Pre-built Handlers (Reference)

### AgentRouterFn (`handlers/router.ts`)

Reference implementation for routing inbound messages.

**Trigger**: EventBridge rule matching `lead.message.created` events
**Function**: 
- Resolves phone numbers to email_lc via leads table
- Writes inbound messages to messages table
- Invokes AgentFn with processed context

**Environment Variables**:
- `MESSAGES_TABLE`: DynamoDB messages table name
- `LEADS_TABLE`: DynamoDB leads table name
- `AWS_REGION`: AWS region

### AgentFn (`handlers/agent.ts`)

Processes messages with LangChain and generates responses.

**Trigger**: Direct invocation from AgentRouterFn
**Function**:
- Loads conversation history from DynamoDB
- Processes message with LangChain + Bedrock
- Writes agent response to messages table
- Emits `agent.reply.created` event

**Environment Variables**:
- `BEDROCK_MODEL_ID`: Bedrock model identifier
- `OUTBOUND_EVENT_BUS_NAME`: EventBridge bus for outbound events
- `HISTORY_LIMIT`: Maximum messages in conversation history

### IndexerFn (`handlers/indexer.ts`) - Optional

Indexes documents for RAG retrieval.

**Trigger**: S3 events when documents are uploaded
**Function**:
- Downloads and processes documents
- Generates embeddings with Bedrock
- Stores in OpenSearch Serverless
- Emits `rag.index.updated` events

## Services

### DynamoDBService (`lib/dynamodb.ts`)

Handles all DynamoDB operations for messages and leads.

```typescript
import { DynamoDBService } from '@kxgen/langchain-agent-runtime';

const dynamoService = new DynamoDBService(config);

// Store a message
await dynamoService.putMessage({
  tenantId: 'tenant1',
  email_lc: 'user@example.com',
  source: 'sms',
  direction: 'inbound',
  text: 'Hello!',
});

// Get conversation history
const { items } = await dynamoService.getMessageHistory('tenant1', 'user@example.com');

// Resolve phone to email
const emailLc = await dynamoService.resolveContactFromPhone('tenant1', '+1234567890');
```

### EventBridgeService (`lib/eventbridge.ts`)

Publishes events to the configured EventBridge bus.

```typescript
import { EventBridgeService } from '@kxgen/langchain-agent-runtime';

const eventService = new EventBridgeService(config);

// Publish agent reply
await eventService.publishAgentReply({
  source: 'kxgen.agent',
  'detail-type': 'agent.reply.created',
  detail: {
    tenantId: 'tenant1',
    contact_pk: 'tenant1#user@example.com',
    preferredChannel: 'sms',
    text: 'Hi there!',
    routing: { sms: { to: '+1234567890' } },
  },
});
```

### AgentService (`lib/agent.ts`)

Orchestrates LangChain processing with Bedrock models.

```typescript
import { AgentService } from '@kxgen/langchain-agent-runtime';

const agentService = new AgentService({
  ...config,
  dynamoService,
  eventBridgeService,
});

// Process a message
const response = await agentService.processMessage({
  tenantId: 'tenant1',
  email_lc: 'user@example.com',
  text: 'Hello!',
  source: 'sms',
});
```

## LangChain Integration

### KxDynamoChatHistory (`lib/chat-history.ts`)

Custom LangChain chat history implementation that persists to DynamoDB.

```typescript
import { KxDynamoChatHistory } from '@kxgen/langchain-agent-runtime';
import { BufferMemory } from 'langchain/memory';

const chatHistory = new KxDynamoChatHistory({
  tenantId: 'tenant1',
  emailLc: 'user@example.com',
  dynamoService,
  historyLimit: 50,
});

const memory = new BufferMemory({
  chatHistory,
  returnMessages: true,
});
```

**Features**:
- Automatic message type conversion (Human/AI/System)
- Token budget management with `getMessagesWithTokenEstimate()`
- Conversation filtering by `conversationId`
- Metadata preservation in `additional_kwargs`

## Data Models

### MessageItem

```typescript
interface MessageItem {
  contact_pk: string;        // "{tenantId}#{email_lc}"
  ts: string;               // ULID timestamp
  tenantId: string;
  email_lc: string;
  lead_id?: string;
  source: 'sms' | 'email' | 'chat' | 'api';
  direction: 'inbound' | 'outbound';
  channel_context?: ChannelContext;
  text: string;
  attachments?: string[];   // S3 URIs
  meta?: Record<string, any>;
  conversation_id?: string;
  
  // GSI attributes
  GSI1PK?: string;         // tenantId
  GSI1SK?: string;         // ts
  GSI2PK?: string;         // lead_id  
  GSI2SK?: string;         // ts
}
```

### Event Types

```typescript
// Inbound message event (consumed)
interface InboundMessageEvent {
  source: 'kxgen.messaging';
  'detail-type': 'lead.message.created';
  detail: {
    tenantId: string;
    email_lc?: string;
    phone_e164?: string;
    source: MessageSource;
    text: string;
    channel_context?: ChannelContext;
    timestamps: { received: string; processed?: string };
  };
}

// Agent reply event (published)
interface AgentReplyEvent {
  source: 'kxgen.agent';
  'detail-type': 'agent.reply.created';
  detail: {
    tenantId: string;
    contact_pk: string;
    preferredChannel: MessageSource;
    text: string;
    routing: {
      sms?: { to: string };
      email?: { to: string };
      chat?: { sessionId: string };
    };
  };
}
```

## Configuration

### Runtime Configuration

```typescript
interface RuntimeConfig {
  messagesTable: string;
  leadsTable: string;
  bedrockModelId: string;
  outboundEventBusName?: string;
  outboundEventBusArn?: string;
  eventBusPutEventsRoleArn?: string;
  ragIndexNamePrefix?: string;
  historyLimit: number;
  awsRegion: string;
  dynamodbEndpoint?: string;  // for local development
}
```

### Loading Configuration

```typescript
import { loadRuntimeConfig, validateRuntimeConfig } from '@kxgen/langchain-agent-runtime';

// Load from environment variables
const config = loadRuntimeConfig();
validateRuntimeConfig(config);

// Create test configuration
const testConfig = createTestConfig({
  bedrockModelId: 'anthropic.claude-3-haiku-20240307-v1:0',
  dynamodbEndpoint: 'http://localhost:8000',
});
```

## Local Development

### Environment Setup

Create `.env.local`:
```bash
AWS_REGION=us-east-1
AWS_PROFILE=your-profile
MESSAGES_TABLE=test-messages
LEADS_TABLE=test-leads
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
DYNAMODB_ENDPOINT=http://localhost:8000
OUTBOUND_EVENT_BUS_NAME=test-event-bus
HISTORY_LIMIT=50
```

### DynamoDB Local

```bash
# Start DynamoDB Local
docker run -p 8000:8000 amazon/dynamodb-local

# Create tables (example)
aws dynamodb create-table \
  --endpoint-url http://localhost:8000 \
  --table-name test-messages \
  --attribute-definitions \
    AttributeName=contact_pk,AttributeType=S \
    AttributeName=ts,AttributeType=S \
  --key-schema \
    AttributeName=contact_pk,KeyType=HASH \
    AttributeName=ts,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
```

### Testing Handlers

```typescript
import { handler as routerHandler } from '@kxgen/langchain-agent-runtime/handlers/router';

// Mock EventBridge event
const mockEvent = {
  source: 'kxgen.messaging',
  'detail-type': 'lead.message.created',
  detail: {
    tenantId: 'tenant1',
    email_lc: 'user@example.com',
    source: 'sms',
    text: 'Hello!',
    timestamps: { received: new Date().toISOString() },
  },
};

// Invoke handler
await routerHandler(mockEvent, mockContext);
```

## Error Handling

All services include comprehensive error handling:

- **Validation**: Zod schemas for type safety
- **Retries**: Built-in retry logic for transient failures  
- **Observability**: Structured error events published to EventBridge
- **Graceful Degradation**: Fallback behaviors for non-critical failures

## Performance Considerations

- **Token Management**: Chat history automatically truncated based on token budget
- **Batch Operations**: DynamoDB batch operations where possible
- **Connection Pooling**: AWS SDK v3 with optimized connection management
- **Memory Optimization**: Configurable Lambda memory based on workload

## Monitoring

The runtime emits structured logs and events:

```json
{
  "level": "info",
  "message": "Agent processing completed",
  "tenantId": "tenant1",
  "contact_pk": "tenant1#user@example.com", 
  "duration_ms": 1250,
  "model": "anthropic.claude-3-sonnet-20240229-v1:0",
  "input_tokens": 150,
  "output_tokens": 75
}
```

## Testing

```bash
# Run tests
yarn test

# Run with coverage
yarn test --coverage

# Run specific test file
yarn test src/lib/dynamodb.test.ts
```

## Building

```bash
# Build TypeScript
yarn build

# Watch mode
yarn dev

# Clean build artifacts  
yarn clean
```

## Deployment

This package is designed to be consumed by the IaC package. It should not be deployed directly.

The IaC package references handler entry points:
```typescript
// In CDK construct
new NodejsFunction(this, 'AgentRouter', {
  entry: path.join(runtimePackagePath, 'src/handlers/router.ts'),
  handler: 'handler',
});
```
