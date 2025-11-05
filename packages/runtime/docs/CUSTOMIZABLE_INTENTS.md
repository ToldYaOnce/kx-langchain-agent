# Customizable Intent System

This guide shows how consumers can **define custom intent actions** and **manage personas dynamically** using the KxGen LangChain Agent runtime.

## Overview

The intent system is now split into two parts:

1. **Intent Detection** - Recognizes user intents from messages (triggers, patterns, confidence)
2. **Intent Actions** - What happens when an intent is detected (consumer-defined)

This separation allows consumers to:
- **Define custom actions** for any intent (webhooks, database updates, external API calls)
- **Store personas in DynamoDB** instead of static JSON files
- **Customize intent handling** per tenant/company
- **Integrate with external systems** (CRM, scheduling, analytics)

## Intent Action Registry

### Basic Usage

```typescript
import { 
  createApiGatewayHandler, 
  IntentActionRegistry, 
  IntentActionHelpers 
} from '@kxgen/langchain-agent-runtime';

// Create intent action registry
const intentRegistry = new IntentActionRegistry();

// Register appointment scheduling action
intentRegistry.registerAction('appointment_request', {
  id: 'schedule_appointment',
  name: 'Schedule Appointment',
  description: 'Books appointment in external calendar system',
  handler: async (context) => {
    // Call external scheduling API
    const booking = await externalCalendar.book({
      email: context.user.email,
      preferredTime: context.extractedData.preferredTime,
      service: context.extractedData.service,
    });
    
    return {
      success: true,
      message: `Great! I've scheduled your appointment for ${booking.time}`,
      data: { bookingId: booking.id, confirmationCode: booking.code },
    };
  },
  conditions: {
    minConfidence: 0.8,
    requiredFields: ['preferredTime'],
  },
});

// Register lead tracking action
intentRegistry.registerAction('lead_qualified', {
  id: 'send_to_crm',
  name: 'Send to CRM',
  description: 'Creates lead in CRM system',
  async: true, // Don't wait for completion
  handler: async (context) => {
    await crmSystem.createLead({
      email: context.user.email,
      phone: context.extractedData.phone,
      name: context.extractedData.name,
      source: 'chat_bot',
      notes: `Intent: ${context.intent.id}, Confidence: ${context.intent.confidence}`,
    });
    
    return { success: true };
  },
});

// Create handler with intent registry
export const handler = createApiGatewayHandler({
  tenantId: 'my-company',
  intentActionRegistry: intentRegistry,
});
```

### Built-in Action Helpers

The system provides helpers for common action types:

#### Webhook Actions

```typescript
import { IntentActionHelpers } from '@kxgen/langchain-agent-runtime';

// Create webhook action
const webhookAction = IntentActionHelpers.createWebhookAction({
  id: 'notify_sales_team',
  name: 'Notify Sales Team',
  url: 'https://api.mycompany.com/webhooks/lead-qualified',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-api-key',
    'X-Source': 'chat-bot',
  },
  transformPayload: (context) => ({
    leadInfo: {
      email: context.user.email,
      phone: context.extractedData.phone,
      name: context.extractedData.name,
    },
    intent: {
      id: context.intent.id,
      confidence: context.intent.confidence,
    },
    message: context.message,
    timestamp: new Date().toISOString(),
  }),
});

intentRegistry.registerAction('lead_qualified', webhookAction);
```

#### EventBridge Actions

```typescript
// Publish to EventBridge
const eventBridgeAction = IntentActionHelpers.createEventBridgeAction({
  id: 'publish_appointment_event',
  name: 'Publish Appointment Event',
  source: 'mycompany.appointments',
  detailType: 'appointment.requested',
  transformDetail: (context) => ({
    userEmail: context.user.email,
    preferredTime: context.extractedData.preferredTime,
    service: context.extractedData.service,
    intentConfidence: context.intent.confidence,
    conversationId: context.conversation.id,
  }),
});

intentRegistry.registerAction('appointment_request', eventBridgeAction);
```

#### DynamoDB Actions

```typescript
// Store intent data in DynamoDB
const dynamoAction = IntentActionHelpers.createDynamoDBAction({
  id: 'store_intent_data',
  name: 'Store Intent Data',
  tableName: 'my-intents-table',
  transformItem: (context) => ({
    pk: `${context.tenant.id}#${context.intent.id}`,
    sk: new Date().toISOString(),
    intentId: context.intent.id,
    userEmail: context.user.email,
    message: context.message,
    extractedData: context.extractedData,
    confidence: context.intent.confidence,
    channel: context.channel.source,
    timestamp: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
  }),
});

