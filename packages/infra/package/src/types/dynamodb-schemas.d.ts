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
    /** Contact identifier: `${tenantId}#${email_lc}` */
    contact_pk: string;
    /** Timestamp sort key (ULID for time-ordered uniqueness) */
    ts: ULID;
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
    /** Lead identifier (if associated with a lead) */
    lead_id?: string;
    /** Channel-specific context */
    channel_context?: ChannelContext;
    /** Message metadata */
    meta?: MessageMetadata;
    /** GSI1 Partition Key: tenantId (for recent messages per tenant) */
    GSI1PK?: TenantId;
    /** GSI1 Sort Key: timestamp */
    GSI1SK?: ULID;
    /** GSI2 Partition Key: lead_id (for messages by lead) */
    GSI2PK?: string;
    /** GSI2 Sort Key: timestamp */
    GSI2SK?: ULID;
    /** When the record was created */
    created_at?: Timestamp;
    /** When the record was last updated */
    updated_at?: Timestamp;
}
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
    /** Contact identifier: `${tenantId}#${email_lc}` */
    contact_pk: string;
    /** Sort key: "PROFILE" for main contact record */
    sk: string;
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
    /** GSI1 Partition Key: `${tenantId}#${phone}` (for phone lookup) */
    GSI1PK?: string;
    /** GSI1 Sort Key: "PHONE_LOOKUP" */
    GSI1SK?: string;
    /** GSI2 Partition Key: `${tenantId}#${status}` (for status queries) */
    GSI2PK?: string;
    /** GSI2 Sort Key: created_at timestamp */
    GSI2SK?: Timestamp;
    /** When the lead was created */
    created_at: Timestamp;
    /** When the lead was last updated */
    updated_at: Timestamp;
    /** Who created the lead (system, user, import, etc.) */
    created_by?: string;
    /** Who last updated the lead */
    updated_by?: string;
}
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
    hours?: Record<string, {
        open: string;
        close: string;
        is24Hours?: boolean;
    }>;
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
    /** Persona identifier: `${tenantId}#${persona_id}` */
    persona_pk: string;
    /** Sort key: "CONFIG" for main persona record */
    sk: string;
    /** Tenant identifier */
    tenantId: TenantId;
    /** Persona identifier within tenant */
    persona_id: string;
    /** Persona status */
    status: PersonaStatus;
    /** Complete persona configuration */
    config: PersonaConfig;
    /** GSI1 Partition Key: tenantId (for active personas per tenant) */
    GSI1PK?: TenantId;
    /** GSI1 Sort Key: `${status}#${updated_at}` */
    GSI1SK?: string;
    /** GSI2 Partition Key: `TEMPLATE#${category}` (for persona templates) */
    GSI2PK?: string;
    /** GSI2 Sort Key: popularity_score (for template ranking) */
    GSI2SK?: string;
    /** Whether this persona is a template */
    isTemplate?: boolean;
    /** Template category */
    templateCategory?: string;
    /** Popularity score for template ranking */
    popularityScore?: number;
    /** Template description */
    templateDescription?: string;
    /** When the persona was created */
    created_at: Timestamp;
    /** When the persona was last updated */
    updated_at: Timestamp;
    /** Who created the persona */
    created_by?: string;
    /** Who last updated the persona */
    updated_by?: string;
}
/**
 * Zod schema for MessageItem validation
 */
export declare const MessageItemSchema: z.ZodObject<{
    contact_pk: z.ZodString;
    ts: z.ZodString;
    tenantId: z.ZodString;
    email_lc: z.ZodString;
    source: z.ZodEnum<["sms", "email", "chat", "api", "voice", "social"]>;
    direction: z.ZodEnum<["inbound", "outbound"]>;
    text: z.ZodString;
    conversation_id: z.ZodOptional<z.ZodString>;
    lead_id: z.ZodOptional<z.ZodString>;
    channel_context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    meta: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    GSI1PK: z.ZodOptional<z.ZodString>;
    GSI1SK: z.ZodOptional<z.ZodString>;
    GSI2PK: z.ZodOptional<z.ZodString>;
    GSI2SK: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodString>;
    updated_at: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    contact_pk: string;
    ts: string;
    tenantId: string;
    email_lc: string;
    source: "chat" | "sms" | "email" | "api" | "voice" | "social";
    direction: "inbound" | "outbound";
    text: string;
    lead_id?: string | undefined;
    channel_context?: Record<string, any> | undefined;
    meta?: Record<string, any> | undefined;
    conversation_id?: string | undefined;
    GSI1PK?: string | undefined;
    GSI1SK?: string | undefined;
    GSI2PK?: string | undefined;
    GSI2SK?: string | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
}, {
    contact_pk: string;
    ts: string;
    tenantId: string;
    email_lc: string;
    source: "chat" | "sms" | "email" | "api" | "voice" | "social";
    direction: "inbound" | "outbound";
    text: string;
    lead_id?: string | undefined;
    channel_context?: Record<string, any> | undefined;
    meta?: Record<string, any> | undefined;
    conversation_id?: string | undefined;
    GSI1PK?: string | undefined;
    GSI1SK?: string | undefined;
    GSI2PK?: string | undefined;
    GSI2SK?: string | undefined;
    created_at?: string | undefined;
    updated_at?: string | undefined;
}>;
/**
 * Zod schema for LeadItem validation
 */
