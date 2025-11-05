# Consumer Implementation Guide

This guide provides everything consumers need to know to implement the KxGen LangChain Agent for different integration patterns.

## Implementation Options

### 1. EventBridge (Asynchronous) - ✅ READY

**Best for:** SMS, Email, Batch Processing, Webhooks

#### Quick Setup

```typescript
import { LangchainAgent } from '@toldyaonce/kx-langchain-agent-iac';

const agent = new LangchainAgent(this, 'MyAgent', {
  eventBus: events.EventBus.fromEventBusArn(this, 'Bus', 'arn:aws:events:...'),
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
});
```

#### Event Patterns

**Inbound (Consume):**
```json
{
  "source": ["kxgen.messaging"],
  "detail-type": ["lead.message.created"],
  "detail": {
    "tenantId": "company123",
    "email_lc": "user@example.com",
    "phone_e164": "+1234567890",
    "source": "sms|email|chat|api",
    "text": "Hello!",
    "channel_context": { "sms": { "from": "+1234567890" } }
  }
}
```

**Outbound (Publish):**
```json
{
  "source": "kxgen.agent",
  "detail-type": "agent.reply.created",
  "detail": {
    "tenantId": "company123",
    "contact_pk": "company123#user@example.com",
    "preferredChannel": "sms",
    "text": "Hi! How can I help?",
    "routing": {
      "sms": { "to": "+1234567890" }
    }
  }
}
```

#### Consumer Lambda Pattern

```typescript
import { createEventBridgeHandler } from '@toldyaonce/langchain-agent-runtime';

export const handler = createEventBridgeHandler({
  tenantId: 'my-company',
  invokeAgent: true,
  middleware: [
    // Custom authentication
    async (event, context, next) => {
      if (!validateTenant(event.detail.tenantId)) {
        throw new Error('Unauthorized tenant');
      }
      return next();
    },
    // Custom logging
    async (event, context, next) => {
      console.log('Processing message:', event.detail.text);
      return next();
    }
  ],
  errorHandler: async (error, event, context) => {
    // Custom error handling
    await sendToDeadLetterQueue(event, error);
  }
});
```

### 2. API Gateway HTTP API (Synchronous) - ✅ READY

**Best for:** Chat Widgets, Mobile Apps, Real-time Chat

#### Quick Setup

```typescript
import { ApiGateway, DynamoDBTables } from '@toldyaonce/kx-langchain-agent-iac';

const tables = new DynamoDBTables(this, 'Tables');
const chatApi = new ApiGateway(this, 'ChatApi', {
  tableNames: {
    messagesTable: tables.messagesTable.tableName,
    leadsTable: tables.leadsTable.tableName,
    personasTable: tables.personasTable.tableName,
  },
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  apiConfig: {
    corsConfiguration: {
      allowOrigins: ['https://mycompany.com'],
      allowMethods: [apigatewayv2.CorsHttpMethod.POST],
    },
  },
});
```

#### API Endpoints

**POST /chat** - Send message, get immediate response
**GET /health** - Health check

#### Client Examples

**JavaScript:**
```javascript
const response = await fetch('https://api.mycompany.com/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenantId: 'company123',
    message: 'Hello!',
    userEmail: 'user@example.com'
  })
});

const data = await response.json();
console.log('Agent:', data.message);
```

**React Hook:**
```tsx
const useChatApi = (apiUrl: string, tenantId: string) => {
  const [loading, setLoading] = useState(false);
  
  const sendMessage = useCallback(async (message: string, userEmail?: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, message, userEmail }),
      });
      return await response.json();
    } finally {
      setLoading(false);
    }
  }, [apiUrl, tenantId]);
  
  return { sendMessage, loading };
};
```

#### Consumer Lambda Pattern

```typescript
import { createApiGatewayHandler } from '@toldyaonce/langchain-agent-runtime';

export const handler = createApiGatewayHandler({
  tenantId: 'my-company',
  cors: {
    allowOrigins: ['https://mycompany.com'],
    allowMethods: ['POST'],
    allowHeaders: ['Content-Type', 'Authorization'],
  },
  middleware: [
    // JWT Authentication
    async (event, context, next) => {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token || !validateJWT(token)) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }
      return next();
    },
    // Rate limiting
    async (event, context, next) => {
      const clientIp = event.requestContext.http.sourceIp;
      if (await isRateLimited(clientIp)) {
        return {
          statusCode: 429,
          body: JSON.stringify({ error: 'Too many requests' }),
        };
      }
      return next();
    }
  ],
});
```

### 3. API Gateway WebSocket API - ⚠️ NOT YET IMPLEMENTED

