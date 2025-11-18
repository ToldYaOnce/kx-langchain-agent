/**
 * @fileoverview
 * Comprehensive TypeScript types for DynamoDB table schemas and payloads.
 * 
 * This file defines all data structures used in the KxGen LangChain Agent system,
 * providing complete type safety and documentation for UX development.
 * 
 * **Table Overview:**
 * - Messages: Conversation history and agent responses
 * - Leads: Contact information and lead management  
 * - Personas: Dynamic AI personality configurations
 * 
 * @version 1.0.0
 * @author KxGen LangChain Agent
 */

import { z } from 'zod';

// =============================================================================
// COMMON TYPES
// =============================================================================

/**
 * Standard timestamp format used throughout the system
 * Format: ISO 8601 string (e.g., "2024-01-15T10:30:00.000Z")
 */
export type Timestamp = string;

/**
 * ULID (Universally Unique Lexicographically Sortable Identifier)
 * Used for generating time-ordered unique identifiers
 */
export type ULID = string;

/**
 * Tenant identifier - isolates data between different organizations/customers
 */
export type TenantId = string;

/**
 * Lowercase email address used as a consistent contact identifier
 */
export type EmailLowercase = string;

/**
 * Phone number in E.164 format (e.g., "+1234567890")
 */
export type PhoneE164 = string;

/**
 * Message source channels supported by the system
 */
export type MessageSource = 'sms' | 'email' | 'chat' | 'api' | 'voice' | 'social';

/**
 * Message direction from the system's perspective
 */
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Lead status in the qualification pipeline
 */
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost' | 'nurturing';

/**
 * Persona status for configuration management
 */
export type PersonaStatus = 'active' | 'draft' | 'archived' | 'template';

// =============================================================================
// MESSAGES TABLE SCHEMA
// =============================================================================

/**
 * Channel-specific context information for messages
 */
export interface ChannelContext {
  /** SMS/Text messaging context */
  sms?: {
    /** Phone number that sent/received the message */
    phoneNumber: PhoneE164;
    /** SMS provider (Twilio, AWS SNS, etc.) */
    provider?: string;
    /** Message segments for long messages */
    segments?: number;
  };

  /** Email context */
  email?: {
    /** Email subject line */
    subject?: string;
    /** Sender/recipient email address */
    emailAddress: string;
    /** Email provider or service */
    provider?: string;
    /** Thread ID for email conversations */
    threadId?: string;
  };

  /** Chat/Web context */
  chat?: {
    /** Chat session identifier */
    sessionId: string;
    /** Client identifier (browser, app, etc.) */
    clientId?: string;
    /** User agent string */
    userAgent?: string;
    /** IP address for security/analytics */
    ipAddress?: string;
    /** WebSocket connection ID for direct message routing */
    connectionId?: string;
  };

  /** API context */
  api?: {
    /** API key or client identifier */
    clientId: string;
    /** API version used */
    version?: string;
    /** Request ID for tracing */
    requestId?: string;
  };

  /** Voice/Phone context */
  voice?: {
    /** Call ID or session identifier */
    callId: string;
    /** Phone number that initiated the call */
    phoneNumber: PhoneE164;
    /** Call duration in seconds */
    duration?: number;
    /** Voice provider (Twilio, AWS Connect, etc.) */
    provider?: string;
  };

  /** Social media context */
  social?: {
    /** Social platform (Facebook, Instagram, Twitter, etc.) */
    platform: string;
    /** Platform-specific user ID */
    userId: string;
    /** Post or thread ID */
    postId?: string;
    /** Platform-specific message ID */
    messageId?: string;
  };
}

/**
 * Message metadata for tracking and analytics
 */
export interface MessageMetadata {
  /** AI model used to generate the response (for outbound messages) */
  model?: string;
  
  /** Processing time in milliseconds */
  processingTimeMs?: number;
  
  /** Intent detected in the message */
  detectedIntent?: {
    /** Intent identifier */
    id: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Intent category */
    category?: string;
  };
  
