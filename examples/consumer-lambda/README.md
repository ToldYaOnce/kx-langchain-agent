# Consumer Lambda Example

This example shows how a **consumer** would create their own Lambda functions using the KxGen LangChain Agent runtime.

## Project Structure

```
my-chat-app/
├── src/
│   └── handlers/
│       ├── chat.ts          # API Gateway handler for sync chat
│       ├── sms.ts           # EventBridge handler for SMS
│       └── health.ts        # Health check handler
├── infrastructure/
│   └── chat-api-stack.ts    # CDK infrastructure
├── package.json
└── tsconfig.json
```

## Installation

```bash
npm install @kxgen/langchain-agent-runtime
npm install aws-cdk-lib constructs
```

## Lambda Handlers

### Chat Handler (API Gateway)

```typescript
// src/handlers/chat.ts
import { createApiGatewayHandler } from '@kxgen/langchain-agent-runtime';
import { validateApiKey } from '../lib/auth';

export const handler = createApiGatewayHandler({
  tenantId: 'my-company',
  
  cors: {
    allowOrigins: ['https://mycompany.com'],
    allowMethods: ['POST'],
    allowHeaders: ['Content-Type', 'Authorization'],
  },
  
  middleware: [
    // API Key authentication
    async (event, context, next) => {
      const apiKey = event.headers['x-api-key'];
      if (!apiKey || !validateApiKey(apiKey)) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid API key' }),
        };
      }
      return next();
    },
    
    // Request logging
    async (event, context, next) => {
      console.log('Chat request:', {
        requestId: event.requestContext.requestId,
        userAgent: event.headers['user-agent'],
      });
      
      const result = await next();
      
      console.log('Chat response:', {
        statusCode: result.statusCode,
        requestId: event.requestContext.requestId,
      });
      
      return result;
    },
  ],
});
```

### SMS Handler (EventBridge)

```typescript
// src/handlers/sms.ts
import { createEventBridgeHandler } from '@kxgen/langchain-agent-runtime';

export const handler = createEventBridgeHandler({
  tenantId: 'my-company',
  invokeAgent: true,
  
  middleware: [
    // SMS-specific preprocessing
    async (event, context, next) => {
      if (event.source === 'mycompany.messaging') {
        console.log('Processing SMS event:', event.detail);
        
        // Add SMS-specific context
        if (event.detail.source === 'sms') {
          event.detail.channel_context = {
            sms: {
              phoneNumber: event.detail.phone_e164,
              provider: 'twilio',
            },
          };
        }
      }
      
      return next();
    },
  ],
});
```

### Health Check Handler

```typescript
// src/handlers/health.ts
import { createHealthCheckHandler } from '@kxgen/langchain-agent-runtime';

export const handler = createHealthCheckHandler({
  version: '1.0.0',
  serviceName: 'my-company-chat-api',
});
```

## Infrastructure (CDK)

```typescript
// infrastructure/chat-api-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class ChatApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Tables
    const messagesTable = new dynamodb.Table(this, 'MessagesTable', {
      partitionKey: { name: 'contact_pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'ts', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const leadsTable = new dynamodb.Table(this, 'LeadsTable', {
      partitionKey: { name: 'contact_pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Common environment variables
    const commonEnv = {
      MESSAGES_TABLE: messagesTable.tableName,
      LEADS_TABLE: leadsTable.tableName,
      BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
    };

    // Chat Lambda Function
    const chatFunction = new nodejs.NodejsFunction(this, 'ChatFunction', {
      entry: 'src/handlers/chat.ts',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: commonEnv,
    });

    // SMS Lambda Function
    const smsFunction = new nodejs.NodejsFunction(this, 'SmsFunction', {
      entry: 'src/handlers/sms.ts',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: commonEnv,
    });

    // Health Check Lambda Function
    const healthFunction = new nodejs.NodejsFunction(this, 'HealthFunction', {
      entry: 'src/handlers/health.ts',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(5),
      memorySize: 256,
    });

    // Grant permissions
    messagesTable.grantReadWriteData(chatFunction);
    messagesTable.grantReadWriteData(smsFunction);
    leadsTable.grantReadWriteData(chatFunction);
    leadsTable.grantReadWriteData(smsFunction);

    // Bedrock permissions
    chatFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0'],
    }));
    smsFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: ['arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0'],
    }));

    // API Gateway
    const api = new apigateway.HttpApi(this, 'ChatApi', {
      apiName: 'my-company-chat-api',
      corsPreflight: {
        allowOrigins: ['https://mycompany.com'],
        allowMethods: [apigateway.CorsHttpMethod.POST],
        allowHeaders: ['Content-Type', 'X-API-Key'],
      },
    });

    // API Routes
    api.addRoutes({
      path: '/chat',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('ChatIntegration', chatFunction),
    });

    api.addRoutes({
      path: '/health',
      methods: [apigateway.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('HealthIntegration', healthFunction),
    });

    // EventBridge Rule for SMS
    const eventBus = events.EventBus.fromEventBusName(this, 'EventBus', 'default');
    
    new events.Rule(this, 'SmsRule', {
      eventBus,
      eventPattern: {
        source: ['mycompany.messaging'],
        detailType: ['lead.message.created'],
      },
      targets: [new targets.LambdaFunction(smsFunction)],
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url!,
      description: 'Chat API URL',
    });

    new cdk.CfnOutput(this, 'ChatEndpoint', {
      value: `${api.url}chat`,
      description: 'Chat endpoint URL',
    });
  }
}
```

## Package.json

```json
{
  "name": "my-chat-app",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "deploy": "cdk deploy",
    "test": "jest"
  },
  "dependencies": {
    "@kxgen/langchain-agent-runtime": "^1.0.0",
    "aws-cdk-lib": "^2.100.0",
    "constructs": "^10.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

## Deployment

```bash
# Build the project
npm run build

# Deploy infrastructure
npm run deploy
```

## Usage

### Chat API Request

```bash
curl -X POST https://your-api-url/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "tenantId": "my-company",
    "message": "Hi, I want to learn about your services",
    "userEmail": "user@example.com"
  }'
```

### SMS Integration

Publish events to EventBridge from your SMS webhook:

```typescript
// Twilio webhook handler
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const eventBridge = new EventBridgeClient({});

export const twilioWebhook = async (event: any) => {
  const { From, Body } = JSON.parse(event.body);
  
  await eventBridge.send(new PutEventsCommand({
    Entries: [{
      Source: 'mycompany.messaging',
      DetailType: 'lead.message.created',
      Detail: JSON.stringify({
        tenantId: 'my-company',
        phone_e164: From,
        source: 'sms',
        text: Body,
        timestamps: {
          received: new Date().toISOString(),
        },
      }),
    }],
  }));
  
  return { statusCode: 200, body: 'OK' };
};
```

## Benefits

This approach gives you:

1. **Complete Control**: Your Lambda functions, your configuration
2. **Custom Authentication**: Implement any auth strategy you need
3. **Flexible Infrastructure**: Use any IaC tool (CDK, Serverless, Terraform)
4. **Security**: Deploy to your own AWS account with your own IAM policies
5. **Observability**: Use your own logging and monitoring solutions
6. **Cost Optimization**: Right-size your functions and resources

You get all the power of the KxGen LangChain Agent while maintaining complete ownership of your infrastructure!

