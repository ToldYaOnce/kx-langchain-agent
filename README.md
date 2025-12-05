# 🤖 KX LangChain Agent

A production-ready AI conversational agent framework built on LangChain with AWS infrastructure. This agent powers intelligent lead qualification, appointment scheduling, and data collection through natural conversation.

## 🎯 What This Project Does

The KX LangChain Agent is a **goal-driven conversational AI** that:

1. **Collects Lead Information** - Names, emails, phone numbers through natural conversation
2. **Qualifies Leads** - Assesses fitness goals, motivation, timeline, and interest level
3. **Schedules Appointments** - Books consultations based on business hours
4. **Tracks Engagement** - Monitors interest level, conversion likelihood, and emotional tone
5. **Maintains Persona** - Responds as a configurable character (e.g., "King Mo" the boxing coach)

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Goal Orchestration** | Sequenced workflow goals with prerequisites and triggers |
| **Intent Detection** | LLM-powered extraction of user intent and data |
| **Conversation Analytics** | Per-message scoring of interest, conversion likelihood, emotional tone |
| **Multi-Channel Support** | SMS, Email, Chat (WebSocket), API |
| **Dynamic Personas** | Configurable personality, tone, and behavior |
| **Event-Driven Architecture** | EventBridge integration for async processing |

---

## 📦 Packages

| Package | NPM | Description |
|---------|-----|-------------|
| `@toldyaonce/kx-langchain-agent-runtime` | Runtime | Core agent logic, handlers, services |
| `@toldyaonce/kx-langchain-agent-iac` | IAC | AWS CDK constructs for deployment |
| `@toldyaonce/kx-langchain-agent-cli` | CLI | Local testing and development tools |
| `@toldyaonce/kx-delayed-replies-infra` | Infra | Consumer-facing CDK stack |
| `@toldyaonce/kx-langchain-agent-core` | Core | Shared utilities (compose, timing) |
| `@toldyaonce/release-router` | Router | Event routing Lambda |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           INBOUND EVENTS                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ SMS (Twilio)│  │   Email     │  │ Chat Widget │  │   REST API  │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │           │
│         └────────────────┴────────────────┴────────────────┘           │
│                                   │                                     │
│                                   ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    AWS EventBridge                               │   │
│  │   Source: kxgen.messaging                                        │   │
│  │   DetailType: lead.message.created                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                   │                                     │
│                                   ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Router Lambda                                 │   │
│  │   • Validates event schema                                       │   │
│  │   • Resolves contact/channel info                                │   │
│  │   • Invokes Agent Lambda                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                   │                                     │
│                                   ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Agent Lambda                                  │   │
│  │   ┌─────────────────────────────────────────────────────────┐   │   │
│  │   │  AgentService                                            │   │   │
│  │   │   • Goal Orchestrator (workflow state machine)           │   │   │
│  │   │   • Message Processor (LLM intent detection)             │   │   │
│  │   │   • Channel State Service (DynamoDB persistence)         │   │   │
│  │   │   • EventBridge Service (event emission)                 │   │   │
│  │   └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                   │                                     │
│                                   ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    AWS EventBridge                               │   │
│  │   Source: kxgen.agent                                            │   │
│  │   DetailTypes: agent.reply.created, lead.contact_captured, etc.  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                   │                                     │
│                                   ▼                                     │
│                          OUTBOUND EVENTS                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ SMS Reply   │  │ Email Reply │  │ Chat Reply  │  │ Webhook     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘

                              DATA STORES
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   DynamoDB      │  │   DynamoDB      │  │   DynamoDB      │
│   Messages      │  │   Workflow      │  │   Company/      │
│   Table         │  │   State Table   │  │   Persona Table │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 📡 Event Contracts

### Events We Subscribe To (Inbound)

| Source | DetailType | Description |
|--------|------------|-------------|
| `kxgen.messaging` | `lead.message.created` | User sends a message to the agent |
| `kx-notifications-messaging` | `chat.message.available` | Chat message from WebSocket |

#### `lead.message.created` Payload

```typescript
{
  tenantId: string;           // Your tenant ID
  source: 'sms' | 'email' | 'chat' | 'api';
  text: string;               // The user's message
  email_lc?: string;          // User email (lowercase)
  phone_e164?: string;        // User phone (E.164 format)
  conversation_id?: string;   // Conversation/channel ID
  lead_id?: string;           // Lead ID if known
  channel_context?: {
    sms?: { from: string; to: string; messageId?: string };
    email?: { from: string; to: string; subject?: string };
    chat?: { sessionId: string; connectionId?: string };
  };
}
```

---

### Events We Emit (Outbound)