  /** Sentiment analysis results */
  sentiment?: {
    /** Overall sentiment score (-1 to 1) */
    score: number;
    /** Sentiment label */
    label: 'positive' | 'negative' | 'neutral';
    /** Confidence in sentiment analysis */
    confidence: number;
  };
  
  /** Message that triggered this response (for outbound messages) */
  triggeredByMessage?: ULID;
  
  /** Timestamp when processing completed */
  processedAt?: Timestamp;
  
  /** Error information if processing failed */
  error?: {
    /** Error code */
    code: string;
    /** Error message */
    message: string;
    /** Stack trace (for debugging) */
    stack?: string;
  };
  
  /** Custom metadata for extensibility */
  custom?: Record<string, any>;
}

/**
 * Complete message item stored in DynamoDB Messages table
 * 
 * **Primary Key:** `contact_pk` (tenantId#email_lc) + `ts` (timestamp)
 * **GSI1:** `GSI1PK` (tenantId) + `GSI1SK` (timestamp) - Recent messages per tenant
 * **GSI2:** `GSI2PK` (lead_id) + `GSI2SK` (timestamp) - Messages by lead
 */
export interface MessageItem {
  // Primary Key
  /** Contact identifier: `${tenantId}#${email_lc}` */
  contact_pk: string;
  /** Timestamp sort key (ULID for time-ordered uniqueness) */
  ts: ULID;

  // Core Message Data
  /** Tenant identifier */
  tenantId: TenantId;
  /** Lowercase email address */
  email_lc: EmailLowercase;
  /** Message source channel */
  source: MessageSource;
  /** Message direction */
  direction: MessageDirection;
  /** Message content/text */
  text: string;
  /** Conversation identifier for grouping related messages */
  conversation_id?: string;

  // Optional Fields
  /** Lead identifier (if associated with a lead) */
  lead_id?: string;
  /** Channel-specific context */
  channel_context?: ChannelContext;
  /** Message metadata */
  meta?: MessageMetadata;

  // Global Secondary Index Keys
  /** GSI1 Partition Key: tenantId (for recent messages per tenant) */
  GSI1PK?: TenantId;
  /** GSI1 Sort Key: timestamp */
  GSI1SK?: ULID;
  /** GSI2 Partition Key: lead_id (for messages by lead) */
  GSI2PK?: string;
  /** GSI2 Sort Key: timestamp */
  GSI2SK?: ULID;

  // Audit Fields
  /** When the record was created */
  created_at?: Timestamp;
  /** When the record was last updated */
  updated_at?: Timestamp;
}

// =============================================================================
// LEADS TABLE SCHEMA
// =============================================================================

/**
 * Contact information for a lead
 */
export interface ContactInfo {
  /** First name */
  firstName?: string;
  /** Last name */
  lastName?: string;
  /** Full name (computed or provided) */
  fullName?: string;
  /** Primary email address */
  email: string;
  /** Phone number in E.164 format */
  phone?: PhoneE164;
  /** Company or organization name */
  company?: string;
  /** Job title */
  title?: string;
  /** Preferred communication channel */
  preferredChannel?: MessageSource;
  /** Time zone (IANA format, e.g., "America/New_York") */
  timezone?: string;
  /** Language preference (ISO 639-1 code, e.g., "en", "es") */
  language?: string;
}

/**
 * Lead qualification and scoring information
 */
export interface LeadQualification {
  /** Overall lead score (0-100) */
  score: number;
  /** Lead status in the pipeline */
  status: LeadStatus;
  /** Lead source (how they were acquired) */
  source: string;
  /** Campaign or marketing attribution */
  campaign?: string;
  /** Interest level (0-1) */
  interestLevel?: number;
  /** Urgency level (0-1) */
  urgencyLevel?: number;
  /** Budget qualification */
  budget?: {
    /** Estimated budget range */
    range: string;
    /** Budget qualification status */
    qualified: boolean;
  };
  /** Decision maker status */
  decisionMaker?: boolean;
  /** Timeline for decision */
  timeline?: string;
  /** Qualification notes */
  notes?: string[];
}