intentRegistry.registerAction('pricing_request', dynamoAction);
```

### Multiple Actions per Intent

```typescript
// Register multiple actions for the same intent
intentRegistry.registerActions({
  'appointment_request': [
    // High priority - schedule the appointment
    {
      id: 'schedule_appointment',
      name: 'Schedule Appointment',
      priority: 100,
      handler: async (context) => {
        const booking = await scheduleAppointment(context);
        return {
          success: true,
          message: `Appointment scheduled for ${booking.time}`,
          data: { bookingId: booking.id },
        };
      },
    },
    
    // Medium priority - notify sales team
    {
      id: 'notify_sales',
      name: 'Notify Sales Team',
      priority: 50,
      async: true,
      handler: async (context) => {
        await notifySalesTeam(context);
        return { success: true };
      },
    },
    
    // Low priority - analytics
    {
      id: 'track_analytics',
      name: 'Track Analytics',
      priority: 10,
      async: true,
      handler: async (context) => {
        await analytics.track('appointment_requested', {
          userId: context.user.email,
          channel: context.channel.source,
          confidence: context.intent.confidence,
        });
        return { success: true };
      },
    },
  ],
});
```

### Global Middleware

```typescript
// Register middleware that runs for all intents
intentRegistry.registerMiddleware(async (context) => {
  // Log all intent actions
  console.log(`Intent action: ${context.intent.id} for user: ${context.user.email}`);
  
  // Send to analytics
  await analytics.track('intent_detected', {
    intentId: context.intent.id,
    confidence: context.intent.confidence,
    userId: context.user.email,
    channel: context.channel.source,
  });
  
  // Continue processing
  return { success: true, continueProcessing: true };
});
```

### Conditional Actions

```typescript
// Action that only runs under certain conditions
intentRegistry.registerAction('pricing_request', {
  id: 'send_pricing_email',
  name: 'Send Pricing Email',
  description: 'Sends detailed pricing via email',
  handler: async (context) => {
    await emailService.sendPricingInfo({
      to: context.user.email,
      template: 'pricing_details',
      data: {
        name: context.extractedData.name,
        service: context.extractedData.service,
      },
    });
    
    return {
      success: true,
      message: 'I\'ve sent detailed pricing information to your email!',
    };
  },
  conditions: {
    minConfidence: 0.9,
    requiredFields: ['name', 'email'],
    allowedChannels: ['chat', 'api'],
    customCondition: (context) => {
      // Only send email if user explicitly asked for detailed info
      return context.message.toLowerCase().includes('detailed') ||
             context.message.toLowerCase().includes('email');
    },
  },
});
```

## Dynamic Persona Management

### Persona Storage Service

```typescript
import { 
  PersonaStorage, 
  createPersonaStorage,
  DynamoDBService 
} from '@kxgen/langchain-agent-runtime';

// Create persona storage with DynamoDB backend
const dynamoService = new DynamoDBService(config);
const personaStorage = createPersonaStorage({
  dynamoService,
  fallbackPersonasPath: './personas.json', // Fallback for development
  defaultPersonaId: 'carlos',
  enableCache: true,
});

// Use in agent service
const agentService = new AgentService({
  ...config,
  personaStorage,
});
```

### Loading Personas from DynamoDB

```typescript
// Load persona (tries DynamoDB first, then fallback)
const persona = await personaStorage.getPersona('tenant123', 'carlos');

// List all personas for a tenant
const personas = await personaStorage.listPersonas('tenant123', {
  includeArchived: false,
  includeTemplates: true,
  limit: 10,
});

// Save persona to DynamoDB
await personaStorage.savePersona('tenant123', 'custom-carlos', {
  name: 'Custom Carlos',
  description: 'Customized boxing gym assistant',
  systemPrompt: 'You are Carlos, a customized boxing gym assistant...',
  // ... rest of persona config
}, {
  status: 'active',
  createdBy: 'admin@mycompany.com',
});
```

### Tenant-Specific Personas

```typescript
// Different personas per tenant
const tenantAPersona = await personaStorage.getPersona('tenant-a', 'sales-bot');
const tenantBPersona = await personaStorage.getPersona('tenant-b', 'support-bot');

// Create persona templates
await personaStorage.savePersona('system', 'fitness-template', fitnessPersona, {
  status: 'template',
  isTemplate: true,
  templateCategory: 'fitness',
  createdBy: 'system',
});
```

## Real-World Examples

### 1. Fitness Gym with Scheduling

```typescript
import { 
  createApiGatewayHandler, 
  IntentActionRegistry 
} from '@kxgen/langchain-agent-runtime';

const intentRegistry = new IntentActionRegistry();

