import type { EventBridgeEvent, Context } from 'aws-lambda';
import { type InboundMessageEvent } from '../types/index.js';
/**
 * Lambda handler for routing inbound messages
 * Triggered by EventBridge rule: lead.message.created
 */
export declare function handler(event: EventBridgeEvent<'lead.message.created', InboundMessageEvent['detail']>, context: Context): Promise<void>;
//# sourceMappingURL=router.d.ts.map