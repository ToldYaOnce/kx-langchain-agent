import type { MessageItem, LeadItem, RuntimeConfig } from '../types/index.js';
export declare class DynamoDBService {
    private client;
    private config;
    constructor(config: RuntimeConfig);
    /**
     * Create contact primary key from tenantId and email_lc
     */
    static createContactPK(tenantId: string, emailLc: string): string;
    /**
     * Generate timestamp-based sort key using ULID
     */
    static generateTimestampSK(): string;
    /**
     * Convert ULID to ISO8601 timestamp
     */
    static ulidToTimestamp(ulidStr: string): string;
    /**
     * Put a message item to the messages table
     */
    putMessage(message: Omit<MessageItem, 'contact_pk' | 'ts' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'>): Promise<MessageItem>;
    /**
     * Query messages for a contact (tenantId + email_lc)
     *
     * NOTE: This method supports both table schemas:
     * 1. Legacy schema: contact_pk as partition key
     * 2. Consumer schema: targetKey as partition key
     */
    getMessageHistory(tenantId: string, emailLc: string, options?: {
        limit?: number;
        exclusiveStartKey?: Record<string, any>;
        scanIndexForward?: boolean;
        conversationId?: string;
    }): Promise<{
        items: MessageItem[];
        lastEvaluatedKey?: Record<string, any>;
    }>;
    /**
     * Query recent messages per tenant (GSI1)
     */
    getRecentMessagesByTenant(tenantId: string, options?: {
        limit?: number;
        exclusiveStartKey?: Record<string, any>;
    }): Promise<{
        items: MessageItem[];
        lastEvaluatedKey?: Record<string, any>;
    }>;
    /**
     * Get lead by tenantId and email_lc
     */
    getLead(tenantId: string, emailLc: string): Promise<LeadItem | null>;
    /**
     * Query leads by phone number (assuming GSI on phone_e164)
     */
    getLeadByPhone(tenantId: string, phoneE164: string): Promise<LeadItem | null>;
    /**
     * Resolve contact info from phone number
     * Returns email_lc if lead found, null otherwise
     */
    resolveContactFromPhone(tenantId: string, phoneE164: string): Promise<string | null>;
}
