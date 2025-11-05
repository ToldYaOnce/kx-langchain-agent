import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
export class DynamoDBService {
    client;
    config;
    constructor(config) {
        this.config = config;
        const dynamoClient = new DynamoDBClient({
            region: config.awsRegion,
            ...(config.dynamodbEndpoint && { endpoint: config.dynamodbEndpoint }),
        });
        this.client = DynamoDBDocumentClient.from(dynamoClient, {
            marshallOptions: {
                removeUndefinedValues: true,
            },
        });
    }
    /**
     * Create contact primary key from tenantId and email_lc
     */
    static createContactPK(tenantId, emailLc) {
        return `${tenantId}#${emailLc}`;
    }
    /**
     * Generate timestamp-based sort key using ULID
     */
    static generateTimestampSK() {
        return ulid();
    }
    /**
     * Convert ULID to ISO8601 timestamp
     */
    static ulidToTimestamp(ulidStr) {
        try {
            // ULID first 10 characters represent timestamp in base32
            const timestamp = parseInt(ulidStr.substring(0, 10), 36);
            return new Date(timestamp).toISOString();
        }
        catch {
            return new Date().toISOString();
        }
    }
    /**
     * Put a message item to the messages table
     */
    async putMessage(message) {
        const ts = DynamoDBService.generateTimestampSK();
        const contact_pk = DynamoDBService.createContactPK(message.tenantId, message.email_lc);
        const item = {
            tenantId: message.tenantId,
            email_lc: message.email_lc,
            source: message.source,
            direction: message.direction,
            text: message.text,
            conversation_id: message.conversation_id,
            meta: message.meta,
            contact_pk,
            ts,
            GSI1PK: message.tenantId, // For recent messages per tenant
            GSI1SK: ts,
        };
        // Only add optional fields if they exist
        if (message.lead_id) {
            item.lead_id = message.lead_id;
            item.GSI2PK = message.lead_id;
            item.GSI2SK = ts;
        }
        if (message.channel_context) {
            item.channel_context = message.channel_context;
        }
        await this.client.send(new PutCommand({
            TableName: this.config.messagesTable,
            Item: item,
        }));
        return item;
    }
    /**
     * Query messages for a contact (tenantId + email_lc)
     */
    async getMessageHistory(tenantId, emailLc, options = {}) {
        const contact_pk = DynamoDBService.createContactPK(tenantId, emailLc);
        const result = await this.client.send(new QueryCommand({
            TableName: this.config.messagesTable,
            KeyConditionExpression: 'contact_pk = :pk',
            ExpressionAttributeValues: {
                ':pk': contact_pk,
            },
            Limit: options.limit || this.config.historyLimit,
            ExclusiveStartKey: options.exclusiveStartKey,
            ScanIndexForward: options.scanIndexForward ?? false, // Most recent first
        }));
        return {
            items: (result.Items || []),
            lastEvaluatedKey: result.LastEvaluatedKey,
        };
    }
    /**
     * Query recent messages per tenant (GSI1)
     */
    async getRecentMessagesByTenant(tenantId, options = {}) {
        const result = await this.client.send(new QueryCommand({
            TableName: this.config.messagesTable,
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :pk',
            ExpressionAttributeValues: {
                ':pk': tenantId,
            },
            Limit: options.limit || 100,
            ExclusiveStartKey: options.exclusiveStartKey,
            ScanIndexForward: false, // Most recent first
        }));
        return {
            items: (result.Items || []),
            lastEvaluatedKey: result.LastEvaluatedKey,
        };
    }
    /**
     * Get lead by tenantId and email_lc
     */
    async getLead(tenantId, emailLc) {
        const result = await this.client.send(new GetCommand({
            TableName: this.config.leadsTable,
            Key: {
                PK: tenantId,
                SK: emailLc,
            },
        }));
        return result.Item || null;
    }
    /**
     * Query leads by phone number (assuming GSI on phone_e164)
     */
    async getLeadByPhone(tenantId, phoneE164) {
        // This assumes there's a GSI on the leads table with phone_e164
        // The exact implementation depends on your existing leads table structure
        const result = await this.client.send(new QueryCommand({
            TableName: this.config.leadsTable,
            IndexName: 'PhoneIndex', // Adjust based on your actual GSI name
            KeyConditionExpression: 'PK = :tenantId AND phone_e164 = :phone',
            ExpressionAttributeValues: {
                ':tenantId': tenantId,
                ':phone': phoneE164,
            },
            Limit: 1,
        }));
        const items = result.Items;
        return items?.[0] || null;
    }
    /**
     * Resolve contact info from phone number
     * Returns email_lc if lead found, null otherwise
     */
    async resolveContactFromPhone(tenantId, phoneE164) {
        const lead = await this.getLeadByPhone(tenantId, phoneE164);
        return lead?.email_lc || null;
    }
}
//# sourceMappingURL=dynamodb.js.map