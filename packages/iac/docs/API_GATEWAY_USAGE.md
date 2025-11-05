# API Gateway Usage Guide

This guide shows how to use the API Gateway construct for **synchronous chat interactions** with the KxGen LangChain Agent.

## Overview

The `ApiGateway` construct creates an HTTP API (API Gateway V2) with Lambda integration, perfect for:
- **Chat widgets** on websites
- **Mobile app** messaging
- **Real-time chat** applications
- **Synchronous messaging** interfaces

Unlike the EventBridge-based flow (which is async and perfect for SMS/email), the API Gateway provides **immediate responses** for chat scenarios.

## Quick Start

### 1. Basic Setup

```typescript
import { ApiGateway, DynamoDBTables } from '@kxgen/langchain-agent-iac';

// Create DynamoDB tables
const tables = new DynamoDBTables(this, 'AgentTables');

// Create API Gateway for chat
const chatApi = new ApiGateway(this, 'ChatApi', {
  tableNames: {
    messagesTable: tables.messagesTable.tableName,
    leadsTable: tables.leadsTable.tableName,
    personasTable: tables.personasTable.tableName,
  },
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
});

// Output the API URL
new CfnOutput(this, 'ChatApiUrl', {
  value: chatApi.apiUrl,
  description: 'Chat API endpoint URL',
});
```

### 2. Advanced Configuration

```typescript
const chatApi = new ApiGateway(this, 'ChatApi', {
  tableNames: {
    messagesTable: 'my-messages',
    leadsTable: 'my-leads',
    personasTable: 'my-personas',
  },
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  eventBusArn: 'arn:aws:events:us-east-1:123456789012:event-bus/my-events',
  
  // API Configuration
  apiConfig: {
    apiName: 'my-company-chat-api',
    description: 'Customer support chat API',
    stageName: 'prod',
    
    // CORS for your domain
    corsConfiguration: {
      allowOrigins: ['https://mycompany.com', 'https://app.mycompany.com'],
      allowMethods: [apigatewayv2.CorsHttpMethod.POST],
      allowHeaders: ['Content-Type', 'Authorization'],
    },
    
    // Rate limiting
    throttling: {
      rateLimit: 1000,   // requests per second
      burstLimit: 2000,  // burst capacity
    },
    
    enableAccessLogging: true,
  },
  
  // Lambda Configuration
  lambdaConfig: {
    memorySize: 1536,
    timeout: Duration.seconds(45),
    environment: {
      LOG_LEVEL: 'DEBUG',
      CUSTOM_SETTING: 'value',
    },
  },
});
```

## API Endpoints

### POST /chat

Send a message to the agent and get an immediate response.

#### Request Format

```json
{
  "tenantId": "company123",
  "message": "Hi, I want to learn about boxing classes",
  "userEmail": "john.doe@example.com",
  "sessionId": "sess_abc123",
  "conversationId": "conv_xyz789",
  "leadId": "lead_456",
  "metadata": {
    "source": "website_widget",
    "page": "/pricing"
  }
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | string | ✅ | Your organization identifier |
| `message` | string | ✅ | User's message text |
| `userEmail` | string | ❌ | User's email (for known users) |
| `userId` | string | ❌ | User ID (for anonymous users) |
| `sessionId` | string | ❌ | Chat session identifier |
| `conversationId` | string | ❌ | Conversation thread ID |
| `leadId` | string | ❌ | Existing lead identifier |
| `metadata` | object | ❌ | Custom metadata |

#### Response Format

```json
{
  "success": true,
  "message": "Hey champ! I'd love to help you get started with boxing! 🥊",
  "intent": {
    "id": "general_inquiry",
    "confidence": 0.85,
    "category": "information_request"
  },
  "metadata": {
    "processingTimeMs": 1250,
    "totalProcessingTimeMs": 1350,
    "model": "anthropic.claude-3-sonnet-20240229-v1:0"
  },
  "conversationId": "conv_xyz789",
  "sessionId": "sess_abc123"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the request succeeded |
| `message` | string | Agent's response text |
| `intent` | object | Detected intent information |
| `metadata` | object | Processing metadata |
| `conversationId` | string | Conversation thread ID |
| `sessionId` | string | Chat session ID |

### GET /health

Health check endpoint for monitoring.

#### Response Format

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "service": "kxgen-langchain-agent-api"
}
```

## Client Integration Examples

### JavaScript/TypeScript

```typescript
class ChatClient {
  constructor(private apiUrl: string, private tenantId: string) {}

  async sendMessage(message: string, options: {
    userEmail?: string;
    sessionId?: string;
    conversationId?: string;
    metadata?: Record<string, any>;
  } = {}): Promise<ChatResponse> {
    const response = await fetch(`${this.apiUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenantId: this.tenantId,
        message,
        ...options,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat API error: ${response.status}`);
    }

    return response.json();
  }
}

// Usage
const chatClient = new ChatClient('https://api.mycompany.com', 'company123');

const response = await chatClient.sendMessage('Hello!', {
  userEmail: 'user@example.com',
  sessionId: 'sess_123',
  metadata: { source: 'website' },
});

console.log('Agent response:', response.message);
```

### React Chat Widget

```tsx
import React, { useState, useCallback } from 'react';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

