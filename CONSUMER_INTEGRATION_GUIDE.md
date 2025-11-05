# 🔌 Consumer Integration Guide

Complete guide for integrating the KX LangChain Agent with your existing systems.

## 📡 EventBridge Integration

### Events the Agent CONSUMES (Inbound)

Your system needs to publish these events to trigger agent responses:

#### `lead.message.created`
```json
{
  "Source": "kxgen.messaging",
  "DetailType": "lead.message.created",
  "Detail": {
    "tenantId": "your-tenant-id",
    "email_lc": "user@example.com",
    "phone_e164": "+15551234567",
    "source": "chat",
    "text": "Hey, how do I cancel my membership?",
    "conversation_id": "conv-abc-123",
    "message_id": "msg-001",
    "timestamps": {
      "received": "2025-11-05T12:00:00Z"
    },
    "channel_context": {
      "sessionId": "session-123",
      "userAgent": "Mozilla/5.0...",
      "ipAddress": "192.168.1.1"
    }
  }
}
```

**Required Fields:**
- `tenantId`: Your organization identifier
- `source`: Channel type (`"chat"`, `"sms"`, `"email"`, `"api"`)
- `text`: The user's message

**Optional Fields:**
- `email_lc`: User's email (lowercase)
- `phone_e164`: User's phone in E.164 format
- `conversation_id`: Conversation thread identifier
- `message_id`: Unique message identifier
- `channel_context`: Additional channel-specific data

### Events the Agent EMITS (Outbound)

Subscribe to these events in your EventBridge to handle agent responses:

#### `agent.message.read` (Delayed Response System)
Indicates the agent has "read" the user's message.

```json
{
  "Source": "kxgen.agent",
  "DetailType": "agent.message.read",
  "Detail": {
    "tenantId": "your-tenant-id",
    "contact_pk": "contact#user@example.com",
    "channel": "chat",
    "conversation_id": "conv-abc-123",
    "message_id": "msg-001",
    "timestamps": {
      "at": "2025-11-05T12:00:01Z"
    }
  }
}
```

#### `agent.typing.started` (Chat Only)
Shows typing indicator for chat channels.

```json
{
  "Source": "kxgen.agent",
  "DetailType": "agent.typing.started",
  "Detail": {
    "tenantId": "your-tenant-id",
    "contact_pk": "contact#user@example.com",
    "channel": "chat",
    "conversation_id": "conv-abc-123",
    "message_id": "msg-001",
    "persona": "Carlos",
    "timestamps": {
      "at": "2025-11-05T12:00:02Z"
    }
  }
}
```

#### `agent.typing.stopped` (Chat Only)
Hides typing indicator before final response.

```json
{
  "Source": "kxgen.agent",
  "DetailType": "agent.typing.stopped",
  "Detail": {
    "tenantId": "your-tenant-id",
    "contact_pk": "contact#user@example.com",
    "channel": "chat",
    "conversation_id": "conv-abc-123",
    "message_id": "msg-001",
    "persona": "Carlos",
    "timestamps": {
      "at": "2025-11-05T12:00:06Z"
    }
  }
}
```

#### `agent.reply.created` (Final Response)
The agent's actual response to deliver to the user.

```json
{
  "Source": "kxgen.agent",
  "DetailType": "agent.reply.created",
  "Detail": {
    "tenantId": "your-tenant-id",
    "contact_pk": "contact#user@example.com",
    "preferredChannel": "chat",
    "text": "Hey champ! 🥊 I can help you with that. To cancel your membership, you can...",
    "routing": {
      "sms": { "to": "+15551234567" },
      "email": { "to": "user@example.com" },
      "chat": { "sessionId": "session-123" }
    },
    "conversation_id": "conv-abc-123",
    "metadata": {
      "persona": "Carlos",
      "intent": "membership_cancellation",
      "confidence": 0.95
    },
    "timing": {
      "read_ms": 900,
      "comprehension_ms": 950,
      "write_ms": 1200,
      "type_ms": 4000,
      "jitter_ms": 600,
      "total_ms": 7650
    }
  }
}
```