/**
 * Lead preferences and behavioral data
 */
export interface LeadPreferences {
  /** Communication preferences */
  communication?: {
    /** Preferred contact times */
    preferredTimes?: string[];
    /** Frequency preference */
    frequency?: 'high' | 'medium' | 'low';
    /** Opt-out preferences */
    optOuts?: MessageSource[];
  };
  
  /** Product/service interests */
  interests?: string[];
  
  /** Previous interactions summary */
  interactionHistory?: {
    /** Total number of interactions */
    totalInteractions: number;
    /** Last interaction date */
    lastInteraction: Timestamp;
    /** Most common interaction channel */
    primaryChannel: MessageSource;
    /** Engagement score (0-1) */
    engagementScore: number;
  };
  
  /** Custom preferences */
  custom?: Record<string, any>;
}

/**
 * Complete lead item stored in DynamoDB Leads table
 * 
 * **Primary Key:** `contact_pk` (tenantId#email_lc) + `sk` (PROFILE)
 * **GSI1:** `GSI1PK` (tenantId#phone) + `GSI1SK` (PHONE_LOOKUP) - Phone number lookup
 * **GSI2:** `GSI2PK` (tenantId#status) + `GSI2SK` (created_at) - Lead status queries
 */
export interface LeadItem {
  // Primary Key
  /** Contact identifier: `${tenantId}#${email_lc}` */
  contact_pk: string;
  /** Sort key: "PROFILE" for main contact record */
  sk: string;

  // Core Lead Data
  /** Tenant identifier */
  tenantId: TenantId;
  /** Lowercase email address */
  email_lc: EmailLowercase;
  /** Contact information */
  contactInfo: ContactInfo;
  /** Lead qualification data */
  qualification: LeadQualification;
  /** Lead preferences and behavior */
  preferences?: LeadPreferences;

  // Global Secondary Index Keys
  /** GSI1 Partition Key: `${tenantId}#${phone}` (for phone lookup) */
  GSI1PK?: string;
  /** GSI1 Sort Key: "PHONE_LOOKUP" */
  GSI1SK?: string;
  /** GSI2 Partition Key: `${tenantId}#${status}` (for status queries) */
  GSI2PK?: string;
  /** GSI2 Sort Key: created_at timestamp */
  GSI2SK?: Timestamp;

  // Audit Fields
  /** When the lead was created */
  created_at: Timestamp;
  /** When the lead was last updated */
  updated_at: Timestamp;
  /** Who created the lead (system, user, import, etc.) */
  created_by?: string;
  /** Who last updated the lead */
  updated_by?: string;
}

// =============================================================================
// PERSONAS TABLE SCHEMA
// =============================================================================

/**
 * Company information for persona context
 */
export interface CompanyInfo {
  /** Company name */
  name: string;
  /** Industry or business category */
  industry: string;
  /** Company description */
  description: string;
  /** Products or services offered */
  products: string;
  /** Key benefits or value propositions */
  benefits: string;
  /** Target customer segments */
  targetCustomers: string;
  /** Competitive differentiators */
  differentiators: string;
  /** Company website */
  website?: string;
  /** Physical address */
  address?: string;
  /** Contact phone number */
  phone?: PhoneE164;
  /** Contact email */
  email?: string;
  /** Business hours */
  hours?: Record<string, { open: string; close: string; is24Hours?: boolean }>;
  /** Time zone */
  timezone?: string;
}

/**
 * AI personality configuration
 */
export interface PersonalityConfig {
  /** Overall tone (e.g., "warm, friendly, professional") */
  tone: string;
  /** Communication style */
  style: string;
  /** Language quirks and patterns */
  languageQuirks?: string[];
  /** Special behaviors or characteristics */
  specialBehaviors?: string[];
}

/**
 * Response guidelines for the AI
 */
export interface ResponseGuidelines {
  /** Maximum response length by channel */
  lengthLimits?: {
    email?: number;
    sms?: number;
    chat?: number;
    api?: number;
  };
  /** Tone guidelines */
  toneGuidelines?: string[];
  /** Content guidelines */
  contentGuidelines?: string[];
  /** Prohibited topics or responses */
  prohibitions?: string[];
  /** Required disclaimers or legal text */
  disclaimers?: string[];
}

