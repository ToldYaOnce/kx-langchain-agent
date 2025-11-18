# @kxgen/langchain-agent-iac

CDK constructs and stacks for deploying the KxGen LangChain agent infrastructure.

## Overview

This package provides AWS CDK constructs for deploying the LangChain agent infrastructure:

- **LangchainAgent**: Main construct with Lambda functions and EventBridge rules
- **LangchainAgentStack**: Complete stack wrapper for easy deployment
- Uses NodejsFunction with esbuild bundling for optimal performance
- Implements least-privilege IAM permissions

## Quick Start

### Installation

```bash
npm install @kxgen/langchain-agent-iac
# or
yarn add @kxgen/langchain-agent-iac
```

### Basic Usage

```typescript
import { LangchainAgent } from '@kxgen/langchain-agent-iac';
import * as events from 'aws-cdk-lib/aws-events';

const eventBus = events.EventBus.fromEventBusArn(
  this, 
  'EventBus', 
  'arn:aws:events:us-east-1:123456789012:event-bus/kxgen-events'
);

// Option 1: Let the construct create DynamoDB tables automatically
const agent = new LangchainAgent(this, 'MyAgent', {
  eventBus,
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  // Tables will be created with default names: kxgen-messages, kxgen-leads, kxgen-personas
});

// Option 2: Use existing DynamoDB tables
const agentWithExistingTables = new LangchainAgent(this, 'MyAgentExisting', {
  eventBus,
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  existingTables: {
    messagesTableName: 'my-existing-messages',
    leadsTableName: 'my-existing-leads',
    personasTableName: 'my-existing-personas',
  },
});

// Option 3: Customize DynamoDB table creation
const agentWithCustomTables = new LangchainAgent(this, 'MyAgentCustom', {
  eventBus,
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  dynamoDBTablesProps: {
    messagesTableName: 'custom-messages',
    leadsTableName: 'custom-leads',
    personasTableName: 'custom-personas',
    billingMode: dynamodb.BillingMode.PROVISIONED,
    removalPolicy: RemovalPolicy.DESTROY, // For dev environments
  },
});
```

### API Gateway for Synchronous Chat

For real-time chat interfaces (websites, mobile apps):

```typescript
import { ApiGateway, DynamoDBTables } from '@kxgen/langchain-agent-iac';

// Create tables
const tables = new DynamoDBTables(this, 'AgentTables');

// Create API Gateway for chat
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
    throttling: {
      rateLimit: 1000,
      burstLimit: 2000,
    },
  },
});

// Output API URL
new CfnOutput(this, 'ChatApiUrl', { value: chatApi.apiUrl });
```

### Hybrid Approach (Recommended)

Use both EventBridge (async) and API Gateway (sync) for different channels:

```typescript
// EventBridge for SMS/Email (async)
const agent = new LangchainAgent(this, 'Agent', {
  eventBus,
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
});

// API Gateway for Chat/Mobile (sync)
const chatApi = new ApiGateway(this, 'ChatApi', {
  tableNames: {
    messagesTable: agent.dynamoDBTables!.messagesTable.tableName,
    leadsTable: agent.dynamoDBTables!.leadsTable.tableName,
    personasTable: agent.dynamoDBTables!.personasTable.tableName,
  },
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  eventBusArn: eventBus.eventBusArn,
});
```

### DynamoDB Tables Only

If you only need the DynamoDB tables without the Lambda functions:

```typescript
import { DynamoDBTables } from '@kxgen/langchain-agent-iac';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

const tables = new DynamoDBTables(this, 'AgentTables', {
  messagesTableName: 'my-app-messages',
  leadsTableName: 'my-app-leads',
  personasTableName: 'my-app-personas',
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.RETAIN, // For production
  pointInTimeRecovery: true,
});

// Access the created tables
console.log('Messages table:', tables.messagesTable.tableName);
console.log('Leads table:', tables.leadsTable.tableName);
console.log('Personas table:', tables.personasTable.tableName);
```

### Complete Stack Deployment

