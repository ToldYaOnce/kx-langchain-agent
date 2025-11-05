/**
 * @fileoverview
 * Factory functions for creating Lambda handlers with the KxGen LangChain Agent.
 *
 * This approach gives consumers complete control over their Lambda functions while
 * providing pre-built, tested handler logic they can use or customize.
 *
 * Consumers can:
 * - Use the factory functions directly for common patterns
 * - Customize the handlers with their own middleware/logic
 * - Create entirely custom handlers using the core AgentService
 *
 * @example
 * ```typescript
 * // In consumer's Lambda function
 * import { createApiGatewayHandler, createEventBridgeHandler } from '@kxgen/langchain-agent-runtime';
 *
 * // Option 1: Use factory directly
 * export const handler = createApiGatewayHandler({
 *   tenantId: 'my-company',
 *   customMiddleware: async (event, context, next) => {
 *     // Custom auth, logging, etc.
 *     return next();
 *   }
 * });
 *
 * // Option 2: Customize the handler
 * const baseHandler = createApiGatewayHandler();
 * export const handler = async (event, context) => {
 *   // Custom preprocessing
 *   if (!validateApiKey(event.headers.authorization)) {
 *     return { statusCode: 401, body: 'Unauthorized' };
 *   }
 *
 *   // Call base handler
 *   return baseHandler(event, context);
 * };
 * ```
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context, EventBridgeEvent } from 'aws-lambda';
import type { AgentResponse } from '../types/index.js';
import { z } from 'zod';
/**
 * Base configuration for all handler factories
 */
export interface BaseHandlerConfig {
    /**
     * Optional tenant ID override (if not provided in request)
     */
    tenantId?: string;
    /**
     * Custom environment variable overrides
     */
    environmentOverrides?: Record<string, string>;
    /**
     * Custom error handler
     */
    errorHandler?: (error: Error, event: any, context: Context) => Promise<any>;
    /**
     * Custom logging function
     */
    logger?: (level: 'info' | 'warn' | 'error', message: string, data?: any) => void;
}
/**
 * Middleware function type for custom processing
 */
export type MiddlewareFunction<TEvent, TResult> = (event: TEvent, context: Context, next: () => Promise<TResult>) => Promise<TResult>;
/**
 * Configuration for API Gateway handler factory
 */
export interface ApiGatewayHandlerConfig extends BaseHandlerConfig {
    /**
     * CORS configuration
     */
    cors?: {
        allowOrigins?: string[];
        allowMethods?: string[];
        allowHeaders?: string[];
        allowCredentials?: boolean;
    };
    /**
     * Request validation schema override
     */
    requestSchema?: z.ZodSchema;
    /**
     * Custom middleware functions
     */
    middleware?: MiddlewareFunction<APIGatewayProxyEventV2, APIGatewayProxyResultV2>[];
    /**
     * Custom response transformer
     */
    responseTransformer?: (response: AgentResponse, event: APIGatewayProxyEventV2) => APIGatewayProxyResultV2;
}
/**
 * Configuration for EventBridge handler factory
 */
export interface EventBridgeHandlerConfig extends BaseHandlerConfig {
    /**
     * Custom event validation schema
     */
    eventSchema?: z.ZodSchema;
    /**
     * Custom middleware functions
     */
    middleware?: MiddlewareFunction<EventBridgeEvent<string, any>, void>[];
    /**
     * Whether to invoke agent handler directly or publish to another event
     */
    invokeAgent?: boolean;
}
/**
 * Creates an API Gateway Lambda handler for synchronous chat requests
 *
 * @param config Configuration options for the handler
 * @returns Lambda handler function
 *
 * @example
 * ```typescript
 * // Basic usage
 * export const handler = createApiGatewayHandler();
 *
 * // With custom configuration
 * export const handler = createApiGatewayHandler({
 *   tenantId: 'my-company',
 *   cors: {
 *     allowOrigins: ['https://mycompany.com'],
 *     allowCredentials: true,
 *   },
 *   middleware: [
 *     async (event, context, next) => {
 *       // Custom authentication
 *       if (!event.headers.authorization) {
 *         return {
 *           statusCode: 401,
 *           headers: defaultCorsHeaders,
 *           body: JSON.stringify({ error: 'Unauthorized' }),
 *         };
 *       }
 *       return next();
 *     },
 *   ],
 * });
 * ```
 */
export declare function createApiGatewayHandler(config?: ApiGatewayHandlerConfig): (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2>;
/**
 * Creates an EventBridge Lambda handler for asynchronous message processing
 *
 * @param config Configuration options for the handler
 * @returns Lambda handler function
 *
 * @example
 * ```typescript
 * // Basic usage
 * export const handler = createEventBridgeHandler();
 *
 * // With custom configuration
 * export const handler = createEventBridgeHandler({
 *   middleware: [
 *     async (event, context, next) => {
 *       // Custom preprocessing
 *       console.log('Processing event:', event.source);
 *       return next();
 *     },
 *   ],
 *   invokeAgent: true, // Directly invoke agent processing
 * });
 * ```
 */
export declare function createEventBridgeHandler(config?: EventBridgeHandlerConfig): (event: EventBridgeEvent<string, any>, context: Context) => Promise<void>;
/**
 * Creates a simple health check handler
 *
 * @param config Basic configuration
 * @returns Health check handler
 */
export declare function createHealthCheckHandler(config?: {
    version?: string;
    serviceName?: string;
}): (event: any, context: Context) => Promise<any>;
//# sourceMappingURL=agent-handler-factory.d.ts.map