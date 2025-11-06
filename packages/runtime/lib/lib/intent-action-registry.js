"use strict";
/**
 * @fileoverview
 * Intent Action Registry - Allows consumers to register custom actions for intents
 *
 * This separates intent DETECTION (triggers, patterns) from intent ACTIONS (what happens).
 * Consumers can register their own action handlers for any intent.
 *
 * @example
 * ```typescript
 * // Consumer registers custom actions
 * const registry = new IntentActionRegistry();
 *
 * // Register appointment scheduling action
 * registry.registerAction('appointment_request', async (context) => {
 *   // Route to external scheduling system
 *   const booking = await scheduleAppointment({
 *     userEmail: context.userEmail,
 *     preferredTime: context.extractedData.preferredTime,
 *   });
 *
 *   return {
 *     success: true,
 *     data: { bookingId: booking.id },
 *     message: `Great! I've scheduled your appointment for ${booking.time}`,
 *   };
 * });
 *
 * // Register lead tracking action
 * registry.registerAction('lead_qualified', async (context) => {
 *   // Send to CRM
 *   await sendToCRM({
 *     email: context.userEmail,
 *     phone: context.extractedData.phone,
 *     source: 'chat_bot',
 *   });
 *
 *   return { success: true };
 * });
 * ```
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultIntentActionRegistry = exports.IntentActionHelpers = exports.IntentActionRegistry = void 0;
// =============================================================================
// INTENT ACTION REGISTRY
// =============================================================================
/**
 * Registry for intent actions that consumers can customize
 */
