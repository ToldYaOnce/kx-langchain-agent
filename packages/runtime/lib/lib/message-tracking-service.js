"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageTrackingService = void 0;
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const ulid_1 = require("ulid");
/**
 * MessageTrackingService - manages active response tracking for interruption handling
 *
 * Enables graceful interruption of multi-chunk agent responses when user sends a new message.
 * Uses the existing kx-channels table with a special createdAt value ("ACTIVE_RESPONSE").
 * TTL enabled for automatic cleanup.
 */
class MessageTrackingService {
    constructor(docClient, channelsTable, ttlSeconds = 300) {
        this.ACTIVE_RESPONSE_KEY = 'ACTIVE_RESPONSE';
        this.docClient = docClient;
        this.channelsTable = channelsTable;
        this.ttlSeconds = ttlSeconds; // Default 5 minutes
    }
    /**
     * Start tracking a new response
     *
     * @param tenantId - Tenant identifier
     * @param channelId - Channel identifier
     * @param senderId - User/sender identifier
     * @param stateSnapshot - Optional state snapshot for rollback
     * @returns messageId - Unique identifier for this response
     */
    async startTracking(tenantId, channelId, senderId, stateSnapshot) {
        const messageId = (0, ulid_1.ulid)();
        const now = new Date().toISOString();
        const ttl = Math.floor(Date.now() / 1000) + this.ttlSeconds;
        const trackingItem = {
            channelId,
            createdAt: this.ACTIVE_RESPONSE_KEY, // Special key for message tracking
            tenantId,
            messageId,
            senderId,
            startedAt: now,
            stateSnapshot,
            ttl,
            updated_at: now,
        };
        await this.docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: this.channelsTable,
            Item: trackingItem,
        }));
        console.log(`✅ Started tracking response: ${messageId} for channel ${channelId}`);
        return messageId;
    }
    /**
     * Check if a response is still valid (not interrupted)
     *
     * @param tenantId - Tenant identifier
     * @param channelId - Channel identifier
     * @param messageId - Message ID to validate
     * @returns true if this is still the active response, false if interrupted
     */
    async isResponseValid(tenantId, channelId, messageId) {
        const result = await this.docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: this.channelsTable,
            Key: {
                channelId,
                createdAt: this.ACTIVE_RESPONSE_KEY,
            },
        }));
        if (!result.Item) {
            console.log(`⚠️ No active response found for channel ${channelId}`);
            return false;
        }
        const currentMessageId = result.Item.messageId;
        const isValid = currentMessageId === messageId;
        if (!isValid) {
            console.log(`❌ STALE CHUNK: Expected ${messageId}, but current is ${currentMessageId}`);
        }
        else {
            console.log(`✅ Valid chunk: ${messageId} matches current response`);
        }
        return isValid;
    }
    /**
     * Get the state snapshot for rollback
     *
     * @param tenantId - Tenant identifier
     * @param channelId - Channel identifier
     * @returns StateSnapshot if exists, undefined otherwise
     */
    async getStateSnapshot(tenantId, channelId) {
        const result = await this.docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: this.channelsTable,
            Key: {
                channelId,
                createdAt: this.ACTIVE_RESPONSE_KEY,
            },
        }));
        return result.Item?.stateSnapshot;
    }
    /**
     * Clear tracking for a channel (response completed or interrupted)
     *
     * @param tenantId - Tenant identifier
     * @param channelId - Channel identifier
     */
    async clearTracking(tenantId, channelId) {
        await this.docClient.send(new lib_dynamodb_1.DeleteCommand({
            TableName: this.channelsTable,
            Key: {
                channelId,
                createdAt: this.ACTIVE_RESPONSE_KEY,
            },
        }));
        console.log(`🧹 Cleared response tracking for channel ${channelId}`);
    }
    /**
     * Get the current active message ID for a channel
     *
     * @param tenantId - Tenant identifier
     * @param channelId - Channel identifier
     * @returns messageId if exists, undefined otherwise
     */
    async getCurrentMessageId(tenantId, channelId) {
        const result = await this.docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: this.channelsTable,
            Key: {
                channelId,
                createdAt: this.ACTIVE_RESPONSE_KEY,
            },
        }));
        return result.Item?.messageId;
    }
}
exports.MessageTrackingService = MessageTrackingService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVzc2FnZS10cmFja2luZy1zZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9tZXNzYWdlLXRyYWNraW5nLXNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsd0RBQXNHO0FBQ3RHLCtCQUE0QjtBQWU1Qjs7Ozs7O0dBTUc7QUFDSCxNQUFhLHNCQUFzQjtJQU1qQyxZQUFZLFNBQWlDLEVBQUUsYUFBcUIsRUFBRSxhQUFxQixHQUFHO1FBRjdFLHdCQUFtQixHQUFHLGlCQUFpQixDQUFDO1FBR3ZELElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDO1FBQ25DLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDLENBQUMsb0JBQW9CO0lBQ3BELENBQUM7SUFFRDs7Ozs7Ozs7T0FRRztJQUNILEtBQUssQ0FBQyxhQUFhLENBQ2pCLFFBQWtCLEVBQ2xCLFNBQWlCLEVBQ2pCLFFBQWdCLEVBQ2hCLGFBQTZCO1FBRTdCLE1BQU0sU0FBUyxHQUFHLElBQUEsV0FBSSxHQUFFLENBQUM7UUFDekIsTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNyQyxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBRTVELE1BQU0sWUFBWSxHQUFnQjtZQUNoQyxTQUFTO1lBQ1QsU0FBUyxFQUFFLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxtQ0FBbUM7WUFDeEUsUUFBUTtZQUNSLFNBQVM7WUFDVCxRQUFRO1lBQ1IsU0FBUyxFQUFFLEdBQUc7WUFDZCxhQUFhO1lBQ2IsR0FBRztZQUNILFVBQVUsRUFBRSxHQUFHO1NBQ2hCLENBQUM7UUFFRixNQUFNLElBQUksQ0FBQyxTQUFTLENB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SkQsd0RBMEpDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCwgR2V0Q29tbWFuZCwgRGVsZXRlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XHJcbmltcG9ydCB7IHVsaWQgfSBmcm9tICd1bGlkJztcclxuaW1wb3J0IHR5cGUgeyBDaGFubmVsSXRlbSB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcclxuaW1wb3J0IHR5cGUgeyBUZW5hbnRJZCwgVGltZXN0YW1wIH0gZnJvbSAnLi4vdHlwZXMvZHluYW1vZGItc2NoZW1hcy5qcyc7XHJcblxyXG4vKipcclxuICogU3RhdGUgc25hcHNob3QgZm9yIHJvbGxiYWNrIG9uIG1lc3NhZ2UgaW50ZXJydXB0aW9uXHJcbiAqL1xyXG5leHBvcnQgaW50ZXJmYWNlIFN0YXRlU25hcHNob3Qge1xyXG4gIGF0dGVtcHRDb3VudHM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XHJcbiAgY2FwdHVyZWREYXRhOiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gIGFjdGl2ZUdvYWxzOiBzdHJpbmdbXTtcclxuICBjb21wbGV0ZWRHb2Fsczogc3RyaW5nW107XHJcbiAgbWVzc2FnZUNvdW50OiBudW1iZXI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBNZXNzYWdlVHJhY2tpbmdTZXJ2aWNlIC0gbWFuYWdlcyBhY3RpdmUgcmVzcG9uc2UgdHJhY2tpbmcgZm9yIGludGVycnVwdGlvbiBoYW5kbGluZ1xyXG4gKiBcclxuICogRW5hYmxlcyBncmFjZWZ1bCBpbnRlcnJ1cHRpb24gb2YgbXVsdGktY2h1bmsgYWdlbnQgcmVzcG9uc2VzIHdoZW4gdXNlciBzZW5kcyBhIG5ldyBtZXNzYWdlLlxyXG4gKiBVc2VzIHRoZSBleGlzdGluZyBreC1jaGFubmVscyB0YWJsZSB3aXRoIGEgc3BlY2lhbCBjcmVhdGVkQXQgdmFsdWUgKFwiQUNUSVZFX1JFU1BPTlNFXCIpLlxyXG4gKiBUVEwgZW5hYmxlZCBmb3IgYXV0b21hdGljIGNsZWFudXAuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgTWVzc2FnZVRyYWNraW5nU2VydmljZSB7XHJcbiAgcHJpdmF0ZSBkb2NDbGllbnQ6IER5bmFtb0RCRG9jdW1lbnRDbGllbnQ7XHJcbiAgcHJpdmF0ZSBjaGFubmVsc1RhYmxlOiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSB0dGxTZWNvbmRzOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBBQ1RJVkVfUkVTUE9OU0VfS0VZID0gJ0FDVElWRV9SRVNQT05TRSc7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGRvY0NsaWVudDogRHluYW1vREJEb2N1bWVudENsaWVudCwgY2hhbm5lbHNUYWJsZTogc3RyaW5nLCB0dGxTZWNvbmRzOiBudW1iZXIgPSAzMDApIHtcclxuICAgIHRoaXMuZG9jQ2xpZW50ID0gZG9jQ2xpZW50O1xyXG4gICAgdGhpcy5jaGFubmVsc1RhYmxlID0gY2hhbm5lbHNUYWJsZTtcclxuICAgIHRoaXMudHRsU2Vjb25kcyA9IHR0bFNlY29uZHM7IC8vIERlZmF1bHQgNSBtaW51dGVzXHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBTdGFydCB0cmFja2luZyBhIG5ldyByZXNwb25zZVxyXG4gICAqIFxyXG4gICAqIEBwYXJhbSB0ZW5hbnRJZCAtIFRlbmFudCBpZGVudGlmaWVyXHJcbiAgICogQHBhcmFtIGNoYW5uZWxJZCAtIENoYW5uZWwgaWRlbnRpZmllclxyXG4gICAqIEBwYXJhbSBzZW5kZXJJZCAtIFVzZXIvc2VuZGVyIGlkZW50aWZpZXJcclxuICAgKiBAcGFyYW0gc3RhdGVTbmFwc2hvdCAtIE9wdGlvbmFsIHN0YXRlIHNuYXBzaG90IGZvciByb2xsYmFja1xyXG4gICAqIEByZXR1cm5zIG1lc3NhZ2VJZCAtIFVuaXF1ZSBpZGVudGlmaWVyIGZvciB0aGlzIHJlc3BvbnNlXHJcbiAgICovXHJcbiAgYXN5bmMgc3RhcnRUcmFja2luZyhcclxuICAgIHRlbmFudElkOiBUZW5hbnRJZCxcclxuICAgIGNoYW5uZWxJZDogc3RyaW5nLFxyXG4gICAgc2VuZGVySWQ6IHN0cmluZyxcclxuICAgIHN0YXRlU25hcHNob3Q/OiBTdGF0ZVNuYXBzaG90XHJcbiAgKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGNvbnN0IG1lc3NhZ2VJZCA9IHVsaWQoKTtcclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcclxuICAgIGNvbnN0IHR0bCA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApICsgdGhpcy50dGxTZWNvbmRzO1xyXG5cclxuICAgIGNvbnN0IHRyYWNraW5nSXRlbTogQ2hhbm5lbEl0ZW0gPSB7XHJcbiAgICAgIGNoYW5uZWxJZCxcclxuICAgICAgY3JlYXRlZEF0OiB0aGlzLkFDVElWRV9SRVNQT05TRV9LRVksIC8vIFNwZWNpYWwga2V5IGZvciBtZXNzYWdlIHRyYWNraW5nXHJcbiAgICAgIHRlbmFudElkLFxyXG4gICAgICBtZXNzYWdlSWQsXHJcbiAgICAgIHNlbmRlcklkLFxyXG4gICAgICBzdGFydGVkQXQ6IG5vdyxcclxuICAgICAgc3RhdGVTbmFwc2hvdCxcclxuICAgICAgdHRsLFxyXG4gICAgICB1cGRhdGVkX2F0OiBub3csXHJcbiAgICB9O1xyXG5cclxuICAgIGF3YWl0IHRoaXMuZG9jQ2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHRoaXMuY2hhbm5lbHNUYWJsZSxcclxuICAgICAgSXRlbTogdHJhY2tpbmdJdGVtLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgU3RhcnRlZCB0cmFja2luZyByZXNwb25zZTogJHttZXNzYWdlSWR9IGZvciBjaGFubmVsICR7Y2hhbm5lbElkfWApO1xyXG4gICAgcmV0dXJuIG1lc3NhZ2VJZDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIGEgcmVzcG9uc2UgaXMgc3RpbGwgdmFsaWQgKG5vdCBpbnRlcnJ1cHRlZClcclxuICAgKiBcclxuICAgKiBAcGFyYW0gdGVuYW50SWQgLSBUZW5hbnQgaWRlbnRpZmllclxyXG4gICAqIEBwYXJhbSBjaGFubmVsSWQgLSBDaGFubmVsIGlkZW50aWZpZXJcclxuICAgKiBAcGFyYW0gbWVzc2FnZUlkIC0gTWVzc2FnZSBJRCB0byB2YWxpZGF0ZVxyXG4gICAqIEByZXR1cm5zIHRydWUgaWYgdGhpcyBpcyBzdGlsbCB0aGUgYWN0aXZlIHJlc3BvbnNlLCBmYWxzZSBpZiBpbnRlcnJ1cHRlZFxyXG4gICAqL1xyXG4gIGFzeW5jIGlzUmVzcG9uc2VWYWxpZChcclxuICAgIHRlbmFudElkOiBUZW5hbnRJZCxcclxuICAgIGNoYW5uZWxJZDogc3RyaW5nLFxyXG4gICAgbWVzc2FnZUlkOiBzdHJpbmdcclxuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHRoaXMuY2hhbm5lbHNUYWJsZSxcclxuICAgICAgS2V5OiB7XHJcbiAgICAgICAgY2hhbm5lbElkLFxyXG4gICAgICAgIGNyZWF0ZWRBdDogdGhpcy5BQ1RJVkVfUkVTUE9OU0VfS0VZLFxyXG4gICAgICB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGlmICghcmVzdWx0Lkl0ZW0pIHtcclxuICAgICAgY29uc29sZS5sb2coYOKaoO+4jyBObyBhY3RpdmUgcmVzcG9uc2UgZm91bmQgZm9yIGNoYW5uZWwgJHtjaGFubmVsSWR9YCk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBjdXJyZW50TWVzc2FnZUlkID0gKHJlc3VsdC5JdGVtIGFzIENoYW5uZWxJdGVtKS5tZXNzYWdlSWQ7XHJcbiAgICBjb25zdCBpc1ZhbGlkID0gY3VycmVudE1lc3NhZ2VJZCA9PT0gbWVzc2FnZUlkO1xyXG5cclxuICAgIGlmICghaXNWYWxpZCkge1xyXG4gICAgICBjb25zb2xlLmxvZyhg4p2MIFNUQUxFIENIVU5LOiBFeHBlY3RlZCAke21lc3NhZ2VJZH0sIGJ1dCBjdXJyZW50IGlzICR7Y3VycmVudE1lc3NhZ2VJZH1gKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgVmFsaWQgY2h1bms6ICR7bWVzc2FnZUlkfSBtYXRjaGVzIGN1cnJlbnQgcmVzcG9uc2VgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gaXNWYWxpZDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCB0aGUgc3RhdGUgc25hcHNob3QgZm9yIHJvbGxiYWNrXHJcbiAgICogXHJcbiAgICogQHBhcmFtIHRlbmFudElkIC0gVGVuYW50IGlkZW50aWZpZXJcclxuICAgKiBAcGFyYW0gY2hhbm5lbElkIC0gQ2hhbm5lbCBpZGVudGlmaWVyXHJcbiAgICogQHJldHVybnMgU3RhdGVTbmFwc2hvdCBpZiBleGlzdHMsIHVuZGVmaW5lZCBvdGhlcndpc2VcclxuICAgKi9cclxuICBhc3luYyBnZXRTdGF0ZVNuYXBzaG90KFxyXG4gICAgdGVuYW50SWQ6IFRlbmFudElkLFxyXG4gICAgY2hhbm5lbElkOiBzdHJpbmdcclxuICApOiBQcm9taXNlPFN0YXRlU25hcHNob3QgfCB1bmRlZmluZWQ+IHtcclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xyXG4gICAgICBUYWJsZU5hbWU6IHRoaXMuY2hhbm5lbHNUYWJsZSxcclxuICAgICAgS2V5OiB7XHJcbiAgICAgICAgY2hhbm5lbElkLFxyXG4gICAgICAgIGNyZWF0ZWRBdDogdGhpcy5BQ1RJVkVfUkVTUE9OU0VfS0VZLFxyXG4gICAgICB9LFxyXG4gICAgfSkpO1xyXG5cclxuICAgIHJldHVybiAocmVzdWx0Lkl0ZW0gYXMgQ2hhbm5lbEl0ZW0gfCB1bmRlZmluZWQpPy5zdGF0ZVNuYXBzaG90O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2xlYXIgdHJhY2tpbmcgZm9yIGEgY2hhbm5lbCAocmVzcG9uc2UgY29tcGxldGVkIG9yIGludGVycnVwdGVkKVxyXG4gICAqIFxyXG4gICAqIEBwYXJhbSB0ZW5hbnRJZCAtIFRlbmFudCBpZGVudGlmaWVyXHJcbiAgICogQHBhcmFtIGNoYW5uZWxJZCAtIENoYW5uZWwgaWRlbnRpZmllclxyXG4gICAqL1xyXG4gIGFzeW5jIGNsZWFyVHJhY2tpbmcoXHJcbiAgICB0ZW5hbnRJZDogVGVuYW50SWQsXHJcbiAgICBjaGFubmVsSWQ6IHN0cmluZ1xyXG4gICk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgYXdhaXQgdGhpcy5kb2NDbGllbnQuc2VuZChuZXcgRGVsZXRlQ29tbWFuZCh7XHJcbiAgICAgIFRhYmxlTmFtZTogdGhpcy5jaGFubmVsc1RhYmxlLFxyXG4gICAgICBLZXk6IHtcclxuICAgICAgICBjaGFubmVsSWQsXHJcbiAgICAgICAgY3JlYXRlZEF0OiB0aGlzLkFDVElWRV9SRVNQT05TRV9LRVksXHJcbiAgICAgIH0sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc29sZS5sb2coYPCfp7kgQ2xlYXJlZCByZXNwb25zZSB0cmFja2luZyBmb3IgY2hhbm5lbCAke2NoYW5uZWxJZH1gKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCB0aGUgY3VycmVudCBhY3RpdmUgbWVzc2FnZSBJRCBmb3IgYSBjaGFubmVsXHJcbiAgICogXHJcbiAgICogQHBhcmFtIHRlbmFudElkIC0gVGVuYW50IGlkZW50aWZpZXJcclxuICAgKiBAcGFyYW0gY2hhbm5lbElkIC0gQ2hhbm5lbCBpZGVudGlmaWVyXHJcbiAgICogQHJldHVybnMgbWVzc2FnZUlkIGlmIGV4aXN0cywgdW5kZWZpbmVkIG90aGVyd2lzZVxyXG4gICAqL1xyXG4gIGFzeW5jIGdldEN1cnJlbnRNZXNzYWdlSWQoXHJcbiAgICB0ZW5hbnRJZDogVGVuYW50SWQsXHJcbiAgICBjaGFubmVsSWQ6IHN0cmluZ1xyXG4gICk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRvY0NsaWVudC5zZW5kKG5ldyBHZXRDb21tYW5kKHtcclxuICAgICAgVGFibGVOYW1lOiB0aGlzLmNoYW5uZWxzVGFibGUsXHJcbiAgICAgIEtleToge1xyXG4gICAgICAgIGNoYW5uZWxJZCxcclxuICAgICAgICBjcmVhdGVkQXQ6IHRoaXMuQUNUSVZFX1JFU1BPTlNFX0tFWSxcclxuICAgICAgfSxcclxuICAgIH0pKTtcclxuXHJcbiAgICByZXR1cm4gKHJlc3VsdC5JdGVtIGFzIENoYW5uZWxJdGVtIHwgdW5kZWZpbmVkKT8ubWVzc2FnZUlkO1xyXG4gIH1cclxufVxyXG5cclxuIl19