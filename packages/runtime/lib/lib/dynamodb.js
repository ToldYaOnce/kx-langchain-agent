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
        await this.client.send(new lib_dynamodb_1.PutCommand({
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluYW1vZGIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2R5bmFtb2RiLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBcUc7QUFDckcsK0JBQTRCO0FBRzVCLE1BQWEsZUFBZTtJQUkxQixZQUFZLE1BQXFCO1FBQy9CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXJCLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQztZQUN0QyxNQUFNLEVBQUUsTUFBTSxDQUFDLFNBQVM7WUFDeEIsR0FBRyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsSUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztTQUN0RSxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsTUFBTSxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDdEQsZUFBZSxFQUFFO2dCQUNmLHFCQUFxQixFQUFFLElBQUk7YUFDNUI7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7O09BRUc7SUFDSCxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQWdCLEVBQUUsT0FBZTtRQUN0RCxPQUFPLEdBQUcsUUFBUSxJQUFJLE9BQU8sRUFBRSxDQUFDO0lBQ2xDLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxtQkFBbUI7UUFDeEIsT0FBTyxJQUFBLFdBQUksR0FBRSxDQUFDO0lBQ2hCLENBQUM7SUFFRDs7T0FFRztJQUNILE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBZTtRQUNwQyxJQUFJLENBQUM7WUFDSCx5REFBeUQ7WUFDekQsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3pELE9BQU8sSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsV0FBVyxF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dUM7WUFDaEUsc0JBQXNCLEVBQUUsd0NBQXdDO1lBQ2hFLHlCQUF5QixFQUFFO2dCQUN6QixXQUFXLEVBQUUsUUFBUTtnQkFDckIsUUFBUSxFQUFFLFNBQVM7YUFDcEI7WUFDRCxLQUFLLEVBQUUsQ0FBQztTQUNULENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQW1CLENBQUM7UUFDekMsT0FBTyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUM7SUFDNUIsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxRQUFnQixFQUFFLFNBQWlCO1FBQy9ELE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDNUQsT0FBTyxJQUFJLEVBQUUsUUFBUSxJQUFJLElBQUksQ0FBQztJQUNoQyxDQUFDO0NBQ0Y7QUFsTUQsMENBa01DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUXVlcnlDb21tYW5kLCBQdXRDb21tYW5kLCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IHVsaWQgfSBmcm9tICd1bGlkJztcbmltcG9ydCB0eXBlIHsgTWVzc2FnZUl0ZW0sIExlYWRJdGVtLCBSdW50aW1lQ29uZmlnIH0gZnJvbSAnLi4vdHlwZXMvaW5kZXguanMnO1xuXG5leHBvcnQgY2xhc3MgRHluYW1vREJTZXJ2aWNlIHtcbiAgcHJpdmF0ZSBjbGllbnQ6IER5bmFtb0RCRG9jdW1lbnRDbGllbnQ7XG4gIHByaXZhdGUgY29uZmlnOiBSdW50aW1lQ29uZmlnO1xuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogUnVudGltZUNvbmZpZykge1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICAgIFxuICAgIGNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7XG4gICAgICByZWdpb246IGNvbmZpZy5hd3NSZWdpb24sXG4gICAgICAuLi4oY29uZmlnLmR5bmFtb2RiRW5kcG9pbnQgJiYgeyBlbmRwb2ludDogY29uZmlnLmR5bmFtb2RiRW5kcG9pbnQgfSksXG4gICAgfSk7XG4gICAgXG4gICAgdGhpcy5jbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50LCB7XG4gICAgICBtYXJzaGFsbE9wdGlvbnM6IHtcbiAgICAgICAgcmVtb3ZlVW5kZWZpbmVkVmFsdWVzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgY29udGFjdCBwcmltYXJ5IGtleSBmcm9tIHRlbmFudElkIGFuZCBlbWFpbF9sY1xuICAgKi9cbiAgc3RhdGljIGNyZWF0ZUNvbnRhY3RQSyh0ZW5hbnRJZDogc3RyaW5nLCBlbWFpbExjOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHt0ZW5hbnRJZH0jJHtlbWFpbExjfWA7XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgdGltZXN0YW1wLWJhc2VkIHNvcnQga2V5IHVzaW5nIFVMSURcbiAgICovXG4gIHN0YXRpYyBnZW5lcmF0ZVRpbWVzdGFtcFNLKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHVsaWQoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb252ZXJ0IFVMSUQgdG8gSVNPODYwMSB0aW1lc3RhbXBcbiAgICovXG4gIHN0YXRpYyB1bGlkVG9UaW1lc3RhbXAodWxpZFN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgICB0cnkge1xuICAgICAgLy8gVUxJRCBmaXJzdCAxMCBjaGFyYWN0ZXJzIHJlcHJlc2VudCB0aW1lc3RhbXAgaW4gYmFzZTMyXG4gICAgICBjb25zdCB0aW1lc3RhbXAgPSBwYXJzZUludCh1bGlkU3RyLnN1YnN0cmluZygwLCAxMCksIDM2KTtcbiAgICAgIHJldHVybiBuZXcgRGF0ZSh0aW1lc3RhbXApLnRvSVNPU3RyaW5nKCk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBQdXQgYSBtZXNzYWdlIGl0ZW0gdG8gdGhlIG1lc3NhZ2VzIHRhYmxlXG4gICAqL1xuICBhc3luYyBwdXRNZXNzYWdlKG1lc3NhZ2U6IE9taXQ8TWVzc2FnZUl0ZW0sICdjb250YWN0X3BrJyB8ICd0cycgfCAnR1NJMVBLJyB8ICdHU0kxU0snIHwgJ0dTSTJQSycgfCAnR1NJMlNLJz4pOiBQcm9taXNlPE1lc3NhZ2VJdGVtPiB7XG4gICAgY29uc3QgdHMgPSBEeW5hbW9EQlNlcnZpY2UuZ2VuZXJhdGVUaW1lc3RhbXBTSygpO1xuICAgIGNvbnN0IGNvbnRhY3RfcGsgPSBEeW5hbW9EQlNlcnZpY2UuY3JlYXRlQ29udGFjdFBLKG1lc3NhZ2UudGVuYW50SWQsIG1lc3NhZ2UuZW1haWxfbGMpO1xuICAgIFxuICAgIGNvbnN0IGl0ZW06IE1lc3NhZ2VJdGVtID0ge1xuICAgICAgdGVuYW50SWQ6IG1lc3NhZ2UudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogbWVzc2FnZS5lbWFpbF9sYyxcbiAgICAgIHNvdXJjZTogbWVzc2FnZS5zb3VyY2UsXG4gICAgICBkaXJlY3Rpb246IG1lc3NhZ2UuZGlyZWN0aW9uLFxuICAgICAgdGV4dDogbWVzc2FnZS50ZXh0LFxuICAgICAgY29udmVyc2F0aW9uX2lkOiBtZXNzYWdlLmNvbnZlcnNhdGlvbl9pZCxcbiAgICAgIG1ldGE6IG1lc3NhZ2UubWV0YSxcbiAgICAgIGNvbnRhY3RfcGssXG4gICAgICB0cyxcbiAgICAgIEdTSTFQSzogbWVzc2FnZS50ZW5hbnRJZCwgLy8gRm9yIHJlY2VudCBtZXNzYWdlcyBwZXIgdGVuYW50XG4gICAgICBHU0kxU0s6IHRzLFxuICAgIH07XG5cbiAgICAvLyBPbmx5IGFkZCBvcHRpb25hbCBmaWVsZHMgaWYgdGhleSBleGlzdFxuICAgIGlmIChtZXNzYWdlLmxlYWRfaWQpIHtcbiAgICAgIGl0ZW0ubGVhZF9pZCA9IG1lc3NhZ2UubGVhZF9pZDtcbiAgICAgIGl0ZW0uR1NJMlBLID0gbWVzc2FnZS5sZWFkX2lkO1xuICAgICAgaXRlbS5HU0kyU0sgPSB0cztcbiAgICB9XG4gICAgaWYgKG1lc3NhZ2UuY2hhbm5lbF9jb250ZXh0KSB7XG4gICAgICBpdGVtLmNoYW5uZWxfY29udGV4dCA9IG1lc3NhZ2UuY2hhbm5lbF9jb250ZXh0O1xuICAgIH1cblxuICAgIGF3YWl0IHRoaXMuY2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0aGlzLmNvbmZpZy5tZXNzYWdlc1RhYmxlLFxuICAgICAgSXRlbTogaXRlbSxcbiAgICB9KSk7XG5cbiAgICByZXR1cm4gaXRlbTtcbiAgfVxuXG4gIC8qKlxuICAgKiBRdWVyeSBtZXNzYWdlcyBmb3IgYSBjb250YWN0ICh0ZW5hbnRJZCArIGVtYWlsX2xjKVxuICAgKi9cbiAgYXN5bmMgZ2V0TWVzc2FnZUhpc3RvcnkoXG4gICAgdGVuYW50SWQ6IHN0cmluZyxcbiAgICBlbWFpbExjOiBzdHJpbmcsXG4gICAgb3B0aW9uczoge1xuICAgICAgbGltaXQ/OiBudW1iZXI7XG4gICAgICBleGNsdXNpdmVTdGFydEtleT86IFJlY29yZDxzdHJpbmcsIGFueT47XG4gICAgICBzY2FuSW5kZXhGb3J3YXJkPzogYm9vbGVhbjtcbiAgICB9ID0ge31cbiAgKTogUHJvbWlzZTx7XG4gICAgaXRlbXM6IE1lc3NhZ2VJdGVtW107XG4gICAgbGFzdEV2YWx1YXRlZEtleT86IFJlY29yZDxzdHJpbmcsIGFueT47XG4gIH0+IHtcbiAgICBjb25zdCBjb250YWN0X3BrID0gRHluYW1vREJTZXJ2aWNlLmNyZWF0ZUNvbnRhY3RQSyh0ZW5hbnRJZCwgZW1haWxMYyk7XG4gICAgXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jbGllbnQuc2VuZChuZXcgUXVlcnlDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGhpcy5jb25maWcubWVzc2FnZXNUYWJsZSxcbiAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICdjb250YWN0X3BrID0gOnBrJyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgJzpwayc6IGNvbnRhY3RfcGssXG4gICAgICB9LFxuICAgICAgTGltaXQ6IG9wdGlvbnMubGltaXQgfHwgdGhpcy5jb25maWcuaGlzdG9yeUxpbWl0LFxuICAgICAgRXhjbHVzaXZlU3RhcnRLZXk6IG9wdGlvbnMuZXhjbHVzaXZlU3RhcnRLZXksXG4gICAgICBTY2FuSW5kZXhGb3J3YXJkOiBvcHRpb25zLnNjYW5JbmRleEZvcndhcmQgPz8gZmFsc2UsIC8vIE1vc3QgcmVjZW50IGZpcnN0XG4gICAgfSkpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGl0ZW1zOiAocmVzdWx0Lkl0ZW1zIHx8IFtdKSBhcyBNZXNzYWdlSXRlbVtdLFxuICAgICAgbGFzdEV2YWx1YXRlZEtleTogcmVzdWx0Lkxhc3RFdmFsdWF0ZWRLZXksXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBRdWVyeSByZWNlbnQgbWVzc2FnZXMgcGVyIHRlbmFudCAoR1NJMSlcbiAgICovXG4gIGFzeW5jIGdldFJlY2VudE1lc3NhZ2VzQnlUZW5hbnQoXG4gICAgdGVuYW50SWQ6IHN0cmluZyxcbiAgICBvcHRpb25zOiB7XG4gICAgICBsaW1pdD86IG51bWJlcjtcbiAgICAgIGV4Y2x1c2l2ZVN0YXJ0S2V5PzogUmVjb3JkPHN0cmluZywgYW55PjtcbiAgICB9ID0ge31cbiAgKTogUHJvbWlzZTx7XG4gICAgaXRlbXM6IE1lc3NhZ2VJdGVtW107XG4gICAgbGFzdEV2YWx1YXRlZEtleT86IFJlY29yZDxzdHJpbmcsIGFueT47XG4gIH0+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBRdWVyeUNvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiB0aGlzLmNvbmZpZy5tZXNzYWdlc1RhYmxlLFxuICAgICAgSW5kZXhOYW1lOiAnR1NJMScsXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAnR1NJMVBLID0gOnBrJyxcbiAgICAgIEV4cHJlc3Npb25BdHRyaWJ1dGVWYWx1ZXM6IHtcbiAgICAgICAgJzpwayc6IHRlbmFudElkLFxuICAgICAgfSxcbiAgICAgIExpbWl0OiBvcHRpb25zLmxpbWl0IHx8IDEwMCxcbiAgICAgIEV4Y2x1c2l2ZVN0YXJ0S2V5OiBvcHRpb25zLmV4Y2x1c2l2ZVN0YXJ0S2V5LFxuICAgICAgU2NhbkluZGV4Rm9yd2FyZDogZmFsc2UsIC8vIE1vc3QgcmVjZW50IGZpcnN0XG4gICAgfSkpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGl0ZW1zOiAocmVzdWx0Lkl0ZW1zIHx8IFtdKSBhcyBNZXNzYWdlSXRlbVtdLFxuICAgICAgbGFzdEV2YWx1YXRlZEtleTogcmVzdWx0Lkxhc3RFdmFsdWF0ZWRLZXksXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgbGVhZCBieSB0ZW5hbnRJZCBhbmQgZW1haWxfbGNcbiAgICovXG4gIGFzeW5jIGdldExlYWQodGVuYW50SWQ6IHN0cmluZywgZW1haWxMYzogc3RyaW5nKTogUHJvbWlzZTxMZWFkSXRlbSB8IG51bGw+IHtcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogdGhpcy5jb25maWcubGVhZHNUYWJsZSxcbiAgICAgIEtleToge1xuICAgICAgICBQSzogdGVuYW50SWQsXG4gICAgICAgIFNLOiBlbWFpbExjLFxuICAgICAgfSxcbiAgICB9KSk7XG5cbiAgICByZXR1cm4gcmVzdWx0Lkl0ZW0gYXMgTGVhZEl0ZW0gfHwgbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBRdWVyeSBsZWFkcyBieSBwaG9uZSBudW1iZXIgKGFzc3VtaW5nIEdTSSBvbiBwaG9uZV9lMTY0KVxuICAgKi9cbiAgYXN5bmMgZ2V0TGVhZEJ5UGhvbmUodGVuYW50SWQ6IHN0cmluZywgcGhvbmVFMTY0OiBzdHJpbmcpOiBQcm9taXNlPExlYWRJdGVtIHwgbnVsbD4ge1xuICAgIC8vIFRoaXMgYXNzdW1lcyB0aGVyZSdzIGEgR1NJIG9uIHRoZSBsZWFkcyB0YWJsZSB3aXRoIHBob25lX2UxNjRcbiAgICAvLyBUaGUgZXhhY3QgaW1wbGVtZW50YXRpb24gZGVwZW5kcyBvbiB5b3VyIGV4aXN0aW5nIGxlYWRzIHRhYmxlIHN0cnVjdHVyZVxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2xpZW50LnNlbmQobmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICBUYWJsZU5hbWU6IHRoaXMuY29uZmlnLmxlYWRzVGFibGUsXG4gICAgICBJbmRleE5hbWU6ICdQaG9uZUluZGV4JywgLy8gQWRqdXN0IGJhc2VkIG9uIHlvdXIgYWN0dWFsIEdTSSBuYW1lXG4gICAgICBLZXlDb25kaXRpb25FeHByZXNzaW9uOiAnUEsgPSA6dGVuYW50SWQgQU5EIHBob25lX2UxNjQgPSA6cGhvbmUnLFxuICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAnOnRlbmFudElkJzogdGVuYW50SWQsXG4gICAgICAgICc6cGhvbmUnOiBwaG9uZUUxNjQsXG4gICAgICB9LFxuICAgICAgTGltaXQ6IDEsXG4gICAgfSkpO1xuXG4gICAgY29uc3QgaXRlbXMgPSByZXN1bHQuSXRlbXMgYXMgTGVhZEl0ZW1bXTtcbiAgICByZXR1cm4gaXRlbXM/LlswXSB8fCBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc29sdmUgY29udGFjdCBpbmZvIGZyb20gcGhvbmUgbnVtYmVyXG4gICAqIFJldHVybnMgZW1haWxfbGMgaWYgbGVhZCBmb3VuZCwgbnVsbCBvdGhlcndpc2VcbiAgICovXG4gIGFzeW5jIHJlc29sdmVDb250YWN0RnJvbVBob25lKHRlbmFudElkOiBzdHJpbmcsIHBob25lRTE2NDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gICAgY29uc3QgbGVhZCA9IGF3YWl0IHRoaXMuZ2V0TGVhZEJ5UGhvbmUodGVuYW50SWQsIHBob25lRTE2NCk7XG4gICAgcmV0dXJuIGxlYWQ/LmVtYWlsX2xjIHx8IG51bGw7XG4gIH1cbn1cbiJdfQ==