#### `agent.error` (Error Handling)
Emitted when agent processing fails.

```json
{
  "Source": "kxgen.agent",
  "DetailType": "agent.error",
  "Detail": {
    "tenantId": "your-tenant-id",
    "contact_pk": "contact#user@example.com",
    "error": "Failed to generate response: Model timeout",
    "stack": "Error: Model timeout\n    at AgentService...",
    "context": {
      "operation": "message_processing",
      "source": "chat",
      "messageLength": 45
    }
  }
}
```

#### `agent.trace` (Monitoring)
Telemetry events for monitoring and debugging.

```json
{
  "Source": "kxgen.agent",
  "DetailType": "agent.trace",
  "Detail": {
    "tenantId": "your-tenant-id",
    "contact_pk": "contact#user@example.com",
    "operation": "delayed_response_scheduled",
    "duration_ms": 1250,
    "metadata": {
      "persona": "Carlos",
      "channel": "chat",
      "inputLength": 45,
      "replyLength": 156
    }
  }
}
```

## 🏗️ EventBridge Setup

### 1. Create EventBridge Rules

```typescript
// CDK Example
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

// Rule to capture agent responses
const agentResponseRule = new events.Rule(this, 'AgentResponseRule', {
  eventPattern: {
    source: ['kxgen.agent'],
    detailType: [
      'agent.reply.created',
      'agent.message.read',
      'agent.typing.started',
      'agent.typing.stopped'
    ]
  }
});

// Route to your message delivery Lambda
agentResponseRule.addTarget(new targets.LambdaFunction(yourMessageDeliveryLambda));

// Rule for error handling
const agentErrorRule = new events.Rule(this, 'AgentErrorRule', {
  eventPattern: {
    source: ['kxgen.agent'],
    detailType: ['agent.error']
  }
});

agentErrorRule.addTarget(new targets.LambdaFunction(yourErrorHandlerLambda));
```

### 2. Publish Inbound Messages

```typescript
// Your message ingestion Lambda
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const eventBridge = new EventBridgeClient({});

export const handler = async (event: any) => {
  // When you receive a user message (webhook, WebSocket, etc.)
  await eventBridge.send(new PutEventsCommand({
    Entries: [{
      Source: 'kxgen.messaging',
      DetailType: 'lead.message.created',
      Detail: JSON.stringify({
        tenantId: 'your-tenant-id',
        email_lc: userEmail,
        source: 'chat',
        text: userMessage,
        conversation_id: conversationId,
        timestamps: {
          received: new Date().toISOString()
        }
      })
    }]
  }));
};
```

## 🌐 API Integration

### Management API (Company & Personas)

The Management API provides Lambda functions that attach to **your existing API Gateway**. Choose between automatic bootstrap or manual integration:

#### Option 1: Automatic Bootstrap (Recommended)

```typescript
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

// Automatic integration - just 3 lines!
const delayedReplies = new DelayedRepliesStack(this, 'DelayedReplies', {
  eventBusName: 'your-event-bus',
  apiGatewayConfig: {
    existingApi: yourExistingApi,  // RestApi from aws-cdk-lib/aws-apigateway
    basePath: '/api'               // Optional prefix (default: '/')
  }
});

// That's it! All endpoints are automatically created with CORS support
```

#### Option 2: Manual Integration

```typescript
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

// Deploy the stack without automatic integration
const delayedReplies = new DelayedRepliesStack(this, 'DelayedReplies', {
  eventBusName: 'your-event-bus'
});

// Manual attachment using helper method
delayedReplies.attachToApiGateway(yourExistingApi, '/api');

// Or get function details for custom integration
const managementFunctions = delayedReplies.getManagementApiFunctions();
```

📚 **[Complete Bootstrap Guide →](./MANAGEMENT_API_BOOTSTRAP_GUIDE.md)**

### Attach to Your Existing API Gateway