/**
 * Greeting configuration with variations
 */
export interface GreetingConfig {
  /** General greeting description */
  gist: string;
  /** Multiple greeting variations for natural variety */
  variations: string[];
  /** Channel-specific greetings */
  channelSpecific?: {
    email?: string[];
    sms?: string[];
    chat?: string[];
    voice?: string[];
  };
}

/**
 * Intent trigger configuration
 */
export interface IntentTrigger {
  /** Unique intent identifier */
  id: string;
  /** Human-readable intent name */
  name: string;
  /** Intent description */
  description: string;
  /** Trigger words or phrases */
  triggers: string[];
  /** Regex patterns for matching */
  patterns: string[];
  /** Intent priority (high, medium, low) */
  priority: 'high' | 'medium' | 'low';
  /** Response configuration */
  response: {
    /** Response type */
    type: 'template' | 'operational' | 'persona_handled';
    /** Response template */
    template: string;
    /** Follow-up questions or prompts */
    followUp?: string[];
  };
  /** Actions to trigger */
  actions?: string[];
  /** Channel-specific overrides */
  channelOverrides?: Record<MessageSource, Partial<IntentTrigger>>;
}

/**
 * Intent capturing configuration
 */
export interface IntentCapturing {
  /** Whether intent capturing is enabled */
  enabled: boolean;
  /** List of intent triggers */
  intents: IntentTrigger[];
  /** Fallback intent for unmatched inputs */
  fallbackIntent?: IntentTrigger;
  /** Confidence threshold for intent matching */
  confidenceThreshold?: number;
}

/**
 * Goal configuration for lead qualification
 */
export interface GoalConfiguration {
  /** Whether goal orchestration is enabled */
  enabled: boolean;
  /** List of goals to pursue */
  goals: GoalDefinition[];
  /** Global goal settings */
  globalSettings: {
    /** Maximum number of active goals */
    maxActiveGoals: number;
    /** Whether to respect user declines */
    respectDeclines: boolean;
    /** Whether to adapt to user urgency */
    adaptToUrgency: boolean;
    /** Interest threshold for goal activation */
    interestThreshold: number;
  };
  /** Goal completion triggers */
  completionTriggers: {
    /** Intent to trigger when all critical goals complete */
    allCriticalComplete: string;
    /** Channel-specific completion triggers */
    channelSpecific?: Record<MessageSource, {
      goalIds: string[];
      triggerIntent: string;
      description: string;
    }>;
    /** Custom goal combinations */
    customCombinations?: Array<{
      goalIds: string[];
      triggerIntent: string;
      description: string;
      channels?: MessageSource[];
    }>;
  };
}

/**
 * Individual goal definition
 */
export interface GoalDefinition {
  /** Unique goal identifier */
  id: string;
  /** Human-readable goal name */
  name: string;
  /** Goal description */
  description: string;
  /** Goal type */
  type: 'collect_info' | 'schedule_action' | 'qualify_lead' | 'custom';
  /** Goal priority */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Target information to collect */
  target: {
    /** Field name to collect */
    field: string;
    /** Regex patterns for extraction */
    extractionPatterns: string[];
  };
  /** Timing configuration */
  timing: {
    /** Approach strategy */
    approach: 'immediate' | 'coercive' | 'natural' | 'opportunistic';
    /** Minimum messages before activation */
    minMessages: number;
    /** Maximum messages to pursue */
    maxMessages: number;
    /** Conditions for activation */
    conditions: string[];
  };
  /** Messages for goal pursuit */
  messages: {
    /** Initial request message */
    request: string;
    /** Follow-up message */
    followUp: string;
    /** Acknowledgment message */
    acknowledgment: string;
  };
  /** Channel-specific rules */
  channelRules?: Record<MessageSource, {
    /** Whether this goal is required for this channel */
    required: boolean;
    /** Whether to skip this goal for this channel */
    skip?: boolean;
  }>;
}

