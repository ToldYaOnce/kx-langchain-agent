import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { DynamoDBTables, type DynamoDBTablesProps } from './dynamodb-tables.js';
export interface LangchainAgentProps {
    /**
     * Injected EventBridge bus (IEventBus or ARN string)
     */
    eventBus: events.IEventBus | string;
    /**
     * Bedrock model ID (e.g., Claude Sonnet)
     */
    bedrockModelId: string;
    /**
     * Optional OpenSearch Serverless collection ARN for RAG
     */
    opensearchCollectionArn?: string;
    /**
     * Optional cross-account role ARN for EventBridge PutEvents
     */
    putEventsRoleArn?: string;
    /**
     * Optional prefix for RAG index names (default: "kxgen_")
     */
    ragIndexNamePrefix?: string;
    /**
     * Optional history limit for chat memory (default: 50)
     */
    historyLimit?: number;
    /**
     * DynamoDB tables configuration
     * If not provided, tables will be created with default settings
     */
    dynamoDBTablesProps?: DynamoDBTablesProps;
    /**
     * Existing DynamoDB tables (alternative to creating new ones)
     * If provided, dynamoDBTablesProps will be ignored
     */
    existingTables?: {
        messagesTableName: string;
        leadsTableName: string;
        personasTableName?: string;
    };
}
/**
 * LangChain Agent construct that creates Lambda functions and EventBridge rules
 */
export declare class LangchainAgent extends Construct {
    readonly agentRouterFunction: nodejs.NodejsFunction;
    readonly agentFunction: nodejs.NodejsFunction;
    readonly indexerFunction?: nodejs.NodejsFunction;
    readonly dynamoDBTables?: DynamoDBTables;
    constructor(scope: Construct, id: string, props: LangchainAgentProps);
    /**
     * Find the runtime package path relative to this construct
     */
    private findRuntimePackagePath;
    /**
     * Setup IAM permissions for Lambda functions
     */
    private setupIamPermissions;
    /**
     * Setup EventBridge rules to trigger Lambda functions
     */
    private setupEventBridgeRules;
}
