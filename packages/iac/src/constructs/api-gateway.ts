import { Construct } from 'constructs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Duration } from 'aws-cdk-lib';
import * as path from 'path';

/**
 * Configuration for the API Gateway construct
 */
export interface ApiGatewayProps {
  /**
   * DynamoDB table names for agent data
   */
  tableNames: {
    messagesTable: string;
    leadsTable: string;
    personasTable?: string;
  };

  /**
   * Bedrock model ID for AI processing
   */
  bedrockModelId: string;

  /**
   * Optional EventBridge bus ARN for publishing events
   */
  eventBusArn?: string;

  /**
   * Optional cross-account role ARN for EventBridge PutEvents
   */
  putEventsRoleArn?: string;

  /**
   * Optional history limit for chat memory (default: 50)
   */
  historyLimit?: number;

  /**
   * API Gateway configuration
   */
  apiConfig?: {
    /**
     * API name
     * @default 'kxgen-langchain-agent-api'
     */
    apiName?: string;

    /**
     * API description
     * @default 'KxGen LangChain Agent Chat API'
     */
    description?: string;

    /**
     * CORS configuration
     * @default Allows all origins, headers, and methods
     */
    corsConfiguration?: apigatewayv2.CorsPreflightOptions;

    /**
     * Custom domain configuration
     */
    domainName?: string;

    /**
     * Stage name
     * @default 'prod'
     */
    stageName?: string;

    /**
     * Enable access logging
     * @default true
     */
    enableAccessLogging?: boolean;

    /**
     * Throttling configuration
     */
    throttling?: {
      rateLimit?: number;
      burstLimit?: number;
    };
  };

  /**
   * Lambda function configuration overrides
   */
  lambdaConfig?: {
    /**
     * Memory size in MB
     * @default 1024
     */
    memorySize?: number;

    /**
     * Timeout duration
     * @default Duration.seconds(30)
     */
    timeout?: Duration;

    /**
     * Environment variables to add
     */
    environment?: Record<string, string>;
  };
}

/**
 * API Gateway construct for synchronous chat interactions with the LangChain agent
 * 
 * Creates an HTTP API (API Gateway V2) with Lambda integration for real-time chat.
 * Perfect for chat widgets, mobile apps, and any synchronous messaging interface.
 * 
 * @example
 * ```typescript
 * const chatApi = new ApiGateway(this, 'ChatApi', {
 *   tableNames: {
 *     messagesTable: 'my-messages',
 *     leadsTable: 'my-leads',
 *     personasTable: 'my-personas',
 *   },
 *   bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
 *   apiConfig: {
 *     apiName: 'my-chat-api',
 *     domainName: 'chat.mycompany.com',
 *     corsConfiguration: {
 *       allowOrigins: ['https://mycompany.com'],
 *       allowMethods: [apigatewayv2.CorsHttpMethod.POST],
 *     },
 *   },
 * });
 * 
 * // Get the API URL
 * console.log('Chat API URL:', chatApi.apiUrl);
 * ```
 */
export class ApiGateway extends Construct {
  /**
   * The HTTP API Gateway instance
   */
  public readonly httpApi: apigatewayv2.HttpApi;

  /**
   * The Lambda function handling chat requests
   */
  public readonly chatFunction: nodejs.NodejsFunction;

  /**
   * The Lambda function handling health checks
   */
  public readonly healthFunction: nodejs.NodejsFunction;

  /**
   * The API URL for making requests
   */
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    const {
      tableNames,
      bedrockModelId,
      eventBusArn,
      putEventsRoleArn,
      historyLimit = 50,
      apiConfig = {},
      lambdaConfig = {},
    } = props;

    // Find the runtime package path
    const runtimePackagePath = this.findRuntimePackagePath();

    // Common environment variables
    const commonEnv = {
      MESSAGES_TABLE: tableNames.messagesTable,
      LEADS_TABLE: tableNames.leadsTable,
      ...(tableNames.personasTable && { PERSONAS_TABLE: tableNames.personasTable }),
      BEDROCK_MODEL_ID: bedrockModelId,
      ...(eventBusArn && { OUTBOUND_EVENT_BUS_ARN: eventBusArn }),
      ...(putEventsRoleArn && { EVENT_BUS_PUT_EVENTS_ROLE_ARN: putEventsRoleArn }),
      HISTORY_LIMIT: historyLimit.toString(),
      ...lambdaConfig.environment,
    };

    // Common Lambda configuration
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: lambdaConfig.timeout || Duration.seconds(30),
      memorySize: lambdaConfig.memorySize || 1024,
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
          '@aws-sdk/client-bedrock-runtime',
        ],
      },
    };

    // Chat Lambda Function
    this.chatFunction = new nodejs.NodejsFunction(this, 'ChatFunction', {
      ...commonLambdaProps,
      entry: path.join(runtimePackagePath, 'src/handlers/api-gateway.ts'),
      handler: 'handler',
      description: 'Handles synchronous chat requests via API Gateway',
      functionName: `${id}-chat-handler`,
    });

    // Health Check Lambda Function
    this.healthFunction = new nodejs.NodejsFunction(this, 'HealthFunction', {
      ...commonLambdaProps,
      entry: path.join(runtimePackagePath, 'src/handlers/api-gateway.ts'),
      handler: 'healthHandler',
      description: 'Health check endpoint for API Gateway',
      functionName: `${id}-health-handler`,
      timeout: Duration.seconds(5), // Health checks should be fast
      memorySize: 256, // Health checks need minimal memory
    });

    // Setup IAM permissions
    this.setupIamPermissions(tableNames, bedrockModelId, eventBusArn);

    // Create HTTP API
    this.httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: apiConfig.apiName || 'kxgen-langchain-agent-api',
      description: apiConfig.description || 'KxGen LangChain Agent Chat API',
      corsPreflight: apiConfig.corsConfiguration || {
        allowOrigins: ['*'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        maxAge: Duration.hours(1),
      },
    });

    // Create Lambda integrations
    const chatIntegration = new integrations.HttpLambdaIntegration(
      'ChatIntegration',
      this.chatFunction,
      {
        payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
      }
    );

    const healthIntegration = new integrations.HttpLambdaIntegration(
      'HealthIntegration',
      this.healthFunction,
      {
        payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
      }
    );

    // Add routes
    this.httpApi.addRoutes({
      path: '/chat',
      methods: [apigatewayv2.HttpMethod.POST, apigatewayv2.HttpMethod.OPTIONS],
      integration: chatIntegration,
    });

    this.httpApi.addRoutes({
      path: '/health',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: healthIntegration,
    });

    // Configure throttling if specified
    if (apiConfig.throttling) {
      // Note: API Gateway V2 throttling is configured at the stage level
      // For more granular throttling, use usage plans with API keys
      console.warn('Throttling configuration detected but not implemented - use AWS Console or CLI to configure throttling for API Gateway V2');
    }

    // Enable access logging if requested
    if (apiConfig.enableAccessLogging !== false) {
      const accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
        logGroupName: `/aws/apigateway/${this.httpApi.apiId}/access-logs`,
        retention: logs.RetentionDays.ONE_WEEK,
      });

      const stage = this.httpApi.defaultStage as apigatewayv2.HttpStage;
      stage.node.addDependency(accessLogGroup);
    }

    // Set API URL
    this.apiUrl = this.httpApi.url!;

    // Add tags for resource management
    [this.chatFunction, this.healthFunction].forEach(fn => {
      fn.node.addMetadata('component', 'kxgen-langchain-agent-api');
      fn.node.addMetadata('purpose', 'Synchronous chat API');
    });
  }

  /**
   * Find the runtime package path for Lambda bundling
   */
  private findRuntimePackagePath(): string {
    // This assumes the IaC package is in packages/iac and runtime is in packages/runtime
    // Adjust the path based on your actual monorepo structure
    return path.resolve(__dirname, '../../../runtime');
  }

  /**
   * Setup IAM permissions for Lambda functions
   */
  private setupIamPermissions(
    tableNames: { messagesTable: string; leadsTable: string; personasTable?: string },
    bedrockModelId: string,
    eventBusArn?: string
  ): void {
    // DynamoDB permissions
    const tableArns = [
      `arn:aws:dynamodb:*:*:table/${tableNames.messagesTable}`,
      `arn:aws:dynamodb:*:*:table/${tableNames.messagesTable}/index/*`,
      `arn:aws:dynamodb:*:*:table/${tableNames.leadsTable}`,
      `arn:aws:dynamodb:*:*:table/${tableNames.leadsTable}/index/*`,
    ];

    if (tableNames.personasTable) {
      tableArns.push(
        `arn:aws:dynamodb:*:*:table/${tableNames.personasTable}`,
        `arn:aws:dynamodb:*:*:table/${tableNames.personasTable}/index/*`
      );
    }

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
        `arn:aws:bedrock:*::foundation-model/${bedrockModelId}`,
        'arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v1',
      ],
    });

    // Apply permissions to chat function (health function doesn't need these)
    this.chatFunction.addToRolePolicy(dynamoPolicy);
    this.chatFunction.addToRolePolicy(bedrockPolicy);

    // EventBridge permissions (optional)
    if (eventBusArn) {
      const eventBridgePolicy = new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['events:PutEvents'],
        resources: [eventBusArn],
      });
      this.chatFunction.addToRolePolicy(eventBridgePolicy);
    }
  }

  /**
   * Get the chat endpoint URL
   */
  public getChatEndpoint(): string {
    return `${this.apiUrl}chat`;
  }

  /**
   * Get the health check endpoint URL
   */
  public getHealthEndpoint(): string {
    return `${this.apiUrl}health`;
  }
}
