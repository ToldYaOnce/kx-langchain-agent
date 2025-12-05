import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { RemovalPolicy } from 'aws-cdk-lib';

/**
 * Configuration options for DynamoDB tables
 */
export interface DynamoDBTablesProps {
  /**
   * Name for the messages table
   * @default 'kxgen-messages'
   */
  messagesTableName?: string;

  /**
   * Name for the leads table
   * @default 'kxgen-leads'
   */
  leadsTableName?: string;

  /**
   * Name for the personas table
   * @default 'kxgen-personas'
   */
  personasTableName?: string;

  /**
   * Name for the agent workflow state table
   * @default 'KxGen-agent-workflow-state'
   */
  workflowStateTableName?: string;

  /**
   * Billing mode for all tables
   * @default dynamodb.BillingMode.PAY_PER_REQUEST
   */
  billingMode?: dynamodb.BillingMode;

  /**
   * Removal policy for tables (DESTROY for dev, RETAIN for prod)
   * @default RemovalPolicy.RETAIN
   */
  removalPolicy?: RemovalPolicy;

  /**
   * Enable point-in-time recovery
   * @default true
   */
  pointInTimeRecovery?: boolean;

  /**
   * Table class (STANDARD or STANDARD_INFREQUENT_ACCESS)
   * @default dynamodb.TableClass.STANDARD
   */
  tableClass?: dynamodb.TableClass;
}

/**
 * DynamoDB Tables construct for KxGen LangChain Agent
 * 
 * Creates all necessary DynamoDB tables with proper schemas, indexes, and documentation
 * for the LangChain agent system. This includes:
 * 
 * - Messages Table: Conversation history and agent responses
 * - Leads Table: Contact information and lead management
 * - Personas Table: Dynamic persona configurations
 * 
 * @example
 * ```typescript
 * const tables = new DynamoDBTables(this, 'AgentTables', {
 *   messagesTableName: 'my-app-messages',
 *   leadsTableName: 'my-app-leads',
 *   personasTableName: 'my-app-personas',
 *   billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
 *   removalPolicy: RemovalPolicy.DESTROY, // For dev environments
 * });
 * 
 * // Use in LangchainAgent construct
 * const agent = new LangchainAgent(this, 'Agent', {
 *   messagesTableName: tables.messagesTable.tableName,
 *   leadsTableName: tables.leadsTable.tableName,
 *   // ... other props
 * });
 * ```
 */
export class DynamoDBTables extends Construct {
  /**
   * Messages table for storing conversation history
   * 
   * **Schema:**
   * - PK: `tenantId#email_lc` (Contact identifier)
   * - SK: `ts` (Timestamp for message ordering)
   * 
   * **Global Secondary Indexes:**
   * - GSI1: Recent messages per tenant
   * - GSI2: Messages by lead ID
   * 
   * **Use Cases:**
   * - Store inbound/outbound messages
   * - Retrieve conversation history
   * - Query recent messages across tenants
   * - Track messages by lead
   */
  public readonly messagesTable: dynamodb.Table;

  /**
   * Leads table for contact management and phone→email resolution
   * 
   * **Schema:**
   * - PK: `tenantId#email_lc` (Primary contact identifier)
   * - SK: `PROFILE` (Sort key for contact profile)
   * 
   * **Global Secondary Indexes:**
   * - GSI1: Phone number lookup (`tenantId#phone` → contact)
   * - GSI2: Lead status and creation date queries
   * 
   * **Use Cases:**
   * - Resolve phone numbers to email addresses
   * - Store contact information and preferences
   * - Track lead status and qualification
   * - Query leads by various criteria
   */
  public readonly leadsTable: dynamodb.Table;

  /**
   * Personas table for dynamic AI personality configuration
   * 
   * **Schema:**
   * - PK: `tenantId#persona_id` (Persona identifier)
   * - SK: `CONFIG` (Sort key for persona configuration)
   * 
   * **Global Secondary Indexes:**
   * - GSI1: Active personas per tenant
   * - GSI2: Persona templates and sharing
   * 
   * **Use Cases:**
   * - Store dynamic persona configurations
   * - Manage company-specific AI personalities
   * - Version control for persona changes
   * - Share persona templates across tenants
   */
  public readonly personasTable: dynamodb.Table;

  /**
   * Agent workflow state table for conversation state management
   * 
   * **Schema:**
   * - PK: `channelId` (Channel identifier)
   * - SK: `createdAt` (Timestamp for state versioning)
   * 
   * **Purpose:**
   * This table is OWNED by the agent service and stores workflow state
   * separately from the channels table (owned by kx-notifications-messaging).
   * This eliminates cross-package dependencies.
   * 
   * **Stored Data:**
   * - Active goals
   * - Completed goals
   * - Captured data from conversations
   * - Contact capture status (email, phone, name)
   * - Message count
   * - Workflow progress
   * 
   * **Use Cases:**
   * - Track goal progression in conversations
   * - Store captured data until ready to create lead
   * - Resume conversations after interruptions
   * - Query workflow state for analytics
   */
  public readonly workflowStateTable: dynamodb.Table;