```typescript
import { createLangchainAgentStack } from '@kxgen/langchain-agent-iac';

const stack = createLangchainAgentStack(app, 'KxGenAgent', {
  eventBusArn: 'arn:aws:events:us-east-1:123456789012:event-bus/kxgen-events',
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  // DynamoDB tables will be created automatically
  env: {
    account: '123456789012',
    region: 'us-east-1',
  },
});
```

## Cross-Environment Integration

### Problem: Cross-Environment IAM Role References

When using the LangchainAgent in different AWS environments (accounts/regions) or referencing it from other stacks, you may encounter this error:

```
ValidationError: Cannot use resource 'KxGenStack/LangchainAgent/AgentFunction/ServiceRole' in a cross-environment fashion, the resource's physical name must be explicit set or use `PhysicalName.GENERATE_IF_NEEDED`
```

### Solution: Use Physical Names and Stack Exports

The `@toldyaonce/kx-langchain-agent-iac` package provides built-in support for cross-environment references through physical name extraction and CDK exports.

#### Option 1: Use LangchainAgentStack (Recommended)

The `LangchainAgentStack` automatically exports all physical names as CDK outputs:

```typescript
import { LangchainAgentStack } from '@toldyaonce/kx-langchain-agent-iac';

// Deploy the agent stack
const agentStack = new LangchainAgentStack(this, 'LangchainAgentStack', {
  agentProps: {
    eventBus: eventBusArn,
    bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    existingTables: {
      messagesTableName: 'my-messages-table',
      leadsTableName: 'my-leads-table',
    }
  }
});

// The stack automatically exports these values:
// - LangchainAgentStack-AgentRouterFunctionArn
// - LangchainAgentStack-AgentFunctionArn  
// - LangchainAgentStack-AgentRoleArn
// - LangchainAgentStack-IndexerFunctionArn (if RAG enabled)
// - etc.
```

#### Option 2: Extract Physical Names Programmatically

```typescript
import { LangchainAgent } from '@toldyaonce/kx-langchain-agent-iac';
import { CfnOutput } from 'aws-cdk-lib';

const agent = new LangchainAgent(this, 'LangchainAgent', {
  eventBus,
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
});

// Get all physical names for cross-environment references
const physicalNames = agent.getPhysicalNames();

// Create your own CDK outputs
new CfnOutput(this, 'AgentFunctionArn', {
  value: physicalNames.agentFunctionArn,
  exportName: 'MyStack-AgentFunctionArn',
});

new CfnOutput(this, 'AgentRoleArn', {
  value: physicalNames.agentRoleArn!,
  exportName: 'MyStack-AgentRoleArn',
});
```

#### Option 3: Import from Another Stack/Environment

```typescript
import { LangchainAgent } from '@toldyaonce/kx-langchain-agent-iac';
import { Fn } from 'aws-cdk-lib';

// Import ARNs from another stack's exports
const agentFunctionArn = Fn.importValue('LangchainAgentStack-AgentFunctionArn');
const agentRouterFunctionArn = Fn.importValue('LangchainAgentStack-AgentRouterFunctionArn');

// Use the static import method
const importedFunctions = LangchainAgent.importFromArns(this, 'ImportedAgent', {
  agentRouterFunctionArn,
  agentFunctionArn,
  // indexerFunctionArn: optional
});

// Now you can reference these functions without cross-environment issues
importedFunctions.agentFunction.grantInvoke(someOtherRole);
```

### Available Physical Names

The `getPhysicalNames()` method returns:

```typescript
{
  agentRouterFunctionArn: string;      // ARN of the router Lambda
  agentRouterFunctionName: string;     // Name of the router Lambda  
  agentRouterRoleArn?: string;         // ARN of the router IAM role
  agentFunctionArn: string;            // ARN of the main agent Lambda
  agentFunctionName: string;           // Name of the main agent Lambda
  agentRoleArn?: string;               // ARN of the agent IAM role
  indexerFunctionArn?: string;         // ARN of the indexer Lambda (if RAG enabled)
  indexerFunctionName?: string;        // Name of the indexer Lambda (if RAG enabled)
  indexerRoleArn?: string;             // ARN of the indexer IAM role (if RAG enabled)
}
```

### Integration with DelayedRepliesStack

When using with `@toldyaonce/kx-delayed-replies-infra`, make sure to install the runtime dependency:

```bash
npm install @toldyaonce/kx-langchain-agent-runtime @toldyaonce/kx-release-router --registry https://npm.pkg.github.com
```

Then reference the agent Lambda ARN:

```typescript
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

const delayedReplies = new DelayedRepliesStack(this, 'DelayedReplies', {
  eventBusName: 'my-event-bus',
  existingAgentLambdaArn: physicalNames.agentFunctionArn, // Use the extracted ARN
});
```

## Constructs

### DynamoDBTables

Creates all DynamoDB tables required for the LangChain agent system with proper schemas and indexes.

#### Props

```typescript
interface DynamoDBTablesProps {
  /**
   * Name for the messages table
   * @default 'kxgen-messages'
   */
  messagesTableName?: string;

  /**
   * Name for the leads table
   * @default 'kxgen-leads'
   */
  leadsTableName?: string;

  /**
   * Name for the personas table
   * @default 'kxgen-personas'
   */
  personasTableName?: string;

  /**
   * Billing mode for all tables
   * @default dynamodb.BillingMode.PAY_PER_REQUEST
   */
  billingMode?: dynamodb.BillingMode;

  /**
   * Removal policy for tables (DESTROY for dev, RETAIN for prod)
   * @default RemovalPolicy.RETAIN
   */
  removalPolicy?: RemovalPolicy;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;

  /**
   * Table class (STANDARD or STANDARD_INFREQUENT_ACCESS)
   * @default dynamodb.TableClass.STANDARD
   */
  tableClass?: dynamodb.TableClass;
}
```

#### Resources Created

- **Messages Table**: Conversation history with GSIs for tenant queries and lead tracking
- **Leads Table**: Contact management with GSIs for phone lookup and status queries  
- **Personas Table**: AI personality configurations with GSIs for tenant management and templates

#### Public Properties

```typescript
class DynamoDBTables extends Construct {
  public readonly messagesTable: dynamodb.Table;
  public readonly leadsTable: dynamodb.Table;
  public readonly personasTable: dynamodb.Table;
  
  // Utility methods
  public getTableNames(): { messages: string; leads: string; personas: string; }
  public getTableArns(): string[];
}
```

### ApiGateway

Creates an HTTP API (API Gateway V2) with Lambda integration for **synchronous chat interactions**.

#### Props

```typescript
interface ApiGatewayProps {
  /**
   * DynamoDB table names for agent data
   */
  tableNames: {
    messagesTable: string;
    leadsTable: string;
    personasTable?: string;
  };

  /**
   * Bedrock model ID for AI processing
   */
  bedrockModelId: string;

  /**
   * Optional EventBridge bus ARN for publishing events
   */
  eventBusArn?: string;

  /**
   * API Gateway configuration
   */
  apiConfig?: {
    apiName?: string;
    description?: string;
    corsConfiguration?: apigatewayv2.CorsPreflightOptions;
    domainName?: string;
    stageName?: string;
    enableAccessLogging?: boolean;
    throttling?: {
      rateLimit?: number;
      burstLimit?: number;
    };
  };

  /**
   * Lambda function configuration overrides
   */
  lambdaConfig?: {
    memorySize?: number;
    timeout?: Duration;
    environment?: Record<string, string>;
  };
}
```

#### Resources Created

- **HTTP API**: API Gateway V2 with CORS support
- **Chat Lambda**: Handles POST /chat requests with structured responses
- **Health Lambda**: Handles GET /health for monitoring
- **IAM Roles**: Permissions for DynamoDB, Bedrock, and EventBridge

#### Public Properties

```typescript
class ApiGateway extends Construct {
  public readonly httpApi: apigatewayv2.HttpApi;
  public readonly chatFunction: nodejs.NodejsFunction;
  public readonly healthFunction: nodejs.NodejsFunction;
  public readonly apiUrl: string;
  
  // Utility methods
  public getChatEndpoint(): string;
  public getHealthEndpoint(): string;
}
```

#### Usage Examples

**Basic Chat Request:**
```bash
curl -X POST https://api.mycompany.com/chat \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "company123",
    "message": "Hi, I want to learn about boxing classes",
    "userEmail": "john.doe@example.com"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Hey champ! I'd love to help you get started with boxing! 🥊",
  "intent": {
    "id": "general_inquiry",
    "confidence": 0.85
  },
  "metadata": {
    "processingTimeMs": 1250
  }
}
```