export declare const LeadItemSchema: z.ZodObject<{
    contact_pk: z.ZodString;
    sk: z.ZodString;
    tenantId: z.ZodString;
    email_lc: z.ZodString;
    contactInfo: z.ZodObject<{
        firstName: z.ZodOptional<z.ZodString>;
        lastName: z.ZodOptional<z.ZodString>;
        fullName: z.ZodOptional<z.ZodString>;
        email: z.ZodString;
        phone: z.ZodOptional<z.ZodString>;
        company: z.ZodOptional<z.ZodString>;
        title: z.ZodOptional<z.ZodString>;
        preferredChannel: z.ZodOptional<z.ZodEnum<["sms", "email", "chat", "api", "voice", "social"]>>;
        timezone: z.ZodOptional<z.ZodString>;
        language: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        email: string;
        preferredChannel?: "chat" | "sms" | "email" | "api" | "voice" | "social" | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        fullName?: string | undefined;
        phone?: string | undefined;
        company?: string | undefined;
        title?: string | undefined;
        timezone?: string | undefined;
        language?: string | undefined;
    }, {
        email: string;
        preferredChannel?: "chat" | "sms" | "email" | "api" | "voice" | "social" | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        fullName?: string | undefined;
        phone?: string | undefined;
        company?: string | undefined;
        title?: string | undefined;
        timezone?: string | undefined;
        language?: string | undefined;
    }>;
    qualification: z.ZodObject<{
        score: z.ZodNumber;
        status: z.ZodEnum<["new", "contacted", "qualified", "converted", "lost", "nurturing"]>;
        source: z.ZodString;
        campaign: z.ZodOptional<z.ZodString>;
        interestLevel: z.ZodOptional<z.ZodNumber>;
        urgencyLevel: z.ZodOptional<z.ZodNumber>;
        budget: z.ZodOptional<z.ZodObject<{
            range: z.ZodString;
            qualified: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            qualified: boolean;
            range: string;
        }, {
            qualified: boolean;
            range: string;
        }>>;
        decisionMaker: z.ZodOptional<z.ZodBoolean>;
        timeline: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        status: "new" | "contacted" | "qualified" | "converted" | "lost" | "nurturing";
        source: string;
        score: number;
        campaign?: string | undefined;
        interestLevel?: number | undefined;
        urgencyLevel?: number | undefined;
        budget?: {
            qualified: boolean;
            range: string;
        } | undefined;
        decisionMaker?: boolean | undefined;
        timeline?: string | undefined;
        notes?: string[] | undefined;
    }, {
        status: "new" | "contacted" | "qualified" | "converted" | "lost" | "nurturing";
        source: string;
        score: number;
        campaign?: string | undefined;
        interestLevel?: number | undefined;
        urgencyLevel?: number | undefined;
        budget?: {
            qualified: boolean;
            range: string;
        } | undefined;
        decisionMaker?: boolean | undefined;
        timeline?: string | undefined;
        notes?: string[] | undefined;
    }>;
    preferences: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    GSI1PK: z.ZodOptional<z.ZodString>;
    GSI1SK: z.ZodOptional<z.ZodString>;
    GSI2PK: z.ZodOptional<z.ZodString>;
    GSI2SK: z.ZodOptional<z.ZodString>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    created_by: z.ZodOptional<z.ZodString>;
    updated_by: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    contact_pk: string;
    tenantId: string;
    email_lc: string;
    created_at: string;
    updated_at: string;
    sk: string;
    contactInfo: {
        email: string;
        preferredChannel?: "chat" | "sms" | "email" | "api" | "voice" | "social" | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        fullName?: string | undefined;
        phone?: string | undefined;
        company?: string | undefined;
        title?: string | undefined;
        timezone?: string | undefined;
        language?: string | undefined;
    };
    qualification: {
        status: "new" | "contacted" | "qualified" | "converted" | "lost" | "nurturing";
        source: string;
        score: number;
        campaign?: string | undefined;
        interestLevel?: number | undefined;
        urgencyLevel?: number | undefined;
        budget?: {
            qualified: boolean;
            range: string;
        } | undefined;
        decisionMaker?: boolean | undefined;
        timeline?: string | undefined;
        notes?: string[] | undefined;
    };
    GSI1PK?: string | undefined;
    GSI1SK?: string | undefined;
    GSI2PK?: string | undefined;
    GSI2SK?: string | undefined;
    preferences?: Record<string, any> | undefined;
    created_by?: string | undefined;
    updated_by?: string | undefined;
}, {
    contact_pk: string;
    tenantId: string;
    email_lc: string;
    created_at: string;
    updated_at: string;
    sk: string;
    contactInfo: {
        email: string;
        preferredChannel?: "chat" | "sms" | "email" | "api" | "voice" | "social" | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        fullName?: string | undefined;
        phone?: string | undefined;
        company?: string | undefined;
        title?: string | undefined;
        timezone?: string | undefined;
        language?: string | undefined;
    };
    qualification: {
        status: "new" | "contacted" | "qualified" | "converted" | "lost" | "nurturing";
        source: string;
        score: number;
        campaign?: string | undefined;
        interestLevel?: number | undefined;
        urgencyLevel?: number | undefined;
        budget?: {
            qualified: boolean;
            range: string;
        } | undefined;
        decisionMaker?: boolean | undefined;
        timeline?: string | undefined;
        notes?: string[] | undefined;
    };
    GSI1PK?: string | undefined;
    GSI1SK?: string | undefined;
    GSI2PK?: string | undefined;
    GSI2SK?: string | undefined;
    preferences?: Record<string, any> | undefined;
    created_by?: string | undefined;
    updated_by?: string | undefined;
}>;
/**
 * Zod schema for PersonaItem validation
 */
