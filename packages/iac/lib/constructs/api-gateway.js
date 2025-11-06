"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiGateway = void 0;
const constructs_1 = require("constructs");
const apigatewayv2 = __importStar(require("aws-cdk-lib/aws-apigatewayv2"));
const integrations = __importStar(require("aws-cdk-lib/aws-apigatewayv2-integrations"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const nodejs = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const aws_cdk_lib_1 = require("aws-cdk-lib");
const path = __importStar(require("path"));
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
class ApiGateway extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        const { tableNames, bedrockModelId, eventBusArn, putEventsRoleArn, historyLimit = 50, apiConfig = {}, lambdaConfig = {}, } = props;
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
            timeout: lambdaConfig.timeout || aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(5), // Health checks should be fast
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
                maxAge: aws_cdk_lib_1.Duration.hours(1),
            },
        });
        // Create Lambda integrations
        const chatIntegration = new integrations.HttpLambdaIntegration('ChatIntegration', this.chatFunction, {
            payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
        });
        const healthIntegration = new integrations.HttpLambdaIntegration('HealthIntegration', this.healthFunction, {
            payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
        });
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
            const stage = this.httpApi.defaultStage;
            stage.node.addDependency(accessLogGroup);
        }
        // Set API URL
        this.apiUrl = this.httpApi.url;
        // Add tags for resource management
        [this.chatFunction, this.healthFunction].forEach(fn => {
            fn.node.addMetadata('component', 'kxgen-langchain-agent-api');
            fn.node.addMetadata('purpose', 'Synchronous chat API');
        });
    }
    /**
     * Find the runtime package path for Lambda bundling
     */
    findRuntimePackagePath() {
        // This assumes the IaC package is in packages/iac and runtime is in packages/runtime
        // Adjust the path based on your actual monorepo structure
        return path.resolve(__dirname, '../../../runtime');
    }
    /**
     * Setup IAM permissions for Lambda functions
     */
    setupIamPermissions(tableNames, bedrockModelId, eventBusArn) {
        // DynamoDB permissions
        const tableArns = [
            `arn:aws:dynamodb:*:*:table/${tableNames.messagesTable}`,
            `arn:aws:dynamodb:*:*:table/${tableNames.messagesTable}/index/*`,
            `arn:aws:dynamodb:*:*:table/${tableNames.leadsTable}`,
            `arn:aws:dynamodb:*:*:table/${tableNames.leadsTable}/index/*`,
        ];
        if (tableNames.personasTable) {
            tableArns.push(`arn:aws:dynamodb:*:*:table/${tableNames.personasTable}`, `arn:aws:dynamodb:*:*:table/${tableNames.personasTable}/index/*`);
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
    getChatEndpoint() {
        return `${this.apiUrl}chat`;
    }
    /**
     * Get the health check endpoint URL
     */
    getHealthEndpoint() {
        return `${this.apiUrl}health`;
    }
}
exports.ApiGateway = ApiGateway;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWdhdGV3YXkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29uc3RydWN0cy9hcGktZ2F0ZXdheS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyQ0FBdUM7QUFDdkMsMkVBQTZEO0FBQzdELHdGQUEwRTtBQUMxRSwrREFBaUQ7QUFDakQsc0VBQXdEO0FBQ3hELHlEQUEyQztBQUMzQywyREFBNkM7QUFDN0MsNkNBQXVDO0FBQ3ZDLDJDQUE2QjtBQTBHN0I7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0E0Qkc7QUFDSCxNQUFhLFVBQVcsU0FBUSxzQkFBUztJQXFCdkMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFDSixVQUFVLEVBQ1YsY0FBYyxFQUNkLFdBQVcsRUFDWCxnQkFBZ0IsRUFDaEIsWUFBWSxHQUFHLEVBQUUsRUFDakIsU0FBUyxHQUFHLEVBQUUsRUFDZCxZQUFZLEdBQUcsRUFBRSxHQUNsQixHQUFHLEtBQUssQ0FBQztRQUVWLGdDQUFnQztRQUNoQyxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBRXpELCtCQUErQjtRQUMvQixNQUFNLFNBQVMsR0FBRztZQUNoQixjQUFjLEVBQUUsVUFBVSxDQUFDLGFBQWE7WUFDeEMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxVQUFVO1lBQ2xDLEdBQUcsQ0FBQyxVQUFVLENBQUMsYUFBYSxJQUFJLEVBQUUsY0FBYyxFQUFFLFVBQVUsQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUM3RSxnQkFBZ0IsRUFBRSxjQUFjO1lBQ2hDLEdBQUcsQ0FBQyxXQUFXLElBQUksRUFBRSxzQkFBc0IsRUFBRSxXQUFXLEVBQUUsQ0FBQztZQUMzRCxHQUFHLENBQUMsZ0JBQWdCLElB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LENBQUM7WUFDSCxJQUFJLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSSxlQUFlO1FBQ3BCLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxNQUFNLENBQUM7SUFDOUIsQ0FBQztJQUVEOztPQUVHO0lBQ0ksaUJBQWlCO1FBQ3RCLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxRQUFRLENBQUM7SUFDaEMsQ0FBQztDQUNGO0FBL1BELGdDQStQQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheXYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5djInO1xuaW1wb3J0ICogYXMgaW50ZWdyYXRpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5djItaW50ZWdyYXRpb25zJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIG5vZGVqcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqcyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCB7IER1cmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIGZvciB0aGUgQVBJIEdhdGV3YXkgY29uc3RydWN0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXBpR2F0ZXdheVByb3BzIHtcbiAgLyoqXG4gICAqIER5bmFtb0RCIHRhYmxlIG5hbWVzIGZvciBhZ2VudCBkYXRhXG4gICAqL1xuICB0YWJsZU5hbWVzOiB7XG4gICAgbWVzc2FnZXNUYWJsZTogc3RyaW5nO1xuICAgIGxlYWRzVGFibGU6IHN0cmluZztcbiAgICBwZXJzb25hc1RhYmxlPzogc3RyaW5nO1xuICB9O1xuXG4gIC8qKlxuICAgKiBCZWRyb2NrIG1vZGVsIElEIGZvciBBSSBwcm9jZXNzaW5nXG4gICAqL1xuICBiZWRyb2NrTW9kZWxJZDogc3RyaW5nO1xuXG4gIC8qKlxuICAgKiBPcHRpb25hbCBFdmVudEJyaWRnZSBidXMgQVJOIGZvciBwdWJsaXNoaW5nIGV2ZW50c1xuICAgKi9cbiAgZXZlbnRCdXNBcm4/OiBzdHJpbmc7XG5cbiAgLyoqXG4gICAqIE9wdGlvbmFsIGNyb3NzLWFjY291bnQgcm9sZSBBUk4gZm9yIEV2ZW50QnJpZGdlIFB1dEV2ZW50c1xuICAgKi9cbiAgcHV0RXZlbnRzUm9sZUFybj86IHN0cmluZztcblxuICAvKipcbiAgICogT3B0aW9uYWwgaGlzdG9yeSBsaW1pdCBmb3IgY2hhdCBtZW1vcnkgKGRlZmF1bHQ6IDUwKVxuICAgKi9cbiAgaGlzdG9yeUxpbWl0PzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBBUEkgR2F0ZXdheSBjb25maWd1cmF0aW9uXG4gICAqL1xuICBhcGlDb25maWc/OiB7XG4gICAgLyoqXG4gICAgICogQVBJIG5hbWVcbiAgICAgKiBAZGVmYXVsdCAna3hnZW4tbGFuZ2NoYWluLWFnZW50LWFwaSdcbiAgICAgKi9cbiAgICBhcGlOYW1lPzogc3RyaW5nO1xuXG4gICAgLyoqXG4gICAgICogQVBJIGRlc2NyaXB0aW9uXG4gICAgICogQGRlZmF1bHQgJ0t4R2VuIExhbmdDaGFpbiBBZ2VudCBDaGF0IEFQSSdcbiAgICAgKi9cbiAgICBkZXNjcmlwdGlvbj86IHN0cmluZztcblxuICAgIC8qKlxuICAgICAqIENPUlMgY29uZmlndXJhdGlvblxuICAgICAqIEBkZWZhdWx0IEFsbG93cyBhbGwgb3JpZ2lucywgaGVhZGVycywgYW5kIG1ldGhvZHNcbiAgICAgKi9cbiAgICBjb3JzQ29uZmlndXJhdGlvbj86IGFwaWdhdGV3YXl2Mi5Db3JzUHJlZmxpZ2h0T3B0aW9ucztcblxuICAgIC8qKlxuICAgICAqIEN1c3RvbSBkb21haW4gY29uZmlndXJhdGlvblxuICAgICAqL1xuICAgIGRvbWFpbk5hbWU/OiBzdHJpbmc7XG5cbiAgICAvKipcbiAgICAgKiBTdGFnZSBuYW1lXG4gICAgICogQGRlZmF1bHQgJ3Byb2QnXG4gICAgICovXG4gICAgc3RhZ2VOYW1lPzogc3RyaW5nO1xuXG4gICAgLyoqXG4gICAgICogRW5hYmxlIGFjY2VzcyBsb2dnaW5nXG4gICAgICogQGRlZmF1bHQgdHJ1ZVxuICAgICAqL1xuICAgIGVuYWJsZUFjY2Vzc0xvZ2dpbmc/OiBib29sZWFuO1xuXG4gICAgLyoqXG4gICAgICogVGhyb3R0bGluZyBjb25maWd1cmF0aW9uXG4gICAgICovXG4gICAgdGhyb3R0bGluZz86IHtcbiAgICAgIHJhdGVMaW1pdD86IG51bWJlcjtcbiAgICAgIGJ1cnN0TGltaXQ/OiBudW1iZXI7XG4gICAgfTtcbiAgfTtcblxuICAvKipcbiAgICogTGFtYmRhIGZ1bmN0aW9uIGNvbmZpZ3VyYXRpb24gb3ZlcnJpZGVzXG4gICAqL1xuICBsYW1iZGFDb25maWc/OiB7XG4gICAgLyoqXG4gICAgICogTWVtb3J5IHNpemUgaW4gTUJcbiAgICAgKiBAZGVmYXVsdCAxMDI0XG4gICAgICovXG4gICAgbWVtb3J5U2l6ZT86IG51bWJlcjtcblxuICAgIC8qKlxuICAgICAqIFRpbWVvdXQgZHVyYXRpb25cbiAgICAgKiBAZGVmYXVsdCBEdXJhdGlvbi5zZWNvbmRzKDMwKVxuICAgICAqL1xuICAgIHRpbWVvdXQ/OiBEdXJhdGlvbjtcblxuICAgIC8qKlxuICAgICAqIEVudmlyb25tZW50IHZhcmlhYmxlcyB0byBhZGRcbiAgICAgKi9cbiAgICBlbnZpcm9ubWVudD86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gIH07XG59XG5cbi8qKlxuICogQVBJIEdhdGV3YXkgY29uc3RydWN0IGZvciBzeW5jaHJvbm91cyBjaGF0IGludGVyYWN0aW9ucyB3aXRoIHRoZSBMYW5nQ2hhaW4gYWdlbnRcbiAqIFxuICogQ3JlYXRlcyBhbiBIVFRQIEFQSSAoQVBJIEdhdGV3YXkgVjIpIHdpdGggTGFtYmRhIGludGVncmF0aW9uIGZvciByZWFsLXRpbWUgY2hhdC5cbiAqIFBlcmZlY3QgZm9yIGNoYXQgd2lkZ2V0cywgbW9iaWxlIGFwcHMsIGFuZCBhbnkgc3luY2hyb25vdXMgbWVzc2FnaW5nIGludGVyZmFjZS5cbiAqIFxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IGNoYXRBcGkgPSBuZXcgQXBpR2F0ZXdheSh0aGlzLCAnQ2hhdEFwaScsIHtcbiAqICAgdGFibGVOYW1lczoge1xuICogICAgIG1lc3NhZ2VzVGFibGU6ICdteS1tZXNzYWdlcycsXG4gKiAgICAgbGVhZHNUYWJsZTogJ215LWxlYWRzJyxcbiAqICAgICBwZXJzb25hc1RhYmxlOiAnbXktcGVyc29uYXMnLFxuICogICB9LFxuICogICBiZWRyb2NrTW9kZWxJZDogJ2FudGhyb3BpYy5jbGF1ZGUtMy1zb25uZXQtMjAyNDAyMjktdjE6MCcsXG4gKiAgIGFwaUNvbmZpZzoge1xuICogICAgIGFwaU5hbWU6ICdteS1jaGF0LWFwaScsXG4gKiAgICAgZG9tYWluTmFtZTogJ2NoYXQubXljb21wYW55LmNvbScsXG4gKiAgICAgY29yc0NvbmZpZ3VyYXRpb246IHtcbiAqICAgICAgIGFsbG93T3JpZ2luczogWydodHRwczovL215Y29tcGFueS5jb20nXSxcbiAqICAgICAgIGFsbG93TWV0aG9kczogW2FwaWdhdGV3YXl2Mi5Db3JzSHR0cE1ldGhvZC5QT1NUXSxcbiAqICAgICB9LFxuICogICB9LFxuICogfSk7XG4gKiBcbiAqIC8vIEdldCB0aGUgQVBJIFVSTFxuICogY29uc29sZS5sb2coJ0NoYXQgQVBJIFVSTDonLCBjaGF0QXBpLmFwaVVybCk7XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIEFwaUdhdGV3YXkgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICAvKipcbiAgICogVGhlIEhUVFAgQVBJIEdhdGV3YXkgaW5zdGFuY2VcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBodHRwQXBpOiBhcGlnYXRld2F5djIuSHR0cEFwaTtcblxuICAvKipcbiAgICogVGhlIExhbWJkYSBmdW5jdGlvbiBoYW5kbGluZyBjaGF0IHJlcXVlc3RzXG4gICAqL1xuICBwdWJsaWMgcmVhZG9ubHkgY2hhdEZ1bmN0aW9uOiBub2RlanMuTm9kZWpzRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIFRoZSBMYW1iZGEgZnVuY3Rpb24gaGFuZGxpbmcgaGVhbHRoIGNoZWNrc1xuICAgKi9cbiAgcHVibGljIHJlYWRvbmx5IGhlYWx0aEZ1bmN0aW9uOiBub2RlanMuTm9kZWpzRnVuY3Rpb247XG5cbiAgLyoqXG4gICAqIFRoZSBBUEkgVVJMIGZvciBtYWtpbmcgcmVxdWVzdHNcbiAgICovXG4gIHB1YmxpYyByZWFkb25seSBhcGlVcmw6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXBpR2F0ZXdheVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHtcbiAgICAgIHRhYmxlTmFtZXMsXG4gICAgICBiZWRyb2NrTW9kZWxJZCxcbiAgICAgIGV2ZW50QnVzQXJuLFxuICAgICAgcHV0RXZlbnRzUm9sZUFybixcbiAgICAgIGhpc3RvcnlMaW1pdCA9IDUwLFxuICAgICAgYXBpQ29uZmlnID0ge30sXG4gICAgICBsYW1iZGFDb25maWcgPSB7fSxcbiAgICB9ID0gcHJvcHM7XG5cbiAgICAvLyBGaW5kIHRoZSBydW50aW1lIHBhY2thZ2UgcGF0aFxuICAgIGNvbnN0IHJ1bnRpbWVQYWNrYWdlUGF0aCA9IHRoaXMuZmluZFJ1bnRpbWVQYWNrYWdlUGF0aCgpO1xuXG4gICAgLy8gQ29tbW9uIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIGNvbnN0IGNvbW1vbkVudiA9IHtcbiAgICAgIE1FU1NBR0VTX1RBQkxFOiB0YWJsZU5hbWVzLm1lc3NhZ2VzVGFibGUsXG4gICAgICBMRUFEU19UQUJMRTogdGFibGVOYW1lcy5sZWFkc1RhYmxlLFxuICAgICAgLi4uKHRhYmxlTmFtZXMucGVyc29uYXNUYWJsZSAmJiB7IFBFUlNPTkFTX1RBQkxFOiB0YWJsZU5hbWVzLnBlcnNvbmFzVGFibGUgfSksXG4gICAgICBCRURST0NLX01PREVMX0lEOiBiZWRyb2NrTW9kZWxJZCxcbiAgICAgIC4uLihldmVudEJ1c0FybiAmJiB7IE9VVEJPVU5EX0VWRU5UX0JVU19BUk46IGV2ZW50QnVzQXJuIH0pLFxuICAgICAgLi4uKHB1dEV2ZW50c1JvbGVBcm4gJiYgeyBFVkVOVF9CVVNfUFVUX0VWRU5UU19ST0xFX0FSTjogcHV0RXZlbnRzUm9sZUFybiB9KSxcbiAgICAgIEhJU1RPUllfTElNSVQ6IGhpc3RvcnlMaW1pdC50b1N0cmluZygpLFxuICAgICAgLi4ubGFtYmRhQ29uZmlnLmVudmlyb25tZW50LFxuICAgIH07XG5cbiAgICAvLyBDb21tb24gTGFtYmRhIGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBjb21tb25MYW1iZGFQcm9wcyA9IHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgdGltZW91dDogbGFtYmRhQ29uZmlnLnRpbWVvdXQgfHwgRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiBsYW1iZGFDb25maWcubWVtb3J5U2l6ZSB8fCAxMDI0LFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZm9ybWF0OiBub2RlanMuT3V0cHV0Rm9ybWF0LkVTTSxcbiAgICAgICAgdGFyZ2V0OiAnZXMyMDIyJyxcbiAgICAgICAgcGxhdGZvcm06ICdub2RlJyxcbiAgICAgICAgbWFpbkZpZWxkczogWydtb2R1bGUnLCAnbWFpbiddLFxuICAgICAgICBjb25kaXRpb25zOiBbJ2ltcG9ydCcsICdtb2R1bGUnXSxcbiAgICAgICAgYmFubmVyOiAnaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gXCJtb2R1bGVcIjsgY29uc3QgcmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTsnLFxuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFtcbiAgICAgICAgICAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJyxcbiAgICAgICAgICAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyxcbiAgICAgICAgICAnQGF3cy1zZGsvY2xpZW50LWV2ZW50YnJpZGdlJyxcbiAgICAgICAgICAnQGF3cy1zZGsvY2xpZW50LWJlZHJvY2stcnVudGltZScsXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIH07XG5cbiAgICAvLyBDaGF0IExhbWJkYSBGdW5jdGlvblxuICAgIHRoaXMuY2hhdEZ1bmN0aW9uID0gbmV3IG5vZGVqcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnQ2hhdEZ1bmN0aW9uJywge1xuICAgICAgLi4uY29tbW9uTGFtYmRhUHJvcHMsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKHJ1bnRpbWVQYWNrYWdlUGF0aCwgJ3NyYy9oYW5kbGVycy9hcGktZ2F0ZXdheS50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgZGVzY3JpcHRpb246ICdIYW5kbGVzIHN5bmNocm9ub3VzIGNoYXQgcmVxdWVzdHMgdmlhIEFQSSBHYXRld2F5JyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7aWR9LWNoYXQtaGFuZGxlcmAsXG4gICAgfSk7XG5cbiAgICAvLyBIZWFsdGggQ2hlY2sgTGFtYmRhIEZ1bmN0aW9uXG4gICAgdGhpcy5oZWFsdGhGdW5jdGlvbiA9IG5ldyBub2RlanMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0hlYWx0aEZ1bmN0aW9uJywge1xuICAgICAgLi4uY29tbW9uTGFtYmRhUHJvcHMsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKHJ1bnRpbWVQYWNrYWdlUGF0aCwgJ3NyYy9oYW5kbGVycy9hcGktZ2F0ZXdheS50cycpLFxuICAgICAgaGFuZGxlcjogJ2hlYWx0aEhhbmRsZXInLFxuICAgICAgZGVzY3JpcHRpb246ICdIZWFsdGggY2hlY2sgZW5kcG9pbnQgZm9yIEFQSSBHYXRld2F5JyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7aWR9LWhlYWx0aC1oYW5kbGVyYCxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoNSksIC8vIEhlYWx0aCBjaGVja3Mgc2hvdWxkIGJlIGZhc3RcbiAgICAgIG1lbW9yeVNpemU6IDI1NiwgLy8gSGVhbHRoIGNoZWNrcyBuZWVkIG1pbmltYWwgbWVtb3J5XG4gICAgfSk7XG5cbiAgICAvLyBTZXR1cCBJQU0gcGVybWlzc2lvbnNcbiAgICB0aGlzLnNldHVwSWFtUGVybWlzc2lvbnModGFibGVOYW1lcywgYmVkcm9ja01vZGVsSWQsIGV2ZW50QnVzQXJuKTtcblxuICAgIC8vIENyZWF0ZSBIVFRQIEFQSVxuICAgIHRoaXMuaHR0cEFwaSA9IG5ldyBhcGlnYXRld2F5djIuSHR0cEFwaSh0aGlzLCAnSHR0cEFwaScsIHtcbiAgICAgIGFwaU5hbWU6IGFwaUNvbmZpZy5hcGlOYW1lIHx8ICdreGdlbi1sYW5nY2hhaW4tYWdlbnQtYXBpJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBhcGlDb25maWcuZGVzY3JpcHRpb24gfHwgJ0t4R2VuIExhbmdDaGFpbiBBZ2VudCBDaGF0IEFQSScsXG4gICAgICBjb3JzUHJlZmxpZ2h0OiBhcGlDb25maWcuY29yc0NvbmZpZ3VyYXRpb24gfHwge1xuICAgICAgICBhbGxvd09yaWdpbnM6IFsnKiddLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFtcbiAgICAgICAgICBhcGlnYXRld2F5djIuQ29yc0h0dHBNZXRob2QuR0VULFxuICAgICAgICAgIGFwaWdhdGV3YXl2Mi5Db3JzSHR0cE1ldGhvZC5QT1NULFxuICAgICAgICAgIGFwaWdhdGV3YXl2Mi5Db3JzSHR0cE1ldGhvZC5PUFRJT05TLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nLCAnWC1SZXF1ZXN0ZWQtV2l0aCddLFxuICAgICAgICBtYXhBZ2U6IER1cmF0aW9uLmhvdXJzKDEpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBMYW1iZGEgaW50ZWdyYXRpb25zXG4gICAgY29uc3QgY2hhdEludGVncmF0aW9uID0gbmV3IGludGVncmF0aW9ucy5IdHRwTGFtYmRhSW50ZWdyYXRpb24oXG4gICAgICAnQ2hhdEludGVncmF0aW9uJyxcbiAgICAgIHRoaXMuY2hhdEZ1bmN0aW9uLFxuICAgICAge1xuICAgICAgICBwYXlsb2FkRm9ybWF0VmVyc2lvbjogYXBpZ2F0ZXdheXYyLlBheWxvYWRGb3JtYXRWZXJzaW9uLlZFUlNJT05fMl8wLFxuICAgICAgfVxuICAgICk7XG5cbiAgICBjb25zdCBoZWFsdGhJbnRlZ3JhdGlvbiA9IG5ldyBpbnRlZ3JhdGlvbnMuSHR0cExhbWJkYUludGVncmF0aW9uKFxuICAgICAgJ0hlYWx0aEludGVncmF0aW9uJyxcbiAgICAgIHRoaXMuaGVhbHRoRnVuY3Rpb24sXG4gICAgICB7XG4gICAgICAgIHBheWxvYWRGb3JtYXRWZXJzaW9uOiBhcGlnYXRld2F5djIuUGF5bG9hZEZvcm1hdFZlcnNpb24uVkVSU0lPTl8yXzAsXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFkZCByb3V0ZXNcbiAgICB0aGlzLmh0dHBBcGkuYWRkUm91dGVzKHtcbiAgICAgIHBhdGg6ICcvY2hhdCcsXG4gICAgICBtZXRob2RzOiBbYXBpZ2F0ZXdheXYyLkh0dHBNZXRob2QuUE9TVCwgYXBpZ2F0ZXdheXYyLkh0dHBNZXRob2QuT1BUSU9OU10sXG4gICAgICBpbnRlZ3JhdGlvbjogY2hhdEludGVncmF0aW9uLFxuICAgIH0pO1xuXG4gICAgdGhpcy5odHRwQXBpLmFkZFJvdXRlcyh7XG4gICAgICBwYXRoOiAnL2hlYWx0aCcsXG4gICAgICBtZXRob2RzOiBbYXBpZ2F0ZXdheXYyLkh0dHBNZXRob2QuR0VUXSxcbiAgICAgIGludGVncmF0aW9uOiBoZWFsdGhJbnRlZ3JhdGlvbixcbiAgICB9KTtcblxuICAgIC8vIENvbmZpZ3VyZSB0aHJvdHRsaW5nIGlmIHNwZWNpZmllZFxuICAgIGlmIChhcGlDb25maWcudGhyb3R0bGluZykge1xuICAgICAgLy8gTm90ZTogQVBJIEdhdGV3YXkgVjIgdGhyb3R0bGluZyBpcyBjb25maWd1cmVkIGF0IHRoZSBzdGFnZSBsZXZlbFxuICAgICAgLy8gRm9yIG1vcmUgZ3JhbnVsYXIgdGhyb3R0bGluZywgdXNlIHVzYWdlIHBsYW5zIHdpdGggQVBJIGtleXNcbiAgICAgIGNvbnNvbGUud2FybignVGhyb3R0bGluZyBjb25maWd1cmF0aW9uIGRldGVjdGVkIGJ1dCBub3QgaW1wbGVtZW50ZWQgLSB1c2UgQVdTIENvbnNvbGUgb3IgQ0xJIHRvIGNvbmZpZ3VyZSB0aHJvdHRsaW5nIGZvciBBUEkgR2F0ZXdheSBWMicpO1xuICAgIH1cblxuICAgIC8vIEVuYWJsZSBhY2Nlc3MgbG9nZ2luZyBpZiByZXF1ZXN0ZWRcbiAgICBpZiAoYXBpQ29uZmlnLmVuYWJsZUFjY2Vzc0xvZ2dpbmcgIT09IGZhbHNlKSB7XG4gICAgICBjb25zdCBhY2Nlc3NMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdBcGlBY2Nlc3NMb2dzJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2FwaWdhdGV3YXkvJHt0aGlzLmh0dHBBcGkuYXBpSWR9L2FjY2Vzcy1sb2dzYCxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICB9KTtcblxuICAgICAgY29uc3Qgc3RhZ2UgPSB0aGlzLmh0dHBBcGkuZGVmYXVsdFN0YWdlIGFzIGFwaWdhdGV3YXl2Mi5IdHRwU3RhZ2U7XG4gICAgICBzdGFnZS5ub2RlLmFkZERlcGVuZGVuY3koYWNjZXNzTG9nR3JvdXApO1xuICAgIH1cblxuICAgIC8vIFNldCBBUEkgVVJMXG4gICAgdGhpcy5hcGlVcmwgPSB0aGlzLmh0dHBBcGkudXJsITtcblxuICAgIC8vIEFkZCB0YWdzIGZvciByZXNvdXJjZSBtYW5hZ2VtZW50XG4gICAgW3RoaXMuY2hhdEZ1bmN0aW9uLCB0aGlzLmhlYWx0aEZ1bmN0aW9uXS5mb3JFYWNoKGZuID0+IHtcbiAgICAgIGZuLm5vZGUuYWRkTWV0YWRhdGEoJ2NvbXBvbmVudCcsICdreGdlbi1sYW5nY2hhaW4tYWdlbnQtYXBpJyk7XG4gICAgICBmbi5ub2RlLmFkZE1ldGFkYXRhKCdwdXJwb3NlJywgJ1N5bmNocm9ub3VzIGNoYXQgQVBJJyk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogRmluZCB0aGUgcnVudGltZSBwYWNrYWdlIHBhdGggZm9yIExhbWJkYSBidW5kbGluZ1xuICAgKi9cbiAgcHJpdmF0ZSBmaW5kUnVudGltZVBhY2thZ2VQYXRoKCk6IHN0cmluZyB7XG4gICAgLy8gVGhpcyBhc3N1bWVzIHRoZSBJYUMgcGFja2FnZSBpcyBpbiBwYWNrYWdlcy9pYWMgYW5kIHJ1bnRpbWUgaXMgaW4gcGFja2FnZXMvcnVudGltZVxuICAgIC8vIEFkanVzdCB0aGUgcGF0aCBiYXNlZCBvbiB5b3VyIGFjdHVhbCBtb25vcmVwbyBzdHJ1Y3R1cmVcbiAgICByZXR1cm4gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uLy4uL3J1bnRpbWUnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXR1cCBJQU0gcGVybWlzc2lvbnMgZm9yIExhbWJkYSBmdW5jdGlvbnNcbiAgICovXG4gIHByaXZhdGUgc2V0dXBJYW1QZXJtaXNzaW9ucyhcbiAgICB0YWJsZU5hbWVzOiB7IG1lc3NhZ2VzVGFibGU6IHN0cmluZzsgbGVhZHNUYWJsZTogc3RyaW5nOyBwZXJzb25hc1RhYmxlPzogc3RyaW5nIH0sXG4gICAgYmVkcm9ja01vZGVsSWQ6IHN0cmluZyxcbiAgICBldmVudEJ1c0Fybj86IHN0cmluZ1xuICApOiB2b2lkIHtcbiAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IHRhYmxlQXJucyA9IFtcbiAgICAgIGBhcm46YXdzOmR5bmFtb2RiOio6Kjp0YWJsZS8ke3RhYmxlTmFtZXMubWVzc2FnZXNUYWJsZX1gLFxuICAgICAgYGFybjphd3M6ZHluYW1vZGI6KjoqOnRhYmxlLyR7dGFibGVOYW1lcy5tZXNzYWdlc1RhYmxlfS9pbmRleC8qYCxcbiAgICAgIGBhcm46YXdzOmR5bmFtb2RiOio6Kjp0YWJsZS8ke3RhYmxlTmFtZXMubGVhZHNUYWJsZX1gLFxuICAgICAgYGFybjphd3M6ZHluYW1vZGI6KjoqOnRhYmxlLyR7dGFibGVOYW1lcy5sZWFkc1RhYmxlfS9pbmRleC8qYCxcbiAgICBdO1xuXG4gICAgaWYgKHRhYmxlTmFtZXMucGVyc29uYXNUYWJsZSkge1xuICAgICAgdGFibGVBcm5zLnB1c2goXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOio6Kjp0YWJsZS8ke3RhYmxlTmFtZXMucGVyc29uYXNUYWJsZX1gLFxuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoqOio6dGFibGUvJHt0YWJsZU5hbWVzLnBlcnNvbmFzVGFibGV9L2luZGV4LypgXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IGR5bmFtb1BvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOkJhdGNoR2V0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpCYXRjaFdyaXRlSXRlbScsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiB0YWJsZUFybnMsXG4gICAgfSk7XG5cbiAgICAvLyBCZWRyb2NrIHBlcm1pc3Npb25zXG4gICAgY29uc3QgYmVkcm9ja1BvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbFdpdGhSZXNwb25zZVN0cmVhbScsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmJlZHJvY2s6Kjo6Zm91bmRhdGlvbi1tb2RlbC8ke2JlZHJvY2tNb2RlbElkfWAsXG4gICAgICAgICdhcm46YXdzOmJlZHJvY2s6Kjo6Zm91bmRhdGlvbi1tb2RlbC9hbWF6b24udGl0YW4tZW1iZWQtdGV4dC12MScsXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQXBwbHkgcGVybWlzc2lvbnMgdG8gY2hhdCBmdW5jdGlvbiAoaGVhbHRoIGZ1bmN0aW9uIGRvZXNuJ3QgbmVlZCB0aGVzZSlcbiAgICB0aGlzLmNoYXRGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koZHluYW1vUG9saWN5KTtcbiAgICB0aGlzLmNoYXRGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koYmVkcm9ja1BvbGljeSk7XG5cbiAgICAvLyBFdmVudEJyaWRnZSBwZXJtaXNzaW9ucyAob3B0aW9uYWwpXG4gICAgaWYgKGV2ZW50QnVzQXJuKSB7XG4gICAgICBjb25zdCBldmVudEJyaWRnZVBvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbJ2V2ZW50czpQdXRFdmVudHMnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbZXZlbnRCdXNBcm5dLFxuICAgICAgfSk7XG4gICAgICB0aGlzLmNoYXRGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koZXZlbnRCcmlkZ2VQb2xpY3kpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdGhlIGNoYXQgZW5kcG9pbnQgVVJMXG4gICAqL1xuICBwdWJsaWMgZ2V0Q2hhdEVuZHBvaW50KCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3RoaXMuYXBpVXJsfWNoYXRgO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0aGUgaGVhbHRoIGNoZWNrIGVuZHBvaW50IFVSTFxuICAgKi9cbiAgcHVibGljIGdldEhlYWx0aEVuZHBvaW50KCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3RoaXMuYXBpVXJsfWhlYWx0aGA7XG4gIH1cbn1cbiJdfQ==