import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import type { ChannelItem } from '../types/index.js';
import type { TenantId, Timestamp } from '../types/dynamodb-schemas.js';

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
export class MessageTrackingService {
  private docClient: DynamoDBDocumentClient;
  private channelsTable: string;
  private ttlSeconds: number;
  private readonly ACTIVE_RESPONSE_KEY = 'ACTIVE_RESPONSE';

  constructor(docClient: DynamoDBDocumentClient, channelsTable: string, ttlSeconds: number = 300) {
    this.docClient = docClient;
    this.channelsTable = channelsTable;
    this.ttlSeconds = ttlSeconds; // Default 5 minutes
  }

  /**
   * Start tracking a new response
   * 
   * @param tenantId - Tenant identifier
   * @param channelId - Channel identifier
   * @param senderId - User/sender identifier
   * @param stateSnapshot - Optional state snapshot for rollback
   * @returns messageId - Unique identifier for this response
   */
  async startTracking(
    tenantId: TenantId,
    channelId: string,
    senderId: string,
    stateSnapshot?: StateSnapshot
  ): Promise<string> {
    const messageId = ulid();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + this.ttlSeconds;

    const trackingItem: ChannelItem = {
      channelId,
      createdAt: this.ACTIVE_RESPONSE_KEY, // Special key for message tracking
      tenantId,
      messageId,
      senderId,
      startedAt: now,
      stateSnapshot,
      ttl,
      updated_at: now,
    };

    await this.docClient.send(new PutCommand({
      TableName: this.channelsTable,
      Item: trackingItem,
    }));

    console.log(`✅ Started tracking response: ${messageId} for channel ${channelId}`);
    return messageId;
  }

  /**
   * Check if a response is still valid (not interrupted)
   * 
   * @param tenantId - Tenant identifier
   * @param channelId - Channel identifier
   * @param messageId - Message ID to validate
   * @returns true if this is still the active response, false if interrupted
   */
  async isResponseValid(
    tenantId: TenantId,
    channelId: string,
    messageId: string
  ): Promise<boolean> {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.channelsTable,
      Key: {
        channelId,
        createdAt: this.ACTIVE_RESPONSE_KEY,
      },
    }));

    if (!result.Item) {
      console.log(`⚠️ No active response found for channel ${channelId}`);
      return false;
    }

    const currentMessageId = (result.Item as ChannelItem).messageId;
    const isValid = currentMessageId === messageId;

    if (!isValid) {
      console.log(`❌ STALE CHUNK: Expected ${messageId}, but current is ${currentMessageId}`);
    } else {
      console.log(`✅ Valid chunk: ${messageId} matches current response`);
    }

    return isValid;
  }

  /**
   * Get the state snapshot for rollback
   * 
   * @param tenantId - Tenant identifier
   * @param channelId - Channel identifier
   * @returns StateSnapshot if exists, undefined otherwise
   */
  async getStateSnapshot(
    tenantId: TenantId,
    channelId: string
  ): Promise<StateSnapshot | undefined> {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.channelsTable,
      Key: {
        channelId,
        createdAt: this.ACTIVE_RESPONSE_KEY,
      },
    }));

    return (result.Item as ChannelItem | undefined)?.stateSnapshot;
  }

  /**
   * Clear tracking for a channel (response completed or interrupted)
   * 
   * @param tenantId - Tenant identifier
   * @param channelId - Channel identifier
   */
  async clearTracking(
    tenantId: TenantId,
    channelId: string
  ): Promise<void> {
    await this.docClient.send(new DeleteCommand({
      TableName: this.channelsTable,
      Key: {
        channelId,
        createdAt: this.ACTIVE_RESPONSE_KEY,
      },
    }));

    console.log(`🧹 Cleared response tracking for channel ${channelId}`);
  }

  /**
   * Get the current active message ID for a channel
   * 
   * @param tenantId - Tenant identifier
   * @param channelId - Channel identifier
   * @returns messageId if exists, undefined otherwise
   */
  async getCurrentMessageId(
    tenantId: TenantId,
    channelId: string
  ): Promise<string | undefined> {
    const result = await this.docClient.send(new GetCommand({
      TableName: this.channelsTable,
      Key: {
        channelId,
        createdAt: this.ACTIVE_RESPONSE_KEY,
      },
    }));

    return (result.Item as ChannelItem | undefined)?.messageId;
  }
}

