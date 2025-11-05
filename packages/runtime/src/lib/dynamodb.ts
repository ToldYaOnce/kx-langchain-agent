import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import type { MessageItem, LeadItem, RuntimeConfig } from '../types/index.js';

export class DynamoDBService {
  private client: DynamoDBDocumentClient;
  private config: RuntimeConfig;

  constructor(config: RuntimeConfig) {
    this.config = config;
    
    const dynamoClient = new DynamoDBClient({
      region: config.awsRegion,
      ...(config.dynamodbEndpoint && { endpoint: config.dynamodbEndpoint }),
    });
    
    this.client = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  /**
   * Create contact primary key from tenantId and email_lc
   */
  static createContactPK(tenantId: string, emailLc: string): string {
    return `${tenantId}#${emailLc}`;
  }

  /**
   * Generate timestamp-based sort key using ULID
   */
  static generateTimestampSK(): string {
    return ulid();
  }

  /**
   * Convert ULID to ISO8601 timestamp
   */
  static ulidToTimestamp(ulidStr: string): string {
    try {
      // ULID first 10 characters represent timestamp in base32
      const timestamp = parseInt(ulidStr.substring(0, 10), 36);
      return new Date(timestamp).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Put a message item to the messages table
   */
  async putMessage(message: Omit<MessageItem, 'contact_pk' | 'ts' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'>): Promise<MessageItem> {
    const ts = DynamoDBService.generateTimestampSK();
    const contact_pk = DynamoDBService.createContactPK(message.tenantId, message.email_lc);
    
    const item: MessageItem = {
      tenantId: message.tenantId,
      email_lc: message.email_lc,
      source: message.source,
      direction: message.direction,
      text: message.text,
      conversation_id: message.conversation_id,
      meta: message.meta,
      contact_pk,
      ts,
      GSI1PK: message.tenantId, // For recent messages per tenant
      GSI1SK: ts,
    };

    // Only add optional fields if they exist
    if (message.lead_id) {
      item.lead_id = message.lead_id;
      item.GSI2PK = message.lead_id;
      item.GSI2SK = ts;
    }
    if (message.channel_context) {
      item.channel_context = message.channel_context;
    }

    await this.client.send(new PutCommand({
      TableName: this.config.messagesTable,
      Item: item,
    }));

    return item;
  }

  /**
   * Query messages for a contact (tenantId + email_lc)
   */
  async getMessageHistory(
    tenantId: string,
    emailLc: string,
    options: {
      limit?: number;
      exclusiveStartKey?: Record<string, any>;
      scanIndexForward?: boolean;
    } = {}
  ): Promise<{
    items: MessageItem[];
    lastEvaluatedKey?: Record<string, any>;
  }> {
    const contact_pk = DynamoDBService.createContactPK(tenantId, emailLc);
    
    const result = await this.client.send(new QueryCommand({
      TableName: this.config.messagesTable,
      KeyConditionExpression: 'contact_pk = :pk',
      ExpressionAttributeValues: {
        ':pk': contact_pk,
      },
      Limit: options.limit || this.config.historyLimit,
      ExclusiveStartKey: options.exclusiveStartKey,
      ScanIndexForward: options.scanIndexForward ?? false, // Most recent first
    }));

    return {
      items: (result.Items || []) as MessageItem[],
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Query recent messages per tenant (GSI1)
   */
  async getRecentMessagesByTenant(
    tenantId: string,
    options: {
      limit?: number;
      exclusiveStartKey?: Record<string, any>;
    } = {}
  ): Promise<{
    items: MessageItem[];
    lastEvaluatedKey?: Record<string, any>;
  }> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.config.messagesTable,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': tenantId,
      },
      Limit: options.limit || 100,
      ExclusiveStartKey: options.exclusiveStartKey,
      ScanIndexForward: false, // Most recent first
    }));

    return {
      items: (result.Items || []) as MessageItem[],
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Get lead by tenantId and email_lc
   */
  async getLead(tenantId: string, emailLc: string): Promise<LeadItem | null> {
    const result = await this.client.send(new GetCommand({
      TableName: this.config.leadsTable,
      Key: {
        PK: tenantId,
        SK: emailLc,
      },
    }));

    return result.Item as LeadItem || null;
  }

  /**
   * Query leads by phone number (assuming GSI on phone_e164)
   */
  async getLeadByPhone(tenantId: string, phoneE164: string): Promise<LeadItem | null> {
    // This assumes there's a GSI on the leads table with phone_e164
    // The exact implementation depends on your existing leads table structure
    const result = await this.client.send(new QueryCommand({
      TableName: this.config.leadsTable,
      IndexName: 'PhoneIndex', // Adjust based on your actual GSI name
      KeyConditionExpression: 'PK = :tenantId AND phone_e164 = :phone',
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':phone': phoneE164,
      },
      Limit: 1,
    }));

    const items = result.Items as LeadItem[];
    return items?.[0] || null;
  }

  /**
   * Resolve contact info from phone number
   * Returns email_lc if lead found, null otherwise
   */
  async resolveContactFromPhone(tenantId: string, phoneE164: string): Promise<string | null> {
    const lead = await this.getLeadByPhone(tenantId, phoneE164);
    return lead?.email_lc || null;
  }
}
