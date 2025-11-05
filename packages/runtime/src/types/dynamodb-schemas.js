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
//# sourceMappingURL=dynamodb-schemas.js.map