```typescript
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

// Assuming you have an existing API Gateway
const yourExistingApi = apigateway.RestApi.fromRestApiAttributes(this, 'ExistingApi', {
  restApiId: 'your-api-id',
  rootResourceId: 'your-root-resource-id'
});

// Create resources and methods for Management API
const managementFunctions = delayedReplies.getManagementApiFunctions();

// Company Info endpoints
const companyInfoResource = yourExistingApi.root.addResource('company-info');
const companyInfoIntegration = new apigateway.LambdaIntegration(
  lambda.Function.fromFunctionArn(this, 'CompanyInfoFn', managementFunctions.companyInfo.functionArn)
);

companyInfoResource.addMethod('POST', companyInfoIntegration); // Create company
companyInfoResource.addMethod('GET', companyInfoIntegration);  // List companies

const companyInfoByIdResource = companyInfoResource.addResource('{tenantId}');
companyInfoByIdResource.addMethod('GET', companyInfoIntegration);    // Get company
companyInfoByIdResource.addMethod('PUT', companyInfoIntegration);    // Update company
companyInfoByIdResource.addMethod('DELETE', companyInfoIntegration); // Delete company

// Personas endpoints
const personasResource = yourExistingApi.root.addResource('personas');
const personasIntegration = new apigateway.LambdaIntegration(
  lambda.Function.fromFunctionArn(this, 'PersonasFn', managementFunctions.personas.functionArn)
);

const personasByTenantResource = personasResource.addResource('{tenantId}');
personasByTenantResource.addMethod('GET', personasIntegration);  // List personas
personasByTenantResource.addMethod('POST', personasIntegration); // Create persona

const personasByIdResource = personasByTenantResource.addResource('{personaId}');
personasByIdResource.addMethod('GET', personasIntegration);    // Get persona
personasByIdResource.addMethod('PUT', personasIntegration);    // Update persona
personasByIdResource.addMethod('DELETE', personasIntegration); // Delete persona

// Company + Persona combined endpoint
const companyPersonaResource = yourExistingApi.root.addResource('company-persona');
const companyPersonaIntegration = new apigateway.LambdaIntegration(
  lambda.Function.fromFunctionArn(this, 'CompanyPersonaFn', managementFunctions.companyPersona.functionArn)
);

const companyPersonaByTenantResource = companyPersonaResource.addResource('{tenantId}');
companyPersonaByTenantResource.addMethod('GET', companyPersonaIntegration); // Get company + random persona

const companyPersonaByIdResource = companyPersonaByTenantResource.addResource('{personaId}');
companyPersonaByIdResource.addMethod('GET', companyPersonaIntegration); // Get company + specific persona
```

#### API Endpoints

**Company Info:**
- `GET /company-info/{tenantId}` - Get company information
- `POST /company-info` - Create company
- `PUT /company-info/{tenantId}` - Update company
- `DELETE /company-info/{tenantId}` - Delete company
- `GET /company-info/{tenantId}/intents` - Get company intents
- `PUT /company-info/{tenantId}/intents` - Update company intents

**Personas:**
- `GET /personas/{tenantId}` - List all personas for tenant
- `GET /personas/{tenantId}/{personaId}` - Get specific persona
- `GET /personas/{tenantId}/random` - Get random persona
- `POST /personas/{tenantId}` - Create persona
- `PUT /personas/{tenantId}/{personaId}` - Update persona
- `DELETE /personas/{tenantId}/{personaId}` - Delete persona

**Combined API:**
- `GET /company-persona/{tenantId}` - Get company + random persona
- `GET /company-persona/{tenantId}/{personaId}` - Get company + specific persona

### Example: Create Company & Persona