export declare const PersonaItemSchema: z.ZodObject<{
    persona_pk: z.ZodString;
    sk: z.ZodString;
    tenantId: z.ZodString;
    persona_id: z.ZodString;
    status: z.ZodEnum<["active", "draft", "archived", "template"]>;
    config: z.ZodRecord<z.ZodString, z.ZodAny>;
    GSI1PK: z.ZodOptional<z.ZodString>;
    GSI1SK: z.ZodOptional<z.ZodString>;
    GSI2PK: z.ZodOptional<z.ZodString>;
    GSI2SK: z.ZodOptional<z.ZodString>;
    isTemplate: z.ZodOptional<z.ZodBoolean>;
    templateCategory: z.ZodOptional<z.ZodString>;
    popularityScore: z.ZodOptional<z.ZodNumber>;
    templateDescription: z.ZodOptional<z.ZodString>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    created_by: z.ZodOptional<z.ZodString>;
    updated_by: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "draft" | "archived" | "template";
    tenantId: string;
    created_at: string;
    updated_at: string;
    sk: string;
    persona_pk: string;
    persona_id: string;
    config: Record<string, any>;
    GSI1PK?: string | undefined;
    GSI1SK?: string | undefined;
    GSI2PK?: string | undefined;
    GSI2SK?: string | undefined;
    created_by?: string | undefined;
    updated_by?: string | undefined;
    isTemplate?: boolean | undefined;
    templateCategory?: string | undefined;
    popularityScore?: number | undefined;
    templateDescription?: string | undefined;
}, {
    status: "active" | "draft" | "archived" | "template";
    tenantId: string;
    created_at: string;
    updated_at: string;
    sk: string;
    persona_pk: string;
    persona_id: string;
    config: Record<string, any>;
    GSI1PK?: string | undefined;
    GSI1SK?: string | undefined;
    GSI2PK?: string | undefined;
    GSI2SK?: string | undefined;
    created_by?: string | undefined;
    updated_by?: string | undefined;
    isTemplate?: boolean | undefined;
    templateCategory?: string | undefined;
    popularityScore?: number | undefined;
    templateDescription?: string | undefined;
}>;
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
//# sourceMappingURL=dynamodb-schemas.d.ts.map