  // NOTE: Channels table is owned by kx-notifications-and-messaging stack
  // Reference it via LangchainAgent's existingTables prop instead

  constructor(scope: Construct, id: string, props: DynamoDBTablesProps = {}) {
    super(scope, id);

    const {
      messagesTableName = 'kxgen-messages',
      leadsTableName = 'kxgen-leads',
      personasTableName = 'kxgen-personas',
      workflowStateTableName = 'KxGen-agent-workflow-state',
      billingMode = dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy = RemovalPolicy.RETAIN,
      pointInTimeRecovery = true,
      tableClass = dynamodb.TableClass.STANDARD,
    } = props;

    // Common table configuration
    const commonProps = {
      billingMode,
      removalPolicy,
      pointInTimeRecovery,
      tableClass,
    };

    // Messages Table
    this.messagesTable = new dynamodb.Table(this, 'MessagesTable', {
      ...commonProps,
      tableName: messagesTableName,
      partitionKey: {
        name: 'contact_pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'ts',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Messages Table GSI1: Recent messages per tenant
    this.messagesTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK', // tenantId
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK', // ts (timestamp)
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Messages Table GSI2: Messages by lead ID
    this.messagesTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK', // lead_id
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK', // ts (timestamp)
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Leads Table
    this.leadsTable = new dynamodb.Table(this, 'LeadsTable', {
      ...commonProps,
      tableName: leadsTableName,
      partitionKey: {
        name: 'contact_pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Leads Table GSI1: Phone number lookup
    this.leadsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK', // tenantId#phone
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK', // PHONE_LOOKUP
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Leads Table GSI2: Lead status queries
    this.leadsTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK', // tenantId#status
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK', // created_at
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Personas Table
    this.personasTable = new dynamodb.Table(this, 'PersonasTable', {
      ...commonProps,
      tableName: personasTableName,
      partitionKey: {
        name: 'persona_pk',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Personas Table GSI1: Active personas per tenant
    this.personasTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK', // tenantId
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK', // status#updated_at
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Personas Table GSI2: Persona templates
    this.personasTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK', // TEMPLATE#category
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK', // popularity_score
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Agent Workflow State Table
    this.workflowStateTable = new dynamodb.Table(this, 'WorkflowStateTable', {
      ...commonProps,
      tableName: workflowStateTableName,
      partitionKey: {
        name: 'channelId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Workflow State Table GSI1: Query by tenant
    this.workflowStateTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK', // tenantId
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK', // lastUpdated
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Workflow State Table GSI2: Query by goal status
    this.workflowStateTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK', // tenantId#goalId
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK', // messageCount
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // NOTE: Channels table is NOT created here - it's owned by kx-notifications-and-messaging
    // This stack references it via existingTables prop in LangchainAgent construct

    // Add tags for better resource management
    const tables = [this.messagesTable, this.leadsTable, this.personasTable, this.workflowStateTable];
    tables.forEach(table => {
      table.node.addMetadata('component', 'kxgen-langchain-agent');
      table.node.addMetadata('purpose', 'AI agent data storage');
    });
  }

  /**
   * Get all table names as a convenient object
   * 
   * @returns Object containing all table names
   */
  public getTableNames(): {
    messages: string;
    leads: string;
    personas: string;
    workflowState: string;
  } {
    return {
      messages: this.messagesTable.tableName,
      leads: this.leadsTable.tableName,
      personas: this.personasTable.tableName,
      workflowState: this.workflowStateTable.tableName,
    };
  }

  /**
   * Get all table ARNs for IAM policy creation
   * 
   * @returns Array of table ARNs including indexes
   */
  public getTableArns(): string[] {
    const arns: string[] = [];
    
    // Add table ARNs (channels table excluded - owned by kx-notifications-and-messaging)
    arns.push(this.messagesTable.tableArn);
    arns.push(this.leadsTable.tableArn);
    arns.push(this.personasTable.tableArn);
    arns.push(this.workflowStateTable.tableArn);
    
    // Add GSI ARNs
    arns.push(`${this.messagesTable.tableArn}/index/*`);
    arns.push(`${this.leadsTable.tableArn}/index/*`);
    arns.push(`${this.personasTable.tableArn}/index/*`);
    arns.push(`${this.workflowStateTable.tableArn}/index/*`);
    
    return arns;
  }
}

