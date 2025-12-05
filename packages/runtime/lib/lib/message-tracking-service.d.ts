import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { TenantId } from '../types/dynamodb-schemas.js';
/**
 * State snapshot for rollback on message interruption
 */
export interface StateSnapshot {
    attemptCounts: Record<string, number>;
    capturedData: Record<string, any>;
    activeGoals: string[];
    completedGoals: string[];
    messageCount: number;
}
/**
 * MessageTrackingService - manages active response tracking for interruption handling
 *
 * Enables graceful interruption of multi-chunk agent responses when user sends a new message.
 * Uses the existing kx-channels table with a special createdAt value ("ACTIVE_RESPONSE").
 * TTL enabled for automatic cleanup.
 */
export declare class MessageTrackingService {
    private docClient;
    private channelsTable;
    private ttlSeconds;
    private readonly ACTIVE_RESPONSE_KEY;
    constructor(docClient: DynamoDBDocumentClient, channelsTable: string, ttlSeconds?: number);
    /**
     * Start tracking a new response
     *
     * @param tenantId - Tenant identifier
     * @param channelId - Channel identifier
     * @param senderId - User/sender identifier
     * @param stateSnapshot - Optional state snapshot for rollback
     * @returns messageId - Unique identifier for this response
     */
    startTracking(tenantId: TenantId, channelId: string, senderId: string, stateSnapshot?: StateSnapshot): Promise<string>;
    /**
     * Check if a response is still valid (not interrupted)
     *
     * @param tenantId - Tenant identifier
     * @param channelId - Channel identifier
     * @param messageId - Message ID to validate
     * @returns true if this is still the active response, false if interrupted
     */
    isResponseValid(tenantId: TenantId, channelId: string, messageId: string): Promise<boolean>;
    /**
     * Get the state snapshot for rollback
     *
     * @param tenantId - Tenant identifier
     * @param channelId - Channel identifier
     * @returns StateSnapshot if exists, undefined otherwise
     */
    getStateSnapshot(tenantId: TenantId, channelId: string): Promise<StateSnapshot | undefined>;
    /**
     * Clear tracking for a channel (response completed or interrupted)
     *
     * @param tenantId - Tenant identifier
     * @param channelId - Channel identifier
     */
    clearTracking(tenantId: TenantId, channelId: string): Promise<void>;
    /**
     * Get the current active message ID for a channel
     *
     * @param tenantId - Tenant identifier
     * @param channelId - Channel identifier
     * @returns messageId if exists, undefined otherwise
     */
    getCurrentMessageId(tenantId: TenantId, channelId: string): Promise<string | undefined>;
}
