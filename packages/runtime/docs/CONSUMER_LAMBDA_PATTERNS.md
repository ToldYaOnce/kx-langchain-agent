# Consumer Lambda Patterns

This guide shows how **consumers can create their own Lambda functions** using the KxGen LangChain Agent runtime, giving you complete control over triggers, authentication, middleware, and deployment patterns.

## Philosophy

Instead of providing pre-built Lambda functions in the IaC package, we provide **factory functions** that let you create handlers with your preferred configuration. This gives you:

- **Complete control** over Lambda triggers and configuration
- **Custom authentication** and authorization logic
- **Flexible middleware** for preprocessing and postprocessing
- **Custom error handling** and logging strategies
- **Your own deployment patterns** and infrastructure choices

## Quick Start

### 1. Install the Runtime Package

```bash
npm install @kxgen/langchain-agent-runtime
```

### 2. Create Your Lambda Function

```typescript
// src/handlers/chat.ts
import { createApiGatewayHandler } from '@kxgen/langchain-agent-runtime';

// Simple usage - uses all defaults
export const handler = createApiGatewayHandler({
  tenantId: 'my-company', // Your organization ID
});
```

### 3. Deploy with Your Preferred IaC Tool

```typescript
// CDK example
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';

const chatFunction = new nodejs.NodejsFunction(this, 'ChatFunction', {
  entry: 'src/handlers/chat.ts',
  runtime: lambda.Runtime.NODEJS_20_X,
  environment: {
    MESSAGES_TABLE: 'my-messages-table',
    LEADS_TABLE: 'my-leads-table',
    BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
  },
});
```

## Handler Factory Functions

### `createApiGatewayHandler(config?)`

Creates a Lambda handler for **synchronous chat requests** via API Gateway.

#### Basic Usage

```typescript
import { createApiGatewayHandler } from '@kxgen/langchain-agent-runtime';

export const handler = createApiGatewayHandler({
  tenantId: 'my-company',
});
```

#### Advanced Configuration

```typescript
export const handler = createApiGatewayHandler({
  tenantId: 'my-company',
  
  // Custom CORS
  cors: {
    allowOrigins: ['https://mycompany.com', 'https://app.mycompany.com'],
    allowMethods: ['POST'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowCredentials: true,
  },
  
  // Custom middleware
  middleware: [
    // Authentication middleware
    async (event, context, next) => {
      const authHeader = event.headers.authorization;
      if (!authHeader || !validateApiKey(authHeader)) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }
      return next();
    },
    
    // Logging middleware
    async (event, context, next) => {
      console.log('Request received:', {
        method: event.requestContext.http.method,
        path: event.requestContext.http.path,
        userAgent: event.headers['user-agent'],
      });
      
      const result = await next();
      
      console.log('Response sent:', {
        statusCode: result.statusCode,
        requestId: event.requestContext.requestId,
      });
      
      return result;
    },
  ],
  
  // Custom error handling
  errorHandler: async (error, event, context) => {
    console.error('Chat handler error:', error);
    
    // Send to monitoring service
    await sendToDatadog(error, event);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        requestId: event.requestContext.requestId,
      }),
    };
  },
  
  // Custom response transformation
  responseTransformer: (response, event) => {
    // Add custom headers or modify response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': event.requestContext.requestId,
        'X-Processing-Time': response.metadata.totalProcessingTimeMs.toString(),
      },
      body: JSON.stringify({
        ...response,
        // Add custom fields
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      }),
    };
  },
});
```

### `createEventBridgeHandler(config?)`

Creates a Lambda handler for **asynchronous message processing** via EventBridge.

#### Basic Usage

```typescript
import { createEventBridgeHandler } from '@kxgen/langchain-agent-runtime';

export const handler = createEventBridgeHandler({
  tenantId: 'my-company',
  invokeAgent: true, // Process messages immediately
});
```

#### Advanced Configuration

```typescript
export const handler = createEventBridgeHandler({
  tenantId: 'my-company',
  
  // Custom middleware
  middleware: [
    // Event filtering
    async (event, context, next) => {
      // Only process events from specific sources
      if (!event.source.startsWith('mycompany.')) {
        console.log('Ignoring event from unknown source:', event.source);
        return;
      }
      return next();
    },
    
    // Rate limiting
    async (event, context, next) => {
      const tenantId = event.detail.tenantId;
      if (await isRateLimited(tenantId)) {
        console.log('Rate limited for tenant:', tenantId);
        return;
      }
      return next();
    },
  ],
  
  // Custom error handling
  errorHandler: async (error, event, context) => {
    console.error('EventBridge handler error:', error);
    
    // Publish error event for monitoring
    await publishErrorEvent({
      error: error.message,
      event: event,
      context: context,
    });
    
    // Don't re-throw - let the event be marked as processed
  },
  
  invokeAgent: false, // Just store message, don't process yet
});
```

