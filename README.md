# 🤖 KX LangChain Agent

A comprehensive, production-ready AI agent framework built on LangChain with AWS infrastructure support. This monorepo provides everything needed to deploy intelligent conversational agents with advanced features like intent detection, goal orchestration, and dynamic persona management.

## 🚀 Quick Start

### For Consumers (Integrating into Your App)

**📋 [Complete Setup Guide](./CONSUMER_SETUP_GUIDE.md)** ← **Start Here!**

```bash
# 1. Install packages
npm install @toldyaonce/kx-delayed-replies-infra @toldyaonce/kx-langchain-agent-runtime --registry https://npm.pkg.github.com

# 2. Deploy with automatic API Gateway integration
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

const agentStack = new DelayedRepliesStack(this, 'MyAgentStack', {
  apiGatewayConfig: {
    existingApi: yourExistingApi,
    basePath: 'agent'
  }
});
```

### For Development & Testing

```bash
# Install CLI globally
npm install -g @toldyaonce/kx-langchain-agent-cli --registry https://npm.pkg.github.com

# Start interactive chat
kxagent chat --persona carlos

# Deploy infrastructure
kxagent deploy --stack my-agent-stack
```

## 📦 Packages

This monorepo contains three main packages:

### 🔧 Runtime (`@toldyaonce/langchain-agent-runtime`)
The core agent runtime with all business logic, handlers, and services.

**Key Features:**
- 🧠 Advanced LangChain integration
- 🎯 Intent detection and action registry
- 🏆 Goal orchestration system
- 👤 Dynamic persona management
- 📊 DynamoDB integration
- ⚡ EventBridge event handling
- 🔄 Response chunking and streaming

### 🏗️ Infrastructure (`@toldyaonce/kx-langchain-agent-iac`)
AWS CDK constructs for deploying the agent infrastructure.

**Key Features:**
- 🌐 API Gateway V2 with WebSocket support
- 📡 EventBridge integration
- 🗄️ DynamoDB table management
- ⚡ Lambda function deployment
- 🔐 IAM roles and policies
- 📈 CloudWatch monitoring

### 🖥️ CLI (`@toldyaonce/kx-langchain-agent-cli`)
Command-line interface for development, testing, and deployment.

**Key Features:**
- 💬 Interactive chat testing
- 🧪 Conversation simulation
- 🎭 Persona management
- 🎯 Intent testing
- 🚀 Deployment commands

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Gateway   │────│   EventBridge   │────│     Lambda      │
│   (WebSocket)   │    │   (Routing)     │    │   (Agent)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   DynamoDB      │    │   CloudWatch    │    │   S3 Storage    │
│   (State)       │    │   (Monitoring)  │    │   (Assets)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🎭 Personas

The agent supports dynamic personas with rich configuration:

- **Carlos** 🥊 - Boxing enthusiast from RockBox Fitness
- **Alex** 💼 - Professional business consultant  
- **Sam** 🎓 - Friendly educational assistant

Each persona includes:
- Unique personality traits and language quirks
- Channel-aware contact collection rules
- Custom greeting variations
- Goal-specific behavior patterns

## 🎯 Intent System

Powerful intent detection with customizable actions:

```typescript
// Register custom intent actions
intentRegistry.register('appointment_booking', async (context) => {
  // Your custom booking logic
  return await scheduleAppointment(context.extractedInfo);
});
```

## 🏆 Goal Orchestration

Intelligent goal management system:
- **Contact Collection**: Name, email, phone (channel-aware)
- **Interest Assessment**: Product/service interest detection
- **Appointment Scheduling**: Calendar integration
- **Follow-up Management**: Automated nurturing sequences

## 🔌 Consumer Integration

### 📋 Complete Setup Guide

**👉 [CONSUMER_SETUP_GUIDE.md](./CONSUMER_SETUP_GUIDE.md)** - Step-by-step integration instructions

### 🌐 Management API Endpoints

The agent provides REST APIs for dynamic configuration:

| Service | Base Path | Description |
|---------|-----------|-------------|
| **Company Info** | `/company-info` | Manage company details & intent configuration |
| **Personas** | `/personas` | Create & manage AI personas |
| **Company-Persona** | `/company-persona` | Get combined company + persona data |

#### Key Endpoints:
```bash
# Company Management
POST   /company-info/                    # Create company
GET    /company-info/{tenantId}          # Get company info
PATCH  /company-info/{tenantId}          # Update company

# Persona Management  
POST   /personas/                        # Create persona
GET    /personas/{tenantId}              # List tenant personas
GET    /personas/{tenantId}/{personaId}  # Get specific persona
GET    /personas/{tenantId}/random       # Get random persona

# Combined Data (Used by Agent)
GET    /company-persona/{tenantId}/{personaId}  # Company + specific persona
GET    /company-persona/{tenantId}              # Company + random persona
```