### LangchainAgent

Main construct that creates all necessary AWS resources including Lambda functions and DynamoDB tables for **asynchronous EventBridge-based processing**.

#### Props

```typescript
interface LangchainAgentProps {
  /**
   * Injected EventBridge bus (IEventBus or ARN string)
   */
  eventBus: events.IEventBus | string;
  
  /**
   * Bedrock model ID (e.g., Claude Sonnet)
   */
  bedrockModelId: string;
  
  /**
   * Optional OpenSearch Serverless collection ARN for RAG
   */
  opensearchCollectionArn?: string;
  
  /**
   * Optional cross-account role ARN for EventBridge PutEvents
   */
  putEventsRoleArn?: string;
  
  /**
   * Optional prefix for RAG index names (default: "kxgen_")
   */
  ragIndexNamePrefix?: string;
  
  /**
   * Optional history limit for chat memory (default: 50)
   */
  historyLimit?: number;

  /**
   * DynamoDB tables configuration
   * If not provided, tables will be created with default settings
   */
  dynamoDBTablesProps?: DynamoDBTablesProps;

  /**
   * Existing DynamoDB tables (alternative to creating new ones)
   * If provided, dynamoDBTablesProps will be ignored
   */
  existingTables?: {
    messagesTableName: string;
    leadsTableName: string;
    personasTableName?: string;
  };
}
```

#### Resources Created

- **DynamoDB Tables**: Messages, Leads, and Personas tables with proper schemas and GSIs (unless existing tables are provided)
- **AgentRouterFunction**: Routes inbound messages
- **AgentFunction**: Processes messages with LangChain
- **IndexerFunction**: Optional RAG document indexing
- **EventBridge Rules**: Trigger functions based on events
- **IAM Roles**: Least-privilege permissions for all functions and tables

#### Public Properties

```typescript
class LangchainAgent extends Construct {
  public readonly agentRouterFunction: nodejs.NodejsFunction;
  public readonly agentFunction: nodejs.NodejsFunction;
  public readonly indexerFunction?: nodejs.NodejsFunction;
  public readonly dynamoDBTables?: DynamoDBTables; // Only present if tables were created
}
```

### LangchainAgentStack

Stack wrapper that provides a complete deployment unit.

```typescript
interface LangchainAgentStackProps extends StackProps {
  agentProps: LangchainAgentProps;
  stackNamePrefix?: string;
}
```

## Lambda Configuration

### Runtime Settings

All Lambda functions use:
- **Runtime**: Node.js 20.x
- **Architecture**: x86_64
- **Bundling**: esbuild with ESM output
- **Memory**: 512MB (AgentRouter), 1024MB (Agent), 512MB (Indexer)
- **Timeout**: 5 minutes (AgentRouter), 10 minutes (Agent), 5 minutes (Indexer)
- **Log Retention**: 1 week

### Environment Variables

All functions receive:
```bash
MESSAGES_TABLE=your-messages-table
LEADS_TABLE=your-leads-table
PERSONAS_TABLE=your-personas-table
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
OUTBOUND_EVENT_BUS_NAME=your-event-bus
OUTBOUND_EVENT_BUS_ARN=arn:aws:events:...
RAG_INDEX_NAME_PREFIX=kxgen_
HISTORY_LIMIT=50
```

### Bundling Configuration

```typescript
bundling: {
  format: nodejs.OutputFormat.ESM,
  target: 'es2022',
  platform: 'node',
  mainFields: ['module', 'main'],
  conditions: ['import', 'module'],
  banner: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  externalModules: [
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb', 
    '@aws-sdk/client-eventbridge',
  ],
}
```

## IAM Permissions

### DynamoDB Permissions

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:PutItem", 
    "dynamodb:Query",
    "dynamodb:UpdateItem",
    "dynamodb:BatchGetItem",
    "dynamodb:BatchWriteItem"
  ],
  "Resource": [
    "arn:aws:dynamodb:*:*:table/messages-table",
    "arn:aws:dynamodb:*:*:table/messages-table/index/*",
    "arn:aws:dynamodb:*:*:table/leads-table",
    "arn:aws:dynamodb:*:*:table/leads-table/index/*"
  ]
}
```

### Bedrock Permissions

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream"
  ],
  "Resource": [
    "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
    "arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v1"
  ]
}
```

