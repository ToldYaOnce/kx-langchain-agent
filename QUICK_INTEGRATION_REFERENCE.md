# ⚡ Quick Integration Reference

Essential code snippets for integrating with the KX LangChain Agent.

## 🔄 Basic Message Flow

### 1. Send User Message to Agent
```typescript
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const eventBridge = new EventBridgeClient({});

// When user sends a message
await eventBridge.send(new PutEventsCommand({
  Entries: [{
    Source: 'kxgen.messaging',
    DetailType: 'lead.message.created',
    Detail: JSON.stringify({
      tenantId: 'your-tenant-id',
      source: 'chat', // 'sms', 'email', 'api'
      text: 'How do I cancel my membership?',
      email_lc: 'user@example.com',
      conversation_id: 'conv-123',
      timestamps: { received: new Date().toISOString() }
    })
  }]
}));
```

### 2. Handle Agent Response
```typescript
// Your Lambda function that receives agent responses
export const handleAgentResponse = async (event: any) => {
  for (const record of event.Records) {
    const detail = JSON.parse(record.body).detail;
    
    switch (record.eventName) {
      case 'agent.reply.created':
        // Deliver final response to user
        await deliverMessage(detail.preferredChannel, detail.text, detail.routing);
        break;
        
      case 'agent.message.read':
        // Show read receipt (optional)
        await showReadReceipt(detail.conversation_id);
        break;
        
      case 'agent.typing.started':
        // Show typing indicator
        await showTypingIndicator(detail.conversation_id, true);
        break;
        
      case 'agent.typing.stopped':
        // Hide typing indicator
        await showTypingIndicator(detail.conversation_id, false);
        break;
        
      case 'agent.error':
        // Handle errors
        await handleAgentError(detail.error, detail.context);
        break;
    }
  }
};
```

## 🏗️ CDK Infrastructure Setup

### EventBridge Rules
```typescript
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

// Rule for agent responses
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

agentResponseRule.addTarget(new targets.LambdaFunction(messageHandlerLambda));

// Rule for errors
const agentErrorRule = new events.Rule(this, 'AgentErrorRule', {
  eventPattern: {
    source: ['kxgen.agent'],
    detailType: ['agent.error']
  }
});

agentErrorRule.addTarget(new targets.LambdaFunction(errorHandlerLambda));
```

### Deploy Agent Infrastructure
```typescript
import { LangchainAgent } from '@toldyaonce/kx-langchain-agent-iac';
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

// Core agent
const agent = new LangchainAgent(this, 'Agent', {
  eventBusName: 'my-event-bus'
});

// Delayed responses + Management API functions
const delayedReplies = new DelayedRepliesStack(this, 'DelayedReplies', {
  eventBusName: 'my-event-bus'
});

// Attach Management API to your existing API Gateway
const managementFunctions = delayedReplies.getManagementApiFunctions();
delayedReplies.grantApiGatewayInvoke(yourExistingApi.restApiArn);

// Add routes to your API Gateway (see full example below)
```

