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

// =============================================================================
// TYPES
// =============================================================================

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
export type IntentActionHandler = (
  context: IntentActionContext
) => Promise<IntentActionResult>;

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

// =============================================================================
// INTENT ACTION REGISTRY
// =============================================================================

/**
 * Registry for intent actions that consumers can customize
 */
export class IntentActionRegistry {
  private actions = new Map<string, IntentActionConfig[]>();
  private globalMiddleware: IntentActionHandler[] = [];

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
  registerAction(intentId: string, config: IntentActionConfig): void {
    if (!this.actions.has(intentId)) {
      this.actions.set(intentId, []);
    }
    
    const actions = this.actions.get(intentId)!;
    actions.push(config);
    
    // Sort by priority (higher first)
    actions.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Register multiple actions at once
   * 
   * @param actionsMap Map of intent ID to action configs
   */
  registerActions(actionsMap: Record<string, IntentActionConfig | IntentActionConfig[]>): void {
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
  registerMiddleware(middleware: IntentActionHandler): void {
    this.globalMiddleware.push(middleware);
  }

  /**
   * Execute actions for a detected intent
   * 
   * @param context Intent action context
   * @returns Combined results from all executed actions
   */
  async executeActions(context: IntentActionContext): Promise<IntentActionResult[]> {
    const results: IntentActionResult[] = [];
    
    // Run global middleware first
    for (const middleware of this.globalMiddleware) {
      try {
        const result = await middleware(context);
        results.push(result);
        
        // If middleware says to stop processing, return early
        if (!result.continueProcessing) {
          return results;
        }
      } catch (error) {
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
        let result: IntentActionResult;
        
        if (actionConfig.async) {
          // Fire and forget for async actions
          actionConfig.handler(context).catch(error => {
            console.error(`Async intent action error (${actionConfig.id}):`, error);
          });
          
          result = {
            success: true,
            metadata: { executedAsync: true, actionId: actionConfig.id },
          };
        } else {
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
        
      } catch (error) {
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
  private shouldExecuteAction(config: IntentActionConfig, context: IntentActionContext): boolean {
    const conditions = config.conditions;
    if (!conditions) return true;
    
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
  getActions(intentId: string): IntentActionConfig[] {
    return this.actions.get(intentId) || [];
  }

  /**
   * Get all registered intent IDs
   */
  getRegisteredIntents(): string[] {
    return Array.from(this.actions.keys());
  }

  /**
   * Remove all actions for an intent
   */
  clearActions(intentId: string): void {
    this.actions.delete(intentId);
  }

  /**
   * Remove all registered actions and middleware
   */
  clearAll(): void {
    this.actions.clear();
    this.globalMiddleware.length = 0;
  }
}

// =============================================================================
// BUILT-IN ACTION HELPERS
// =============================================================================

/**
 * Helper to create common action types
 */
export class IntentActionHelpers {
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
  }): IntentActionConfig {
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
          data: data as Record<string, any>,
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
  static createEventBridgeAction(config: {
    id: string;
    name: string;
    eventBusName?: string;
    source: string;
    detailType: string;
    transformDetail?: (context: IntentActionContext) => any;
  }): IntentActionConfig {
    return {
      id: config.id,
      name: config.name,
      description: `Publish to EventBridge: ${config.source}`,
      async: true, // EventBridge actions are typically async
      handler: async (context) => {
        const { EventBridgeClient, PutEventsCommand } = await import('@aws-sdk/client-eventbridge');
        
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
  static createDynamoDBAction(config: {
    id: string;
    name: string;
    tableName: string;
    transformItem?: (context: IntentActionContext) => any;
  }): IntentActionConfig {
    return {
      id: config.id,
      name: config.name,
      description: `Store in DynamoDB: ${config.tableName}`,
      handler: async (context) => {
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
        
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

// =============================================================================
// DEFAULT REGISTRY INSTANCE
// =============================================================================

/**
 * Default global registry instance
 * Consumers can use this or create their own
 */
export const defaultIntentActionRegistry = new IntentActionRegistry();