export const ChatWidget: React.FC<{
  apiUrl: string;
  tenantId: string;
  userEmail?: string;
}> = ({ apiUrl, tenantId, userEmail }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `sess_${Date.now()}`);
  const [conversationId, setConversationId] = useState<string>();

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      text,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          message: text,
          userEmail,
          sessionId,
          conversationId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update conversation ID
        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId);
        }

        // Add agent response
        const agentMessage: ChatMessage = {
          id: `agent_${Date.now()}`,
          text: data.message,
          sender: 'agent',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, agentMessage]);
      } else {
        throw new Error(data.message || 'Failed to send message');
      }
    } catch (error) {
      console.error('Chat error:', error);
      // Add error message
      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        text: 'Sorry, I encountered an error. Please try again.',
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, tenantId, userEmail, sessionId, conversationId, loading]);

  return (
    <div className="chat-widget">
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.sender}`}>
            <div className="text">{msg.text}</div>
            <div className="timestamp">{msg.timestamp.toLocaleTimeString()}</div>
          </div>
        ))}
        {loading && <div className="loading">Agent is typing...</div>}
      </div>
      
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage(input)}
          placeholder="Type your message..."
          disabled={loading}
        />
        <button onClick={() => sendMessage(input)} disabled={loading}>
          Send
        </button>
      </div>
    </div>
  );
};
```

### Python Client

```python
import requests
from typing import Optional, Dict, Any

class ChatClient:
    def __init__(self, api_url: str, tenant_id: str):
        self.api_url = api_url.rstrip('/')
        self.tenant_id = tenant_id
    
    def send_message(
        self,
        message: str,
        user_email: Optional[str] = None,
        session_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        payload = {
            'tenantId': self.tenant_id,
            'message': message,
        }
        
        if user_email:
            payload['userEmail'] = user_email
        if session_id:
            payload['sessionId'] = session_id
        if conversation_id:
            payload['conversationId'] = conversation_id
        if metadata:
            payload['metadata'] = metadata
        
        response = requests.post(
            f'{self.api_url}/chat',
            json=payload,
            headers={'Content-Type': 'application/json'}
        )
        response.raise_for_status()
        return response.json()

# Usage
client = ChatClient('https://api.mycompany.com', 'company123')

response = client.send_message(
    'Hello, I want to learn about your services',
    user_email='user@example.com',
    metadata={'source': 'python_client'}
)

print(f"Agent: {response['message']}")
if response.get('intent'):
    print(f"Intent: {response['intent']['id']} ({response['intent']['confidence']})")
```

## Architecture Patterns

### 1. Hybrid Approach (Recommended)

Use **both** EventBridge and API Gateway for different channels:

```typescript
// EventBridge for async channels (SMS, Email)
const agent = new LangchainAgent(this, 'Agent', {
  eventBus: myEventBus,
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
});

// API Gateway for sync channels (Chat, Mobile)
const chatApi = new ApiGateway(this, 'ChatApi', {
  tableNames: {
    messagesTable: agent.dynamoDBTables!.messagesTable.tableName,
    leadsTable: agent.dynamoDBTables!.leadsTable.tableName,
    personasTable: agent.dynamoDBTables!.personasTable.tableName,
  },
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  eventBusArn: myEventBus.eventBusArn, // For analytics events
});
```

### 2. API Gateway Only

For chat-focused applications:

```typescript
const tables = new DynamoDBTables(this, 'Tables');
const chatApi = new ApiGateway(this, 'ChatApi', {
  tableNames: {
    messagesTable: tables.messagesTable.tableName,
    leadsTable: tables.leadsTable.tableName,
    personasTable: tables.personasTable.tableName,
  },
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
});
```

## Error Handling

The API returns structured error responses:

```json
{
  "success": false,
  "error": "Invalid request format",
  "message": "Validation errors: message: Required",
  "metadata": {
    "processingTimeMs": 50,
    "requestId": "abc123"
  }
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Bad request (validation errors)
- `405`: Method not allowed
- `429`: Too many requests (rate limited)
- `500`: Internal server error

## Monitoring & Observability

### CloudWatch Metrics

The API Gateway automatically provides metrics:
- Request count
- Latency (p50, p95, p99)
- Error rates (4xx, 5xx)
- Throttling

### Custom Logging

The Lambda functions log:
- Request/response details
- Processing times
- Intent detection (in red for visibility)
- Errors with stack traces

### Health Checks

Use the `/health` endpoint for:
- Load balancer health checks
- Monitoring system checks
- Service discovery

## Security Considerations

### CORS Configuration

Configure CORS properly for your domains:

```typescript
corsConfiguration: {
  allowOrigins: ['https://mycompany.com'], // Specific domains
  allowMethods: [apigatewayv2.CorsHttpMethod.POST],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowCredentials: true, // If using cookies/auth
}
```

### Rate Limiting

Implement throttling to prevent abuse:

```typescript
throttling: {
  rateLimit: 100,   // requests per second per IP
  burstLimit: 200,  // burst capacity
}
```

### Authentication

Add API keys or JWT validation:

```typescript
// In your Lambda function
const authHeader = event.headers.authorization;
if (!authHeader || !validateToken(authHeader)) {
  return {
    statusCode: 401,
    body: JSON.stringify({ error: 'Unauthorized' }),
  };
}
```

This API Gateway approach gives you the **best of both worlds**: async processing for traditional channels (SMS/email) and real-time responses for modern chat interfaces!