### Attach Management API to Existing API Gateway
```typescript
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';

// Reference your existing API Gateway
const existingApi = apigateway.RestApi.fromRestApiAttributes(this, 'ExistingApi', {
  restApiId: 'your-api-id',
  rootResourceId: 'your-root-resource-id'
});

const managementFunctions = delayedReplies.getManagementApiFunctions();

// Company Info API
const companyInfoResource = existingApi.root.addResource('company-info');
const companyInfoFn = lambda.Function.fromFunctionArn(
  this, 'CompanyInfoFn', managementFunctions.companyInfo.functionArn
);
const companyInfoIntegration = new apigateway.LambdaIntegration(companyInfoFn);

companyInfoResource.addMethod('POST', companyInfoIntegration);
const companyByIdResource = companyInfoResource.addResource('{tenantId}');
companyByIdResource.addMethod('GET', companyInfoIntegration);
companyByIdResource.addMethod('PUT', companyInfoIntegration);
companyByIdResource.addMethod('DELETE', companyInfoIntegration);

// Personas API
const personasResource = existingApi.root.addResource('personas');
const personasFn = lambda.Function.fromFunctionArn(
  this, 'PersonasFn', managementFunctions.personas.functionArn
);
const personasIntegration = new apigateway.LambdaIntegration(personasFn);

const personasByTenantResource = personasResource.addResource('{tenantId}');
personasByTenantResource.addMethod('GET', personasIntegration);
personasByTenantResource.addMethod('POST', personasIntegration);

const personaByIdResource = personasByTenantResource.addResource('{personaId}');
personaByIdResource.addMethod('GET', personasIntegration);
personaByIdResource.addMethod('PUT', personasIntegration);
personaByIdResource.addMethod('DELETE', personasIntegration);

// Combined Company + Persona API
const companyPersonaResource = existingApi.root.addResource('company-persona');
const companyPersonaFn = lambda.Function.fromFunctionArn(
  this, 'CompanyPersonaFn', managementFunctions.companyPersona.functionArn
);
const companyPersonaIntegration = new apigateway.LambdaIntegration(companyPersonaFn);

const companyPersonaByTenantResource = companyPersonaResource.addResource('{tenantId}');
companyPersonaByTenantResource.addMethod('GET', companyPersonaIntegration);

const companyPersonaByIdResource = companyPersonaByTenantResource.addResource('{personaId}');
companyPersonaByIdResource.addMethod('GET', companyPersonaIntegration);
```

## 🌐 Management API Usage

### Company Configuration
```typescript
const MANAGEMENT_API_URL = 'https://your-api-gateway-url';

// Create company
const company = await fetch(`${MANAGEMENT_API_URL}/company-info`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tenantId: 'rockbox-fitness',
    name: 'RockBox Fitness Coral Springs',
    industry: 'Fitness & Wellness',
    description: 'High-energy boxing fitness studio',
    intentCapturing: {
      enabled: true,
      intents: [
        {
          id: 'class_booking',
          name: 'Class Booking',
          triggers: ['book', 'schedule', 'class'],
          priority: 'high',
          response: {
            type: 'operational',
            template: 'I can help you book a class!'
          },
          actions: ['capture_booking_intent']
        }
      ]
    }
  })
});
```

### Persona Configuration
```typescript
// Create persona
const persona = await fetch(`${MANAGEMENT_API_URL}/personas/rockbox-fitness`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    personaId: 'carlos',
    name: 'Carlos',
    description: 'Boxing enthusiast coach',
    systemPrompt: 'You are Carlos, a passionate boxing coach at {{companyName}}. Call people "champ" and use 🥊 emojis.',
    personality: {
      tone: 'enthusiastic',
      style: 'motivational',
      languageQuirks: ['calls everyone "champ"'],
      specialBehaviors: ['uses boxing emojis']
    },
    greetings: {
      gist: 'Enthusiastic boxing coach greeting',
      variations: [
        'Hey champ! 🥊 Ready to throw some punches?',
        'What\'s up, future champion! 🥊 How can I help?'
      ]
    }
  })
});
```

### Get Combined Configuration
```typescript
// Get company + persona together
const config = await fetch(`${MANAGEMENT_API_URL}/company-persona/rockbox-fitness/carlos`);
const { companyInfo, persona, intentCapturing } = await config.json();

// Use in your application
console.log(`Agent: ${persona.name} from ${companyInfo.name}`);
```

## 📱 Channel-Specific Handling

### Chat (Full Delayed Response)
```typescript
// Chat gets the full human-like experience
const chatFlow = {
  'agent.message.read': () => showStatus('Carlos read your message'),
  'agent.typing.started': () => showTypingIndicator(true),
  'agent.typing.stopped': () => showTypingIndicator(false),
  'agent.reply.created': (detail) => displayMessage(detail.text)
};
```

