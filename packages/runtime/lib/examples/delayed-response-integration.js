"use strict";
// Note: In production, this would be: import { scheduleActions, estimateTokenCount } from "@toldyaonce/kx-agent-core";
// For now, we'll create a local interface to avoid cross-package compilation issues
Object.defineProperty(exports, "__esModule", { value: true });
exports.DelayedResponseAgentService = void 0;
exports.createDelayedResponseAgent = createDelayedResponseAgent;
exports.delayedResponseHandler = delayedResponseHandler;
// Placeholder function - replace with actual import in production
async function scheduleActions(params) {
    // This is a placeholder - actual implementation would use @toldyaonce/kx-agent-core
    console.log('scheduleActions called with:', params);
    return {
        read_ms: 1000,
        comprehension_ms: 500,
        write_ms: 2000,
        type_ms: 3000,
        jitter_ms: 500,
        pauses_ms: 0,
        total_ms: 7000
    };
}
function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
}
const agent_1 = require("../lib/agent");
/**
 * Enhanced Agent Service that integrates delayed human-like responses
 */
class DelayedResponseAgentService extends agent_1.AgentService {
    constructor(config, releaseQueueUrl) {
        super(config);
        this.releaseQueueUrl = releaseQueueUrl;
    }
    /**
     * Process message with delayed response scheduling
     * This replaces the immediate agent.reply.created emission
     */
    async processMessageWithDelayedResponse(params) {
        const { tenantId, email_lc, phone_e164, text, source, conversation_id, message_id, personaName = 'Carlos' } = params;
        try {
            // Process message using existing agent logic
            const response = await this.processMessage({
                tenantId,
                email_lc: email_lc || '',
                text,
                source
            });
            // Generate contact primary key
            const contact_pk = `contact#${email_lc || phone_e164 || 'unknown'}`;
            // Schedule delayed actions instead of immediate response
            const timing = await scheduleActions({
                queueUrl: this.releaseQueueUrl,
                tenantId,
                contact_pk,
                conversation_id,
                channel: source,
                personaName,
                message_id: message_id || `msg-${Date.now()}`,
                replyText: typeof response === 'string' ? response : 'No response generated',
                inputChars: text.length,
                inputTokens: estimateTokenCount(text)
            });
            // Log timing for telemetry
            const replyText = typeof response === 'string' ? response : 'No response generated';
            console.log('Scheduled delayed response', {
                tenantId,
                conversation_id,
                personaName,
                timing,
                replyLength: replyText.length
            });
            // Emit trace event for monitoring (placeholder - replace with actual EventBridge service)
            console.log('Trace event:', {
                source: 'kxgen.agent',
                detailType: 'agent.trace',
                detail: {
                    tenantId,
                    contact_pk,
                    operation: 'delayed_response_scheduled',
                    metadata: {
                        timing,
                        persona: personaName,
                        channel: source,
                        inputLength: text.length,
                        replyLength: replyText.length
                    }
                }
            });
            return {
                success: true,
                timing,
                message: 'Response scheduled for delayed delivery'
            };
        }
        catch (error) {
            console.error('Failed to process message with delayed response:', error);
            // Emit error event (placeholder - replace with actual EventBridge service)
            console.log('Error event:', {
                source: 'kxgen.agent',
                detailType: 'agent.error',
                detail: {
                    tenantId,
                    contact_pk: `contact#${email_lc || phone_e164 || 'unknown'}`,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    context: {
                        operation: 'delayed_response_processing',
                        source,
                        messageLength: text.length
                    }
                }
            });
            throw error;
        }
    }
    /**
     * Emergency bypass for immediate responses (human takeover, urgent messages)
     */
    async processMessageImmediate(params) {
        console.log('Processing immediate response (bypassing delays)', {
            tenantId: params.tenantId,
            reason: params.reason || 'emergency_bypass'
        });
        // Use original immediate processing
        return this.processMessage({
            tenantId: params.tenantId,
            email_lc: params.email_lc || '',
            text: params.text,
            source: params.source
        });
    }
}
exports.DelayedResponseAgentService = DelayedResponseAgentService;
/**
 * Factory function for creating delayed response agent
 */
function createDelayedResponseAgent(config, releaseQueueUrl) {
    return new DelayedResponseAgentService(config, releaseQueueUrl);
}
/**
 * Lambda handler that uses delayed responses
 */