### `createHealthCheckHandler(config?)`

Creates a simple health check handler for monitoring.

```typescript
import { createHealthCheckHandler } from '@kxgen/langchain-agent-runtime';

export const handler = createHealthCheckHandler({
  version: '2.1.0',
  serviceName: 'my-company-chat-api',
});
```

## Real-World Examples

### 1. Multi-Tenant SaaS Chat API

```typescript
// src/handlers/chat.ts
import { createApiGatewayHandler } from '@kxgen/langchain-agent-runtime';
import { validateJWT, getTenantFromToken } from '../lib/auth';
import { logRequest, logResponse } from '../lib/logging';

export const handler = createApiGatewayHandler({
  middleware: [
    // JWT Authentication
    async (event, context, next) => {
      const token = event.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Missing authorization token' }),
        };
      }
      
      const payload = await validateJWT(token);
      if (!payload) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Invalid token' }),
        };
      }
      
      // Add tenant info to event for downstream processing
      (event as any).tenantId = payload.tenantId;
      (event as any).userId = payload.userId;
      
      return next();
    },
    
    // Request logging
    async (event, context, next) => {
      await logRequest(event, context);
      const result = await next();
      await logResponse(result, event, context);
      return result;
    },
  ],
  
  // Override tenant ID from JWT
  responseTransformer: (response, event) => {
    const tenantId = (event as any).tenantId;
    const userId = (event as any).userId;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...response,
        metadata: {
          ...response.metadata,
          tenantId,
          userId,
        },
      }),
    };
  },
});
```

### 2. SMS Processing with Twilio

```typescript
// src/handlers/sms-webhook.ts
import { createEventBridgeHandler } from '@kxgen/langchain-agent-runtime';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const eventBridge = new EventBridgeClient({});

// Twilio webhook handler
export const twilioWebhook = async (event: any, context: any) => {
  const { From, Body, MessageSid } = JSON.parse(event.body);
  
  // Publish to EventBridge
  await eventBridge.send(new PutEventsCommand({
    Entries: [{
      Source: 'mycompany.messaging',
      DetailType: 'lead.message.created',
      Detail: JSON.stringify({
        tenantId: 'my-company',
        phone_e164: From,
        source: 'sms',
        text: Body,
        provider: {
          twilioMessageSid: MessageSid,
        },
        timestamps: {
          received: new Date().toISOString(),
        },
      }),
    }],
  }));
  
  return { statusCode: 200, body: 'OK' };
};

// EventBridge processor
export const smsProcessor = createEventBridgeHandler({
  tenantId: 'my-company',
  
  middleware: [
    // SMS-specific preprocessing
    async (event, context, next) => {
      if (event.source === 'mycompany.messaging' && event['detail-type'] === 'lead.message.created') {
        const detail = event.detail;
        
        // Add SMS-specific context
        detail.channel_context = {
          sms: {
            phoneNumber: detail.phone_e164,
            provider: 'twilio',
            messageId: detail.provider?.twilioMessageSid,
          },
        };
      }
      
      return next();
    },
  ],
  
  invokeAgent: true,
});
```

### 3. Enterprise Integration with Custom Auth

```typescript
// src/handlers/enterprise-chat.ts
import { createApiGatewayHandler } from '@kxgen/langchain-agent-runtime';
import { validateSAMLToken } from '../lib/saml';
import { auditLog } from '../lib/audit';

export const handler = createApiGatewayHandler({
  middleware: [
    // SAML Authentication
    async (event, context, next) => {
      const samlToken = event.headers['x-saml-assertion'];
      if (!samlToken) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'SAML assertion required' }),
        };
      }
      
      const user = await validateSAMLToken(samlToken);
      if (!user) {
        return {
          statusCode: 401,
          body: JSON.stringify({ error: 'Invalid SAML assertion' }),
        };
      }
      
      // Add user context
      (event as any).user = user;
      
      return next();
    },
    
    // Audit logging
    async (event, context, next) => {
      const user = (event as any).user;
      
      await auditLog({
        action: 'chat_request',
        userId: user.id,
        department: user.department,
        timestamp: new Date().toISOString(),
        requestId: event.requestContext.requestId,
      });
      
      const result = await next();
      
      await auditLog({
        action: 'chat_response',
        userId: user.id,
        statusCode: result.statusCode,
        timestamp: new Date().toISOString(),
        requestId: event.requestContext.requestId,
      });
      
      return result;
    },
  ],
  
  // Use department as tenant ID
  responseTransformer: (response, event) => {
    const user = (event as any).user;
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...response,
        user: {
          name: user.name,
          department: user.department,
        },
      }),
    };
  },
  
  // Override tenant ID from user context
  environmentOverrides: {
    // This would be set dynamically based on user.department
  },
});
```