/**
 * Action tag configuration for UI elements
 */
export interface ActionTagConfig {
  /** Whether action tags are enabled */
  enabled: boolean;
  /** Mapping of action tags to emojis/UI elements */
  mappings: Record<string, string>;
  /** Fallback emoji for unmapped tags */
  fallbackEmoji: string;
}

/**
 * Response chunking configuration
 */
export interface ResponseChunking {
  /** Whether response chunking is enabled */
  enabled: boolean;
  /** Channel-specific chunking rules */
  rules: Record<MessageSource, {
    /** Maximum length per chunk */
    maxLength: number;
    /** How to chunk (sentence, paragraph, none) */
    chunkBy: 'sentence' | 'paragraph' | 'none';
    /** Delay between chunks in milliseconds */
    delayBetweenChunks: number;
  }>;
}

/**
 * Complete persona configuration
 */
export interface PersonaConfig {
  /** Persona name */
  name: string;
  /** Persona description */
  description: string;
  /** System prompt for the AI */
  systemPrompt: string;
  /** Personality configuration */
  personality: PersonalityConfig;
  /** Response guidelines */
  responseGuidelines: string[];
  /** Greeting configuration */
  greetings?: GreetingConfig;
  /** Response chunking configuration */
  responseChunking?: ResponseChunking;
  /** Intent capturing configuration */
  intentCapturing?: IntentCapturing;
  /** Goal configuration */
  goalConfiguration?: GoalConfiguration;
  /** Action tag configuration */
  actionTags?: ActionTagConfig;
  /** Company information */
  companyInfo?: CompanyInfo;
  /** Custom metadata */
  metadata?: {
    /** Creation timestamp */
    createdAt: Timestamp;
    /** Last update timestamp */
    updatedAt: Timestamp;
    /** Version number */
    version: string;
    /** Tags for categorization */
    tags: string[];
  };
}

/**
 * Complete persona item stored in DynamoDB Personas table
 * 
 * **Primary Key:** `persona_pk` (tenantId#persona_id) + `sk` (CONFIG)
 * **GSI1:** `GSI1PK` (tenantId) + `GSI1SK` (status#updated_at) - Active personas per tenant
 * **GSI2:** `GSI2PK` (TEMPLATE#category) + `GSI2SK` (popularity_score) - Persona templates
 */
export interface PersonaItem {
  // Primary Key
  /** Persona identifier: `${tenantId}#${persona_id}` */
  persona_pk: string;
  /** Sort key: "CONFIG" for main persona record */
  sk: string;

  // Core Persona Data
  /** Tenant identifier */
  tenantId: TenantId;
  /** Persona identifier within tenant */
  persona_id: string;
  /** Persona status */
  status: PersonaStatus;
  /** Complete persona configuration */
  config: PersonaConfig;

  // Global Secondary Index Keys
  /** GSI1 Partition Key: tenantId (for active personas per tenant) */
  GSI1PK?: TenantId;
  /** GSI1 Sort Key: `${status}#${updated_at}` */
  GSI1SK?: string;
  /** GSI2 Partition Key: `TEMPLATE#${category}` (for persona templates) */
  GSI2PK?: string;
  /** GSI2 Sort Key: popularity_score (for template ranking) */
  GSI2SK?: string;

  // Template Information (for shared personas)
  /** Whether this persona is a template */
  isTemplate?: boolean;
  /** Template category */
  templateCategory?: string;
  /** Popularity score for template ranking */
  popularityScore?: number;
  /** Template description */
  templateDescription?: string;

  // Audit Fields
  /** When the persona was created */
  created_at: Timestamp;
  /** When the persona was last updated */
  updated_at: Timestamp;
  /** Who created the persona */
  created_by?: string;
  /** Who last updated the persona */
  updated_by?: string;
}

// =============================================================================
// ZOD SCHEMAS FOR VALIDATION
// =============================================================================

/**
 * Zod schema for MessageItem validation
 */