| Source | DetailType | Description |
|--------|------------|-------------|
| `kxgen.agent` | `agent.reply.created` | Agent's response message |
| `kxgen.agent` | `chat.received` | Agent received the message |
| `kxgen.agent` | `chat.read` | Agent "read" the message |
| `kxgen.agent` | `chat.typing` | Agent is typing |
| `kxgen.agent` | `chat.stoppedTyping` | Agent stopped typing |
| `kxgen.agent` | `lead.contact_captured` | Contact info (email+phone) collected |
| `kxgen.agent` | `appointment.consultation_requested` | User requested appointment |
| `kxgen.agent` | `agent.goal.activated` | Workflow goal activated |
| `kxgen.agent` | `agent.goal.completed` | Workflow goal completed |
| `kxgen.agent` | `agent.data.captured` | Data field captured |
| `kxgen.agent` | `agent.workflow.state_updated` | Workflow state changed |
| `kxgen.agent` | `agent.interest.detected` | User interest signal detected |
| `kxgen.agent` | `agent.objection.detected` | User objection detected |
| `kxgen.agent` | `agent.error` | Processing error occurred |
| `kxgen.agent` | `agent.trace` | Debug/telemetry trace |

#### `agent.reply.created` Payload

```typescript
{
  tenantId: string;
  contact_pk: string;         // {tenantId}#{email_lc}
  text: string;               // Agent's response message
  followUpQuestion?: string;  // Optional follow-up question
  conversation_id?: string;
  source: 'sms' | 'email' | 'chat' | 'api';
  channel_context?: { ... };
  metadata?: {
    processingTimeMs: number;
    model: string;
    goalId?: string;
    intent?: string;
  };
}
```

#### `lead.contact_captured` Payload

```typescript
{
  tenantId: string;
  channelId: string;
  email: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  capturedData: Record<string, any>;  // All data collected so far
  timestamp: string;
}
```

#### `appointment.consultation_requested` Payload

```typescript
{
  tenantId: string;
  channelId: string;
  appointmentType: string;    // e.g., "fitness_consultation"
  preferredDate?: string;     // e.g., "Monday"
  preferredTime?: string;     // e.g., "7pm"
  normalizedDateTime?: string; // ISO format: "2025-12-09T19:00:00"
  duration?: number;          // Minutes
  contactInfo: {
    email?: string;
    phone?: string;
    firstName?: string;
  };
}
```

---

## 🌐 REST API Endpoints

### Chat Endpoint

```
POST /chat
```

**Request:**
```json
{
  "tenantId": "company123",
  "message": "Hi, I want to learn about boxing classes",
  "userEmail": "john.doe@example.com",
  "sessionId": "sess_abc123",
  "conversationId": "conv_xyz789",
  "metadata": { "source": "website_widget" }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Hey champ! I'd love to help you get started with boxing!",
  "followUpQuestion": "What's your name, champion?",
  "intent": {
    "id": "general_inquiry",
    "confidence": 0.85
  },
  "metadata": {
    "processingTimeMs": 1250,
    "model": "anthropic.claude-3-sonnet-20240229-v1:0"
  },
  "conversationId": "conv_xyz789",
  "sessionId": "sess_abc123"
}
```

### Management API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/company-info/` | Create company configuration |
| `GET` | `/company-info/{tenantId}` | Get company info |
| `PATCH` | `/company-info/{tenantId}` | Update company info |
| `POST` | `/personas/` | Create persona |
| `GET` | `/personas/{tenantId}` | List tenant personas |
| `GET` | `/personas/{tenantId}/{personaId}` | Get specific persona |
| `GET` | `/company-persona/{tenantId}/{personaId}` | Get combined company + persona config |

---

## 🎯 Goal Orchestration

The agent follows a configurable workflow of goals:

```typescript
const goalConfiguration = {
  enabled: true,
  goals: [
    {
      id: 'collect_identity',
      name: 'Get Name',
      type: 'data_collection',
      order: 1,
      dataToCapture: {
        fields: ['firstName', 'lastName'],
        validationRules: { firstName: { required: true } }
      }
    },
    {
      id: 'assess_fitness_goals',
      name: 'Assess Goals',
      type: 'data_collection',
      order: 2,
      triggers: { prerequisiteGoals: ['collect_identity'] },
      dataToCapture: {
        fields: ['motivationReason', 'primaryGoal', 'timeline']
      }
    },
    {
      id: 'schedule_consultation',
      name: 'Schedule Session',
      type: 'scheduling',
      order: 3,
      isPrimary: true,
      triggers: { prerequisiteGoals: ['assess_fitness_goals'] },
      dataToCapture: {
        fields: ['preferredDate', 'preferredTime']
      },
      actions: {
        onComplete: [{
          type: 'trigger_scheduling_flow',
          eventName: 'appointment.consultation_requested'
        }]
      }
    },
    // ... more goals
  ]
}
```

---

## 📊 Conversation Analytics

Each message is analyzed and scored:

```typescript
interface MessageAnalysis {
  messageIndex: number;           // 1, 2, 3...
  timestamp: string;              // ISO timestamp
  messageText: string;            // The user's message
  interestLevel: number;          // 1-5 (1=cold, 5=eager)
  conversionLikelihood: number;   // 0-1 (probability)
  emotionalTone: string;          // "positive", "neutral", "negative", "frustrated", "urgent"
  languageProfile: {
    formality: number;            // 1-5 (casual to formal)
    hypeTolerance: number;        // 1-5 (calm to loves hype)
    emojiUsage: number;           // 0-5 (frequency)
    language: string;             // "en", "es", etc.
  };
  primaryIntent: string;          // "scheduling", "workflow_data_capture", etc.
}
```

Rolling aggregates are maintained:

```typescript
interface ConversationAggregates {
  engagementScore: number;        // 0-1 overall engagement
  avgInterestLevel: number;       // Average across messages
  avgConversionLikelihood: number;
  dominantEmotionalTone: string;  // Most frequent tone
  messageHistory: MessageAnalysis[]; // Last 50 messages
  emotionalToneFrequency: Record<string, number>;
}
```

---

## 🚀 Quick Start

### For Development (CLI)

```bash
# Install CLI globally
npm install -g @toldyaonce/kx-langchain-agent-cli --registry https://npm.pkg.github.com

# Set AWS credentials
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

# Start interactive chat
kxagent chat

# With debug logging
kxagent chat --debug
```

### For Integration (CDK)

```typescript
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

const agentStack = new DelayedRepliesStack(this, 'AgentStack', {
  eventBusName: 'your-event-bus',
  apiGatewayConfig: {
    existingApi: yourExistingApi,
    basePath: 'agent'
  }
});
```

### Subscribe to Agent Events

```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

// Subscribe to agent responses
new events.Rule(this, 'AgentResponseRule', {
  eventPattern: {
    source: ['kxgen.agent'],
    detailType: ['agent.reply.created']
  }
}).addTarget(new targets.LambdaFunction(yourMessageHandler));

// Subscribe to lead capture events
new events.Rule(this, 'LeadCaptureRule', {
  eventPattern: {
    source: ['kxgen.agent'],
    detailType: ['lead.contact_captured']
  }
}).addTarget(new targets.LambdaFunction(yourCrmHandler));

// Subscribe to appointment requests
new events.Rule(this, 'AppointmentRule', {
  eventPattern: {
    source: ['kxgen.agent'],
    detailType: ['appointment.consultation_requested']
  }
}).addTarget(new targets.LambdaFunction(yourSchedulingHandler));
```

### Publish Messages to Agent

```typescript
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const client = new EventBridgeClient({});

await client.send(new PutEventsCommand({
  Entries: [{
    Source: 'kxgen.messaging',
    DetailType: 'lead.message.created',
    EventBusName: 'your-event-bus',
    Detail: JSON.stringify({
      tenantId: 'your-tenant-id',
      source: 'chat',
      text: 'Hi, I want to schedule a class',
      email_lc: 'user@example.com',
      conversation_id: 'conv_123'
    })
  }]
}));
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MESSAGES_TABLE` | DynamoDB messages table name | Yes |
| `LEADS_TABLE` | DynamoDB leads table name | Yes |
| `WORKFLOW_STATE_TABLE` | DynamoDB workflow state table | Yes |
| `BEDROCK_MODEL_ID` | AWS Bedrock model ID | Yes |
| `OUTBOUND_EVENT_BUS_NAME` | EventBridge bus for outbound events | Yes |
| `AWS_REGION` | AWS region | Yes |
| `HISTORY_LIMIT` | Max conversation history messages | No (default: 20) |

### Company Configuration

```json
{
  "tenantId": "company123",
  "name": "KxGrynde Fitness",
  "businessHours": {
    "monday": [{ "from": "06:00", "to": "21:00" }],
    "tuesday": [{ "from": "06:00", "to": "21:00" }],
    ...
  },
  "goalConfiguration": { ... },
  "intentConfiguration": { ... }
}
```

### Persona Configuration

```json
{
  "personaId": "king-mo",
  "name": "King Mo",
  "role": "Head Boxing Coach",
  "personality": {
    "traits": ["motivational", "energetic", "supportive"],
    "communicationStyle": "casual and encouraging",
    "quirks": ["Uses boxing metaphors", "Calls everyone 'champion'"]
  },
  "systemPrompt": "You are King Mo, the legendary boxing coach..."
}
```

---

## 📚 Additional Documentation

- [Runtime Package](./packages/runtime/README.md)
- [Infrastructure Package](./packages/iac/README.md)
- [CLI Package](./packages/cli/README.md)
- [Consumer Lambda Patterns](./packages/runtime/docs/CONSUMER_LAMBDA_PATTERNS.md)
- [Customizable Intents](./packages/runtime/docs/CUSTOMIZABLE_INTENTS.md)
- [DynamoDB Schemas](./packages/iac/docs/DYNAMODB_SCHEMAS.md)
- [Goal Orchestration](./packages/runtime/GOAL_DRIVEN_QUESTIONS.md)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🆘 Support

- 📧 Email: dev@toldyaonce.com
- 💬 Issues: GitHub Issues

---

Built with ❤️ by the toldyaonce team
