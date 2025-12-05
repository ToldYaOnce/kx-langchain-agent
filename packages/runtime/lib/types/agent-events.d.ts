/**
 * Agent Service Event Schemas
 *
 * These events are emitted by the agent service to communicate
 * workflow state changes, goal progress, and data collection.
 *
 * Event Naming Convention: agent.<entity>.<action>
 */
/**
 * Base event structure - all agent events extend this
 */
export interface AgentEventBase {
    /** Channel ID (also used as lead ID when lead is created) */
    channelId: string;
    /** Tenant ID */
    tenantId: string;
    /** ISO timestamp */
    timestamp: string;
    /** Event version for schema evolution */
    version: string;
}
/**
 * Emitted when a goal is activated
 * EventBridge: agent.goal.activated
 */
export interface GoalActivatedEvent extends AgentEventBase {
    /** Unique goal ID */
    goalId: string;
    /** Human-readable goal name */
    goalName: string;
    /** Goal type */
    goalType: 'data_collection' | 'scheduling' | 'conversation';
    /** Goal priority */
    priority: 'critical' | 'high' | 'medium' | 'low';
    /** Goal order in workflow */
    order: number;
    /** What data fields this goal will collect (if data_collection type) */
    fieldsToCapture?: string[];
    /** Why this goal was activated */
    activationReason: {
        /** Which trigger caused activation */
        trigger: 'messageCount' | 'afterGoals' | 'userSignals';
        /** Details about the trigger */
        details: string;
    };
}
/**
 * Emitted when a goal is completed
 * EventBridge: agent.goal.completed
 */
export interface GoalCompletedEvent extends AgentEventBase {
    /** Unique goal ID */
    goalId: string;
    /** Human-readable goal name */
    goalName: string;
    /** Goal type */
    goalType: 'data_collection' | 'scheduling' | 'conversation';
    /** Data captured during this goal */
    capturedData: Record<string, any>;
    /** How many attempts it took to complete */
    attemptCount: number;
    /** How many messages since goal activation */
    messagesSinceActivation: number;
}
/**
 * Emitted when any data field is captured
 * EventBridge: agent.data.captured
 */
export interface DataCapturedEvent extends AgentEventBase {
    /** The field name that was captured */
    fieldName: string;
    /** The captured value */
    fieldValue: any;
    /** Which goal this data belongs to */
    goalId: string;
    /** Data type */
    dataType: 'string' | 'number' | 'boolean' | 'object' | 'array';
    /** Validation status */
    validated: boolean;
    /** Validation errors if any */
    validationErrors?: string[];
}
/**
 * Emitted when workflow state is updated
 * EventBridge: agent.workflow.state_updated
 */
export interface WorkflowStateUpdatedEvent extends AgentEventBase {
    /** Currently active goals */
    activeGoals: string[];
    /** Completed goals */
    completedGoals: string[];
    /** Total messages in conversation */
    messageCount: number;
    /** All captured data so far */
    capturedData: Record<string, any>;
    /** Contact info capture status */
    contactStatus: {
        isEmailCaptured: boolean;
        isPhoneCaptured: boolean;
        isFirstNameCaptured: boolean;
        isLastNameCaptured: boolean;
    };
    /** What changed in this update */
    changes: {
        goalsActivated: string[];
        goalsCompleted: string[];
        dataCaptured: string[];
    };
}
/**
 * Emitted when a lead is created from anonymous channel
 * EventBridge: lead.created
 *
 * Note: This is triggered by goal completion with action type "convert_anonymous_to_lead"
 */
export interface LeadCreatedEvent extends AgentEventBase {
    /** Lead ID (same as channelId) */
    leadId: string;
    /** Source of lead */
    source: 'chat_agent' | 'web_form' | 'phone' | 'other';
    /** Lead type for segmentation */
    leadType: string;
    /** Contact information */
    contactInfo: {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
    };
    /** All captured data from workflow */
    capturedData: Record<string, any>;
    /** Which goals were completed when lead was created */
    completedGoals: string[];
    /** Conversation metadata */
    conversationMetadata: {
        messageCount: number;
        durationMinutes: number;
        firstMessageTimestamp: string;
    };
}
/**
 * Emitted when an appointment is requested
 * EventBridge: appointment.requested
 *
 * Note: This is triggered by goal completion with action type "trigger_scheduling_flow"
 */