class IntentActionRegistry {
    constructor() {
        this.actions = new Map();
        this.globalMiddleware = [];
    }
    /**
     * Register an action handler for a specific intent
     *
     * @param intentId The intent ID to handle
     * @param config Action configuration
     *
     * @example
     * ```typescript
     * registry.registerAction('appointment_request', {
     *   id: 'schedule_appointment',
     *   name: 'Schedule Appointment',
     *   description: 'Books appointment in external calendar system',
     *   handler: async (context) => {
     *     const booking = await externalCalendar.book({
     *       email: context.user.email,
     *       time: context.extractedData.preferredTime,
     *     });
     *
     *     return {
     *       success: true,
     *       message: `Appointment booked for ${booking.time}`,
     *       data: { bookingId: booking.id },
     *     };
     *   },
     *   conditions: {
     *     minConfidence: 0.8,
     *     requiredFields: ['preferredTime'],
     *   },
     * });
     * ```
     */
    registerAction(intentId, config) {
        if (!this.actions.has(intentId)) {
            this.actions.set(intentId, []);
        }
        const actions = this.actions.get(intentId);
        actions.push(config);
        // Sort by priority (higher first)
        actions.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
    /**
     * Register multiple actions at once
     *
     * @param actionsMap Map of intent ID to action configs
     */
    registerActions(actionsMap) {
        for (const [intentId, configOrConfigs] of Object.entries(actionsMap)) {
            const configs = Array.isArray(configOrConfigs) ? configOrConfigs : [configOrConfigs];
            for (const config of configs) {
                this.registerAction(intentId, config);
            }
        }
    }
    /**
     * Register global middleware that runs for all intents
     *
     * @param middleware Middleware handler
     *
     * @example
     * ```typescript
     * // Log all intent actions
     * registry.registerMiddleware(async (context) => {
     *   console.log(`Intent action: ${context.intent.id}`);
     *   await logToAnalytics(context);
     *   return { success: true, continueProcessing: true };
     * });
     * ```
     */
    registerMiddleware(middleware) {
        this.globalMiddleware.push(middleware);
    }
    /**
     * Execute actions for a detected intent
     *
     * @param context Intent action context
     * @returns Combined results from all executed actions
     */
    async executeActions(context) {
        const results = [];
        // Run global middleware first
        for (const middleware of this.globalMiddleware) {
            try {
                const result = await middleware(context);
                results.push(result);
                // If middleware says to stop processing, return early
                if (!result.continueProcessing) {
                    return results;
                }
            }
            catch (error) {
                console.error('Intent middleware error:', error);
                results.push({
                    success: false,
                    error: {
                        code: 'MIDDLEWARE_ERROR',
                        message: error instanceof Error ? error.message : 'Unknown middleware error',
                        details: error,
                    },
                });
            }
        }
        // Get actions for this intent
        const actions = this.actions.get(context.intent.id) || [];
        // Execute actions
        for (const actionConfig of actions) {
            // Check conditions
            if (!this.shouldExecuteAction(actionConfig, context)) {
                continue;
            }
            try {
                let result;
                if (actionConfig.async) {
                    // Fire and forget for async actions
                    actionConfig.handler(context).catch(error => {
                        console.error(`Async intent action error (${actionConfig.id}):`, error);
                    });
                    result = {
                        success: true,
                        metadata: { executedAsync: true, actionId: actionConfig.id },
                    };
                }
                else {
                    // Wait for synchronous actions
                    result = await actionConfig.handler(context);
                }
                // Add action metadata
                result.metadata = {
                    ...result.metadata,
                    actionId: actionConfig.id,
                    actionName: actionConfig.name,
                };
                results.push(result);
            }
            catch (error) {
                console.error(`Intent action error (${actionConfig.id}):`, error);
                results.push({
                    success: false,
                    error: {
                        code: 'ACTION_ERROR',
                        message: error instanceof Error ? error.message : 'Unknown action error',
                        details: error,
                    },
                    metadata: {
                        actionId: actionConfig.id,
                        actionName: actionConfig.name,
                    },
                });
            }
        }
        return results;
    }
    /**
     * Check if an action should be executed based on its conditions
     */
    shouldExecuteAction(config, context) {
        const conditions = config.conditions;
        if (!conditions)
            return true;
        // Check minimum confidence
        if (conditions.minConfidence && context.intent.confidence < conditions.minConfidence) {
            return false;
        }
        // Check required fields
        if (conditions.requiredFields) {
            for (const field of conditions.requiredFields) {
                if (!context.extractedData[field]) {
                    return false;
                }
            }
        }
        // Check allowed channels
        if (conditions.allowedChannels && !conditions.allowedChannels.includes(context.channel.source)) {
            return false;
        }
        // Check custom condition
        if (conditions.customCondition && !conditions.customCondition(context)) {
            return false;
        }
        return true;
    }
    /**
     * Get all registered actions for an intent
     */
    getActions(intentId) {
        return this.actions.get(intentId) || [];
    }
    /**
     * Get all registered intent IDs
     */
    getRegisteredIntents() {
        return Array.from(this.actions.keys());
    }
    /**
     * Remove all actions for an intent
     */
    clearActions(intentId) {
        this.actions.delete(intentId);
    }
    /**
     * Remove all registered actions and middleware
     */
    clearAll() {
        this.actions.clear();
        this.globalMiddleware.length = 0;
    }
}
exports.IntentActionRegistry = IntentActionRegistry;
// =============================================================================
// BUILT-IN ACTION HELPERS
// =============================================================================
/**
 * Helper to create common action types
 */
class IntentActionHelpers {
    /**
     * Create a webhook action that posts to an external URL
     */
    static createWebhookAction(config) {
        return {
            id: config.id,
            name: config.name,
            description: `Webhook to ${config.url}`,
            handler: async (context) => {
                const payload = config.transformPayload
                    ? config.transformPayload(context)
                    : {
                        intent: context.intent,
                        message: context.message,
                        extractedData: context.extractedData,
                        user: context.user,
                        tenant: context.tenant,
                    };
                const response = await fetch(config.url, {
                    method: config.method || 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...config.headers,
                    },
                    body: JSON.stringify(payload),
                });
                if (!response.ok) {
                    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                return {
                    success: true,
                    data: data,
                    metadata: {
                        webhookUrl: config.url,
                        statusCode: response.status,
                    },
                };
            },
        };
    }
    /**
     * Create an EventBridge action that publishes events
     */
    static createEventBridgeAction(config) {
        return {
            id: config.id,
            name: config.name,
            description: `Publish to EventBridge: ${config.source}`,
            async: true, // EventBridge actions are typically async
            handler: async (context) => {
                const { EventBridgeClient, PutEventsCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-eventbridge')));
                const client = new EventBridgeClient({});
                const detail = config.transformDetail
                    ? config.transformDetail(context)
                    : {
                        intent: context.intent,
                        message: context.message,
                        extractedData: context.extractedData,
                        user: context.user,
                        tenant: context.tenant,
                    };
                await client.send(new PutEventsCommand({
                    Entries: [{
                            Source: config.source,
                            DetailType: config.detailType,
                            Detail: JSON.stringify(detail),
                            ...(config.eventBusName && { EventBusName: config.eventBusName }),
                        }],
                }));
                return {
                    success: true,
                    metadata: {
                        eventSource: config.source,
                        eventDetailType: config.detailType,
                    },
                };
            },
        };
    }
    /**
     * Create a DynamoDB action that stores intent data
     */
    static createDynamoDBAction(config) {
        return {
            id: config.id,
            name: config.name,
            description: `Store in DynamoDB: ${config.tableName}`,
            handler: async (context) => {
                const { DynamoDBClient } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-dynamodb')));
                const { DynamoDBDocumentClient, PutCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/lib-dynamodb')));
                const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
                const item = config.transformItem
                    ? config.transformItem(context)
                    : {
                        pk: `${context.tenant.id}#${context.intent.id}`,
                        sk: new Date().toISOString(),
                        intentId: context.intent.id,
                        message: context.message,
                        extractedData: context.extractedData,
                        userEmail: context.user.email,
                        confidence: context.intent.confidence,
                        timestamp: new Date().toISOString(),
                    };
                await client.send(new PutCommand({
                    TableName: config.tableName,
                    Item: item,
                }));
                return {
                    success: true,
                    data: { item },
                    metadata: {
                        tableName: config.tableName,
                    },
                };
            },
        };
    }
}
exports.IntentActionHelpers = IntentActionHelpers;
// =============================================================================
// DEFAULT REGISTRY INSTANCE
// =============================================================================
/**
 * Default global registry instance
 * Consumers can use this or create their own
 */
exports.defaultIntentActionRegistry = new IntentActionRegistry();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZW50LWFjdGlvbi1yZWdpc3RyeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9saWIvaW50ZW50LWFjdGlvbi1yZWdpc3RyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQXVDRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBa0lILGdGQUFnRjtBQUNoRix5QkFBeUI7QUFDekIsZ0ZBQWdGO0FBRWhGOztHQUVHO0FBQ0gsTUFBYSxvQkFBb0I7SUFBakM7UUFDVSxZQUFPLEdBQUcsSUFBSSxHQUFHLEVBQWdDLENBQUM7UUFDbEQscUJBQWdCLEdBQTBCLEVBQUUsQ0FBQztJQXFPdkQsQ0FBQztJQW5PQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O09BOEJHO0lBQ0gsY0FBYyxDQUFDLFFBQWdCLEVBQUUsTUFBMEI7UUFDekQsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDaEMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ2pDLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUUsQ0FBQztRQUM1QyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXJCLGtDQUFrQztRQUNsQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsZUFBZSxDQUFDLFVBQXFFO1FB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KiBAZmlsZW92ZXJ2aWV3XG4gKiBJbnRlbnQgQWN0aW9uIFJlZ2lzdHJ5IC0gQWxsb3dzIGNvbnN1bWVycyB0byByZWdpc3RlciBjdXN0b20gYWN0aW9ucyBmb3IgaW50ZW50c1xuICogXG4gKiBUaGlzIHNlcGFyYXRlcyBpbnRlbnQgREVURUNUSU9OICh0cmlnZ2VycywgcGF0dGVybnMpIGZyb20gaW50ZW50IEFDVElPTlMgKHdoYXQgaGFwcGVucykuXG4gKiBDb25zdW1lcnMgY2FuIHJlZ2lzdGVyIHRoZWlyIG93biBhY3Rpb24gaGFuZGxlcnMgZm9yIGFueSBpbnRlbnQuXG4gKiBcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiAvLyBDb25zdW1lciByZWdpc3RlcnMgY3VzdG9tIGFjdGlvbnNcbiAqIGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEludGVudEFjdGlvblJlZ2lzdHJ5KCk7XG4gKiBcbiAqIC8vIFJlZ2lzdGVyIGFwcG9pbnRtZW50IHNjaGVkdWxpbmcgYWN0aW9uXG4gKiByZWdpc3RyeS5yZWdpc3RlckFjdGlvbignYXBwb2ludG1lbnRfcmVxdWVzdCcsIGFzeW5jIChjb250ZXh0KSA9PiB7XG4gKiAgIC8vIFJvdXRlIHRvIGV4dGVybmFsIHNjaGVkdWxpbmcgc3lzdGVtXG4gKiAgIGNvbnN0IGJvb2tpbmcgPSBhd2FpdCBzY2hlZHVsZUFwcG9pbnRtZW50KHtcbiAqICAgICB1c2VyRW1haWw6IGNvbnRleHQudXNlckVtYWlsLFxuICogICAgIHByZWZlcnJlZFRpbWU6IGNvbnRleHQuZXh0cmFjdGVkRGF0YS5wcmVmZXJyZWRUaW1lLFxuICogICB9KTtcbiAqICAgXG4gKiAgIHJldHVybiB7XG4gKiAgICAgc3VjY2VzczogdHJ1ZSxcbiAqICAgICBkYXRhOiB7IGJvb2tpbmdJZDogYm9va2luZy5pZCB9LFxuICogICAgIG1lc3NhZ2U6IGBHcmVhdCEgSSd2ZSBzY2hlZHVsZWQgeW91ciBhcHBvaW50bWVudCBmb3IgJHtib29raW5nLnRpbWV9YCxcbiAqICAgfTtcbiAqIH0pO1xuICogXG4gKiAvLyBSZWdpc3RlciBsZWFkIHRyYWNraW5nIGFjdGlvblxuICogcmVnaXN0cnkucmVnaXN0ZXJBY3Rpb24oJ2xlYWRfcXVhbGlmaWVkJywgYXN5bmMgKGNvbnRleHQpID0+IHtcbiAqICAgLy8gU2VuZCB0byBDUk1cbiAqICAgYXdhaXQgc2VuZFRvQ1JNKHtcbiAqICAgICBlbWFpbDogY29udGV4dC51c2VyRW1haWwsXG4gKiAgICAgcGhvbmU6IGNvbnRleHQuZXh0cmFjdGVkRGF0YS5waG9uZSxcbiAqICAgICBzb3VyY2U6ICdjaGF0X2JvdCcsXG4gKiAgIH0pO1xuICogICBcbiAqICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSB9O1xuICogfSk7XG4gKiBgYGBcbiAqL1xuXG5pbXBvcnQgdHlwZSB7IEFnZW50Q29udGV4dCB9IGZyb20gJy4uL3R5cGVzL2luZGV4LmpzJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFRZUEVTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIENvbnRleHQgcHJvdmlkZWQgdG8gaW50ZW50IGFjdGlvbiBoYW5kbGVyc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIEludGVudEFjdGlvbkNvbnRleHQge1xuICAvKiogVGhlIGRldGVjdGVkIGludGVudCBpbmZvcm1hdGlvbiAqL1xuICBpbnRlbnQ6IHtcbiAgICBpZDogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBjb25maWRlbmNlOiBudW1iZXI7XG4gICAgbWF0Y2hlZFRyaWdnZXJzOiBzdHJpbmdbXTtcbiAgfTtcbiAgXG4gIC8qKiBPcmlnaW5hbCBhZ2VudCBjb250ZXh0ICovXG4gIGFnZW50Q29udGV4dDogQWdlbnRDb250ZXh0O1xuICBcbiAgLyoqIFVzZXIncyBvcmlnaW5hbCBtZXNzYWdlICovXG4gIG1lc3NhZ2U6IHN0cmluZztcbiAgXG4gIC8qKiBFeHRyYWN0ZWQgZGF0YSBmcm9tIHRoZSBtZXNzYWdlIChlbWFpbCwgcGhvbmUsIG5hbWUsIGV0Yy4pICovXG4gIGV4dHJhY3RlZERhdGE6IFJlY29yZDxzdHJpbmcsIGFueT47XG4gIFxuICAvKiogQ29udmVyc2F0aW9uIG1ldGFkYXRhICovXG4gIGNvbnZlcnNhdGlvbjoge1xuICAgIGlkPzogc3RyaW5nO1xuICAgIHNlc3Npb25JZD86IHN0cmluZztcbiAgICBtZXNzYWdlQ291bnQ6IG51bWJlcjtcbiAgICBoaXN0b3J5Pzogc3RyaW5nW107XG4gIH07XG4gIFxuICAvKiogVXNlciBpbmZvcm1hdGlvbiAqL1xuICB1c2VyOiB7XG4gICAgZW1haWw/OiBzdHJpbmc7XG4gICAgcGhvbmU/OiBzdHJpbmc7XG4gICAgbmFtZT86IHN0cmluZztcbiAgICBsZWFkSWQ/OiBzdHJpbmc7XG4gIH07XG4gIFxuICAvKiogVGVuYW50L2NvbXBhbnkgaW5mb3JtYXRpb24gKi9cbiAgdGVuYW50OiB7XG4gICAgaWQ6IHN0cmluZztcbiAgICBjb21wYW55SW5mbz86IFJlY29yZDxzdHJpbmcsIGFueT47XG4gIH07XG4gIFxuICAvKiogQ2hhbm5lbC1zcGVjaWZpYyBjb250ZXh0ICovXG4gIGNoYW5uZWw6IHtcbiAgICBzb3VyY2U6IHN0cmluZztcbiAgICBjb250ZXh0PzogUmVjb3JkPHN0cmluZywgYW55PjtcbiAgfTtcbn1cblxuLyoqXG4gKiBSZXN1bHQgcmV0dXJuZWQgYnkgaW50ZW50IGFjdGlvbiBoYW5kbGVyc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIEludGVudEFjdGlvblJlc3VsdCB7XG4gIC8qKiBXaGV0aGVyIHRoZSBhY3Rpb24gc3VjY2VlZGVkICovXG4gIHN1Y2Nlc3M6IGJvb2xlYW47XG4gIFxuICAvKiogT3B0aW9uYWwgcmVzcG9uc2UgbWVzc2FnZSB0byBzZW5kIHRvIHVzZXIgKi9cbiAgbWVzc2FnZT86IHN0cmluZztcbiAgXG4gIC8qKiBEYXRhIHJldHVybmVkIGJ5IHRoZSBhY3Rpb24gKGZvciBsb2dnaW5nLCBhbmFseXRpY3MsIGV0Yy4pICovXG4gIGRhdGE/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuICBcbiAgLyoqIEVycm9yIGluZm9ybWF0aW9uIGlmIGFjdGlvbiBmYWlsZWQgKi9cbiAgZXJyb3I/OiB7XG4gICAgY29kZTogc3RyaW5nO1xuICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICBkZXRhaWxzPzogYW55O1xuICB9O1xuICBcbiAgLyoqIFdoZXRoZXIgdG8gY29udGludWUgd2l0aCBub3JtYWwgYWdlbnQgcHJvY2Vzc2luZyAqL1xuICBjb250aW51ZVByb2Nlc3Npbmc/OiBib29sZWFuO1xuICBcbiAgLyoqIEFkZGl0aW9uYWwgbWV0YWRhdGEgKi9cbiAgbWV0YWRhdGE/OiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xufVxuXG4vKipcbiAqIEludGVudCBhY3Rpb24gaGFuZGxlciBmdW5jdGlvbiB0eXBlXG4gKi9cbmV4cG9ydCB0eXBlIEludGVudEFjdGlvbkhhbmRsZXIgPSAoXG4gIGNvbnRleHQ6IEludGVudEFjdGlvbkNvbnRleHRcbikgPT4gUHJvbWlzZTxJbnRlbnRBY3Rpb25SZXN1bHQ+O1xuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gZm9yIHJlZ2lzdGVyaW5nIGFuIGludGVudCBhY3Rpb25cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJbnRlbnRBY3Rpb25Db25maWcge1xuICAvKiogVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoaXMgYWN0aW9uICovXG4gIGlkOiBzdHJpbmc7XG4gIFxuICAvKiogSHVtYW4tcmVhZGFibGUgbmFtZSAqL1xuICBuYW1lOiBzdHJpbmc7XG4gIFxuICAvKiogRGVzY3JpcHRpb24gb2Ygd2hhdCB0aGlzIGFjdGlvbiBkb2VzICovXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIFxuICAvKiogVGhlIGFjdGlvbiBoYW5kbGVyIGZ1bmN0aW9uICovXG4gIGhhbmRsZXI6IEludGVudEFjdGlvbkhhbmRsZXI7XG4gIFxuICAvKiogV2hldGhlciB0aGlzIGFjdGlvbiBzaG91bGQgcnVuIGFzeW5jaHJvbm91c2x5IChkb24ndCB3YWl0IGZvciByZXN1bHQpICovXG4gIGFzeW5jPzogYm9vbGVhbjtcbiAgXG4gIC8qKiBQcmlvcml0eSBmb3IgZXhlY3V0aW9uIG9yZGVyIChoaWdoZXIgPSBlYXJsaWVyKSAqL1xuICBwcmlvcml0eT86IG51bWJlcjtcbiAgXG4gIC8qKiBDb25kaXRpb25zIGZvciB3aGVuIHRoaXMgYWN0aW9uIHNob3VsZCBydW4gKi9cbiAgY29uZGl0aW9ucz86IHtcbiAgICAvKiogTWluaW11bSBjb25maWRlbmNlIHRocmVzaG9sZCAqL1xuICAgIG1pbkNvbmZpZGVuY2U/OiBudW1iZXI7XG4gICAgXG4gICAgLyoqIFJlcXVpcmVkIGV4dHJhY3RlZCBkYXRhIGZpZWxkcyAqL1xuICAgIHJlcXVpcmVkRmllbGRzPzogc3RyaW5nW107XG4gICAgXG4gICAgLyoqIEFsbG93ZWQgY2hhbm5lbHMgKi9cbiAgICBhbGxvd2VkQ2hhbm5lbHM/OiBzdHJpbmdbXTtcbiAgICBcbiAgICAvKiogQ3VzdG9tIGNvbmRpdGlvbiBmdW5jdGlvbiAqL1xuICAgIGN1c3RvbUNvbmRpdGlvbj86IChjb250ZXh0OiBJbnRlbnRBY3Rpb25Db250ZXh0KSA9PiBib29sZWFuO1xuICB9O1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gSU5URU5UIEFDVElPTiBSRUdJU1RSWVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBSZWdpc3RyeSBmb3IgaW50ZW50IGFjdGlvbnMgdGhhdCBjb25zdW1lcnMgY2FuIGN1c3RvbWl6ZVxuICovXG5leHBvcnQgY2xhc3MgSW50ZW50QWN0aW9uUmVnaXN0cnkge1xuICBwcml2YXRlIGFjdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSW50ZW50QWN0aW9uQ29uZmlnW10+KCk7XG4gIHByaXZhdGUgZ2xvYmFsTWlkZGxld2FyZTogSW50ZW50QWN0aW9uSGFuZGxlcltdID0gW107XG5cbiAgLyoqXG4gICAqIFJlZ2lzdGVyIGFuIGFjdGlvbiBoYW5kbGVyIGZvciBhIHNwZWNpZmljIGludGVudFxuICAgKiBcbiAgICogQHBhcmFtIGludGVudElkIFRoZSBpbnRlbnQgSUQgdG8gaGFuZGxlXG4gICAqIEBwYXJhbSBjb25maWcgQWN0aW9uIGNvbmZpZ3VyYXRpb25cbiAgICogXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogcmVnaXN0cnkucmVnaXN0ZXJBY3Rpb24oJ2FwcG9pbnRtZW50X3JlcXVlc3QnLCB7XG4gICAqICAgaWQ6ICdzY2hlZHVsZV9hcHBvaW50bWVudCcsXG4gICAqICAgbmFtZTogJ1NjaGVkdWxlIEFwcG9pbnRtZW50JyxcbiAgICogICBkZXNjcmlwdGlvbjogJ0Jvb2tzIGFwcG9pbnRtZW50IGluIGV4dGVybmFsIGNhbGVuZGFyIHN5c3RlbScsXG4gICAqICAgaGFuZGxlcjogYXN5bmMgKGNvbnRleHQpID0+IHtcbiAgICogICAgIGNvbnN0IGJvb2tpbmcgPSBhd2FpdCBleHRlcm5hbENhbGVuZGFyLmJvb2soe1xuICAgKiAgICAgICBlbWFpbDogY29udGV4dC51c2VyLmVtYWlsLFxuICAgKiAgICAgICB0aW1lOiBjb250ZXh0LmV4dHJhY3RlZERhdGEucHJlZmVycmVkVGltZSxcbiAgICogICAgIH0pO1xuICAgKiAgICAgXG4gICAqICAgICByZXR1cm4ge1xuICAgKiAgICAgICBzdWNjZXNzOiB0cnVlLFxuICAgKiAgICAgICBtZXNzYWdlOiBgQXBwb2ludG1lbnQgYm9va2VkIGZvciAke2Jvb2tpbmcudGltZX1gLFxuICAgKiAgICAgICBkYXRhOiB7IGJvb2tpbmdJZDogYm9va2luZy5pZCB9LFxuICAgKiAgICAgfTtcbiAgICogICB9LFxuICAgKiAgIGNvbmRpdGlvbnM6IHtcbiAgICogICAgIG1pbkNvbmZpZGVuY2U6IDAuOCxcbiAgICogICAgIHJlcXVpcmVkRmllbGRzOiBbJ3ByZWZlcnJlZFRpbWUnXSxcbiAgICogICB9LFxuICAgKiB9KTtcbiAgICogYGBgXG4gICAqL1xuICByZWdpc3RlckFjdGlvbihpbnRlbnRJZDogc3RyaW5nLCBjb25maWc6IEludGVudEFjdGlvbkNvbmZpZyk6IHZvaWQge1xuICAgIGlmICghdGhpcy5hY3Rpb25zLmhhcyhpbnRlbnRJZCkpIHtcbiAgICAgIHRoaXMuYWN0aW9ucy5zZXQoaW50ZW50SWQsIFtdKTtcbiAgICB9XG4gICAgXG4gICAgY29uc3QgYWN0aW9ucyA9IHRoaXMuYWN0aW9ucy5nZXQoaW50ZW50SWQpITtcbiAgICBhY3Rpb25zLnB1c2goY29uZmlnKTtcbiAgICBcbiAgICAvLyBTb3J0IGJ5IHByaW9yaXR5IChoaWdoZXIgZmlyc3QpXG4gICAgYWN0aW9ucy5zb3J0KChhLCBiKSA9PiAoYi5wcmlvcml0eSB8fCAwKSAtIChhLnByaW9yaXR5IHx8IDApKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWdpc3RlciBtdWx0aXBsZSBhY3Rpb25zIGF0IG9uY2VcbiAgICogXG4gICAqIEBwYXJhbSBhY3Rpb25zTWFwIE1hcCBvZiBpbnRlbnQgSUQgdG8gYWN0aW9uIGNvbmZpZ3NcbiAgICovXG4gIHJlZ2lzdGVyQWN0aW9ucyhhY3Rpb25zTWFwOiBSZWNvcmQ8c3RyaW5nLCBJbnRlbnRBY3Rpb25Db25maWcgfCBJbnRlbnRBY3Rpb25Db25maWdbXT4pOiB2b2lkIHtcbiAgICBmb3IgKGNvbnN0IFtpbnRlbnRJZCwgY29uZmlnT3JDb25maWdzXSBvZiBPYmplY3QuZW50cmllcyhhY3Rpb25zTWFwKSkge1xuICAgICAgY29uc3QgY29uZmlncyA9IEFycmF5LmlzQXJyYXkoY29uZmlnT3JDb25maWdzKSA/IGNvbmZpZ09yQ29uZmlncyA6IFtjb25maWdPckNvbmZpZ3NdO1xuICAgICAgZm9yIChjb25zdCBjb25maWcgb2YgY29uZmlncykge1xuICAgICAgICB0aGlzLnJlZ2lzdGVyQWN0aW9uKGludGVudElkLCBjb25maWcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZWdpc3RlciBnbG9iYWwgbWlkZGxld2FyZSB0aGF0IHJ1bnMgZm9yIGFsbCBpbnRlbnRzXG4gICAqIFxuICAgKiBAcGFyYW0gbWlkZGxld2FyZSBNaWRkbGV3YXJlIGhhbmRsZXJcbiAgICogXG4gICAqIEBleGFtcGxlXG4gICAqIGBgYHR5cGVzY3JpcHRcbiAgICogLy8gTG9nIGFsbCBpbnRlbnQgYWN0aW9uc1xuICAgKiByZWdpc3RyeS5yZWdpc3Rlck1pZGRsZXdhcmUoYXN5bmMgKGNvbnRleHQpID0+IHtcbiAgICogICBjb25zb2xlLmxvZyhgSW50ZW50IGFjdGlvbjogJHtjb250ZXh0LmludGVudC5pZH1gKTtcbiAgICogICBhd2FpdCBsb2dUb0FuYWx5dGljcyhjb250ZXh0KTtcbiAgICogICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBjb250aW51ZVByb2Nlc3Npbmc6IHRydWUgfTtcbiAgICogfSk7XG4gICAqIGBgYFxuICAgKi9cbiAgcmVnaXN0ZXJNaWRkbGV3YXJlKG1pZGRsZXdhcmU6IEludGVudEFjdGlvbkhhbmRsZXIpOiB2b2lkIHtcbiAgICB0aGlzLmdsb2JhbE1pZGRsZXdhcmUucHVzaChtaWRkbGV3YXJlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFeGVjdXRlIGFjdGlvbnMgZm9yIGEgZGV0ZWN0ZWQgaW50ZW50XG4gICAqIFxuICAgKiBAcGFyYW0gY29udGV4dCBJbnRlbnQgYWN0aW9uIGNvbnRleHRcbiAgICogQHJldHVybnMgQ29tYmluZWQgcmVzdWx0cyBmcm9tIGFsbCBleGVjdXRlZCBhY3Rpb25zXG4gICAqL1xuICBhc3luYyBleGVjdXRlQWN0aW9ucyhjb250ZXh0OiBJbnRlbnRBY3Rpb25Db250ZXh0KTogUHJvbWlzZTxJbnRlbnRBY3Rpb25SZXN1bHRbXT4ge1xuICAgIGNvbnN0IHJlc3VsdHM6IEludGVudEFjdGlvblJlc3VsdFtdID0gW107XG4gICAgXG4gICAgLy8gUnVuIGdsb2JhbCBtaWRkbGV3YXJlIGZpcnN0XG4gICAgZm9yIChjb25zdCBtaWRkbGV3YXJlIG9mIHRoaXMuZ2xvYmFsTWlkZGxld2FyZSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbWlkZGxld2FyZShjb250ZXh0KTtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIFxuICAgICAgICAvLyBJZiBtaWRkbGV3YXJlIHNheXMgdG8gc3RvcCBwcm9jZXNzaW5nLCByZXR1cm4gZWFybHlcbiAgICAgICAgaWYgKCFyZXN1bHQuY29udGludWVQcm9jZXNzaW5nKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ludGVudCBtaWRkbGV3YXJlIGVycm9yOicsIGVycm9yKTtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHtcbiAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICBlcnJvcjoge1xuICAgICAgICAgICAgY29kZTogJ01JRERMRVdBUkVfRVJST1InLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBtaWRkbGV3YXJlIGVycm9yJyxcbiAgICAgICAgICAgIGRldGFpbHM6IGVycm9yLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICAvLyBHZXQgYWN0aW9ucyBmb3IgdGhpcyBpbnRlbnRcbiAgICBjb25zdCBhY3Rpb25zID0gdGhpcy5hY3Rpb25zLmdldChjb250ZXh0LmludGVudC5pZCkgfHwgW107XG4gICAgXG4gICAgLy8gRXhlY3V0ZSBhY3Rpb25zXG4gICAgZm9yIChjb25zdCBhY3Rpb25Db25maWcgb2YgYWN0aW9ucykge1xuICAgICAgLy8gQ2hlY2sgY29uZGl0aW9uc1xuICAgICAgaWYgKCF0aGlzLnNob3VsZEV4ZWN1dGVBY3Rpb24oYWN0aW9uQ29uZmlnLCBjb250ZXh0KSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdHJ5IHtcbiAgICAgICAgbGV0IHJlc3VsdDogSW50ZW50QWN0aW9uUmVzdWx0O1xuICAgICAgICBcbiAgICAgICAgaWYgKGFjdGlvbkNvbmZpZy5hc3luYykge1xuICAgICAgICAgIC8vIEZpcmUgYW5kIGZvcmdldCBmb3IgYXN5bmMgYWN0aW9uc1xuICAgICAgICAgIGFjdGlvbkNvbmZpZy5oYW5kbGVyKGNvbnRleHQpLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEFzeW5jIGludGVudCBhY3Rpb24gZXJyb3IgKCR7YWN0aW9uQ29uZmlnLmlkfSk6YCwgZXJyb3IpO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIFxuICAgICAgICAgIHJlc3VsdCA9IHtcbiAgICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgICBtZXRhZGF0YTogeyBleGVjdXRlZEFzeW5jOiB0cnVlLCBhY3Rpb25JZDogYWN0aW9uQ29uZmlnLmlkIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBXYWl0IGZvciBzeW5jaHJvbm91cyBhY3Rpb25zXG4gICAgICAgICAgcmVzdWx0ID0gYXdhaXQgYWN0aW9uQ29uZmlnLmhhbmRsZXIoY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIEFkZCBhY3Rpb24gbWV0YWRhdGFcbiAgICAgICAgcmVzdWx0Lm1ldGFkYXRhID0ge1xuICAgICAgICAgIC4uLnJlc3VsdC5tZXRhZGF0YSxcbiAgICAgICAgICBhY3Rpb25JZDogYWN0aW9uQ29uZmlnLmlkLFxuICAgICAgICAgIGFjdGlvbk5hbWU6IGFjdGlvbkNvbmZpZy5uYW1lLFxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgcmVzdWx0cy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIFxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgSW50ZW50IGFjdGlvbiBlcnJvciAoJHthY3Rpb25Db25maWcuaWR9KTpgLCBlcnJvcik7XG4gICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgZXJyb3I6IHtcbiAgICAgICAgICAgIGNvZGU6ICdBQ1RJT05fRVJST1InLFxuICAgICAgICAgICAgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBhY3Rpb24gZXJyb3InLFxuICAgICAgICAgICAgZGV0YWlsczogZXJyb3IsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBtZXRhZGF0YToge1xuICAgICAgICAgICAgYWN0aW9uSWQ6IGFjdGlvbkNvbmZpZy5pZCxcbiAgICAgICAgICAgIGFjdGlvbk5hbWU6IGFjdGlvbkNvbmZpZy5uYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBhbiBhY3Rpb24gc2hvdWxkIGJlIGV4ZWN1dGVkIGJhc2VkIG9uIGl0cyBjb25kaXRpb25zXG4gICAqL1xuICBwcml2YXRlIHNob3VsZEV4ZWN1dGVBY3Rpb24oY29uZmlnOiBJbnRlbnRBY3Rpb25Db25maWcsIGNvbnRleHQ6IEludGVudEFjdGlvbkNvbnRleHQpOiBib29sZWFuIHtcbiAgICBjb25zdCBjb25kaXRpb25zID0gY29uZmlnLmNvbmRpdGlvbnM7XG4gICAgaWYgKCFjb25kaXRpb25zKSByZXR1cm4gdHJ1ZTtcbiAgICBcbiAgICAvLyBDaGVjayBtaW5pbXVtIGNvbmZpZGVuY2VcbiAgICBpZiAoY29uZGl0aW9ucy5taW5Db25maWRlbmNlICYmIGNvbnRleHQuaW50ZW50LmNvbmZpZGVuY2UgPCBjb25kaXRpb25zLm1pbkNvbmZpZGVuY2UpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgcmVxdWlyZWQgZmllbGRzXG4gICAgaWYgKGNvbmRpdGlvbnMucmVxdWlyZWRGaWVsZHMpIHtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgY29uZGl0aW9ucy5yZXF1aXJlZEZpZWxkcykge1xuICAgICAgICBpZiAoIWNvbnRleHQuZXh0cmFjdGVkRGF0YVtmaWVsZF0pIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgYWxsb3dlZCBjaGFubmVsc1xuICAgIGlmIChjb25kaXRpb25zLmFsbG93ZWRDaGFubmVscyAmJiAhY29uZGl0aW9ucy5hbGxvd2VkQ2hhbm5lbHMuaW5jbHVkZXMoY29udGV4dC5jaGFubmVsLnNvdXJjZSkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgXG4gICAgLy8gQ2hlY2sgY3VzdG9tIGNvbmRpdGlvblxuICAgIGlmIChjb25kaXRpb25zLmN1c3RvbUNvbmRpdGlvbiAmJiAhY29uZGl0aW9ucy5jdXN0b21Db25kaXRpb24oY29udGV4dCkpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGFsbCByZWdpc3RlcmVkIGFjdGlvbnMgZm9yIGFuIGludGVudFxuICAgKi9cbiAgZ2V0QWN0aW9ucyhpbnRlbnRJZDogc3RyaW5nKTogSW50ZW50QWN0aW9uQ29uZmlnW10ge1xuICAgIHJldHVybiB0aGlzLmFjdGlvbnMuZ2V0KGludGVudElkKSB8fCBbXTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWxsIHJlZ2lzdGVyZWQgaW50ZW50IElEc1xuICAgKi9cbiAgZ2V0UmVnaXN0ZXJlZEludGVudHMoKTogc3RyaW5nW10ge1xuICAgIHJldHVybiBBcnJheS5mcm9tKHRoaXMuYWN0aW9ucy5rZXlzKCkpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhbGwgYWN0aW9ucyBmb3IgYW4gaW50ZW50XG4gICAqL1xuICBjbGVhckFjdGlvbnMoaW50ZW50SWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuYWN0aW9ucy5kZWxldGUoaW50ZW50SWQpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZSBhbGwgcmVnaXN0ZXJlZCBhY3Rpb25zIGFuZCBtaWRkbGV3YXJlXG4gICAqL1xuICBjbGVhckFsbCgpOiB2b2lkIHtcbiAgICB0aGlzLmFjdGlvbnMuY2xlYXIoKTtcbiAgICB0aGlzLmdsb2JhbE1pZGRsZXdhcmUubGVuZ3RoID0gMDtcbiAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQlVJTFQtSU4gQUNUSU9OIEhFTFBFUlNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogSGVscGVyIHRvIGNyZWF0ZSBjb21tb24gYWN0aW9uIHR5cGVzXG4gKi9cbmV4cG9ydCBjbGFzcyBJbnRlbnRBY3Rpb25IZWxwZXJzIHtcbiAgLyoqXG4gICAqIENyZWF0ZSBhIHdlYmhvb2sgYWN0aW9uIHRoYXQgcG9zdHMgdG8gYW4gZXh0ZXJuYWwgVVJMXG4gICAqL1xuICBzdGF0aWMgY3JlYXRlV2ViaG9va0FjdGlvbihjb25maWc6IHtcbiAgICBpZDogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICB1cmw6IHN0cmluZztcbiAgICBtZXRob2Q/OiAnUE9TVCcgfCAnUFVUJyB8ICdQQVRDSCc7XG4gICAgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgdHJhbnNmb3JtUGF5bG9hZD86IChjb250ZXh0OiBJbnRlbnRBY3Rpb25Db250ZXh0KSA9PiBhbnk7XG4gIH0pOiBJbnRlbnRBY3Rpb25Db25maWcge1xuICAgIHJldHVybiB7XG4gICAgICBpZDogY29uZmlnLmlkLFxuICAgICAgbmFtZTogY29uZmlnLm5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogYFdlYmhvb2sgdG8gJHtjb25maWcudXJsfWAsXG4gICAgICBoYW5kbGVyOiBhc3luYyAoY29udGV4dCkgPT4ge1xuICAgICAgICBjb25zdCBwYXlsb2FkID0gY29uZmlnLnRyYW5zZm9ybVBheWxvYWQgXG4gICAgICAgICAgPyBjb25maWcudHJhbnNmb3JtUGF5bG9hZChjb250ZXh0KVxuICAgICAgICAgIDoge1xuICAgICAgICAgICAgICBpbnRlbnQ6IGNvbnRleHQuaW50ZW50LFxuICAgICAgICAgICAgICBtZXNzYWdlOiBjb250ZXh0Lm1lc3NhZ2UsXG4gICAgICAgICAgICAgIGV4dHJhY3RlZERhdGE6IGNvbnRleHQuZXh0cmFjdGVkRGF0YSxcbiAgICAgICAgICAgICAgdXNlcjogY29udGV4dC51c2VyLFxuICAgICAgICAgICAgICB0ZW5hbnQ6IGNvbnRleHQudGVuYW50LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goY29uZmlnLnVybCwge1xuICAgICAgICAgIG1ldGhvZDogY29uZmlnLm1ldGhvZCB8fCAnUE9TVCcsXG4gICAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAgIC4uLmNvbmZpZy5oZWFkZXJzLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkocGF5bG9hZCksXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgV2ViaG9vayBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9YCk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGRhdGEgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgZGF0YTogZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+LFxuICAgICAgICAgIG1ldGFkYXRhOiB7XG4gICAgICAgICAgICB3ZWJob29rVXJsOiBjb25maWcudXJsLFxuICAgICAgICAgICAgc3RhdHVzQ29kZTogcmVzcG9uc2Uuc3RhdHVzLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGFuIEV2ZW50QnJpZGdlIGFjdGlvbiB0aGF0IHB1Ymxpc2hlcyBldmVudHNcbiAgICovXG4gIHN0YXRpYyBjcmVhdGVFdmVudEJyaWRnZUFjdGlvbihjb25maWc6IHtcbiAgICBpZDogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBldmVudEJ1c05hbWU/OiBzdHJpbmc7XG4gICAgc291cmNlOiBzdHJpbmc7XG4gICAgZGV0YWlsVHlwZTogc3RyaW5nO1xuICAgIHRyYW5zZm9ybURldGFpbD86IChjb250ZXh0OiBJbnRlbnRBY3Rpb25Db250ZXh0KSA9PiBhbnk7XG4gIH0pOiBJbnRlbnRBY3Rpb25Db25maWcge1xuICAgIHJldHVybiB7XG4gICAgICBpZDogY29uZmlnLmlkLFxuICAgICAgbmFtZTogY29uZmlnLm5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogYFB1Ymxpc2ggdG8gRXZlbnRCcmlkZ2U6ICR7Y29uZmlnLnNvdXJjZX1gLFxuICAgICAgYXN5bmM6IHRydWUsIC8vIEV2ZW50QnJpZGdlIGFjdGlvbnMgYXJlIHR5cGljYWxseSBhc3luY1xuICAgICAgaGFuZGxlcjogYXN5bmMgKGNvbnRleHQpID0+IHtcbiAgICAgICAgY29uc3QgeyBFdmVudEJyaWRnZUNsaWVudCwgUHV0RXZlbnRzQ29tbWFuZCB9ID0gYXdhaXQgaW1wb3J0KCdAYXdzLXNkay9jbGllbnQtZXZlbnRicmlkZ2UnKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBFdmVudEJyaWRnZUNsaWVudCh7fSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBkZXRhaWwgPSBjb25maWcudHJhbnNmb3JtRGV0YWlsXG4gICAgICAgICAgPyBjb25maWcudHJhbnNmb3JtRGV0YWlsKGNvbnRleHQpXG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICAgIGludGVudDogY29udGV4dC5pbnRlbnQsXG4gICAgICAgICAgICAgIG1lc3NhZ2U6IGNvbnRleHQubWVzc2FnZSxcbiAgICAgICAgICAgICAgZXh0cmFjdGVkRGF0YTogY29udGV4dC5leHRyYWN0ZWREYXRhLFxuICAgICAgICAgICAgICB1c2VyOiBjb250ZXh0LnVzZXIsXG4gICAgICAgICAgICAgIHRlbmFudDogY29udGV4dC50ZW5hbnQsXG4gICAgICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgYXdhaXQgY2xpZW50LnNlbmQobmV3IFB1dEV2ZW50c0NvbW1hbmQoe1xuICAgICAgICAgIEVudHJpZXM6IFt7XG4gICAgICAgICAgICBTb3VyY2U6IGNvbmZpZy5zb3VyY2UsXG4gICAgICAgICAgICBEZXRhaWxUeXBlOiBjb25maWcuZGV0YWlsVHlwZSxcbiAgICAgICAgICAgIERldGFpbDogSlNPTi5zdHJpbmdpZnkoZGV0YWlsKSxcbiAgICAgICAgICAgIC4uLihjb25maWcuZXZlbnRCdXNOYW1lICYmIHsgRXZlbnRCdXNOYW1lOiBjb25maWcuZXZlbnRCdXNOYW1lIH0pLFxuICAgICAgICAgIH1dLFxuICAgICAgICB9KSk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgIGV2ZW50U291cmNlOiBjb25maWcuc291cmNlLFxuICAgICAgICAgICAgZXZlbnREZXRhaWxUeXBlOiBjb25maWcuZGV0YWlsVHlwZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIER5bmFtb0RCIGFjdGlvbiB0aGF0IHN0b3JlcyBpbnRlbnQgZGF0YVxuICAgKi9cbiAgc3RhdGljIGNyZWF0ZUR5bmFtb0RCQWN0aW9uKGNvbmZpZzoge1xuICAgIGlkOiBzdHJpbmc7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHRhYmxlTmFtZTogc3RyaW5nO1xuICAgIHRyYW5zZm9ybUl0ZW0/OiAoY29udGV4dDogSW50ZW50QWN0aW9uQ29udGV4dCkgPT4gYW55O1xuICB9KTogSW50ZW50QWN0aW9uQ29uZmlnIHtcbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGNvbmZpZy5pZCxcbiAgICAgIG5hbWU6IGNvbmZpZy5uYW1lLFxuICAgICAgZGVzY3JpcHRpb246IGBTdG9yZSBpbiBEeW5hbW9EQjogJHtjb25maWcudGFibGVOYW1lfWAsXG4gICAgICBoYW5kbGVyOiBhc3luYyAoY29udGV4dCkgPT4ge1xuICAgICAgICBjb25zdCB7IER5bmFtb0RCQ2xpZW50IH0gPSBhd2FpdCBpbXBvcnQoJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicpO1xuICAgICAgICBjb25zdCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQgfSA9IGF3YWl0IGltcG9ydCgnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBjbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20obmV3IER5bmFtb0RCQ2xpZW50KHt9KSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBpdGVtID0gY29uZmlnLnRyYW5zZm9ybUl0ZW1cbiAgICAgICAgICA/IGNvbmZpZy50cmFuc2Zvcm1JdGVtKGNvbnRleHQpXG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICAgIHBrOiBgJHtjb250ZXh0LnRlbmFudC5pZH0jJHtjb250ZXh0LmludGVudC5pZH1gLFxuICAgICAgICAgICAgICBzazogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICBpbnRlbnRJZDogY29udGV4dC5pbnRlbnQuaWQsXG4gICAgICAgICAgICAgIG1lc3NhZ2U6IGNvbnRleHQubWVzc2FnZSxcbiAgICAgICAgICAgICAgZXh0cmFjdGVkRGF0YTogY29udGV4dC5leHRyYWN0ZWREYXRhLFxuICAgICAgICAgICAgICB1c2VyRW1haWw6IGNvbnRleHQudXNlci5lbWFpbCxcbiAgICAgICAgICAgICAgY29uZmlkZW5jZTogY29udGV4dC5pbnRlbnQuY29uZmlkZW5jZSxcbiAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICB9O1xuICAgICAgICBcbiAgICAgICAgYXdhaXQgY2xpZW50LnNlbmQobmV3IFB1dENvbW1hbmQoe1xuICAgICAgICAgIFRhYmxlTmFtZTogY29uZmlnLnRhYmxlTmFtZSxcbiAgICAgICAgICBJdGVtOiBpdGVtLFxuICAgICAgICB9KSk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgICAgZGF0YTogeyBpdGVtIH0sXG4gICAgICAgICAgbWV0YWRhdGE6IHtcbiAgICAgICAgICAgIHRhYmxlTmFtZTogY29uZmlnLnRhYmxlTmFtZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICB9O1xuICB9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBERUZBVUxUIFJFR0lTVFJZIElOU1RBTkNFXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIERlZmF1bHQgZ2xvYmFsIHJlZ2lzdHJ5IGluc3RhbmNlXG4gKiBDb25zdW1lcnMgY2FuIHVzZSB0aGlzIG9yIGNyZWF0ZSB0aGVpciBvd25cbiAqL1xuZXhwb3J0IGNvbnN0IGRlZmF1bHRJbnRlbnRBY3Rpb25SZWdpc3RyeSA9IG5ldyBJbnRlbnRBY3Rpb25SZWdpc3RyeSgpO1xuIl19