# 🚀 Consumer Setup Guide

Complete step-by-step guide for integrating the KX LangChain Agent into your application.

## 📋 Table of Contents

1. [Installation](#installation)
2. [DynamoDB Tables Setup](#dynamodb-tables-setup)
3. [API Endpoints Overview](#api-endpoints-overview)
4. [API Gateway Integration](#api-gateway-integration)
5. [Environment Variables](#environment-variables)
6. [Testing Your Setup](#testing-your-setup)
7. [Sample Data Creation](#sample-data-creation)

## 📦 Installation

```bash
npm install @toldyaonce/kx-delayed-replies-infra @toldyaonce/kx-langchain-agent-runtime @toldyaonce/kx-langchain-agent-iac --registry https://npm.pkg.github.com
```

## 🗄️ DynamoDB Tables Setup

### Required Tables

You need to create **5 DynamoDB tables**. Use the `DelayedRepliesStack` which automatically creates all required tables:

```typescript
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

const agentStack = new DelayedRepliesStack(this, 'MyAgentStack', {
  // Tables will be created with these names:
  // - MyAgentStack-company-info
  // - MyAgentStack-personas  
  // - kxgen-messages (default)
  // - kxgen-leads (default)
  // - kxgen-personas (default)
});
```

### Manual Table Creation (Alternative)

If you prefer to create tables manually:

#### 1. Company Info Table
```typescript
const companyInfoTable = new dynamodb.Table(this, 'CompanyInfoTable', {
  tableName: 'your-app-company-info',
  partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,
});
```

#### 2. Personas Table  
```typescript
const personasTable = new dynamodb.Table(this, 'PersonasTable', {
  tableName: 'your-app-personas',
  partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'personaId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,
});
```

#### 3. Messages Table
```typescript
const messagesTable = new dynamodb.Table(this, 'MessagesTable', {
  tableName: 'your-app-messages',
  partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,
  // Add GSIs for querying
  globalSecondaryIndexes: [
    {
      indexName: 'GSI1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
    },
    {
      indexName: 'GSI2', 
      partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: dynamodb.AttributeType.STRING },
    }
  ]
});
```

#### 4. Leads Table
```typescript
const leadsTable = new dynamodb.Table(this, 'LeadsTable', {
  tableName: 'your-app-leads',
  partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,
  // Add GSIs for phone lookup and lead queries
  globalSecondaryIndexes: [
    {
      indexName: 'GSI1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
    },
    {
      indexName: 'GSI2',
      partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: dynamodb.AttributeType.STRING },
    }
  ]
});
```

## 🔌 API Endpoints Overview

The agent provides **3 main API services**:

### 1. Company Info API (`/company-info`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/company-info/` | Create company info |
| `GET` | `/company-info/{tenantId}` | Get company info |
| `PATCH` | `/company-info/{tenantId}` | Update company info |
| `DELETE` | `/company-info/{tenantId}` | Delete company info |
| `GET` | `/company-info/` | List all companies |

### 2. Personas API (`/personas`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/personas/` | Create persona |
| `GET` | `/personas/{tenantId}/{personaId}` | Get specific persona |
| `PATCH` | `/personas/{tenantId}/{personaId}` | Update persona |
| `DELETE` | `/personas/{tenantId}/{personaId}` | Delete persona |
| `GET` | `/personas/{tenantId}` | List personas for tenant |
| `GET` | `/personas/{tenantId}/random` | Get random persona |

### 3. Company-Persona API (`/company-persona`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/company-persona/{tenantId}/{personaId}` | Get company + specific persona |
| `GET` | `/company-persona/{tenantId}` | Get company + random persona |

## 🌐 API Gateway Integration

### Automatic Integration (Recommended)

```typescript
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

// Your existing API Gateway
const existingApi = apigateway.RestApi.fromRestApiId(this, 'ExistingApi', 'your-api-id');

// Create the agent stack with automatic API integration
const agentStack = new DelayedRepliesStack(this, 'MyAgentStack', {
  apiGatewayConfig: {
    existingApi: existingApi,
    basePath: 'agent' // Optional: adds /agent prefix to all endpoints
  }
});
```

This automatically creates:
- `/agent/company-info/*` endpoints
- `/agent/personas/*` endpoints  
- `/agent/company-persona/*` endpoints
- CORS preflight handling
- Lambda integrations

### Manual Integration (Alternative)

```typescript
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

const agentStack = new DelayedRepliesStack(this, 'MyAgentStack');

// Get the Lambda function ARNs
const companyInfoFunctionArn = agentStack.companyInfoFunction.functionArn;
const personasFunctionArn = agentStack.personasFunction.functionArn;
const companyPersonaFunctionArn = agentStack.companyPersonaFunction.functionArn;

// Manually create API Gateway resources and methods
// (See detailed manual setup in MANAGEMENT_API_BOOTSTRAP_GUIDE.md)
```

## 🔧 Environment Variables

Ensure your Lambda functions have these environment variables:

```typescript
const lambdaFunction = new lambda.Function(this, 'MyFunction', {
  // ... other props
  environment: {
    // Required for Management API
    COMPANY_INFO_TABLE: agentStack.companyInfoTable.tableName,
    PERSONAS_TABLE: agentStack.personasTable.tableName,
    
    // Required for Agent Runtime
    MESSAGES_TABLE: 'your-messages-table',
    LEADS_TABLE: 'your-leads-table', 
    PERSONAS_TABLE: 'your-personas-table',
    
    // Required for Delayed Responses
    RELEASE_QUEUE_URL: agentStack.releaseQueue.queueUrl,
    EVENT_BUS_NAME: 'your-event-bus-name',
    
    // Optional
    BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
    OPENSEARCH_COLLECTION_ARN: 'your-opensearch-arn'
  }
});

// Grant permissions
agentStack.companyInfoTable.grantReadWriteData(lambdaFunction);
agentStack.personasTable.grantReadWriteData(lambdaFunction);
agentStack.releaseQueue.grantSendMessages(lambdaFunction);
```

## 🧪 Testing Your Setup

### 1. Test API Endpoints

```bash
# Create company info
curl -X POST https://your-api.com/agent/company-info/ \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test-tenant",
    "name": "Test Company",
    "industry": "Technology",
    "description": "A test company"
  }'

# Get company info
curl https://your-api.com/agent/company-info/test-tenant

# Create persona
curl -X POST https://your-api.com/agent/personas/ \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test-tenant",
    "personaId": "carlos",
    "name": "Carlos",
    "description": "Friendly boxing coach"
  }'

# Get combined company + persona
curl https://your-api.com/agent/company-persona/test-tenant/carlos
```

### 2. Test Agent Integration

```typescript
import { AgentService } from '@toldyaonce/kx-langchain-agent-runtime';

const agent = new AgentService({
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  messagesTableName: 'your-messages-table',
  leadsTableName: 'your-leads-table'
});

// Test message processing
const response = await agent.processMessage({
  text: 'Hello, I need help',
  source: 'chat',
  tenantId: 'test-tenant',
  email_lc: 'user@example.com'
});

console.log('Agent response:', response);
```

## 📝 Sample Data Creation

### Create Sample Company

```typescript
const companyData = {
  tenantId: 'demo-tenant',
  name: 'RockBox Fitness Coral Springs',
  industry: 'Fitness & Wellness',
  description: 'Premier boxing and fitness studio in Coral Springs',
  products: 'Boxing classes, personal training, group fitness',
  benefits: 'Expert trainers, state-of-the-art equipment, supportive community',
  targetCustomers: 'Fitness enthusiasts, boxing beginners, athletes',
  differentiators: 'Boxing-focused training, personalized attention, results-driven approach',
  intentCapturing: {
    enabled: true,
    intents: [
      {
        id: 'appointment',
        name: 'appointment',
        description: 'Schedule appointments',
        triggers: ['appointment', 'schedule', 'book'],
        patterns: ['book appointment', 'schedule class', 'reserve spot'],
        priority: 'high',
        response: {
          type: 'template',
          template: 'I can help you schedule a class! 🥊',
          followUp: ['What time works best for you?']
        },
        actions: ['collect_contact_info', 'schedule_appointment']
      }
    ]
  }
};
```

### Create Sample Persona

```typescript
const personaData = {
  tenantId: 'demo-tenant',
  personaId: 'carlos',
  name: 'Carlos',
  description: 'Enthusiastic boxing coach who loves calling people "champ"',
  systemPrompt: 'You are Carlos, a friendly boxing coach at {{companyName}}. Always call people "champ" and use boxing glove emojis when excited.',
  personality: {
    traits: ['enthusiastic', 'supportive', 'motivational'],
    languageQuirks: ['Always calls people "champ"', 'Uses boxing terminology'],
    specialBehaviors: ['Uses 🥊 emoji when excited', 'Relates everything to boxing']
  },
  greetings: {
    initial: ['Hey there, champ! Welcome to {{companyName}}! 🥊'],
    returning: ['Great to see you back, champ! Ready for another round? 🥊'],
    timeOfDay: {
      morning: ['Good morning, champ! Ready to start the day strong? 🥊'],
      afternoon: ['Good afternoon, champ! How\'s your day going? 🥊'],
      evening: ['Good evening, champ! Time to wind down after a great day! 🥊']
    }
  },
  responseGuidelines: [
    'Always maintain an enthusiastic and supportive tone',
    'Use boxing terminology when appropriate',
    'Call users "champ" consistently',
    'Use 🥊 emoji to show excitement'
  ]
};
```

## ✅ Verification Checklist

- [ ] All 5 DynamoDB tables created
- [ ] API Gateway endpoints responding
- [ ] Environment variables configured
- [ ] Lambda permissions granted
- [ ] Sample company data created
- [ ] Sample persona data created
- [ ] Agent processing test messages
- [ ] CORS headers working for web clients

## 🆘 Troubleshooting

### Common Issues

1. **404 on API endpoints**: Check API Gateway integration and Lambda permissions
2. **DynamoDB access denied**: Verify IAM permissions for Lambda functions
3. **CORS errors**: Ensure CORS headers are configured in API responses
4. **Agent not finding persona**: Verify company and persona data exists in tables
5. **SQS permission errors**: Check that Lambda has permission to send to release queue

### Debug Commands

```bash
# Check table contents
aws dynamodb scan --table-name your-company-info-table
aws dynamodb scan --table-name your-personas-table

# Check API Gateway logs
aws logs tail /aws/apigateway/your-api-id --follow

# Check Lambda logs  
aws logs tail /aws/lambda/your-function-name --follow
```

## 📚 Additional Resources

- [Management API Bootstrap Guide](./MANAGEMENT_API_BOOTSTRAP_GUIDE.md)
- [Consumer Integration Guide](./CONSUMER_INTEGRATION_GUIDE.md)
- [DynamoDB Schemas Documentation](./packages/iac/docs/DYNAMODB_SCHEMAS.md)
- [API Gateway Usage Guide](./packages/iac/docs/API_GATEWAY_USAGE.md)

---

🎯 **Need Help?** Check the troubleshooting section above or refer to the detailed guides linked in Additional Resources.