async function delayedResponseHandler(event) {
    const releaseQueueUrl = process.env.RELEASE_QUEUE_URL;
    if (!releaseQueueUrl) {
        throw new Error('RELEASE_QUEUE_URL environment variable is required');
    }
    // Create agent with delayed response capability
    const agent = createDelayedResponseAgent({
        messagesTable: process.env.MESSAGES_TABLE || 'messages',
        leadsTable: process.env.LEADS_TABLE || 'leads',
        bedrockModelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-sonnet-4-20250514-v1:0',
        historyLimit: 50,
        awsRegion: process.env.AWS_REGION || 'us-east-1'
    }, releaseQueueUrl);
    // Determine if this should be immediate or delayed
    const isUrgent = event.detail.text?.toLowerCase().includes('urgent') ||
        event.detail.text?.toLowerCase().includes('emergency');
    if (isUrgent) {
        // Process immediately for urgent messages
        return agent.processMessageImmediate({
            tenantId: event.detail.tenantId,
            email_lc: event.detail.email_lc,
            phone_e164: event.detail.phone_e164,
            text: event.detail.text,
            source: event.detail.source,
            reason: 'urgent_message'
        });
    }
    else {
        // Process with delayed response
        return agent.processMessageWithDelayedResponse({
            tenantId: event.detail.tenantId,
            email_lc: event.detail.email_lc,
            phone_e164: event.detail.phone_e164,
            text: event.detail.text,
            source: event.detail.source,
            conversation_id: event.detail.conversation_id,
            message_id: event.detail.message_id,
            personaName: event.detail.persona || 'Carlos'
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVsYXllZC1yZXNwb25zZS1pbnRlZ3JhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9leGFtcGxlcy9kZWxheWVkLXJlc3BvbnNlLWludGVncmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSx1SEFBdUg7QUFDdkgsb0ZBQW9GOzs7QUFrTXBGLGdFQUtDO0FBS0Qsd0RBMENDO0FBMU9ELGtFQUFrRTtBQUNsRSxLQUFLLFVBQVUsZUFBZSxDQUFDLE1BVzlCO0lBQ0Msb0ZBQW9GO0lBQ3BGLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDcEQsT0FBTztRQUNMLE9BQU8sRUFBRSxJQUFJO1FBQ2IsZ0JBQWdCLEVBQUUsR0FBRztRQUNyQixRQUFRLEVBQUUsSUFBSTtRQUNkLE9BQU8sRUFBRSxJQUFJO1FBQ2IsU0FBUyxFQUFFLEdBQUc7UUFDZCxTQUFTLEVBQUUsQ0FBQztRQUNaLFFBQVEsRUFBRSxJQUFJO0tBQ2YsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUFDLElBQVk7SUFDdEMsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDcEMsQ0FBQztBQUNELHdDQUE0QztBQUk1Qzs7R0FFRztBQUNILE1BQWEsMkJBQTRCLFNBQVEsb0JBQVk7SUFHM0QsWUFBWSxNQUFxQixFQUFFLGVBQXVCO1FBQ3hELEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNkLElBQUksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDO0lBQ3pDLENBQUM7SUFFRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsaUNBQWlDLENBQUMsTUFTdkM7UUFDQyxNQUFNLEVBQ0osUUFBUSxFQUNSLFFBQVEsRUFDUixVQUFVLEVBQ1YsSUFBSSxFQUNKLE1BQU0sRUFDTixlQUFlLEVBQ2YsVUFBVSxFQUNWLFdBQVcsR0FBRyxRQUFR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Q0FBQyxNQUFNLENBQUMsZUFBZTtZQUM3QyxVQUFVLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVO1lBQ25DLFdBQVcsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sSUFBSSxRQUFRO1NBQzlDLENBQUMsQ0FBQztJQUNMLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gTm90ZTogSW4gcHJvZHVjdGlvbiwgdGhpcyB3b3VsZCBiZTogaW1wb3J0IHsgc2NoZWR1bGVBY3Rpb25zLCBlc3RpbWF0ZVRva2VuQ291bnQgfSBmcm9tIFwiQHRvbGR5YW9uY2Uva3gtYWdlbnQtY29yZVwiO1xyXG4vLyBGb3Igbm93LCB3ZSdsbCBjcmVhdGUgYSBsb2NhbCBpbnRlcmZhY2UgdG8gYXZvaWQgY3Jvc3MtcGFja2FnZSBjb21waWxhdGlvbiBpc3N1ZXNcclxuXHJcbmludGVyZmFjZSBUaW1pbmcge1xyXG4gIHJlYWRfbXM6IG51bWJlcjtcclxuICBjb21wcmVoZW5zaW9uX21zOiBudW1iZXI7XHJcbiAgd3JpdGVfbXM6IG51bWJlcjtcclxuICB0eXBlX21zOiBudW1iZXI7XHJcbiAgaml0dGVyX21zOiBudW1iZXI7XHJcbiAgcGF1c2VzX21zPzogbnVtYmVyO1xyXG4gIHRvdGFsX21zOiBudW1iZXI7XHJcbn1cclxuXHJcbi8vIFBsYWNlaG9sZGVyIGZ1bmN0aW9uIC0gcmVwbGFjZSB3aXRoIGFjdHVhbCBpbXBvcnQgaW4gcHJvZHVjdGlvblxyXG5hc3luYyBmdW5jdGlvbiBzY2hlZHVsZUFjdGlvbnMocGFyYW1zOiB7XHJcbiAgcXVldWVVcmw6IHN0cmluZztcclxuICB0ZW5hbnRJZDogc3RyaW5nO1xyXG4gIGNvbnRhY3RfcGs6IHN0cmluZztcclxuICBjb252ZXJzYXRpb25faWQ/OiBzdHJpbmc7XHJcbiAgY2hhbm5lbDogJ3NtcycgfCAnZW1haWwnIHwgJ2NoYXQnIHwgJ2FwaSc7XHJcbiAgcGVyc29uYU5hbWU6IHN0cmluZztcclxuICBtZXNzYWdlX2lkOiBzdHJpbmc7XHJcbiAgcmVwbHlUZXh0OiBzdHJpbmc7XHJcbiAgaW5wdXRDaGFyczogbnVtYmVyO1xyXG4gIGlucHV0VG9rZW5zOiBudW1iZXI7XHJcbn0pOiBQcm9taXNlPFRpbWluZz4ge1xyXG4gIC8vIFRoaXMgaXMgYSBwbGFjZWhvbGRlciAtIGFjdHVhbCBpbXBsZW1lbnRhdGlvbiB3b3VsZCB1c2UgQHRvbGR5YW9uY2Uva3gtYWdlbnQtY29yZVxyXG4gIGNvbnNvbGUubG9nKCdzY2hlZHVsZUFjdGlvbnMgY2FsbGVkIHdpdGg6JywgcGFyYW1zKTtcclxuICByZXR1cm4ge1xyXG4gICAgcmVhZF9tczogMTAwMCxcclxuICAgIGNvbXByZWhlbnNpb25fbXM6IDUwMCxcclxuICAgIHdyaXRlX21zOiAyMDAwLFxyXG4gICAgdHlwZV9tczogMzAwMCxcclxuICAgIGppdHRlcl9tczogNTAwLFxyXG4gICAgcGF1c2VzX21zOiAwLFxyXG4gICAgdG90YWxfbXM6IDcwMDBcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBlc3RpbWF0ZVRva2VuQ291bnQodGV4dDogc3RyaW5nKTogbnVtYmVyIHtcclxuICByZXR1cm4gTWF0aC5jZWlsKHRleHQubGVuZ3RoIC8gNCk7XHJcbn1cclxuaW1wb3J0IHsgQWdlbnRTZXJ2aWNlIH0gZnJvbSBcIi4uL2xpYi9hZ2VudFwiO1xyXG5pbXBvcnQgeyBFdmVudEJyaWRnZVNlcnZpY2UgfSBmcm9tIFwiLi4vbGliL2V2ZW50YnJpZGdlXCI7XHJcbmltcG9ydCB7IFJ1bnRpbWVDb25maWcgfSBmcm9tIFwiLi4vdHlwZXMvaW5kZXhcIjtcclxuXHJcbi8qKlxyXG4gKiBFbmhhbmNlZCBBZ2VudCBTZXJ2aWNlIHRoYXQgaW50ZWdyYXRlcyBkZWxheWVkIGh1bWFuLWxpa2UgcmVzcG9uc2VzXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgRGVsYXllZFJlc3BvbnNlQWdlbnRTZXJ2aWNlIGV4dGVuZHMgQWdlbnRTZXJ2aWNlIHtcclxuICBwcml2YXRlIHJlbGVhc2VRdWV1ZVVybDogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3Rvcihjb25maWc6IFJ1bnRpbWVDb25maWcsIHJlbGVhc2VRdWV1ZVVybDogc3RyaW5nKSB7XHJcbiAgICBzdXBlcihjb25maWcpO1xyXG4gICAgdGhpcy5yZWxlYXNlUXVldWVVcmwgPSByZWxlYXNlUXVldWVVcmw7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBQcm9jZXNzIG1lc3NhZ2Ugd2l0aCBkZWxheWVkIHJlc3BvbnNlIHNjaGVkdWxpbmdcclxuICAgKiBUaGlzIHJlcGxhY2VzIHRoZSBpbW1lZGlhdGUgYWdlbnQucmVwbHkuY3JlYXRlZCBlbWlzc2lvblxyXG4gICAqL1xyXG4gIGFzeW5jIHByb2Nlc3NNZXNzYWdlV2l0aERlbGF5ZWRSZXNwb25zZShwYXJhbXM6IHtcclxuICAgIHRlbmFudElkOiBzdHJpbmc7XHJcbiAgICBlbWFpbF9sYz86IHN0cmluZztcclxuICAgIHBob25lX2UxNjQ/OiBzdHJpbmc7XHJcbiAgICB0ZXh0OiBzdHJpbmc7XHJcbiAgICBzb3VyY2U6ICdzbXMnIHwgJ2VtYWlsJyB8ICdjaGF0JyB8ICdhcGknO1xyXG4gICAgY29udmVyc2F0aW9uX2lkPzogc3RyaW5nO1xyXG4gICAgbWVzc2FnZV9pZD86IHN0cmluZztcclxuICAgIHBlcnNvbmFOYW1lPzogJ0NhcmxvcycgfCAnQWxleCcgfCAnU2FtJztcclxuICB9KSB7XHJcbiAgICBjb25zdCB7XHJcbiAgICAgIHRlbmFudElkLFxyXG4gICAgICBlbWFpbF9sYyxcclxuICAgICAgcGhvbmVfZTE2NCxcclxuICAgICAgdGV4dCxcclxuICAgICAgc291cmNlLFxyXG4gICAgICBjb252ZXJzYXRpb25faWQsXHJcbiAgICAgIG1lc3NhZ2VfaWQsXHJcbiAgICAgIHBlcnNvbmFOYW1lID0gJ0NhcmxvcydcclxuICAgIH0gPSBwYXJhbXM7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gUHJvY2VzcyBtZXNzYWdlIHVzaW5nIGV4aXN0aW5nIGFnZW50IGxvZ2ljXHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5wcm9jZXNzTWVzc2FnZSh7XHJcbiAgICAgICAgdGVuYW50SWQsXHJcbiAgICAgICAgZW1haWxfbGM6IGVtYWlsX2xjIHx8ICcnLFxyXG4gICAgICAgIHRleHQsXHJcbiAgICAgICAgc291cmNlXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gR2VuZXJhdGUgY29udGFjdCBwcmltYXJ5IGtleVxyXG4gICAgICBjb25zdCBjb250YWN0X3BrID0gYGNvbnRhY3QjJHtlbWFpbF9sYyB8fCBwaG9uZV9lMTY0IHx8ICd1bmtub3duJ31gO1xyXG5cclxuICAgICAgLy8gU2NoZWR1bGUgZGVsYXllZCBhY3Rpb25zIGluc3RlYWQgb2YgaW1tZWRpYXRlIHJlc3BvbnNlXHJcbiAgICAgIGNvbnN0IHRpbWluZyA9IGF3YWl0IHNjaGVkdWxlQWN0aW9ucyh7XHJcbiAgICAgICAgcXVldWVVcmw6IHRoaXMucmVsZWFzZVF1ZXVlVXJsLFxyXG4gICAgICAgIHRlbmFudElkLFxyXG4gICAgICAgIGNvbnRhY3RfcGssXHJcbiAgICAgICAgY29udmVyc2F0aW9uX2lkLFxyXG4gICAgICAgIGNoYW5uZWw6IHNvdXJjZSxcclxuICAgICAgICBwZXJzb25hTmFtZSxcclxuICAgICAgICBtZXNzYWdlX2lkOiBtZXNzYWdlX2lkIHx8IGBtc2ctJHtEYXRlLm5vdygpfWAsXHJcbiAgICAgICAgcmVwbHlUZXh0OiB0eXBlb2YgcmVzcG9uc2UgPT09ICdzdHJpbmcnID8gcmVzcG9uc2UgOiAnTm8gcmVzcG9uc2UgZ2VuZXJhdGVkJyxcclxuICAgICAgICBpbnB1dENoYXJzOiB0ZXh0Lmxlbmd0aCxcclxuICAgICAgICBpbnB1dFRva2VuczogZXN0aW1hdGVUb2tlbkNvdW50KHRleHQpXHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gTG9nIHRpbWluZyBmb3IgdGVsZW1ldHJ5XHJcbiAgICAgIGNvbnN0IHJlcGx5VGV4dCA9IHR5cGVvZiByZXNwb25zZSA9PT0gJ3N0cmluZycgPyByZXNwb25zZSA6ICdObyByZXNwb25zZSBnZW5lcmF0ZWQnO1xyXG4gICAgICBjb25zb2xlLmxvZygnU2NoZWR1bGVkIGRlbGF5ZWQgcmVzcG9uc2UnLCB7XHJcbiAgICAgICAgdGVuYW50SWQsXHJcbiAgICAgICAgY29udmVyc2F0aW9uX2lkLFxyXG4gICAgICAgIHBlcnNvbmFOYW1lLFxyXG4gICAgICAgIHRpbWluZyxcclxuICAgICAgICByZXBseUxlbmd0aDogcmVwbHlUZXh0Lmxlbmd0aFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIEVtaXQgdHJhY2UgZXZlbnQgZm9yIG1vbml0b3JpbmcgKHBsYWNlaG9sZGVyIC0gcmVwbGFjZSB3aXRoIGFjdHVhbCBFdmVudEJyaWRnZSBzZXJ2aWNlKVxyXG4gICAgICBjb25zb2xlLmxvZygnVHJhY2UgZXZlbnQ6Jywge1xyXG4gICAgICAgIHNvdXJjZTogJ2t4Z2VuLmFnZW50JyxcclxuICAgICAgICBkZXRhaWxUeXBlOiAnYWdlbnQudHJhY2UnLFxyXG4gICAgICAgIGRldGFpbDoge1xyXG4gICAgICAgICAgdGVuYW50SWQsXHJcbiAgICAgICAgICBjb250YWN0X3BrLFxyXG4gICAgICAgICAgb3BlcmF0aW9uOiAnZGVsYXllZF9yZXNwb25zZV9zY2hlZHVsZWQnLFxyXG4gICAgICAgICAgbWV0YWRhdGE6IHtcclxuICAgICAgICAgICAgdGltaW5nLFxyXG4gICAgICAgICAgICBwZXJzb25hOiBwZXJzb25hTmFtZSxcclxuICAgICAgICAgICAgY2hhbm5lbDogc291cmNlLFxyXG4gICAgICAgICAgICBpbnB1dExlbmd0aDogdGV4dC5sZW5ndGgsXHJcbiAgICAgICAgICAgIHJlcGx5TGVuZ3RoOiByZXBseVRleHQubGVuZ3RoXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcclxuICAgICAgICB0aW1pbmcsXHJcbiAgICAgICAgbWVzc2FnZTogJ1Jlc3BvbnNlIHNjaGVkdWxlZCBmb3IgZGVsYXllZCBkZWxpdmVyeSdcclxuICAgICAgfTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gcHJvY2VzcyBtZXNzYWdlIHdpdGggZGVsYXllZCByZXNwb25zZTonLCBlcnJvcik7XHJcbiAgICAgIFxyXG4gICAgICAvLyBFbWl0IGVycm9yIGV2ZW50IChwbGFjZWhvbGRlciAtIHJlcGxhY2Ugd2l0aCBhY3R1YWwgRXZlbnRCcmlkZ2Ugc2VydmljZSlcclxuICAgICAgY29uc29sZS5sb2coJ0Vycm9yIGV2ZW50OicsIHtcclxuICAgICAgICBzb3VyY2U6ICdreGdlbi5hZ2VudCcsXHJcbiAgICAgICAgZGV0YWlsVHlwZTogJ2FnZW50LmVycm9yJyxcclxuICAgICAgICBkZXRhaWw6IHtcclxuICAgICAgICAgIHRlbmFudElkLFxyXG4gICAgICAgICAgY29udGFjdF9wazogYGNvbnRhY3QjJHtlbWFpbF9sYyB8fCBwaG9uZV9lMTY0IHx8ICd1bmtub3duJ31gLFxyXG4gICAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSxcclxuICAgICAgICAgIHN0YWNrOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3Iuc3RhY2sgOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICBjb250ZXh0OiB7XHJcbiAgICAgICAgICAgIG9wZXJhdGlvbjogJ2RlbGF5ZWRfcmVzcG9uc2VfcHJvY2Vzc2luZycsXHJcbiAgICAgICAgICAgIHNvdXJjZSxcclxuICAgICAgICAgICAgbWVzc2FnZUxlbmd0aDogdGV4dC5sZW5ndGhcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFbWVyZ2VuY3kgYnlwYXNzIGZvciBpbW1lZGlhdGUgcmVzcG9uc2VzIChodW1hbiB0YWtlb3ZlciwgdXJnZW50IG1lc3NhZ2VzKVxyXG4gICAqL1xyXG4gIGFzeW5jIHByb2Nlc3NNZXNzYWdlSW1tZWRpYXRlKHBhcmFtczoge1xyXG4gICAgdGVuYW50SWQ6IHN0cmluZztcclxuICAgIGVtYWlsX2xjPzogc3RyaW5nO1xyXG4gICAgcGhvbmVfZTE2ND86IHN0cmluZztcclxuICAgIHRleHQ6IHN0cmluZztcclxuICAgIHNvdXJjZTogJ3NtcycgfCAnZW1haWwnIHwgJ2NoYXQnIHwgJ2FwaSc7XHJcbiAgICByZWFzb24/OiBzdHJpbmc7XHJcbiAgfSkge1xyXG4gICAgY29uc29sZS5sb2coJ1Byb2Nlc3NpbmcgaW1tZWRpYXRlIHJlc3BvbnNlIChieXBhc3NpbmcgZGVsYXlzKScsIHtcclxuICAgICAgdGVuYW50SWQ6IHBhcmFtcy50ZW5hbnRJZCxcclxuICAgICAgcmVhc29uOiBwYXJhbXMucmVhc29uIHx8ICdlbWVyZ2VuY3lfYnlwYXNzJ1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gVXNlIG9yaWdpbmFsIGltbWVkaWF0ZSBwcm9jZXNzaW5nXHJcbiAgICByZXR1cm4gdGhpcy5wcm9jZXNzTWVzc2FnZSh7XHJcbiAgICAgIHRlbmFudElkOiBwYXJhbXMudGVuYW50SWQsXHJcbiAgICAgIGVtYWlsX2xjOiBwYXJhbXMuZW1haWxfbGMgfHwgJycsXHJcbiAgICAgIHRleHQ6IHBhcmFtcy50ZXh0LFxyXG4gICAgICBzb3VyY2U6IHBhcmFtcy5zb3VyY2VcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEZhY3RvcnkgZnVuY3Rpb24gZm9yIGNyZWF0aW5nIGRlbGF5ZWQgcmVzcG9uc2UgYWdlbnRcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVEZWxheWVkUmVzcG9uc2VBZ2VudChcclxuICBjb25maWc6IFJ1bnRpbWVDb25maWcsXHJcbiAgcmVsZWFzZVF1ZXVlVXJsOiBzdHJpbmdcclxuKTogRGVsYXllZFJlc3BvbnNlQWdlbnRTZXJ2aWNlIHtcclxuICByZXR1cm4gbmV3IERlbGF5ZWRSZXNwb25zZUFnZW50U2VydmljZShjb25maWcsIHJlbGVhc2VRdWV1ZVVybCk7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBMYW1iZGEgaGFuZGxlciB0aGF0IHVzZXMgZGVsYXllZCByZXNwb25zZXNcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZWxheWVkUmVzcG9uc2VIYW5kbGVyKGV2ZW50OiBhbnkpIHtcclxuICBjb25zdCByZWxlYXNlUXVldWVVcmwgPSBwcm9jZXNzLmVudi5SRUxFQVNFX1FVRVVFX1VSTDtcclxuICBpZiAoIXJlbGVhc2VRdWV1ZVVybCkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdSRUxFQVNFX1FVRVVFX1VSTCBlbnZpcm9ubWVudCB2YXJpYWJsZSBpcyByZXF1aXJlZCcpO1xyXG4gIH1cclxuXHJcbiAgLy8gQ3JlYXRlIGFnZW50IHdpdGggZGVsYXllZCByZXNwb25zZSBjYXBhYmlsaXR5XHJcbiAgY29uc3QgYWdlbnQgPSBjcmVhdGVEZWxheWVkUmVzcG9uc2VBZ2VudCh7XHJcbiAgICBtZXNzYWdlc1RhYmxlOiBwcm9jZXNzLmVudi5NRVNTQUdFU19UQUJMRSB8fCAnbWVzc2FnZXMnLFxyXG4gICAgbGVhZHNUYWJsZTogcHJvY2Vzcy5lbnYuTEVBRFNfVEFCTEUgfHwgJ2xlYWRzJyxcclxuICAgIGJlZHJvY2tNb2RlbElkOiBwcm9jZXNzLmVudi5CRURST0NLX01PREVMX0lEIHx8ICdhbnRocm9waWMuY2xhdWRlLXNvbm5ldC00LTIwMjUwNTE0LXYxOjAnLFxyXG4gICAgaGlzdG9yeUxpbWl0OiA1MCxcclxuICAgIGF3c1JlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJ1xyXG4gIH0sIHJlbGVhc2VRdWV1ZVVybCk7XHJcblxyXG4gIC8vIERldGVybWluZSBpZiB0aGlzIHNob3VsZCBiZSBpbW1lZGlhdGUgb3IgZGVsYXllZFxyXG4gIGNvbnN0IGlzVXJnZW50ID0gZXZlbnQuZGV0YWlsLnRleHQ/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3VyZ2VudCcpIHx8IFxyXG4gICAgICAgICAgICAgICAgICAgZXZlbnQuZGV0YWlsLnRleHQ/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ2VtZXJnZW5jeScpO1xyXG5cclxuICBpZiAoaXNVcmdlbnQpIHtcclxuICAgIC8vIFByb2Nlc3MgaW1tZWRpYXRlbHkgZm9yIHVyZ2VudCBtZXNzYWdlc1xyXG4gICAgcmV0dXJuIGFnZW50LnByb2Nlc3NNZXNzYWdlSW1tZWRpYXRlKHtcclxuICAgICAgdGVuYW50SWQ6IGV2ZW50LmRldGFpbC50ZW5hbnRJZCxcclxuICAgICAgZW1haWxfbGM6IGV2ZW50LmRldGFpbC5lbWFpbF9sYyxcclxuICAgICAgcGhvbmVfZTE2NDogZXZlbnQuZGV0YWlsLnBob25lX2UxNjQsXHJcbiAgICAgIHRleHQ6IGV2ZW50LmRldGFpbC50ZXh0LFxyXG4gICAgICBzb3VyY2U6IGV2ZW50LmRldGFpbC5zb3VyY2UsXHJcbiAgICAgIHJlYXNvbjogJ3VyZ2VudF9tZXNzYWdlJ1xyXG4gICAgfSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIC8vIFByb2Nlc3Mgd2l0aCBkZWxheWVkIHJlc3BvbnNlXHJcbiAgICByZXR1cm4gYWdlbnQucHJvY2Vzc01lc3NhZ2VXaXRoRGVsYXllZFJlc3BvbnNlKHtcclxuICAgICAgdGVuYW50SWQ6IGV2ZW50LmRldGFpbC50ZW5hbnRJZCxcclxuICAgICAgZW1haWxfbGM6IGV2ZW50LmRldGFpbC5lbWFpbF9sYyxcclxuICAgICAgcGhvbmVfZTE2NDogZXZlbnQuZGV0YWlsLnBob25lX2UxNjQsXHJcbiAgICAgIHRleHQ6IGV2ZW50LmRldGFpbC50ZXh0LFxyXG4gICAgICBzb3VyY2U6IGV2ZW50LmRldGFpbC5zb3VyY2UsXHJcbiAgICAgIGNvbnZlcnNhdGlvbl9pZDogZXZlbnQuZGV0YWlsLmNvbnZlcnNhdGlvbl9pZCxcclxuICAgICAgbWVzc2FnZV9pZDogZXZlbnQuZGV0YWlsLm1lc3NhZ2VfaWQsXHJcbiAgICAgIHBlcnNvbmFOYW1lOiBldmVudC5kZXRhaWwucGVyc29uYSB8fCAnQ2FybG9zJ1xyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcbiJdfQ==