import { Construct } from 'constructs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Duration } from 'aws-cdk-lib';
import * as path from 'path';
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
export class LangchainAgent extends Construct {
  public readonly agentRouterFunction: nodejs.NodejsFunction;
  public readonly agentFunction: nodejs.NodejsFunction;
  public readonly indexerFunction?: nodejs.NodejsFunction;
  public readonly dynamoDBTables?: DynamoDBTables;
  
  constructor(scope: Construct, id: string, props: LangchainAgentProps) {
    super(scope, id);
    
    // Resolve EventBridge bus
    const eventBus = typeof props.eventBus === 'string' 
      ? events.EventBus.fromEventBusArn(this, 'EventBus', props.eventBus)
      : props.eventBus;

    // Create or use existing DynamoDB tables
    let messagesTableName: string;
    let leadsTableName: string;
    let personasTableName: string;

    if (props.existingTables) {
      // Use existing tables
      messagesTableName = props.existingTables.messagesTableName;
      leadsTableName = props.existingTables.leadsTableName;
      personasTableName = props.existingTables.personasTableName || 'kxgen-personas';
    } else {
      // Create new tables
      this.dynamoDBTables = new DynamoDBTables(this, 'Tables', props.dynamoDBTablesProps);
      const tableNames = this.dynamoDBTables.getTableNames();
      messagesTableName = tableNames.messages;
      leadsTableName = tableNames.leads;
      personasTableName = tableNames.personas;
    }
    
    // Common environment variables
    const commonEnv = {
      MESSAGES_TABLE: messagesTableName,
      LEADS_TABLE: leadsTableName,
      PERSONAS_TABLE: personasTableName,
      BEDROCK_MODEL_ID: props.bedrockModelId,
      OUTBOUND_EVENT_BUS_NAME: eventBus.eventBusName,
      OUTBOUND_EVENT_BUS_ARN: eventBus.eventBusArn,
      RAG_INDEX_NAME_PREFIX: props.ragIndexNamePrefix || 'kxgen_',
      HISTORY_LIMIT: (props.historyLimit || 50).toString(),
      ...(props.putEventsRoleArn && { EVENT_BUS_PUT_EVENTS_ROLE_ARN: props.putEventsRoleArn }),
    };
    
    // Common Lambda configuration
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.minutes(5),
      memorySize: 512,
      environment: commonEnv,
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: 'es2022',
        platform: 'node',
        mainFields: ['module', 'main'],
        conditions: ['import', 'module'],
        banner: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
        externalModules: [
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-eventbridge',
        ],
      },
    };
    
    // Find the runtime package path
    const runtimePackagePath = this.findRuntimePackagePath();
    
    // Agent Router Function
    this.agentRouterFunction = new nodejs.NodejsFunction(this, 'AgentRouterFunction', {
      ...commonLambdaProps,
      functionName: `${id}-agent-router`,
      description: 'Routes inbound messages and invokes agent processing',
      entry: path.join(runtimePackagePath, 'src/handlers/router.ts'),
      handler: 'handler',
      role: new iam.Role(this, 'AgentRouterRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
        roleName: `${id}-agent-router-role`, // Explicit physical name
      }),
    });
    
    // Agent Function
    this.agentFunction = new nodejs.NodejsFunction(this, 'AgentFunction', {
      ...commonLambdaProps,
      functionName: `${id}-agent`,
      description: 'Processes messages with LangChain and generates responses',
      entry: path.join(runtimePackagePath, 'src/handlers/agent.ts'),
      handler: 'handler',
      timeout: Duration.minutes(10), // Longer timeout for LLM processing
      memorySize: 1024, // More memory for LangChain
      role: new iam.Role(this, 'AgentRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
        roleName: `${id}-agent-role`, // Explicit physical name
      }),
    });
    
    // Optional Indexer Function for RAG
    if (props.opensearchCollectionArn) {
      this.indexerFunction = new nodejs.NodejsFunction(this, 'IndexerFunction', {
        ...commonLambdaProps,
        functionName: `${id}-indexer`,
        description: 'Indexes documents for RAG retrieval',
        entry: path.join(runtimePackagePath, 'src/handlers/indexer.ts'),
        handler: 'handler',
        environment: {
          ...commonEnv,
          OPENSEARCH_COLLECTION_ARN: props.opensearchCollectionArn,
        },
        role: new iam.Role(this, 'IndexerRole', {
          assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
          ],
          roleName: `${id}-indexer-role`, // Explicit physical name
        }),
      });
    }
    
    // IAM permissions
    // Get table ARNs for IAM permissions
    const tableArns = this.dynamoDBTables 
      ? this.dynamoDBTables.getTableArns()
      : [
          `arn:aws:dynamodb:*:*:table/${messagesTableName}`,
          `arn:aws:dynamodb:*:*:table/${messagesTableName}/index/*`,
          `arn:aws:dynamodb:*:*:table/${leadsTableName}`,
          `arn:aws:dynamodb:*:*:table/${leadsTableName}/index/*`,
          `arn:aws:dynamodb:*:*:table/${personasTableName}`,
          `arn:aws:dynamodb:*:*:table/${personasTableName}/index/*`,
        ];

    this.setupIamPermissions(props, eventBus, tableArns);
    
    // EventBridge rules
    this.setupEventBridgeRules(eventBus);
  }
  
  /**
   * Find the runtime package path relative to this construct
   */
  private findRuntimePackagePath(): string {
    // Use require.resolve to find the runtime package root, then navigate to src/handlers
    try {
      const packageJsonPath = require.resolve('@toldyaonce/kx-langchain-agent-runtime/package.json');
      return path.dirname(packageJsonPath);
    } catch (error) {
      // Fallback to relative path for development
      return path.resolve(__dirname, '../../../runtime');
    }
  }
  
  /**
   * Setup IAM permissions for Lambda functions
   */
  private setupIamPermissions(props: LangchainAgentProps, eventBus: events.IEventBus, tableArns: string[]): void {
    // DynamoDB permissions
    const dynamoPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:Query',
        'dynamodb:UpdateItem',
        'dynamodb:BatchGetItem',
        'dynamodb:BatchWriteItem',
      ],
      resources: tableArns,
    });
    
    // Bedrock permissions
    const bedrockPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        `arn:aws:bedrock:*::foundation-model/${props.bedrockModelId}`,
        'arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v1',
      ],
    });
    
    // EventBridge permissions
    const eventBridgePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['events:PutEvents'],
      resources: [eventBus.eventBusArn],
    });
    
    // Apply permissions to functions
    [this.agentRouterFunction, this.agentFunction].forEach(fn => {
      fn.role!.addToPrincipalPolicy(dynamoPolicy);
      fn.role!.addToPrincipalPolicy(bedrockPolicy);
      fn.role!.addToPrincipalPolicy(eventBridgePolicy);
    });
    
    // OpenSearch permissions for indexer
    if (this.indexerFunction && props.opensearchCollectionArn) {
      const opensearchPolicy = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'aoss:APIAccessAll',
          'aoss:DashboardsAccessAll',
        ],
        resources: [props.opensearchCollectionArn],
      });
      
      this.indexerFunction.role!.addToPrincipalPolicy(opensearchPolicy);
      this.indexerFunction.role!.addToPrincipalPolicy(dynamoPolicy);
      this.indexerFunction.role!.addToPrincipalPolicy(eventBridgePolicy);
    }
    
    // Lambda invoke permissions (for router to invoke agent)
    this.agentFunction.grantInvoke(this.agentRouterFunction);
  }
  
  /**
   * Setup EventBridge rules to trigger Lambda functions
   */
  private setupEventBridgeRules(eventBus: events.IEventBus): void {
    // Rule for inbound messages (transformed format)
    new events.Rule(this, 'InboundMessageRule', {
      eventBus,
      description: 'Route inbound lead messages to agent router',
      eventPattern: {
        source: ['kxgen.messaging'],
        detailType: ['lead.message.created'],
      },
      targets: [new targets.LambdaFunction(this.agentRouterFunction)],
    });

    // // Rule for direct chat messages (for testing/compatibility)
    // new events.Rule(this, 'ChatMessageRule', {
    //   eventBus,
    //   description: 'Route chat messages directly to agent router',
    //   eventPattern: {
    //     source: ['kx-event-tracking'],
    //     detailType: ['chat.message'],
    //     detail: {
    //       $or: [
    //         { isBot: [true] },
    //         { channelType: ['lead'] },
    //         { recipientType: ['bot'] }
    //       ]
    //     }
    //   },
    //   targets: [new targets.LambdaFunction(this.agentRouterFunction)],
    // });

    // Rule for chat.message.available from kx-notifications-messaging
    new events.Rule(this, 'ChatMessageAvailableRule', {
      eventBus,
      description: 'Route chat.message.available events to agent router',
      eventPattern: {
        source: ['kx-notifications-messaging'],
        detailType: ['chat.message.available']
      },
      targets: [new targets.LambdaFunction(this.agentRouterFunction)],
    });
  }

  /**
   * Get the physical names/ARNs for cross-environment references
   */
  public getPhysicalNames() {
    return {
      agentRouterFunctionArn: this.agentRouterFunction.functionArn,
      agentRouterFunctionName: this.agentRouterFunction.functionName,
      agentRouterRoleArn: this.agentRouterFunction.role?.roleArn,
      agentFunctionArn: this.agentFunction.functionArn,
      agentFunctionName: this.agentFunction.functionName,
      agentRoleArn: this.agentFunction.role?.roleArn,
      indexerFunctionArn: this.indexerFunction?.functionArn,
      indexerFunctionName: this.indexerFunction?.functionName,
      indexerRoleArn: this.indexerFunction?.role?.roleArn,
    };
  }

  /**
   * Static method to import Lambda functions from ARNs for cross-environment references
   */
  public static importFromArns(scope: Construct, id: string, arns: {
    agentRouterFunctionArn: string;
    agentFunctionArn: string;
    indexerFunctionArn?: string;
  }) {
    return {
      agentRouterFunction: lambda.Function.fromFunctionArn(scope, `${id}-AgentRouter`, arns.agentRouterFunctionArn),
      agentFunction: lambda.Function.fromFunctionArn(scope, `${id}-Agent`, arns.agentFunctionArn),
      indexerFunction: arns.indexerFunctionArn 
        ? lambda.Function.fromFunctionArn(scope, `${id}-Indexer`, arns.indexerFunctionArn)
        : undefined,
    };
  }
}