### Quick Start for Consumers

1. **Deploy with Automatic API Integration**
```typescript
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

const agentStack = new DelayedRepliesStack(this, 'MyAgentStack', {
  apiGatewayConfig: {
    existingApi: yourExistingApi,  // Your existing API Gateway
    basePath: 'agent'              // Optional: adds /agent prefix
  }
});
```

2. **Set Up EventBridge Integration**
```typescript
// Subscribe to agent responses
const agentResponseRule = new events.Rule(this, 'AgentResponseRule', {
  eventPattern: {
    source: ['kxgen.agent'],
    detailType: ['agent.reply.created', 'agent.message.read', 'agent.typing.started']
  }
});
agentResponseRule.addTarget(new targets.LambdaFunction(yourMessageHandler));
```

3. **Publish User Messages**
```typescript
// When user sends a message
await eventBridge.send(new PutEventsCommand({
  Entries: [{
    Source: 'kxgen.messaging',
    DetailType: 'lead.message.created',
    Detail: JSON.stringify({
      tenantId: 'your-tenant-id',
      source: 'chat', // or 'sms', 'email', 'api'
      text: userMessage,
      email_lc: userEmail,
      conversation_id: conversationId
    })
  }]
}));
```

### 📡 Event Contracts

**You Publish (Inbound):**
- `lead.message.created` - User messages to process

**You Subscribe To (Outbound):**
- `agent.reply.created` - Final agent responses
- `agent.message.read` - Read receipts (delayed response system)
- `agent.typing.started/stopped` - Typing indicators (chat only)
- `agent.error` - Error handling
- `agent.trace` - Monitoring/telemetry

### 🌐 Management APIs

Automatic bootstrap pattern - just 3 lines to integrate with **your existing API Gateway**:

```typescript
// Automatic Management API integration
const delayedReplies = new DelayedRepliesStack(this, 'DelayedReplies', {
  eventBusName: 'your-event-bus',
  apiGatewayConfig: {
    existingApi: yourExistingApi,  // Your existing RestApi
    basePath: '/api'               // Optional prefix
  }
});

// All endpoints automatically created:
// POST /api/company-info - Create/update company info
// GET /api/personas/{tenantId} - List personas  
// GET /api/company-persona/{tenantId}/{personaId} - Get combined config
```

📚 **[Complete Integration Guide →](./CONSUMER_INTEGRATION_GUIDE.md)**  
🔧 **[Management API Bootstrap →](./MANAGEMENT_API_BOOTSTRAP_GUIDE.md)**

## 🚀 Deployment

### Quick Deploy
```bash
# Deploy everything
npm run deploy

# Deploy specific stack
cdk deploy LangchainAgentStack --app "npx ts-node packages/iac/src/app.ts"
```

### Custom Deployment
```typescript
import { LangchainAgent } from '@toldyaonce/kx-langchain-agent-iac';

const agent = new LangchainAgent(this, 'MyAgent', {
  eventBusName: 'my-event-bus',
  enableWebSocket: true,
  enableApiGateway: true,
});
```

## 🔧 Development

### Prerequisites
- Node.js 18+
- AWS CLI configured
- CDK CLI installed

### Setup
```bash
# Clone and install
git clone <repo-url>
cd kx-langchain-agent
npm install

# Build all packages
npm run build

# Run tests
npm test
```

### Local Development
```bash
# Start development server
npm run dev

# Interactive chat testing
kxagent chat --persona carlos --debug

# Test conversations
kxagent test-conversations --persona carlos
```

## 📊 Monitoring

Built-in observability:
- **CloudWatch Logs**: Structured logging
- **EventBridge Traces**: Event flow monitoring  
- **DynamoDB Metrics**: Performance tracking
- **Custom Metrics**: Business KPIs

## 🔐 Security

- **IAM Roles**: Least privilege access
- **VPC Integration**: Network isolation
- **Encryption**: At rest and in transit
- **API Authentication**: Token-based auth

## 📚 Documentation

- [Runtime Package](./packages/runtime/README.md)
- [Infrastructure Package](./packages/iac/README.md)
- [CLI Package](./packages/cli/README.md)
- [Consumer Lambda Patterns](./packages/runtime/docs/CONSUMER_LAMBDA_PATTERNS.md)
- [Customizable Intents](./packages/runtime/docs/CUSTOMIZABLE_INTENTS.md)
- [DynamoDB Schemas](./packages/iac/docs/DYNAMODB_SCHEMAS.md)
- [API Gateway Usage](./packages/iac/docs/API_GATEWAY_USAGE.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📧 Email: dev@toldyaonce.com
- 💬 Issues: GitHub Issues
- 📖 Docs: [Documentation Site](https://docs.toldyaonce.com)

---

Built with ❤️ by the toldyaonce team