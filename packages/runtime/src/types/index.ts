import { z } from 'zod';

// Message source types
export const MessageSourceSchema = z.enum(['sms', 'email', 'chat', 'api', 'agent']);
export type MessageSource = z.infer<typeof MessageSourceSchema>;

// Message direction types
export const MessageDirectionSchema = z.enum(['inbound', 'outbound']);
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;

// Channel context schemas
export const SmsChannelContextSchema = z.object({
  from: z.string(),
  to: z.string(),
  messageId: z.string().optional(),
});

export const EmailChannelContextSchema = z.object({
  from: z.string(),
  to: z.string(),
  msgId: z.string().optional(),
  threadId: z.string().optional(),
});

export const ChatChannelContextSchema = z.object({
  sessionId: z.string(),
  clientId: z.string().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  connectionId: z.string().optional(),
});

export const ChannelContextSchema = z.object({
  sms: SmsChannelContextSchema.optional(),
  email: EmailChannelContextSchema.optional(),
  chat: ChatChannelContextSchema.optional(),
});

export type SmsChannelContext = z.infer<typeof SmsChannelContextSchema>;
export type EmailChannelContext = z.infer<typeof EmailChannelContextSchema>;
export type ChatChannelContext = z.infer<typeof ChatChannelContextSchema>;
export type ChannelContext = z.infer<typeof ChannelContextSchema>;

// Message item schema for DynamoDB
export const MessageItemSchema = z.object({
  contact_pk: z.string(), // {tenantId}#{email_lc}
  ts: z.string(), // ISO8601 or ULID
  tenantId: z.string(),
  email_lc: z.string(),
  lead_id: z.string().optional(),
  source: MessageSourceSchema,
  direction: MessageDirectionSchema,
  channel_context: ChannelContextSchema.optional(),
  text: z.string(),
  attachments: z.array(z.string()).optional(), // S3 URIs
  meta: z.record(z.any()).optional(),
  conversation_id: z.string().optional(),
  // Consumer table fields
  targetKey: z.string().optional(), // channel#{channelId} or contact_pk
  dateReceived: z.string().optional(), // ISO8601 timestamp
  // GSI attributes
  GSI1PK: z.string().optional(), // tenantId for recent messages
  GSI1SK: z.string().optional(), // ts
  GSI2PK: z.string().optional(), // lead_id
  GSI2SK: z.string().optional(), // ts
});

export type MessageItem = z.infer<typeof MessageItemSchema>;

// Lead item schema (existing table)
export const LeadItemSchema = z.object({
  PK: z.string(), // tenantId
  SK: z.string(), // email_lc
  lead_id: z.string(),
  email: z.string(),
  email_lc: z.string(),
  phone_e164: z.string().optional(),
  preferences: z.record(z.any()).optional(),
});

export type LeadItem = z.infer<typeof LeadItemSchema>;

// Event schemas for EventBridge
export const InboundMessageEventSchema = z.object({
  source: z.literal('kxgen.messaging'),
  'detail-type': z.literal('lead.message.created'),
  detail: z.object({
    tenantId: z.string(),
    email_lc: z.string().optional(),
    phone_e164: z.string().optional(),
    lead_id: z.string().optional(),
    source: MessageSourceSchema,
    text: z.string(),
    conversation_id: z.string().optional(),
    provider: z.record(z.any()).optional(),
    timestamps: z.object({
      received: z.string(),
      processed: z.string().optional(),
    }),
    channel_context: ChannelContextSchema.optional(),
  }),
});

export const AgentReplyEventSchema = z.object({
  source: z.literal('kxgen.agent'),
  'detail-type': z.literal('agent.reply.created'),
  detail: z.object({
    tenantId: z.string(),
    contact_pk: z.string(),
    preferredChannel: MessageSourceSchema,
    text: z.string(),
    routing: z.object({
      sms: z.object({ to: z.string() }).optional(),
      email: z.object({ to: z.string() }).optional(),
      chat: z.object({ sessionId: z.string() }).optional(),
    }),
    conversation_id: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

export const AgentErrorEventSchema = z.object({
  source: z.literal('kxgen.agent'),
  'detail-type': z.literal('agent.error'),
  detail: z.object({
    tenantId: z.string(),
    contact_pk: z.string().optional(),
    error: z.string(),
    stack: z.string().optional(),
    context: z.record(z.any()).optional(),
  }),
});

export const AgentTraceEventSchema = z.object({
  source: z.literal('kxgen.agent'),
  'detail-type': z.literal('agent.trace'),
  detail: z.object({
    tenantId: z.string(),
    contact_pk: z.string().optional(),
    operation: z.string(),
    duration_ms: z.number().optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

export type InboundMessageEvent = z.infer<typeof InboundMessageEventSchema>;
export type AgentReplyEvent = z.infer<typeof AgentReplyEventSchema>;
export type AgentErrorEvent = z.infer<typeof AgentErrorEventSchema>;
export type AgentTraceEvent = z.infer<typeof AgentTraceEventSchema>;

// Agent context for processing
export interface AgentContext {
  tenantId: string;
  email_lc: string;
  text: string;
  source: MessageSource;
  channel_context?: ChannelContext;
  lead_id?: string;
  conversation_id?: string;
  // Chat-specific fields for response emission
  channelId?: string;
  userId?: string; // Persona ID (the agent)
  senderId?: string; // User ID (the human sender)
  userName?: string;
  connectionId?: string; // WebSocket connection ID for direct response routing
}

// Environment configuration
export interface RuntimeConfig {
  messagesTable: string;
  leadsTable: string;
  personasTable?: string;
  bedrockModelId: string;
  outboundEventBusName?: string;
  outboundEventBusArn?: string;
  eventBusPutEventsRoleArn?: string;
  ragIndexNamePrefix?: string;
  historyLimit: number;
  awsRegion: string;
  dynamodbEndpoint?: string; // for local development
}

// Structured response for Lambda/API responses
export interface AgentResponse {
  success: boolean;
  message: string;
  intent?: {
    id: string;
    name: string;
    confidence: number;
    priority: string;
    matchedTriggers: string[];
    matchedPatterns: string[];
    actions?: string[];
  };
  metadata: {
    sessionId: string;
    tenantId: string;
    userId?: string;
    channel?: string;
    timestamp: string;
    processingTimeMs: number;
    totalProcessingTimeMs?: number;
    responseChunks?: number;
    personaId?: string;
    companyName?: string;
  };
  followUp?: string[];
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Export workflow state types from dynamodb-schemas
export type { ChannelWorkflowState, ChannelItem } from "./dynamodb-schemas.js";