```typescript
// Create company
const companyResponse = await fetch(`${MANAGEMENT_API_URL}/company-info`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenantId: 'rockbox-fitness',
    name: 'RockBox Fitness Coral Springs',
    industry: 'Fitness & Wellness',
    description: 'High-energy boxing fitness studio',
    products: 'Boxing classes, personal training, nutrition coaching',
    benefits: 'Full-body workout, stress relief, community atmosphere',
    targetCustomers: 'Fitness enthusiasts, stress relief seekers, boxing beginners',
    differentiators: 'Boxing-focused, high-energy music, supportive community',
    intentCapturing: {
      enabled: true,
      intents: [
        {
          id: 'class_booking',
          name: 'Class Booking',
          description: 'User wants to book a class',
          triggers: ['book', 'schedule', 'class', 'reserve'],
          patterns: ['I want to book', 'schedule a class', 'reserve a spot'],
          priority: 'high',
          response: {
            type: 'operational',
            template: 'I can help you book a class! What day works best for you?',
            followUp: ['What time preference?', 'First time or returning?']
          },
          actions: ['capture_booking_intent', 'route_to_scheduling']
        }
      ],
      fallbackIntent: {
        id: 'general_inquiry',
        name: 'General Inquiry',
        description: 'Default response for unclear intents',
        response: {
          type: 'conversational',
          template: 'I\'m here to help! What can I assist you with today?'
        },
        actions: ['continue_conversation']
      },
      confidence: {
        threshold: 0.7,
        multipleIntentHandling: 'highest_confidence'
      }
    }
  })
});

// Create persona
const personaResponse = await fetch(`${MANAGEMENT_API_URL}/personas/rockbox-fitness`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    personaId: 'carlos',
    name: 'Carlos',
    description: 'Boxing enthusiast and motivational coach',
    systemPrompt: 'You are Carlos, a passionate boxing coach at {{companyName}}. You love calling people "champ" and use boxing glove emojis 🥊 when showing enthusiasm.',
    personality: {
      tone: 'enthusiastic',
      style: 'motivational',
      languageQuirks: ['calls everyone "champ"', 'uses boxing metaphors'],
      specialBehaviors: ['shows excitement with boxing emojis', 'relates everything to boxing']
    },
    responseGuidelines: [
      'Always be encouraging and motivational',
      'Use boxing terminology naturally',
      'Show genuine excitement about fitness',
      'Be supportive of all fitness levels'
    ],
    greetings: {
      gist: 'Enthusiastic boxing coach greeting',
      variations: [
        'Hey there, champ! 🥊 Ready to throw some punches at {{companyName}}?',
        'What\'s up, future champion! 🥊 How can I help you crush your fitness goals?',
        'Hey champ! 🥊 Carlos here from {{companyName}}. What brings you to the ring today?'
      ]
    },
    // ... other persona configuration
  })
});
```

## 🚀 Deployment Guide

### 1. Deploy Core Agent Infrastructure

```bash
# Deploy the main agent stack
cd packages/iac
npm run deploy

# This creates:
# - Agent Lambda functions
# - DynamoDB tables
# - EventBridge rules
# - API Gateway (optional)
```

### 2. Deploy Delayed Response System

```bash
# Deploy delayed response infrastructure
cd packages/infra
npm run deploy

# This creates:
# - SQS FIFO queues
# - Release Router Lambda
# - EventBridge permissions
```

### 3. Integrate Management API with Your API Gateway

```typescript
// In your CDK stack
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

const delayedReplies = new DelayedRepliesStack(this, 'DelayedReplies');

// Get Lambda function details
const managementFunctions = delayedReplies.getManagementApiFunctions();

// Grant your API Gateway permission to invoke the functions
delayedReplies.grantApiGatewayInvoke(yourExistingApiGateway.restApiArn);

// Add routes to your existing API Gateway (see API Integration section above)
```

### 4. Configure Environment Variables

Set these in your Lambda functions:

```bash
# Agent Lambda
EVENT_BUS_NAME=your-event-bus
RELEASE_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue-name.fifo
MESSAGES_TABLE=your-messages-table
LEADS_TABLE=your-leads-table
BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-20250514-v1:0

# Release Router Lambda  
EVENT_BUS_NAME=your-event-bus

# Management API
# (Automatically configured by CDK)
```