// Class scheduling
intentRegistry.registerAction('class_booking', {
  id: 'book_fitness_class',
  name: 'Book Fitness Class',
  handler: async (context) => {
    const booking = await fitnessAPI.bookClass({
      memberEmail: context.user.email,
      classType: context.extractedData.classType,
      preferredTime: context.extractedData.preferredTime,
      location: context.extractedData.location || 'main',
    });
    
    return {
      success: true,
      message: `Perfect! I've booked you for ${booking.className} on ${booking.date} at ${booking.time}. Your confirmation number is ${booking.confirmationCode}.`,
      data: { bookingId: booking.id },
    };
  },
  conditions: {
    minConfidence: 0.8,
    requiredFields: ['classType', 'preferredTime'],
  },
});

// Membership inquiry
intentRegistry.registerAction('membership_inquiry', {
  id: 'send_membership_info',
  name: 'Send Membership Info',
  handler: async (context) => {
    // Send to CRM
    await crmSystem.createLead({
      email: context.user.email,
      phone: context.extractedData.phone,
      interest: 'membership',
      source: 'chat_bot',
    });
    
    // Schedule follow-up
    await schedulingSystem.scheduleFollowUp({
      leadEmail: context.user.email,
      followUpType: 'membership_consultation',
      delayHours: 24,
    });
    
    return {
      success: true,
      message: 'I\'ve sent membership details to your email. Our team will follow up within 24 hours to schedule a consultation!',
    };
  },
});

export const handler = createApiGatewayHandler({
  tenantId: 'fitness-gym-123',
  intentActionRegistry: intentRegistry,
});
```

### 2. SaaS Product with Support Tickets

```typescript
const intentRegistry = new IntentActionRegistry();

// Technical support
intentRegistry.registerAction('technical_issue', {
  id: 'create_support_ticket',
  name: 'Create Support Ticket',
  handler: async (context) => {
    const ticket = await supportSystem.createTicket({
      userEmail: context.user.email,
      subject: `Chat Bot Issue: ${context.extractedData.issueType}`,
      description: context.message,
      priority: context.extractedData.urgent ? 'high' : 'normal',
      category: context.extractedData.issueType,
      source: 'chat_bot',
    });
    
    return {
      success: true,
      message: `I've created support ticket #${ticket.number} for you. Our team will respond within ${ticket.sla} hours.`,
      data: { ticketNumber: ticket.number },
    };
  },
});

// Feature request
intentRegistry.registerAction('feature_request', {
  id: 'log_feature_request',
  name: 'Log Feature Request',
  async: true,
  handler: async (context) => {
    await productSystem.logFeatureRequest({
      userEmail: context.user.email,
      feature: context.extractedData.feature,
      description: context.message,
      votes: 1,
    });
    
    return { success: true };
  },
});
```

### 3. E-commerce with Order Management

```typescript
const intentRegistry = new IntentActionRegistry();

// Order status inquiry
intentRegistry.registerAction('order_status', {
  id: 'check_order_status',
  name: 'Check Order Status',
  handler: async (context) => {
    const orderNumber = context.extractedData.orderNumber;
    const order = await ecommerceAPI.getOrder(orderNumber);
    
    if (!order) {
      return {
        success: false,
        message: `I couldn't find order #${orderNumber}. Please check the order number and try again.`,
      };
    }
    
    return {
      success: true,
      message: `Order #${orderNumber} is ${order.status}. ${order.trackingInfo ? `Tracking: ${order.trackingNumber}` : ''}`,
      data: { order },
    };
  },
  conditions: {
    requiredFields: ['orderNumber'],
  },
});

// Return request
intentRegistry.registerAction('return_request', {
  id: 'initiate_return',
  name: 'Initiate Return',
  handler: async (context) => {
    const returnRequest = await ecommerceAPI.createReturn({
      orderNumber: context.extractedData.orderNumber,
      items: context.extractedData.items,
      reason: context.extractedData.reason,
      customerEmail: context.user.email,
    });
    
    return {
      success: true,
      message: `Return request #${returnRequest.number} has been created. You'll receive a return label via email within 24 hours.`,
      data: { returnNumber: returnRequest.number },
    };
  },
});
```

## Benefits

### 1. **Separation of Concerns**
- **Intent Detection**: Handled by the agent (triggers, patterns, confidence)
- **Intent Actions**: Handled by consumer (business logic, integrations)

### 2. **Complete Customization**
- Define any action for any intent
- Integrate with any external system
- Custom conditions and priorities
- Async or sync execution

### 3. **Dynamic Configuration**
- Store personas in DynamoDB
- Update intents without code changes
- Tenant-specific customization
- Template sharing across tenants

### 4. **Production Ready**
- Error handling and logging
- Conditional execution
- Priority-based ordering
- Middleware support

This system gives you **complete control** over what happens when intents are detected while maintaining the powerful intent detection capabilities of the KxGen LangChain Agent!