## Deployment Patterns

### 1. AWS CDK

```typescript
// infrastructure/chat-api.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class ChatApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Chat Lambda
    const chatFunction = new nodejs.NodejsFunction(this, 'ChatFunction', {
      entry: 'src/handlers/chat.ts',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: {
        MESSAGES_TABLE: 'my-messages',
        LEADS_TABLE: 'my-leads',
        BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
      },
    });

    // API Gateway
    const api = new apigateway.HttpApi(this, 'ChatApi', {
      apiName: 'my-chat-api',
      corsPreflight: {
        allowOrigins: ['https://mycompany.com'],
        allowMethods: [apigateway.CorsHttpMethod.POST],
      },
    });

    api.addRoutes({
      path: '/chat',
      methods: [apigateway.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('ChatIntegration', chatFunction),
    });

    // Output API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url!,
    });
  }
}
```

### 2. Serverless Framework

```yaml
# serverless.yml
service: my-chat-api

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  environment:
    MESSAGES_TABLE: ${self:service}-messages-${self:provider.stage}
    LEADS_TABLE: ${self:service}-leads-${self:provider.stage}
    BEDROCK_MODEL_ID: anthropic.claude-3-sonnet-20240229-v1:0

functions:
  chat:
    handler: src/handlers/chat.handler
    timeout: 30
    memorySize: 1024
    events:
      - httpApi:
          path: /chat
          method: post
          cors:
            allowedOrigins:
              - https://mycompany.com
            allowedHeaders:
              - Content-Type
              - Authorization

  smsProcessor:
    handler: src/handlers/sms.smsProcessor
    events:
      - eventBridge:
          pattern:
            source:
              - mycompany.messaging
            detail-type:
              - lead.message.created

resources:
  Resources:
    MessagesTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:service}-messages-${self:provider.stage}
        # ... table definition
```

### 3. Terraform

```hcl
# main.tf
resource "aws_lambda_function" "chat" {
  filename         = "chat-function.zip"
  function_name    = "my-chat-api"
  role            = aws_iam_role.lambda_role.arn
  handler         = "src/handlers/chat.handler"
  runtime         = "nodejs20.x"
  timeout         = 30
  memory_size     = 1024

  environment {
    variables = {
      MESSAGES_TABLE    = aws_dynamodb_table.messages.name
      LEADS_TABLE      = aws_dynamodb_table.leads.name
      BEDROCK_MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0"
    }
  }
}

resource "aws_apigatewayv2_api" "chat_api" {
  name          = "my-chat-api"
  protocol_type = "HTTP"
  
  cors_configuration {
    allow_origins = ["https://mycompany.com"]
    allow_methods = ["POST"]
    allow_headers = ["Content-Type", "Authorization"]
  }
}
```

## Benefits of This Approach

### 1. **Complete Control**
- You own the Lambda functions and can customize everything
- Choose your own triggers (API Gateway, EventBridge, SQS, etc.)
- Implement your own authentication and authorization
- Add custom middleware for logging, monitoring, rate limiting

### 2. **Flexible Deployment**
- Use any IaC tool (CDK, Serverless, Terraform, SAM)
- Deploy to your own AWS accounts and regions
- Integrate with your existing CI/CD pipelines
- Control versioning and rollback strategies

### 3. **Security & Compliance**
- Implement your own security policies
- Use your own IAM roles and permissions
- Integrate with your identity providers (SAML, OAuth, etc.)
- Meet your compliance requirements

### 4. **Observability**
- Use your own logging and monitoring solutions
- Integrate with your APM tools (DataDog, New Relic, etc.)
- Custom metrics and alerting
- Distributed tracing

### 5. **Cost Optimization**
- Right-size your Lambda functions
- Use your own DynamoDB tables with appropriate capacity
- Implement your own caching strategies
- Control cold start optimizations

This approach gives you **all the power of the KxGen LangChain Agent** while maintaining **complete control** over your infrastructure and deployment patterns!


