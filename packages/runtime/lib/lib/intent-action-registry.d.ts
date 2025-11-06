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
import type { AgentContext } from '../types/index.js';
/**
 * Context provided to intent action handlers
 */
export interface IntentActionContext {
    /** The detected intent information */
    intent: {
        id: string;
        name: string;
        confidence: number;
        matchedTriggers: string[];
    };
    /** Original agent context */
    agentContext: AgentContext;
    /** User's original message */
    message: string;
    /** Extracted data from the message (email, phone, name, etc.) */
    extractedData: Record<string, any>;
    /** Conversation metadata */
    conversation: {
        id?: string;
        sessionId?: string;
        messageCount: number;
        history?: string[];
    };
    /** User information */
    user: {
        email?: string;
        phone?: string;
        name?: string;
        leadId?: string;
    };
    /** Tenant/company information */
    tenant: {
        id: string;
        companyInfo?: Record<string, any>;
    };
    /** Channel-specific context */
    channel: {
        source: string;
        context?: Record<string, any>;
    };
}
/**
 * Result returned by intent action handlers
 */
export interface IntentActionResult {
    /** Whether the action succeeded */
    success: boolean;
    /** Optional response message to send to user */
    message?: string;
    /** Data returned by the action (for logging, analytics, etc.) */
    data?: Record<string, any>;
    /** Error information if action failed */
    error?: {
        code: string;
        message: string;
        details?: any;
    };
    /** Whether to continue with normal agent processing */
    continueProcessing?: boolean;
    /** Additional metadata */
    metadata?: Record<string, any>;
}
/**
 * Intent action handler function type
 */
export type IntentActionHandler = (context: IntentActionContext) => Promise<IntentActionResult>;
/**
 * Configuration for registering an intent action
 */
export interface IntentActionConfig {
    /** Unique identifier for this action */
    id: string;
    /** Human-readable name */
    name: string;
    /** Description of what this action does */
    description: string;
    /** The action handler function */
    handler: IntentActionHandler;
    /** Whether this action should run asynchronously (don't wait for result) */
    async?: boolean;
    /** Priority for execution order (higher = earlier) */
    priority?: number;
    /** Conditions for when this action should run */
    conditions?: {
        /** Minimum confidence threshold */
        minConfidence?: number;
        /** Required extracted data fields */
        requiredFields?: string[];
        /** Allowed channels */
        allowedChannels?: string[];
        /** Custom condition function */
        customCondition?: (context: IntentActionContext) => boolean;
    };
}
/**
 * Registry for intent actions that consumers can customize
 */
export declare class IntentActionRegistry {
    private actions;
    private globalMiddleware;
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
    registerAction(intentId: string, config: IntentActionConfig): void;
    /**
     * Register multiple actions at once
     *
     * @param actionsMap Map of intent ID to action configs
     */
    registerActions(actionsMap: Record<string, IntentActionConfig | IntentActionConfig[]>): void;
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
    registerMiddleware(middleware: IntentActionHandler): void;
    /**
     * Execute actions for a detected intent
     *
     * @param context Intent action context
     * @returns Combined results from all executed actions
     */
    executeActions(context: IntentActionContext): Promise<IntentActionResult[]>;
    /**
     * Check if an action should be executed based on its conditions
     */
    private shouldExecuteAction;
    /**
     * Get all registered actions for an intent
     */
    getActions(intentId: string): IntentActionConfig[];
    /**
     * Get all registered intent IDs
     */
    getRegisteredIntents(): string[];
    /**
     * Remove all actions for an intent
     */
    clearActions(intentId: string): void;
    /**
     * Remove all registered actions and middleware
     */
    clearAll(): void;
}
/**
 * Helper to create common action types
 */
export declare class IntentActionHelpers {
    /**
     * Create a webhook action that posts to an external URL
     */
    static createWebhookAction(config: {
        id: string;
        name: string;
        url: string;
        method?: 'POST' | 'PUT' | 'PATCH';
        headers?: Record<string, string>;
        transformPayload?: (context: IntentActionContext) => any;
    }): IntentActionConfig;
    /**
     * Create an EventBridge action that publishes events
     */
    static createEventBridgeAction(config: {
        id: string;
        name: string;
        eventBusName?: string;
        source: string;
        detailType: string;
        transformDetail?: (context: IntentActionContext) => any;
    }): IntentActionConfig;
    /**
     * Create a DynamoDB action that stores intent data
     */
    static createDynamoDBAction(config: {
        id: string;
        name: string;
        tableName: string;
        transformItem?: (context: IntentActionContext) => any;
    }): IntentActionConfig;
}
/**
 * Default global registry instance
 * Consumers can use this or create their own
 */
export declare const defaultIntentActionRegistry: IntentActionRegistry;