**Best for:** Real-time bidirectional chat, live support, collaborative features

#### Current Status
WebSocket support is **not currently implemented** in the agent system. This would require:

1. **New IaC Construct:** `WebSocketApiGateway` construct
2. **Connection Management:** DynamoDB table for WebSocket connections
3. **Message Routing:** Bidirectional message handling
4. **Connection Lifecycle:** Connect/disconnect handlers

#### Proposed Implementation

```typescript
// FUTURE: Not yet available
import { WebSocketApiGateway } from '@toldyaonce/kx-langchain-agent-iac';

const wsApi = new WebSocketApiGateway(this, 'WebSocketChat', {
  tableNames: {
    messagesTable: tables.messagesTable.tableName,
    leadsTable: tables.leadsTable.tableName,
    connectionsTable: tables.connectionsTable.tableName, // New table needed
  },
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  routes: {
    connect: 'connect',
    disconnect: 'disconnect', 
    sendMessage: 'sendMessage',
  },
});
```

#### Client Pattern (Future)

```javascript
// FUTURE: Not yet available
const ws = new WebSocket('wss://ws.mycompany.com/chat');

ws.onopen = () => {
  ws.send(JSON.stringify({
    action: 'authenticate',
    tenantId: 'company123',
    userEmail: 'user@example.com'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'agent_response') {
    displayMessage(data.message);
  }
};

// Send message
const sendMessage = (text) => {
  ws.send(JSON.stringify({
    action: 'sendMessage',
    message: text
  }));
};
```

## Hybrid Implementation (Recommended)

Use multiple patterns for different channels:

```typescript
// EventBridge for async channels (SMS, Email)
const agent = new LangchainAgent(this, 'Agent', {
  eventBus: myEventBus,
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
});

// HTTP API for sync chat
const chatApi = new ApiGateway(this, 'ChatApi', {
  tableNames: {
    messagesTable: agent.dynamoDBTables!.messagesTable.tableName,
    leadsTable: agent.dynamoDBTables!.leadsTable.tableName,
    personasTable: agent.dynamoDBTables!.personasTable.tableName,
  },
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  eventBusArn: myEventBus.eventBusArn,
});

// Future: WebSocket API for real-time features
// const wsApi = new WebSocketApiGateway(this, 'WebSocketChat', { ... });
```

## Consumer Lambda Factory Benefits

### Complete Control
- **Your Infrastructure:** Deploy with any IaC tool (CDK, Terraform, Serverless)
- **Custom Authentication:** JWT, API keys, OAuth, custom logic
- **Middleware Pipeline:** Logging, validation, rate limiting, etc.
- **Error Handling:** Custom error responses and monitoring

### Example: Multi-Tenant SaaS

```typescript
export const handler = createApiGatewayHandler({
  middleware: [
    // Tenant validation
    async (event, context, next) => {
      const tenantId = JSON.parse(event.body || '{}').tenantId;
      const tenant = await getTenant(tenantId);
      if (!tenant.active) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Tenant suspended' }) };
      }
      context.tenant = tenant;
      return next();
    },
    // Usage tracking
    async (event, context, next) => {
      await trackApiUsage(context.tenant.id);
      return next();
    },
    // Custom persona injection
    async (event, context, next) => {
      const body = JSON.parse(event.body || '{}');
      body.personaOverrides = context.tenant.chatPersona;
      event.body = JSON.stringify(body);
      return next();
    }
  ],
});
```

## Next Steps for WebSocket Support

To add WebSocket support, the following components would need to be implemented:

1. **WebSocketApiGateway Construct** (IaC package)
2. **Connection Management Service** (Runtime package)  
3. **WebSocket Handler Factories** (Runtime package)
4. **Connection Lifecycle Handlers** (Runtime package)
5. **Bidirectional Message Routing** (Runtime package)

This would enable real-time features like:
- Live typing indicators
- Instant message delivery
- Real-time presence
- Collaborative features
- Live agent handoff

## Documentation Links

- **[IaC Package README](./packages/iac/README.md)** - Complete infrastructure setup
- **[Runtime Package README](./packages/runtime/README.md)** - Handler factories and services
- **[API Gateway Usage Guide](./packages/iac/docs/API_GATEWAY_USAGE.md)** - HTTP API client examples
- **[DynamoDB Schemas](./packages/iac/docs/DYNAMODB_SCHEMAS.md)** - Complete data model
- **[Consumer Lambda Patterns](./packages/runtime/docs/CONSUMER_LAMBDA_PATTERNS.md)** - Advanced patterns

