import type { Context } from 'aws-lambda';
import type { AgentContext, AgentResponse } from '../types/index.js';
/**
 * Agent invocation context (internal event from router)
 */
export interface AgentInvocationEvent extends AgentContext {
    message_ts: string;
}
/**
 * Lambda handler for processing agent responses
 * Invoked by AgentRouterFn with processed context
 */
export declare function handler(event: AgentInvocationEvent, context: Context): Promise<void>;
/**
 * Lambda handler that returns structured JSON response with intent metadata
 * Useful for API Gateway integrations or when you need detailed response data
 */
export declare function structuredHandler(event: AgentInvocationEvent, context: Context): Promise<AgentResponse>;
