"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoDBService = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const ulid_1 = require("ulid");
class DynamoDBService {
    constructor(config) {
        this.config = config;
        const dynamoClient = new client_dynamodb_1.DynamoDBClient({
            region: config.awsRegion,
            ...(config.dynamodbEndpoint && { endpoint: config.dynamodbEndpoint }),
        });
        this.client = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient, {
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
        return (0, ulid_1.ulid)();
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
        console.log('🔥 1.3.1 PUTMESSAGE START - v1.1.25 - received conversation_id:', message.conversation_id);
        const ts = DynamoDBService.generateTimestampSK();
        const contact_pk = DynamoDBService.createContactPK(message.tenantId, message.email_lc);
        // Support consumer's table schema with targetKey (channel-based)
        const targetKey = message.conversation_id
            ? `channel#${message.conversation_id}`
            : contact_pk;
        console.log('🔥 1.3.2 DYNAMODB SERVICE - targetKey:', targetKey, 'conversation_id:', message.conversation_id);
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
            targetKey, // Add targetKey for consumer's messages table
            dateReceived: new Date().toISOString(), // Add dateReceived for consumer's table
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
        await this.client.send(new lib_dynamodb_1.PutCommand({
            TableName: this.config.messagesTable,
            Item: item,
        }));
        return item;
    }
    /**
     * Query messages for a contact (tenantId + email_lc)
     *
     * NOTE: This method supports both table schemas:
     * 1. Legacy schema: contact_pk as partition key
     * 2. Consumer schema: targetKey as partition key
     */
    async getMessageHistory(tenantId, emailLc, options = {}) {
        // If conversation_id is provided, use consumer's targetKey schema
        if (options.conversationId) {
            const targetKey = `channel#${options.conversationId}`;
            console.log(`🔍 Querying with targetKey schema: ${targetKey}`);
            const result = await this.client.send(new lib_dynamodb_1.QueryCommand({
                TableName: this.config.messagesTable,
                KeyConditionExpression: 'targetKey = :targetKey',
                ExpressionAttributeValues: {
                    ':targetKey': targetKey,
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
        // Otherwise, use legacy contact_pk schema
        const contact_pk = DynamoDBService.createContactPK(tenantId, emailLc);
        console.log(`🔍 Querying with contact_pk schema: ${contact_pk}`);
        const result = await this.client.send(new lib_dynamodb_1.QueryCommand({
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
        const result = await this.client.send(new lib_dynamodb_1.QueryCommand({
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
        const result = await this.client.send(new lib_dynamodb_1.GetCommand({
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
        const result = await this.client.send(new lib_dynamodb_1.QueryCommand({
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
exports.DynamoDBService = DynamoDBService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluYW1vZGIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2R5bmFtb2RiLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBcUc7QUFDckcsK0JBQTRCO0FBRzVCLE1BQWEsZUFBZTtJQUkxQixZQUFZLE1BQXFCO1FBQy9CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQztZQUN0QyxNQUFNLEVBQUUsTUFBTSxDQUFDLFNBQVM7WUFDeEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztTQUN0RSxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsTUFBTSxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDdEQsZUFBZSxFQUFFO2dCQUNmLHFCQUFxQixFQUFFLElBQUk7YUFDNUI7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQWdCLEVBQUUsT0FBZTtRQUN0RCxPQUFPLEdBQUcsUUFBUSxJQUFJLE9BQU8sRUFBRSxDQUFDO0lBQ2xDLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxtQkFBbUI7UUFDeEIsT0FBTyxJQUFBLFdBQUksR0FBRSxDQUFDO0lBQ2hCLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBZTtRQUNwQyxJQUFJLENBQUM7WUFDSCx5REFBeUQ7WUFDekQsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3pELE9BQU8sSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsV0FBVyxF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RUFBMEU7UUFDMUUsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLDJCQUFZLENBQUM7WUFDckQsU0FBUyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVTtZQUNqQyxTQUFTLEVBQUUsWUFBWSxFQUFFLHVDQUF1QztZQUNoRSxzQkFBc0IsRUFBRSx3Q0FBd0M7WUFDaEUseUJBQXlCLEVBQUU7Z0JBQ3pCLFdBQVcsRUFBRSxRQUFRO2dCQUNyQixRQUFRLEVBQUUsU0FBUzthQUNwQjtZQUNELEtBQUssRUFBRSxDQUFDO1NBQ1QsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBbUIsQ0FBQztRQUN6QyxPQUFPLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQztJQUM1QixDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsS0FBSyxDQUFDLHVCQUF1QixDQUFDLFFBQWdCLEVBQUUsU0FBaUI7UUFDL0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM1RCxPQUFPLElBQUksRUFBRSxRQUFRLElBQUksSUFBSSxDQUFDO0lBQ2hDLENBQUM7Q0FDRjtBQXpPRCwwQ0F5T0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBRdWVyeUNvbW1hbmQsIFB1dENvbW1hbmQsIEdldENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgdWxpZCB9IGZyb20gJ3VsaWQnO1xuaW1wb3J0IHR5cGUgeyBNZXNzYWdlSXRlbSwgTGVhZEl0ZW0sIFJ1bnRpbWVDb25maWcgfSBmcm9tICcuLi90eXBlcy9pbmRleC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEeW5hbW9EQlNlcnZpY2Uge1xuICBwcml2YXRlIGNsaWVudDogRHluYW1vREJEb2N1bWVudENsaWVudDtcbiAgcHJpdmF0ZSBjb25maWc6IFJ1bnRpbWVDb25maWc7XG5cbiAgY29uc3RydWN0b3IoY29uZmlnOiBSdW50aW1lQ29uZmlnKSB7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgXG4gICAgY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHtcbiAgICAgIHJlZ2lvbjogY29uZmlnLmF3c1JlZ2lvbixcbiAgICAgIC4uLihjb25maWcuZHluYW1vZGJFbmRwb2ludCAmJiB7IGVuZHBvaW50OiBjb25maWcuZHluYW1vZGJFbmRwb2ludCB9KSxcbiAgICB9KTtcbiAgICBcbiAgICB0aGlzLmNsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQsIHtcbiAgICAgIG1hcnNoYWxsT3B0aW9uczoge1xuICAgICAgICByZW1vdmVVbmRlZmluZWRWYWx1ZXM6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBjb250YWN0IHByaW1hcnkga2V5IGZyb20gdGVuYW50SWQgYW5kIGVtYWlsX2xjXG4gICAqL1xuICBzdGF0aWMgY3JlYXRlQ29udGFjdFBLKHRlbmFudElkOiBzdHJpbmcsIGVtYWlsTGM6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3RlbmFudElkfSMke2VtYWlsTGN9YDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZW5lcmF0ZSB0aW1lc3RhbXAtYmFzZWQgc29ydCBrZXkgdXNpbmcgVUxJRFxuICAgKi9cbiAgc3RhdGljIGdlbmVyYXRlVGltZXN0YW1wU0soKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdWxpZCgpO1xuICB9XG5cbiAgLyoqXG4gICAqIENvbnZlcnQgVUxJRCB0byBJU084NjAxIHRpbWVzdGFtcFxuICAgKi9cbiAgc3RhdGljIHVsaWRUb1RpbWVzdGFtcCh1bGlkU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAvLyBVTElEIGZpcnN0IDEwIGNoYXJhY3RlcnMgcmVwcmVzZW50IHRpbWVzdGFtcCBpbiBiYXNlMzJcbiAgICAgIGNvbnN0IHRpbWVzdGFtcCA9IHBhcnNlSW50KHVsaWRTdHIuc3Vic3RyaW5nKDAsIDEwKSwgMzYpO1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKHRpbWVzdGFtcCkudG9JU09TdHJpbmcoKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFB1dCBhIG1lc3NhZ2UgaXRlbSB0byB0aGUgbWVzc2FnZXMgdGFibGVcbiAgICovXG4gIGFzeW5jIHB1dE1lc3NhZ2UobWVzc2FnZTogT21pdDxNZXNzYWdlSXRlbSwgJ2NvbnRhY3RfcGsnIHwgJ3RzJyB8ICdHU0kxUEsnIHwgJ0dTSTFTSycgfCAnR1NJMlBLJyB8ICdHU0kyU0snPik6IFByb21pc2U8TWVzc2FnZUl0ZW0+IHtcbiAgICBjb25zb2xlLmxvZygn8J+UpSAxLjMuMSBQVVRNRVNTQUdFIFNUQVJUIC0gdjEuMS4yNSAtIHJlY2VpdmVkIGNvbnZlcnNhdGlvbl9pZDonLCBtZXNzYWdlLmNvbnZlcnNhdGlvbl9pZCk7XG4gICAgY29uc3QgdHMgPSBEeW5hbW9EQlNlcnZpY2UuZ2VuZXJhdGVUaW1lc3RhbXBTSygpO1xuICAgIGNvbnN0IGNvbnRhY3RfcGsgPSBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKG1lc3NhZ2UudGVuYW50SWQsIG1lc3NhZ2UuZW1haWxfbGMpO1xuICAgIFxuICAgIC8vIFN1cHBvcnQgY29uc3VtZXIncyB0YWJsZSBzY2hlbWEgd2l0aCB0YXJnZXRLZXkgKGNoYW5uZWwtYmFzZWQpXG4gICAgY29uc3QgdGFyZ2V0S2V5ID0gbWVzc2FnZS5jb252ZXJzYXRpb25faWRcbiAgICAgID8gYGNoYW5uZWwjJHttZXNzYWdlLmNvbnZlcnNhdGlvbl9pZH1gXG4gICAgICA6IGNvbnRhY3RfcGs7XG5cbiAgICBjb25zb2xlLmxvZygn8J+UpSAxLjMuMiBEWU5BTU9EQiBTRVJWSUNFIC0gdGFyZ2V0S2V5OicsIHRhcmdldEtleSwgJ2NvbnZlcnNhdGlvbl9pZDonLCBtZXNzYWdlLmNvbnZlcnNhdGlvbl9pZCk7XG4gICAgXG4gICAgY29uc3QgaXRlbTogTWVzc2FnZUl0ZW0gPSB7XG4gICAgICB0ZW5hbnRJZDogbWVzc2FnZS50ZW5hbnRJZCxcbiAgICAgIGVtYWlsX2xjOiBtZXNzYWdlLmVtYWlsX2xjLFxuICAgICAgc291cmNlOiBtZXNzYWdlLnNvdXJjZSxcbiAgICAgIGRpcmVjdGlvbjogbWVzc2FnZS5kaXJlY3Rpb24sXG4gICAgICB0ZXh0OiBtZXNzYWdlLnRleHQsXG4gICAgICBjb252ZXJzYXRpb25faWQ6IG1lc3NhZ2UuY29udmVyc2F0aW9uX2lkLFxuICAgICAgbWV0YTogbWVzc2FnZS5tZXRhLFxuICAgICAgY29udGFjdF9wayxcbiAgICAgIHRzLFxuICAgICAgdGFyZ2V0S2V5LCAvLyBBZGQgdGFyZ2V0S2V5IGZvciBjb25zdW1lcidzIG1lc3NhZ2VzIHRhYmxlXG4gICAgICBkYXRlUmVjZWl2ZWQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwgLy8gQWRkIGRhdGVSZWNlaXZlZCBmb3IgY29uc3VtZXIncyB0YWJsZVxuICAgICAgR1NJMVBLOiBtZXNzYWdlLnRlbmFudElkLCAvLyBGb3IgcmVjZW50IG1lc3NhZ2VzIHBlciB0ZW5hbnRcbiAgICAgIEdTSTFTSzogdHMsXG4gICAgfTtcblxuICAgIC8vIE9ubHkgYWRkIG9wdGlvbmFsIGZpZWxkcyBpZiB0aGV5IGV4aXN0XG4gICAgaWYgKG1lc3NhZ2UubGVhZF9pZCkge1xuICAgICAgaXRlbS5sZWFkX2lkID0gbWVzc2FnZS5sZWFkX2lkO1xuICAgICAgaXRlbS5HU0kyUEsgPSBtZXNzYWdlLmxlYWRfaWQ7XG4gICAgICBpdGVtLkdTSTJTSyA9IHRzO1xuICAgIH1cbiAgICBpZiAobWVzc2FnZS5jaGFubmVsX2NvbnRleHQpIHtcbiAgICAgIGl0ZW0uY2hhbm5lbF9jb250ZXh0ID0gbWVzc2FnZS5jaGFubmVsX2NvbnRleHQ7XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5jbGllbnQuc2VuZChuZXcgUHV0Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRoaXMuY29uZmlnLm1lc3NhZ2VzVGFibGUsXG4gICAgICBJdGVtOiBpdGVtLFxuICAgIH0pKTtcblxuICAgIHJldHVybiBpdGVtO1xuICB9XG5cbiAgLyoqXG4gICAqIFF1ZXJ5IG1lc3NhZ2VzIGZvciBhIGNvbnRhY3QgKHRlbmFudElkICsgZW1haWxfbGMpXG4gICAqIFxuICAgKiBOT1RFOiBUaGlzIG1ldGhvZCBzdXBwb3J0cyBib3RoIHRhYmxlIHNjaGVtYXM6XG4gICAqIDEuIExlZ2FjeSBzY2hlbWE6IGNvbnRhY3RfcGsgYXMgcGFydGl0aW9uIGtleVxuICAgKiAyLiBDb25zdW1lciBzY2hlbWE6IHRhcmdldEtleSBhcyBwYXJ0aXRpb24ga2V5XG4gICAqL1xuICBhc3luYyBnZXRNZXNzYWdlSGlzdG9yeShcbiAgICB0ZW5hbnRJZDogc3RyaW5nLFxuICAgIGVtYWlsTGM6IHN0cmluZyxcbiAgICBvcHRpb25zOiB7XG4gICAgICBsaW1pdD86IG51bWJlcjtcbiAgICAgIGV4Y2x1c2l2ZVN0YXJ0S2V5PzogUmVjb3JkPHN0cmluZywgYW55PjtcbiAgICAgIHNjYW5JbmRleEZvcndhcmQ/OiBib29sZWFuO1xuICAgICAgY29udmVyc2F0aW9uSWQ/OiBzdHJpbmc7IC8vIElmIHByb3ZpZGVkLCBxdWVyeSB1c2luZyB0YXJnZXRLZXkgKGNvbnN1bWVyIHNjaGVtYSlcbiAgICB9ID0ge31cbiAgKTogUHJvbWlzZTx7XG4gICAgaXRlbXM6IE1lc3NhZ2VJdGVtW107XG4gICAgbGFzdEV2YWx1YXRlZEtleT86IFJlY29yZDxzdHJpbmcsIGFueT47XG4gIH0+IHtcbiAgICAvLyBJZiBjb252ZXJzYXRpb25faWQgaXMgcHJvdmlkZWQsIHVzZSBjb25zdW1lcidzIHRhcmdldEtleSBzY2hlbWFcbiAgICBpZiAob3B0aW9ucy5jb252ZXJzYXRpb25JZCkge1xuICAgICAgY29uc3QgdGFyZ2V0S2V5ID0gYGNoYW5uZWwjJHtvcHRpb25zLmNvbnZlcnNhdGlvbklkfWA7XG4gICAgICBjb25zb2xlLmxvZyhg8J+UjSBRdWVyeWluZyB3aXRoIHRhcmdldEtleSBzY2hlbWE6ICR7dGFyZ2V0S2V5fWApO1xuICAgICAgXG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IHRoaXMuY29uZmlnLm1lc3NhZ2VzVGFibGUsXG4gICAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd0YXJnZXRLZXkgPSA6dGFyZ2V0S2V5JyxcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAgICc6dGFyZ2V0S2V5JzogdGFyZ2V0S2V5LFxuICAgICAgICB9LFxuICAgICAgICBMaW1pdDogb3B0aW9ucy5saW1pdCB8fCB0aGlzLmNvbmZpZy5oaXN0b3J5TGltaXQsXG4gICAgICAgIEV4Y2x1c2l2ZVN0YXJ0S2V5OiBvcHRpb25zLmV4Y2x1c2l2ZVN0YXJ0S2V5LFxuICAgICAgICBTY2FuSW5kZXhGb3J3YXJkOiBvcHRpb25zLnNjYW5JbmRleEZvcndhcmQgPz8gZmFsc2UsIC8vIE1vc3QgcmVjZW50IGZpcnN0XG4gICAgICB9KSk7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGl0ZW1zOiAocmVzdWx0Lkl0ZW1zIHx8IFtdKSBhcyBNZXNzYWdlSXRlbVtdLFxuICAgICAgICBsYXN0RXZhbHVhdGVkS2V5OiByZXN1bHQuTGFzdEV2YWx1YXRlZEtleSxcbiAgICAgIH07XG4gICAgfVxuICAgIFxuICAgIC8vIE90aGVyd2lzZSwgdXNlIGxlZ2FjeSBjb250YWN0X3BrIHNjaGVtYVxuICAgIGNvbnN0IGNvbnRhY3RfcGsgPSBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKHRlbmFudElkLCBlbWFpbExjKTtcbiAgICBjb25zb2xlLmxvZyhg8J+UjSBRdWVyeWluZyB3aXRoIGNvbnRhY3RfcGsgc2NoZW1hOiAke2NvbnRhY3RfcGt9YCk7XG4gICAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGhpcy5jb25maWcubWVzc2FnZXNUYWJsZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdjb250YWN0X3BrID0gOnBrJyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgJzpwayc6IGNvbnRhY3RfcGssXG4gICAgICB9LFxuICAgICAgTGltaXQ6IG9wdGlvbnMubGltaXQgfHwgdGhpcy5jb25maWcuaGlzdG9yeUxpbWl0LFxuICAgICAgRXhjbHVzaXZlU3RhcnRLZXk6IG9wdGlvbnMuZXhjbHVzaXZlU3RhcnRLZXksXG4gICAgICBTY2FuSW5kZXhGb3J3YXJkOiBvcHRpb25zLnNjYW5JbmRleEZvcndhcmQgPz8gZmFsc2UsIC8vIE1vc3QgcmVjZW50IGZpcnN0XG4gICAgfSkpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGl0ZW1zOiAocmVzdWx0Lkl0ZW1zIHx8IFtdKSBhcyBNZXNzYWdlSXRlbVtdLFxuICAgICAgbGFzdEV2YWx1YXRlZEtleTogcmVzdWx0Lkxhc3RFdmFsdWF0ZWRLZXksXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBRdWVyeSByZWNlbnQgbWVzc2FnZXMgcGVyIHRlbmFudCAoR1NJMSlcbiAgICovXG4gIGFzeW5jIGdldFJlY2VudE1lc3NhZ2VzQnlUZW5hbnQoXG4gICAgdGVuYW50SWQ6IHN0cmluZyxcbiAgICBvcHRpb25zOiB7XG4gICAgICBsaW1pdD86IG51bWJlcjtcbiAgICAgIGV4Y2x1c2l2ZVN0YXJ0S2V5PzogUmVjb3JkPHN0cmluZywgYW55PjtcbiAgICB9ID0ge31cbiAgKTogUHJvbWlzZTx7XG4gICAgaXRlbXM6IE1lc3NhZ2VJdGVtW107XG4gICAgbGFzdEV2YWx1YXRlZEtleT86IFJlY29yZDxzdHJpbmcsIGFueT47XG4gIH0+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0aGlzLmNvbmZpZy5tZXNzYWdlc1RhYmxlLFxuICAgICAgSW5kZXhOYW1lOiAnR1NJMScsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAnR1NJMVBLID0gOnBrJyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgJzpwayc6IHRlbmFudElkLFxuICAgICAgfSxcbiAgICAgIExpbWl0OiBvcHRpb25zLmxpbWl0IHx8IDEwMCxcbiAgICAgIEV4Y2x1c2l2ZVN0YXJ0S2V5OiBvcHRpb25zLmV4Y2x1c2l2ZVN0YXJ0S2V5LFxuICAgICAgU2NhbkluZGV4Rm9yd2FyZDogZmFsc2UsIC8vIE1vc3QgcmVjZW50IGZpcnN0XG4gICAgfSkpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGl0ZW1zOiAocmVzdWx0Lkl0ZW1zIHx8IFtdKSBhcyBNZXNzYWdlSXRlbVtdLFxuICAgICAgbGFzdEV2YWx1YXRlZEtleTogcmVzdWx0Lkxhc3RFdmFsdWF0ZWRLZXksXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgbGVhZCBieSB0ZW5hbnRJZCBhbmQgZW1haWxfbGNcbiAgICovXG4gIGFzeW5jIGdldExlYWQodGVuYW50SWQ6IHN0cmluZywgZW1haWxMYzogc3RyaW5nKTogUHJvbWlzZTxMZWFkSXRlbSB8IG51bGw+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGhpcy5jb25maWcubGVhZHNUYWJsZSxcbiAgICAgIEtleToge1xuICAgICAgICBQSzogdGVuYW50SWQsXG4gICAgICAgIFNLOiBlbWFpbExjLFxuICAgICAgfSxcbiAgICB9KSk7XG5cbiAgICByZXR1cm4gcmVzdWx0Lkl0ZW0gYXMgTGVhZEl0ZW0gfHwgbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBRdWVyeSBsZWFkcyBieSBwaG9uZSBudW1iZXIgKGFzc3VtaW5nIEdTSSBvbiBwaG9uZV9lMTY0KVxuICAgKi9cbiAgYXN5bmMgZ2V0TGVhZEJ5UGhvbmUodGVuYW50SWQ6IHN0cmluZywgcGhvbmVFMTY0OiBzdHJpbmcpOiBQcm9taXNlPExlYWRJdGVtIHwgbnVsbD4ge1xuICAgIC8vIFRoaXMgYXNzdW1lcyB0aGVyZSdzIGEgR1NJIG9uIHRoZSBsZWFkcyB0YWJsZSB3aXRoIHBob25lX2UxNjRcbiAgICAvLyBUaGUgZXhhY3QgaW1wbGVtZW50YXRpb24gZGVwZW5kcyBvbiB5b3VyIGV4aXN0aW5nIGxlYWRzIHRhYmxlIHN0cnVjdHVyZVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRoaXMuY29uZmlnLmxlYWRzVGFibGUsXG4gICAgICBJbmRleE5hbWU6ICdQaG9uZUluZGV4JywgLy8gQWRqdXN0IGJhc2VkIG9uIHlvdXIgYWN0dWFsIEdTSSBuYW1lXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAnUEsgPSA6dGVuYW50SWQgQU5EIHBob25lX2UxNjQgPSA6cGhvbmUnLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAnOnRlbmFudElkJzogdGVuYW50SWQsXG4gICAgICAgICc6cGhvbmUnOiBwaG9uZUUxNjQsXG4gICAgICB9LFxuICAgICAgTGltaXQ6IDEsXG4gICAgfSkpO1xuXG4gICAgY29uc3QgaXRlbXMgPSByZXN1bHQuSXRlbXMgYXMgTGVhZEl0ZW1bXTtcbiAgICByZXR1cm4gaXRlbXM/LlswXSB8fCBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc29sdmUgY29udGFjdCBpbmZvIGZyb20gcGhvbmUgbnVtYmVyXG4gICAqIFJldHVybnMgZW1haWxfbGMgaWYgbGVhZCBmb3VuZCwgbnVsbCBvdGhlcndpc2VcbiAgICovXG4gIGFzeW5jIHJlc29sdmVDb250YWN0RnJvbVBob25lKHRlbmFudElkOiBzdHJpbmcsIHBob25lRTE2NDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgY29uc3QgbGVhZCA9IGF3YWl0IHRoaXMuZ2V0TGVhZEJ5UGhvbmUodGVuYW50SWQsIHBob25lRTE2NCk7XG4gICAgcmV0dXJuIGxlYWQ/LmVtYWlsX2xjIHx8IG51bGw7XG4gIH1cbn1cbiJdfQ==