### SMS/Email (Final Response Only)
```typescript
// SMS/Email only gets the final response
const smsEmailFlow = {
  'agent.reply.created': async (detail) => {
    if (detail.preferredChannel === 'sms') {
      await sendSMS(detail.routing.sms.to, detail.text);
    } else if (detail.preferredChannel === 'email') {
      await sendEmail(detail.routing.email.to, detail.text);
    }
  }
};
```

## 🔍 Monitoring Setup

### CloudWatch Alarms
```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

// Monitor agent errors
new cloudwatch.Alarm(this, 'AgentErrorAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/Events',
    metricName: 'MatchedEvents',
    dimensionsMap: {
      RuleName: agentErrorRule.ruleName
    }
  }),
  threshold: 5,
  evaluationPeriods: 2
});

// Monitor SQS queue depth
new cloudwatch.Alarm(this, 'SQSQueueDepthAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/SQS',
    metricName: 'ApproximateNumberOfMessages',
    dimensionsMap: {
      QueueName: delayedReplies.releaseQueue.queueName
    }
  }),
  threshold: 100,
  evaluationPeriods: 3
});
```

### Custom Metrics
```typescript
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatchClient({});

// Track response times
await cloudwatch.send(new PutMetricDataCommand({
  Namespace: 'KXAgent',
  MetricData: [{
    MetricName: 'ResponseTime',
    Value: responseTimeMs,
    Unit: 'Milliseconds',
    Dimensions: [
      { Name: 'TenantId', Value: tenantId },
      { Name: 'Persona', Value: personaName }
    ]
  }]
}));
```

## 🚨 Error Handling

### Graceful Degradation
```typescript
export const handleAgentError = async (error: string, context: any) => {
  console.error('Agent error:', error, context);
  
  // Fallback response
  const fallbackMessage = 'I apologize, but I\'m having trouble right now. Please try again in a moment or contact support.';
  
  // Send fallback via original channel
  switch (context.source) {
    case 'chat':
      await sendChatMessage(context.conversation_id, fallbackMessage);
      break;
    case 'sms':
      await sendSMS(context.phone_e164, fallbackMessage);
      break;
    case 'email':
      await sendEmail(context.email_lc, fallbackMessage);
      break;
  }
  
  // Alert operations team
  await notifyOpsTeam('Agent failure', { error, context });
};
```

### Retry Logic
```typescript
const retryAgentMessage = async (originalEvent: any, attempt = 1) => {
  const maxRetries = 3;
  
  try {
    await eventBridge.send(new PutEventsCommand({
      Entries: [{
        ...originalEvent,
        Detail: JSON.stringify({
          ...JSON.parse(originalEvent.Detail),
          retryAttempt: attempt
        })
      }]
    }));
  } catch (error) {
    if (attempt < maxRetries) {
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      return retryAgentMessage(originalEvent, attempt + 1);
    } else {
      // Final fallback
      await handleAgentError('Max retries exceeded', { originalEvent, error });
    }
  }
};
```

## 🎛️ Environment Variables

```bash
# Required for Agent Lambda
EVENT_BUS_NAME=your-event-bus
RELEASE_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue.fifo
MESSAGES_TABLE=your-messages-table
LEADS_TABLE=your-leads-table
BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-20250514-v1:0
AWS_REGION=us-east-1

# Required for Release Router Lambda
EVENT_BUS_NAME=your-event-bus

# Optional for Management API
MANAGEMENT_API_URL=https://your-api-gateway-url
API_AUTH_TOKEN=your-auth-token
```

## 🔗 Useful Links

- **[Complete Integration Guide](./CONSUMER_INTEGRATION_GUIDE.md)** - Detailed documentation
- **[Delayed Responses Guide](./docs/delayed-replies-README.md)** - Human-like timing system
- **[API Reference](./MANAGEMENT_API_USAGE.md)** - Management API documentation
- **[Examples](./examples/)** - Working code examples