## 🔄 Message Flow Examples

### Chat Conversation Flow

```
1. User sends message via your chat widget
   ↓
2. Your webhook publishes: lead.message.created
   ↓
3. Agent processes and schedules delayed response
   ↓
4. Release Router emits: agent.message.read (900ms later)
   ↓ 
5. Your UI shows "Carlos is reading..."
   ↓
6. Release Router emits: agent.typing.started (1200ms later)
   ↓
7. Your UI shows "Carlos is typing..."
   ↓
8. Release Router emits: agent.typing.stopped + agent.reply.created (7650ms total)
   ↓
9. Your UI delivers Carlos's response: "Hey champ! 🥊 I can help..."
```

### SMS/Email Flow

```
1. User sends SMS/email
   ↓
2. Your system publishes: lead.message.created
   ↓
3. Agent processes and schedules delayed response
   ↓
4. Release Router emits: agent.reply.created (after calculated delay)
   ↓
5. Your system delivers response via SMS/email
```

## 🎛️ Configuration Options

### Persona Timing Customization

```typescript
// Customize persona timing in the Management API
const personaTiming = {
  read_cps: [8, 12],        // Characters per second reading speed
  type_cps: [3, 6],         // Characters per second typing speed  
  comp_base_ms: [500, 1200], // Base comprehension time
  comp_ms_per_token: [2, 5], // Additional time per token
  write_ms_per_char: [4, 8], // Time to compose per character
  jitter_ms: [200, 800],     // Random delay variation
  pauses: {                  // Natural pauses while typing
    prob: 0.3,               // 30% chance of pause
    each_ms: [300, 900],     // Pause duration range
    max: 2                   // Maximum pauses per response
  }
};
```

### Channel-Specific Behavior

```typescript
const channelRules = {
  chat: {
    // Full delayed response flow
    events: ['READ', 'TYPING_ON', 'TYPING_OFF', 'FINAL'],
    maxDelay: 45000 // 45 seconds max for UX
  },
  sms: {
    // Final response only
    events: ['FINAL'],
    maxDelay: 300000 // 5 minutes max
  },
  email: {
    // Final response only  
    events: ['FINAL'],
    maxDelay: 900000 // 15 minutes max
  }
};
```

## 🔍 Monitoring & Debugging

### CloudWatch Metrics to Monitor

```typescript
// Custom metrics you should track
const metrics = [
  'agent.responses.scheduled',
  'agent.responses.delivered', 
  'agent.errors.count',
  'agent.timing.accuracy',
  'sqs.queue.depth',
  'eventbridge.delivery.success'
];
```

### Debug Event Flow

```bash
# Monitor EventBridge events
aws logs tail /aws/events/rule/agent-response-rule --follow

# Monitor SQS queue
aws sqs get-queue-attributes --queue-url $RELEASE_QUEUE_URL --attribute-names All

# Monitor Lambda logs
aws logs tail /aws/lambda/DelayedRepliesStack-ReleaseRouterFunction --follow
```

## 🆘 Troubleshooting

### Common Issues

**Messages not being delivered:**
```bash
# Check EventBridge rule targets
aws events list-targets-by-rule --rule agent-response-rule

# Check Lambda permissions
aws lambda get-policy --function-name your-message-delivery-function
```

**Delayed responses not working:**
```bash
# Check SQS queue status
aws sqs get-queue-attributes --queue-url $RELEASE_QUEUE_URL

# Check dead letter queue
aws sqs receive-message --queue-url $DLQ_URL
```

**Timing inconsistencies:**
```bash
# Verify seed-based consistency
node -e "
const { computeTiming } = require('@toldyaonce/kx-agent-core');
console.log(computeTiming('test-seed', persona, 100, 30, 300));
"
```

## 📞 Support

- **Documentation**: [Full API Reference](./API_REFERENCE.md)
- **Examples**: [Integration Examples](./examples/)
- **Issues**: GitHub Issues
- **Monitoring**: [CloudWatch Playbook](./MONITORING.md)