### EventBridge Permissions

```json
{
  "Effect": "Allow",
  "Action": ["events:PutEvents"],
  "Resource": ["arn:aws:events:*:*:event-bus/your-bus"]
}
```

### OpenSearch Permissions (Optional)

```json
{
  "Effect": "Allow", 
  "Action": [
    "aoss:APIAccessAll",
    "aoss:CreateIndex",
    "aoss:DeleteIndex",
    "aoss:UpdateIndex",
    "aoss:DescribeIndex",
    "aoss:ReadDocument",
    "aoss:WriteDocument"
  ],
  "Resource": ["arn:aws:aoss:*:*:collection/your-collection"]
}
```

## Documentation

### DynamoDB Schemas
For complete documentation of all table schemas, data structures, and access patterns, see:
- **[DynamoDB Schemas Documentation](./docs/DYNAMODB_SCHEMAS.md)** - Comprehensive guide for UX development

### API Gateway Integration
For detailed information on using the API Gateway construct for synchronous chat, see:
- **[API Gateway Usage Guide](./docs/API_GATEWAY_USAGE.md)** - Complete guide with client examples

### TypeScript Types
All data structures are fully typed in:
- **`@kxgen/langchain-agent-runtime`** - Exports all DynamoDB schema types
- **`packages/runtime/src/types/dynamodb-schemas.ts`** - Complete type definitions with Zod validation

### Key Features for UX Development

1. **Complete Type Safety**: All payloads, schemas, and API responses are fully typed
2. **Comprehensive Documentation**: Every table, field, and access pattern is documented
3. **Validation Schemas**: Zod schemas for runtime validation of all data structures
4. **Access Pattern Examples**: Real-world query examples for all common operations
5. **Channel-Aware Data**: Support for different communication channels (SMS, email, chat, etc.)
6. **Flexible Configuration**: Personas, goals, and intents are completely configurable
7. **Multi-Tenant Support**: Built-in tenant isolation for SaaS applications

This makes it incredibly easy to build UX interfaces that interact with the agent system, as you have complete visibility into all data structures and their relationships.

## EventBridge Integration

### Inbound Rules

The construct creates EventBridge rules to trigger Lambda functions:

```typescript
new events.Rule(this, 'InboundMessageRule', {
  eventBus,
  description: 'Route inbound lead messages to agent router',
  eventPattern: {
    source: ['kxgen.messaging'],
    detailType: ['lead.message.created'],
  },
  targets: [new targets.LambdaFunction(this.agentRouterFunction)],
});
```

### Event Bus Injection

The construct accepts an injected EventBridge bus rather than creating its own:

```typescript
// Using existing bus
const eventBus = events.EventBus.fromEventBusName(this, 'Bus', 'existing-bus');

// Using bus ARN
const eventBus = events.EventBus.fromEventBusArn(this, 'Bus', busArn);

// Pass to construct
new LangchainAgent(this, 'Agent', {
  eventBus,
  // ... other props
});
```

## Deployment

### Prerequisites

1. **AWS CLI** configured with appropriate permissions
2. **CDK v2** installed globally: `npm install -g aws-cdk`
3. **Node.js 20+** for Lambda runtime compatibility
4. **Existing EventBridge bus** for event routing
5. **DynamoDB tables** for messages and leads storage

### Required AWS Permissions

Your deployment role needs:
- CloudFormation: Full access for stack operations
- IAM: Create/update roles and policies
- Lambda: Create/update functions
- EventBridge: Create/update rules
- Logs: Create log groups

### Deployment Steps

1. **Set Environment Variables**
```bash
export EVENT_BUS_ARN=arn:aws:events:us-east-1:123456789012:event-bus/kxgen-events
export MESSAGES_TABLE=kxgen-messages
export LEADS_TABLE=kxgen-leads
export BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
```

2. **Bootstrap CDK** (first time only)
```bash
cdk bootstrap aws://123456789012/us-east-1
```