export const MessageItemSchema = z.object({
  contact_pk: z.string(),
  ts: z.string(),
  tenantId: z.string(),
  email_lc: z.string().email(),
  source: z.enum(['sms', 'email', 'chat', 'api', 'voice', 'social']),
  direction: z.enum(['inbound', 'outbound']),
  text: z.string(),
  conversation_id: z.string().optional(),
  lead_id: z.string().optional(),
  channel_context: z.record(z.any()).optional(),
  meta: z.record(z.any()).optional(),
  GSI1PK: z.string().optional(),
  GSI1SK: z.string().optional(),
  GSI2PK: z.string().optional(),
  GSI2SK: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

/**
 * Zod schema for LeadItem validation
 */
export const LeadItemSchema = z.object({
  contact_pk: z.string(),
  sk: z.string(),
  tenantId: z.string(),
  email_lc: z.string().email(),
  contactInfo: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    fullName: z.string().optional(),
    email: z.string().email(),
    phone: z.string().optional(),
    company: z.string().optional(),
    title: z.string().optional(),
    preferredChannel: z.enum(['sms', 'email', 'chat', 'api', 'voice', 'social']).optional(),
    timezone: z.string().optional(),
    language: z.string().optional(),
  }),
  qualification: z.object({
    score: z.number().min(0).max(100),
    status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost', 'nurturing']),
    source: z.string(),
    campaign: z.string().optional(),
    interestLevel: z.number().min(0).max(1).optional(),
    urgencyLevel: z.number().min(0).max(1).optional(),
    budget: z.object({
      range: z.string(),
      qualified: z.boolean(),
    }).optional(),
    decisionMaker: z.boolean().optional(),
    timeline: z.string().optional(),
    notes: z.array(z.string()).optional(),
  }),
  preferences: z.record(z.any()).optional(),
  GSI1PK: z.string().optional(),
  GSI1SK: z.string().optional(),
  GSI2PK: z.string().optional(),
  GSI2SK: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string().optional(),
  updated_by: z.string().optional(),
});

/**
 * Zod schema for PersonaItem validation
 */
export const PersonaItemSchema = z.object({
  persona_pk: z.string(),
  sk: z.string(),
  tenantId: z.string(),
  persona_id: z.string(),
  status: z.enum(['active', 'draft', 'archived', 'template']),
  config: z.record(z.any()), // Complex nested object, validated separately
  GSI1PK: z.string().optional(),
  GSI1SK: z.string().optional(),
  GSI2PK: z.string().optional(),
  GSI2SK: z.string().optional(),
  isTemplate: z.boolean().optional(),
  templateCategory: z.string().optional(),
  popularityScore: z.number().optional(),
  templateDescription: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string().optional(),
  updated_by: z.string().optional(),
});

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Utility type for creating new items (without generated fields)
 */
export type CreateMessageItem = Omit<MessageItem, 'contact_pk' | 'ts' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK' | 'created_at' | 'updated_at'>;
export type CreateLeadItem = Omit<LeadItem, 'contact_pk' | 'sk' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK' | 'created_at' | 'updated_at'>;
export type CreatePersonaItem = Omit<PersonaItem, 'persona_pk' | 'sk' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK' | 'created_at' | 'updated_at'>;

/**
 * Utility type for updating items (all fields optional except keys)
 */
export type UpdateMessageItem = Partial<MessageItem> & Pick<MessageItem, 'contact_pk' | 'ts'>;
export type UpdateLeadItem = Partial<LeadItem> & Pick<LeadItem, 'contact_pk' | 'sk'>;
export type UpdatePersonaItem = Partial<PersonaItem> & Pick<PersonaItem, 'persona_pk' | 'sk'>;

/**
 * Query parameters for different table operations
 */
export interface QueryMessagesParams {
  tenantId: TenantId;
  emailLc: EmailLowercase;
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
  scanIndexForward?: boolean;
}

export interface QueryLeadsByStatusParams {
  tenantId: TenantId;
  status: LeadStatus;
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
}

export interface QueryPersonasByTenantParams {
  tenantId: TenantId;
  status?: PersonaStatus;
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
}

