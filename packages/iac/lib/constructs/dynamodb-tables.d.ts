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
export declare class DynamoDBTables extends Construct {
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
    readonly messagesTable: dynamodb.Table;
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
    readonly leadsTable: dynamodb.Table;
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
    readonly personasTable: dynamodb.Table;
    constructor(scope: Construct, id: string, props?: DynamoDBTablesProps);
    /**
     * Get all table names as a convenient object
     *
     * @returns Object containing all table names
     */
    getTableNames(): {
        messages: string;
        leads: string;
        personas: string;
    };
    /**
     * Get all table ARNs for IAM policy creation
     *
     * @returns Array of table ARNs including indexes
     */
    getTableArns(): string[];
}