3. **Synthesize Templates**
```bash
cdk synth
```

4. **Deploy Stack**
```bash
cdk deploy
```

5. **Verify Deployment**
```bash
# Check Lambda functions
aws lambda list-functions --query 'Functions[?contains(FunctionName, `agent`)].FunctionName'

# Check EventBridge rules  
aws events list-rules --event-bus-name your-bus-name
```

### Cross-Account Deployment

For cross-account EventBridge access:

```typescript
new LangchainAgent(this, 'Agent', {
  eventBus: 'arn:aws:events:us-east-1:OTHER-ACCOUNT:event-bus/shared-bus',
  putEventsRoleArn: 'arn:aws:iam::OTHER-ACCOUNT:role/CrossAccountEventBridgeRole',
  // ... other props
});
```

## Monitoring & Observability

### CloudWatch Logs

All Lambda functions automatically create CloudWatch log groups:
- `/aws/lambda/{stack-name}-agent-router`
- `/aws/lambda/{stack-name}-agent`  
- `/aws/lambda/{stack-name}-indexer`

### CloudWatch Metrics

Standard Lambda metrics are available:
- Duration, Errors, Invocations
- Memory utilization, Cold starts
- Custom metrics from application code

### X-Ray Tracing

Enable X-Ray tracing for distributed tracing:

```typescript
new LangchainAgent(this, 'Agent', {
  // ... props
});

// Enable tracing on functions
agent.agentFunction.addEnvironment('_X_AMZN_TRACE_ID', 'Root=1-...');
```

## Customization

### Custom Lambda Configuration

```typescript
const agent = new LangchainAgent(this, 'Agent', props);

// Customize function settings
agent.agentFunction.addEnvironment('CUSTOM_VAR', 'value');
agent.agentFunction.addToRolePolicy(customPolicy);

// Add custom layers
agent.agentFunction.addLayers(customLayer);
```

### Custom EventBridge Rules

```typescript
// Add custom rule for specific tenant
new events.Rule(this, 'TenantSpecificRule', {
  eventBus: props.eventBus,
  eventPattern: {
    source: ['kxgen.messaging'],
    detailType: ['lead.message.created'],
    detail: {
      tenantId: ['specific-tenant'],
    },
  },
  targets: [new targets.LambdaFunction(agent.agentFunction)],
});
```

### Resource Tagging

```typescript
const stack = new LangchainAgentStack(this, 'Agent', {
  agentProps: props,
});

// Add tags to all resources
stack.tags.setTag('Environment', 'production');
stack.tags.setTag('Team', 'ai-platform');
stack.tags.setTag('CostCenter', 'engineering');
```

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Verify IAM roles have required permissions
   - Check EventBridge bus permissions for cross-account access
   - Ensure Bedrock model access is enabled in your region

2. **Function Timeouts**
   - Increase timeout for Agent function (LLM processing can be slow)
   - Check DynamoDB table capacity and throttling
   - Monitor CloudWatch metrics for performance bottlenecks

3. **EventBridge Issues**
   - Verify event patterns match incoming events exactly
   - Check EventBridge rule targets are configured correctly
   - Use EventBridge console to test event patterns

### Debugging

Enable debug logging:
```typescript
agent.agentFunction.addEnvironment('LOG_LEVEL', 'debug');
```

Check CloudWatch logs:
```bash
aws logs tail /aws/lambda/your-function-name --follow
```

## Testing

### Unit Tests

```bash
# Run CDK unit tests
yarn test

# Test specific construct
yarn test --testNamePattern="LangchainAgent"
```

### Integration Tests

```bash
# Deploy to test environment
cdk deploy --profile test-account

# Run integration tests
yarn test:integration
```

### Snapshot Testing

CDK includes snapshot testing for infrastructure:
```typescript
import { Template } from 'aws-cdk-lib/assertions';

test('LangchainAgent creates expected resources', () => {
  const template = Template.fromStack(stack);
  
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs20.x',
  });
});
```

## Examples

See the [examples directory](./examples) for complete deployment examples:
- Basic single-tenant deployment
- Multi-tenant with RAG
- Cross-account EventBridge setup
- Custom monitoring and alerting