export interface AppointmentRequestedEvent extends AgentEventBase {
    /** Lead ID (if lead exists) */
    leadId?: string;
    /** Type of appointment */
    appointmentType: string;
    /** Requested date */
    requestedDate?: string;
    /** Requested time */
    requestedTime?: string;
    /** Duration in minutes */
    duration?: number;
    /** Additional appointment details */
    details?: Record<string, any>;
    /** Which goal triggered this */
    goalId: string;
}
/**
 * Emitted when user shows interest in something
 * EventBridge: agent.interest.detected
 */
export interface InterestDetectedEvent extends AgentEventBase {
    /** Lead ID (if lead exists) */
    leadId?: string;
    /** What they're interested in */
    interestCategory: string;
    /** Strength of interest signal */
    strength: 'weak' | 'medium' | 'strong';
    /** What triggered the interest detection */
    signal: {
        type: 'keyword' | 'question' | 'request' | 'repetition';
        value: string;
    };
    /** Context from the message */
    context: string;
}
/**
 * Emitted when user declines or shows negative sentiment
 * EventBridge: agent.objection.detected
 */
export interface ObjectionDetectedEvent extends AgentEventBase {
    /** Lead ID (if lead exists) */
    leadId?: string;
    /** Type of objection */
    objectionType: 'price' | 'time' | 'interest' | 'other';
    /** The actual objection text */
    objectionText: string;
    /** Which goal was active when objection occurred */
    goalId?: string;
    /** Severity */
    severity: 'low' | 'medium' | 'high';
}
/**
 * Emitted when workflow encounters an error
 * EventBridge: agent.workflow.error
 */
export interface WorkflowErrorEvent extends AgentEventBase {
    /** Error type */
    errorType: 'data_extraction' | 'goal_orchestration' | 'llm_failure' | 'system';
    /** Error message */
    errorMessage: string;
    /** Which goal was active */
    activeGoalId?: string;
    /** Stack trace (for debugging) */
    stackTrace?: string;
    /** Is this recoverable? */
    recoverable: boolean;
}
/**
 * Union type of all agent events
 */
export type AgentEvent = GoalActivatedEvent | GoalCompletedEvent | DataCapturedEvent | WorkflowStateUpdatedEvent | LeadCreatedEvent | AppointmentRequestedEvent | InterestDetectedEvent | ObjectionDetectedEvent | WorkflowErrorEvent;
/**
 * Event type discriminator
 */
export type AgentEventType = 'agent.goal.activated' | 'agent.goal.completed' | 'agent.data.captured' | 'agent.workflow.state_updated' | 'lead.created' | 'appointment.requested' | 'agent.interest.detected' | 'agent.objection.detected' | 'agent.workflow.error';
/**
 * Helper to create properly structured events
 */
export declare class AgentEventFactory {
    static createGoalActivated(channelId: string, tenantId: string, goalId: string, goalName: string, goalType: 'data_collection' | 'scheduling' | 'conversation', priority: 'critical' | 'high' | 'medium' | 'low', order: number, activationReason: {
        trigger: string;
        details: string;
    }, fieldsToCapture?: string[]): GoalActivatedEvent;
    static createGoalCompleted(channelId: string, tenantId: string, goalId: string, goalName: string, goalType: 'data_collection' | 'scheduling' | 'conversation', capturedData: Record<string, any>, attemptCount: number, messagesSinceActivation: number): GoalCompletedEvent;
    static createDataCaptured(channelId: string, tenantId: string, fieldName: string, fieldValue: any, goalId: string, validated?: boolean, validationErrors?: string[]): DataCapturedEvent;
    static createWorkflowStateUpdated(channelId: string, tenantId: string, activeGoals: string[], completedGoals: string[], messageCount: number, capturedData: Record<string, any>, changes: {
        goalsActivated: string[];
        goalsCompleted: string[];
        dataCaptured: string[];
    }): WorkflowStateUpdatedEvent;
    static createLeadCreated(channelId: string, tenantId: string, source: string, leadType: string, contactInfo: {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
    }, capturedData: Record<string, any>, completedGoals: string[], messageCount: number, firstMessageTimestamp: string): LeadCreatedEvent;
}
