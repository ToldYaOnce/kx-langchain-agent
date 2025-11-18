import type { EventBridgeEvent, Context } from 'aws-lambda';
/**
 * Lambda handler for routing inbound messages
 * Triggered by EventBridge rule: lead.message.created
 */
export declare function handler(event: EventBridgeEvent<string, any>, context: Context): Promise<void>;
