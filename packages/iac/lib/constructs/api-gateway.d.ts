import { Construct } from 'constructs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Duration } from 'aws-cdk-lib';
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
export declare class ApiGateway extends Construct {
    /**
     * The HTTP API Gateway instance
     */
    readonly httpApi: apigatewayv2.HttpApi;
    /**
     * The Lambda function handling chat requests
     */
    readonly chatFunction: nodejs.NodejsFunction;
    /**
     * The Lambda function handling health checks
     */
    readonly healthFunction: nodejs.NodejsFunction;
    /**
     * The API URL for making requests
     */
    readonly apiUrl: string;
    constructor(scope: Construct, id: string, props: ApiGatewayProps);
    /**
     * Find the runtime package path for Lambda bundling
     */
    private findRuntimePackagePath;
    /**
     * Setup IAM permissions for Lambda functions
     */
    private setupIamPermissions;
    /**
     * Get the chat endpoint URL
     */
    getChatEndpoint(): string;
    /**
     * Get the health check endpoint URL
     */
    getHealthEndpoint(): string;
}
