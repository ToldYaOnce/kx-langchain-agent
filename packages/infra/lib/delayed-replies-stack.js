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
exports.DelayedRepliesStack = exports.DelayedReplies = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const constructs_1 = require("constructs");
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const lambdaNodejs = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const sources = __importStar(require("aws-cdk-lib/aws-lambda-event-sources"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const aws_cdk_lib_2 = require("aws-cdk-lib");
const path = __importStar(require("path"));
/**
 * DelayedReplies Construct - Use this within an existing Stack to avoid cross-stack reference issues
 * This is the recommended approach following the pattern from kx-auth
 */
class DelayedReplies extends constructs_1.Construct {
    constructor(scope, id, props = {}) {
        super(scope, id);
        const eventBusName = props.eventBusName || process.env.EVENT_BUS_NAME || "default";
        // Create FIFO queue for delayed message releases
        this.releaseQueue = new sqs.Queue(this, "ReplyReleaseQueue", {
            fifo: true,
            queueName: `${id}-reply-release.fifo`,
            visibilityTimeout: aws_cdk_lib_1.Duration.seconds(60),
            contentBasedDeduplication: false,
            // Add dead letter queue for failed messages
            deadLetterQueue: {
                queue: new sqs.Queue(this, "ReplyReleaseDeadLetterQueue", {
                    fifo: true,
                    queueName: `${id}-reply-release-dlq.fifo`,
                }),
                maxReceiveCount: 3
            }
        });
        // Create release router Lambda function
        const handlerPath = this.findReleaseRouterPackagePath();
        this.releaseRouterFunction = new lambdaNodejs.NodejsFunction(this, "ReleaseRouterFunction", {
            functionName: `${id}-release-router-function`,
            entry: path.join(handlerPath, 'src/handler.ts'),
            handler: "handler",
            runtime: lambda.Runtime.NODEJS_20_X,
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 512,
            environment: {
                EVENT_BUS_NAME: eventBusName,
                NODE_OPTIONS: "--enable-source-maps"
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: "es2022"
            }
        });
        // Add SQS event source to Lambda
        this.releaseRouterFunction.addEventSource(new sources.SqsEventSource(this.releaseQueue, {
            batchSize: 5,
            reportBatchItemFailures: true
        }));
        // Grant permissions
        this.releaseQueue.grantConsumeMessages(this.releaseRouterFunction);
        // Allow release router to put events to EventBridge
        this.releaseRouterFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ["events:PutEvents"],
            resources: [
                `arn:aws:events:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:event-bus/${eventBusName}`,
                `arn:aws:events:${aws_cdk_lib_1.Stack.of(this).region}:${aws_cdk_lib_1.Stack.of(this).account}:event-bus/default`
            ]
        }));
        // If existing Agent Lambda is provided, grant it permission to send to our queue
        if (props.existingAgentFunction) {
            this.releaseQueue.grantSendMessages(props.existingAgentFunction);
        }
        // Grant agent function access to channels table if provided
        if (props.existingAgentFunction && props.channelsTableName) {
            const channelsTable = dynamodb.Table.fromTableName(this, 'ImportedChannelsTable', props.channelsTableName);
            channelsTable.grantReadWriteData(props.existingAgentFunction);
        }
        // Create DynamoDB tables for Management API
        this.companyInfoTable = new dynamodb.Table(this, 'CompanyInfoTable', {
            tableName: `${id}-company-info`,
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: aws_cdk_lib_2.RemovalPolicy.RETAIN, // Use DESTROY for dev environments
            pointInTimeRecovery: true,
        });
        this.personasTable = new dynamodb.Table(this, 'PersonasTable', {
            tableName: `${id}-personas`,
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'personaId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: aws_cdk_lib_2.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });
        // Create Lambda functions for Management API
        const runtimePath = this.findRuntimePackagePath();
        this.companyInfoFunction = new lambdaNodejs.NodejsFunction(this, 'CompanyInfoFunction', {
            functionName: `${id}-company-info-function`,
            entry: path.join(runtimePath, 'src/services/company-info-service.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 512,
            environment: {
                COMPANY_INFO_TABLE: this.companyInfoTable.tableName,
                NODE_OPTIONS: "--enable-source-maps"
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: "es2022"
            }
        });
        this.personasFunction = new lambdaNodejs.NodejsFunction(this, 'PersonasFunction', {
            functionName: `${id}-personas-function`,
            entry: path.join(runtimePath, 'src/services/personas-service.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 512,
            environment: {
                PERSONAS_TABLE: this.personasTable.tableName,
                NODE_OPTIONS: "--enable-source-maps"
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: "es2022"
            }
        });
        this.companyPersonaFunction = new lambdaNodejs.NodejsFunction(this, 'CompanyPersonaFunction', {
            functionName: `${id}-company-persona-function`,
            entry: path.join(runtimePath, 'src/services/company-persona-service.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_20_X,
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 512,
            environment: {
                COMPANY_INFO_TABLE: this.companyInfoTable.tableName,
                PERSONAS_TABLE: this.personasTable.tableName,
                CHAT_HISTORY_TABLE: props.chatHistoryTableName || '',
                NODE_OPTIONS: "--enable-source-maps"
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: "es2022"
            }
        });
        // Grant DynamoDB permissions
        this.companyInfoTable.grantReadWriteData(this.companyInfoFunction);
        this.personasTable.grantReadWriteData(this.personasFunction);
        this.companyInfoTable.grantReadWriteData(this.companyPersonaFunction);
        this.personasTable.grantReadWriteData(this.companyPersonaFunction);
        // Grant agent function access to company_info and personas tables
        if (props.existingAgentFunction) {
            this.companyInfoTable.grantReadData(props.existingAgentFunction);
            this.personasTable.grantReadData(props.existingAgentFunction);
            // Add environment variables to agent function so it knows which tables to use
            if (props.existingAgentFunction instanceof lambda.Function) {
                props.existingAgentFunction.addEnvironment('COMPANY_INFO_TABLE', this.companyInfoTable.tableName);
                props.existingAgentFunction.addEnvironment('PERSONAS_TABLE', this.personasTable.tableName);
                console.log(`✅ Added COMPANY_INFO_TABLE and PERSONAS_TABLE env vars to agent function`);
            }
        }
        // Grant read access to chat history table if provided
        if (props.chatHistoryTableArn) {
            this.companyPersonaFunction.addToRolePolicy(new iam.PolicyStatement({
                actions: ['dynamodb:Query', 'dynamodb:GetItem', 'dynamodb:Scan'],
                resources: [props.chatHistoryTableArn, `${props.chatHistoryTableArn}/index/*`]
            }));
        }
        // Auto-attach to API Gateway if configured
        if (props.apiGatewayConfig) {
            this.attachToApiGateway(props.apiGatewayConfig.existingApi, props.apiGatewayConfig.basePath);
        }
    }
    /**
     * Attach Management API endpoints to an existing API Gateway
     */
    attachToApiGateway(api, basePath = 'agent') {
        // Clean basePath - remove leading/trailing slashes and ensure it's a valid resource path
        const cleanBasePath = basePath.replace(/^\/+|\/+$/g, '') || 'agent';
        // Try to get existing resource or create new one
        let agentResource;
        try {
            // Check if resource already exists by trying to get it
            agentResource = api.root.resourceForPath(cleanBasePath);
        }
        catch (error) {
            // Resource doesn't exist, create it
            agentResource = api.root.addResource(cleanBasePath);
        }
        // Company Info endpoints: /agent/company/{tenantId}
        const companyResource = agentResource.addResource('company');
        const companyTenantResource = companyResource.addResource('{tenantId}');
        companyTenantResource.addMethod('GET', new apigateway.LambdaIntegration(this.companyInfoFunction));
        companyTenantResource.addMethod('PATCH', new apigateway.LambdaIntegration(this.companyInfoFunction));
        companyTenantResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'PATCH', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization'],
        });
        // Personas endpoints: /agent/personas/{tenantId} and /agent/personas/{tenantId}/{personaId}
        const personasResource = agentResource.addResource('personas');
        const personasTenantResource = personasResource.addResource('{tenantId}');
        personasTenantResource.addMethod('GET', new apigateway.LambdaIntegration(this.personasFunction));
        personasTenantResource.addMethod('POST', new apigateway.LambdaIntegration(this.personasFunction));
        personasTenantResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'POST', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization'],
        });
        const personasIdResource = personasTenantResource.addResource('{personaId}');
        personasIdResource.addMethod('GET', new apigateway.LambdaIntegration(this.personasFunction));
        personasIdResource.addMethod('PATCH', new apigateway.LambdaIntegration(this.personasFunction));
        personasIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(this.personasFunction));
        personasIdResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'PATCH', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization'],
        });
        // Company-Persona endpoints: /agent/company-persona/{tenantId}/{personaId}
        const companyPersonaResource = agentResource.addResource('company-persona');
        const companyPersonaTenantResource = companyPersonaResource.addResource('{tenantId}');
        const companyPersonaIdResource = companyPersonaTenantResource.addResource('{personaId}');
        companyPersonaIdResource.addMethod('GET', new apigateway.LambdaIntegration(this.companyPersonaFunction));
        companyPersonaIdResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization'],
        });
    }
    /**
     * Grant a Lambda function permission to send messages to the release queue
     */
    grantSendToQueue(lambdaFunction) {
        this.releaseQueue.grantSendMessages(lambdaFunction);
    }
    /**
     * @deprecated Use attachToApiGateway() instead. This method will be removed in a future version.
     */
    grantApiGatewayInvoke(role) {
        console.warn('grantApiGatewayInvoke() is deprecated. Use attachToApiGateway() for automatic integration.');
        this.companyInfoFunction.grantInvoke(role);
        this.personasFunction.grantInvoke(role);
        this.companyPersonaFunction.grantInvoke(role);
    }
    findReleaseRouterPackagePath() {
        try {
            // Try to resolve the package in the consuming application
            const packageJsonPath = require.resolve('@toldyaonce/kx-release-router/package.json');
            return path.dirname(packageJsonPath);
        }
        catch (error) {
            // Fallback for development - look for the package in the monorepo
            const fallbackPath = path.resolve(__dirname, '../../../release-router');
            if (require('fs').existsSync(fallbackPath)) {
                return fallbackPath;
            }
            throw new Error(`Cannot find @toldyaonce/kx-release-router package. Please ensure it's installed.`);
        }
    }
    findRuntimePackagePath() {
        try {
            // Try to resolve the package in the consuming application
            const packageJsonPath = require.resolve('@toldyaonce/kx-langchain-agent-runtime/package.json');
            return path.dirname(packageJsonPath);
        }
        catch (error) {
            // Fallback for development - look for the package in the monorepo
            const fallbackPath = path.resolve(__dirname, '../../../runtime');
            if (require('fs').existsSync(fallbackPath)) {
                return fallbackPath;
            }
            throw new Error(`Cannot find @toldyaonce/kx-langchain-agent-runtime package. Please ensure it's installed.`);
        }
    }
}
exports.DelayedReplies = DelayedReplies;
/**
 * DelayedRepliesStack - Standalone Stack version (for backward compatibility)
 * @deprecated Use DelayedReplies construct within your existing stack instead to avoid cross-stack reference issues
 */
class DelayedRepliesStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props = {}) {
        super(scope, id, props);
        // Create the DelayedReplies construct
        this.delayedReplies = new DelayedReplies(this, 'DelayedReplies', {
            eventBusName: props.eventBusName,
            existingAgentFunction: props.existingAgentFunction,
            apiGatewayConfig: props.apiGatewayConfig,
        });
        // Expose resources for backward compatibility
        this.releaseQueue = this.delayedReplies.releaseQueue;
        this.releaseRouterFunction = this.delayedReplies.releaseRouterFunction;
        this.companyInfoTable = this.delayedReplies.companyInfoTable;
        this.personasTable = this.delayedReplies.personasTable;
        this.companyInfoFunction = this.delayedReplies.companyInfoFunction;
        this.personasFunction = this.delayedReplies.personasFunction;
        this.companyPersonaFunction = this.delayedReplies.companyPersonaFunction;
        // Export values for integration
        new aws_cdk_lib_1.CfnOutput(this, "ReplyReleaseQueueUrl", {
            value: this.releaseQueue.queueUrl,
            description: "URL of the reply release queue",
            exportName: `${id}-ReplyReleaseQueueUrl`
        });
        new aws_cdk_lib_1.CfnOutput(this, "ReplyReleaseQueueArn", {
            value: this.releaseQueue.queueArn,
            description: "ARN of the reply release queue",
            exportName: `${id}-ReplyReleaseQueueArn`
        });
        new aws_cdk_lib_1.CfnOutput(this, "ReleaseRouterFunctionArn", {
            value: this.releaseRouterFunction.functionArn,
            description: "ARN of the release router function",
            exportName: `${id}-ReleaseRouterFunctionArn`
        });
        new aws_cdk_lib_1.CfnOutput(this, "CompanyInfoTableName", {
            value: this.companyInfoTable.tableName,
            description: "Name of the company info table",
            exportName: `${id}-CompanyInfoTableName`
        });
        new aws_cdk_lib_1.CfnOutput(this, "PersonasTableName", {
            value: this.personasTable.tableName,
            description: "Name of the personas table",
            exportName: `${id}-PersonasTableName`
        });
        new aws_cdk_lib_1.CfnOutput(this, "CompanyInfoFunctionArn", {
            value: this.companyInfoFunction.functionArn,
            description: "ARN of the company info function",
            exportName: `${id}-CompanyInfoFunctionArn`
        });
        new aws_cdk_lib_1.CfnOutput(this, "PersonasFunctionArn", {
            value: this.personasFunction.functionArn,
            description: "ARN of the personas function",
            exportName: `${id}-PersonasFunctionArn`
        });
        new aws_cdk_lib_1.CfnOutput(this, "CompanyPersonaFunctionArn", {
            value: this.companyPersonaFunction.functionArn,
            description: "ARN of the company persona function",
            exportName: `${id}-CompanyPersonaFunctionArn`
        });
    }
    /**
     * Grant a Lambda function permission to send messages to the release queue
     */
    grantSendToQueue(lambdaFunction) {
        this.delayedReplies.grantSendToQueue(lambdaFunction);
    }
    /**
     * Attach Management API endpoints to an existing API Gateway
     */
    attachToApiGateway(api, basePath) {
        this.delayedReplies.attachToApiGateway(api, basePath);
    }
    /**
     * @deprecated Use attachToApiGateway() instead. This method will be removed in a future version.
     */
    grantApiGatewayInvoke(role) {
        this.delayedReplies.grantApiGatewayInvoke(role);
    }
}
exports.DelayedRepliesStack = DelayedRepliesStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVsYXllZC1yZXBsaWVzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2RlbGF5ZWQtcmVwbGllcy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSw2Q0FBcUU7QUFDckUsMkNBQXVDO0FBQ3ZDLHlEQUEyQztBQUMzQywrREFBaUQ7QUFDakQsNEVBQThEO0FBQzlELHlEQUEyQztBQUMzQyw4RUFBZ0U7QUFDaEUsbUVBQXFEO0FBQ3JELHVFQUF5RDtBQUN6RCw2Q0FBNEM7QUFDNUMsMkNBQTZCO0FBMEI3Qjs7O0dBR0c7QUFDSCxNQUFhLGNBQWUsU0FBUSxzQkFBUztJQVMzQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLFFBQTZCLEVBQUU7UUFDdkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsWUFBWSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxJQUFJLFNBQVMsQ0FBQztRQUVuRixpREFBaUQ7UUFDakQsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQzNELElBQUksRUFBRSxJQUFJO1lBQ1YsU0FBUyxFQUFFLEdBQUcsRUFBRSxxQkFBcUI7WUFDckMsaUJBQWlCLEVBQUUsc0JBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLHlCQUF5QixFQUFFLEtBQUs7WUFDaEMsNENBQTRDO1lBQzVDLGVBQWUsRUFBRTtnQkFDZixLQUFLLEVBQUUsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRTtvQkFDeEQsSUFBSSxFQUFFLElBQUk7b0JBQ1YsU0FBUyxFQUFFLEdBQUcsRUFBRSx5QkFBeUI7aUJBQzFDLENBQUM7Z0JBQ0YsZUFBZSxFQUFF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R0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFFRDs7T0FFRztJQUNJLHFCQUFxQixDQUFDLElBQWU7UUFDMUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNsRCxDQUFDO0NBQ0Y7QUFyR0Qsa0RBcUdDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU3RhY2ssIFN0YWNrUHJvcHMsIER1cmF0aW9uLCBDZm5PdXRwdXQgfSBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBzcXMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zcXNcIjtcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYVwiO1xuaW1wb3J0ICogYXMgbGFtYmRhTm9kZWpzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqc1wiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBzb3VyY2VzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXNcIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSBcImF3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5XCI7XG5pbXBvcnQgeyBSZW1vdmFsUG9saWN5IH0gZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGVsYXllZFJlcGxpZXNQcm9wcyB7XG4gIGV2ZW50QnVzTmFtZT86IHN0cmluZztcbiAgZXhpc3RpbmdBZ2VudEZ1bmN0aW9uPzogbGFtYmRhLklGdW5jdGlvbjtcbiAgYXBpR2F0ZXdheUNvbmZpZz86IHtcbiAgICBleGlzdGluZ0FwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuICAgIGJhc2VQYXRoPzogc3RyaW5nO1xuICB9O1xuICBjaGF0SGlzdG9yeVRhYmxlTmFtZT86IHN0cmluZztcbiAgY2hhdEhpc3RvcnlUYWJsZUFybj86IHN0cmluZztcbiAgY2hhbm5lbHNUYWJsZU5hbWU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGVsYXllZFJlcGxpZXNTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gIGV2ZW50QnVzTmFtZT86IHN0cmluZztcbiAgZXhpc3RpbmdBZ2VudEZ1bmN0aW9uPzogbGFtYmRhLklGdW5jdGlvbjtcbiAgYXBpR2F0ZXdheUNvbmZpZz86IHtcbiAgICBleGlzdGluZ0FwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuICAgIGJhc2VQYXRoPzogc3RyaW5nO1xuICB9O1xuICBjaGFubmVsc1RhYmxlTmFtZT86IHN0cmluZztcbiAgY2hhdEhpc3RvcnlUYWJsZU5hbWU/OiBzdHJpbmc7XG4gIGNoYXRIaXN0b3J5VGFibGVBcm4/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogRGVsYXllZFJlcGxpZXMgQ29uc3RydWN0IC0gVXNlIHRoaXMgd2l0aGluIGFuIGV4aXN0aW5nIFN0YWNrIHRvIGF2b2lkIGNyb3NzLXN0YWNrIHJlZmVyZW5jZSBpc3N1ZXNcbiAqIFRoaXMgaXMgdGhlIHJlY29tbWVuZGVkIGFwcHJvYWNoIGZvbGxvd2luZyB0aGUgcGF0dGVybiBmcm9tIGt4LWF1dGhcbiAqL1xuZXhwb3J0IGNsYXNzIERlbGF5ZWRSZXBsaWVzIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHJlbGVhc2VRdWV1ZTogc3FzLlF1ZXVlO1xuICBwdWJsaWMgcmVhZG9ubHkgcmVsZWFzZVJvdXRlckZ1bmN0aW9uOiBsYW1iZGFOb2RlanMuTm9kZWpzRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBjb21wYW55SW5mb1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHVibGljIHJlYWRvbmx5IHBlcnNvbmFzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuICBwdWJsaWMgcmVhZG9ubHkgY29tcGFueUluZm9GdW5jdGlvbjogbGFtYmRhTm9kZWpzLk5vZGVqc0Z1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgcGVyc29uYXNGdW5jdGlvbjogbGFtYmRhTm9kZWpzLk5vZGVqc0Z1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgY29tcGFueVBlcnNvbmFGdW5jdGlvbjogbGFtYmRhTm9kZWpzLk5vZGVqc0Z1bmN0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBEZWxheWVkUmVwbGllc1Byb3BzID0ge30pIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3QgZXZlbnRCdXNOYW1lID0gcHJvcHMuZXZlbnRCdXNOYW1lIHx8IHByb2Nlc3MuZW52LkVWRU5UX0JVU19OQU1FIHx8IFwiZGVmYXVsdFwiO1xuXG4gICAgLy8gQ3JlYXRlIEZJRk8gcXVldWUgZm9yIGRlbGF5ZWQgbWVzc2FnZSByZWxlYXNlc1xuICAgIHRoaXMucmVsZWFzZVF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCBcIlJlcGx5UmVsZWFzZVF1ZXVlXCIsIHtcbiAgICAgIGZpZm86IHRydWUsXG4gICAgICBxdWV1ZU5hbWU6IGAke2lkfS1yZXBseS1yZWxlYXNlLmZpZm9gLFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgY29udGVudEJhc2VkRGVkdXBsaWNhdGlvbjogZmFsc2UsXG4gICAgICAvLyBBZGQgZGVhZCBsZXR0ZXIgcXVldWUgZm9yIGZhaWxlZCBtZXNzYWdlc1xuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiBuZXcgc3FzLlF1ZXVlKHRoaXMsIFwiUmVwbHlSZWxlYXNlRGVhZExldHRlclF1ZXVlXCIsIHtcbiAgICAgICAgICBmaWZvOiB0cnVlLFxuICAgICAgICAgIHF1ZXVlTmFtZTogYCR7aWR9LXJlcGx5LXJlbGVhc2UtZGxxLmZpZm9gLFxuICAgICAgICB9KSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgcmVsZWFzZSByb3V0ZXIgTGFtYmRhIGZ1bmN0aW9uXG4gICAgY29uc3QgaGFuZGxlclBhdGggPSB0aGlzLmZpbmRSZWxlYXNlUm91dGVyUGFja2FnZVBhdGgoKTtcbiAgICB0aGlzLnJlbGVhc2VSb3V0ZXJGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlanMuTm9kZWpzRnVuY3Rpb24odGhpcywgXCJSZWxlYXNlUm91dGVyRnVuY3Rpb25cIiwge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtpZH0tcmVsZWFzZS1yb3V0ZXItZnVuY3Rpb25gLFxuICAgICAgZW50cnk6IHBhdGguam9pbihoYW5kbGVyUGF0aCwgJ3NyYy9oYW5kbGVyLnRzJyksXG4gICAgICBoYW5kbGVyOiBcImhhbmRsZXJcIixcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFVkVOVF9CVVNfTkFNRTogZXZlbnRCdXNOYW1lLFxuICAgICAgICBOT0RFX09QVElPTlM6IFwiLS1lbmFibGUtc291cmNlLW1hcHNcIlxuICAgICAgfSxcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcbiAgICAgICAgc291cmNlTWFwOiB0cnVlLFxuICAgICAgICB0YXJnZXQ6IFwiZXMyMDIyXCJcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBTUVMgZXZlbnQgc291cmNlIHRvIExhbWJkYVxuICAgIHRoaXMucmVsZWFzZVJvdXRlckZ1bmN0aW9uLmFkZEV2ZW50U291cmNlKG5ldyBzb3VyY2VzLlNxc0V2ZW50U291cmNlKHRoaXMucmVsZWFzZVF1ZXVlLCB7XG4gICAgICBiYXRjaFNpemU6IDUsXG4gICAgICByZXBvcnRCYXRjaEl0ZW1GYWlsdXJlczogdHJ1ZVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zXG4gICAgdGhpcy5yZWxlYXNlUXVldWUuZ3JhbnRDb25zdW1lTWVzc2FnZXModGhpcy5yZWxlYXNlUm91dGVyRnVuY3Rpb24pO1xuXG4gICAgLy8gQWxsb3cgcmVsZWFzZSByb3V0ZXIgdG8gcHV0IGV2ZW50cyB0byBFdmVudEJyaWRnZVxuICAgIHRoaXMucmVsZWFzZVJvdXRlckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXCJldmVudHM6UHV0RXZlbnRzXCJdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmV2ZW50czoke1N0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtTdGFjay5vZih0aGlzKS5hY2NvdW50fTpldmVudC1idXMvJHtldmVudEJ1c05hbWV9YCxcbiAgICAgICAgYGFybjphd3M6ZXZlbnRzOiR7U3RhY2sub2YodGhpcykucmVnaW9ufToke1N0YWNrLm9mKHRoaXMpLmFjY291bnR9OmV2ZW50LWJ1cy9kZWZhdWx0YFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIElmIGV4aXN0aW5nIEFnZW50IExhbWJkYSBpcyBwcm92aWRlZCwgZ3JhbnQgaXQgcGVybWlzc2lvbiB0byBzZW5kIHRvIG91ciBxdWV1ZVxuICAgIGlmIChwcm9wcy5leGlzdGluZ0FnZW50RnVuY3Rpb24pIHtcbiAgICAgIHRoaXMucmVsZWFzZVF1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKHByb3BzLmV4aXN0aW5nQWdlbnRGdW5jdGlvbik7XG4gICAgfVxuICAgIFxuICAgIC8vIEdyYW50IGFnZW50IGZ1bmN0aW9uIGFjY2VzcyB0byBjaGFubmVscyB0YWJsZSBpZiBwcm92aWRlZFxuICAgIGlmIChwcm9wcy5leGlzdGluZ0FnZW50RnVuY3Rpb24gJiYgcHJvcHMuY2hhbm5lbHNUYWJsZU5hbWUpIHtcbiAgICAgIGNvbnN0IGNoYW5uZWxzVGFibGUgPSBkeW5hbW9kYi5UYWJsZS5mcm9tVGFibGVOYW1lKFxuICAgICAgICB0aGlzLFxuICAgICAgICAnSW1wb3J0ZWRDaGFubmVsc1RhYmxlJyxcbiAgICAgICAgcHJvcHMuY2hhbm5lbHNUYWJsZU5hbWVcbiAgICAgICk7XG4gICAgICBjaGFubmVsc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShwcm9wcy5leGlzdGluZ0FnZW50RnVuY3Rpb24pO1xuICAgIH1cblxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiB0YWJsZXMgZm9yIE1hbmFnZW1lbnQgQVBJXG4gICAgdGhpcy5jb21wYW55SW5mb1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdDb21wYW55SW5mb1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgJHtpZH0tY29tcGFueS1pbmZvYCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVuYW50SWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuUkVUQUlOLCAvLyBVc2UgREVTVFJPWSBmb3IgZGV2IGVudmlyb25tZW50c1xuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcbiAgICB9KTtcblxuICAgIHRoaXMucGVyc29uYXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnUGVyc29uYXNUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYCR7aWR9LXBlcnNvbmFzYCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVuYW50SWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAncGVyc29uYUlkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LlJFVEFJTixcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9ucyBmb3IgTWFuYWdlbWVudCBBUElcbiAgICBjb25zdCBydW50aW1lUGF0aCA9IHRoaXMuZmluZFJ1bnRpbWVQYWNrYWdlUGF0aCgpO1xuXG4gICAgdGhpcy5jb21wYW55SW5mb0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVqcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnQ29tcGFueUluZm9GdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7aWR9LWNvbXBhbnktaW5mby1mdW5jdGlvbmAsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKHJ1bnRpbWVQYXRoLCAnc3JjL3NlcnZpY2VzL2NvbXBhbnktaW5mby1zZXJ2aWNlLnRzJyksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQ09NUEFOWV9JTkZPX1RBQkxFOiB0aGlzLmNvbXBhbnlJbmZvVGFibGUudGFibGVOYW1lLFxuICAgICAgICBOT0RFX09QVElPTlM6IFwiLS1lbmFibGUtc291cmNlLW1hcHNcIlxuICAgICAgfSxcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcbiAgICAgICAgc291cmNlTWFwOiB0cnVlLFxuICAgICAgICB0YXJnZXQ6IFwiZXMyMDIyXCJcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMucGVyc29uYXNGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlanMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ1BlcnNvbmFzRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGAke2lkfS1wZXJzb25hcy1mdW5jdGlvbmAsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKHJ1bnRpbWVQYXRoLCAnc3JjL3NlcnZpY2VzL3BlcnNvbmFzLXNlcnZpY2UudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBQRVJTT05BU19UQUJMRTogdGhpcy5wZXJzb25hc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgTk9ERV9PUFRJT05TOiBcIi0tZW5hYmxlLXNvdXJjZS1tYXBzXCJcbiAgICAgIH0sXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBtaW5pZnk6IHRydWUsXG4gICAgICAgIHNvdXJjZU1hcDogdHJ1ZSxcbiAgICAgICAgdGFyZ2V0OiBcImVzMjAyMlwiXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLmNvbXBhbnlQZXJzb25hRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZWpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdDb21wYW55UGVyc29uYUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtpZH0tY29tcGFueS1wZXJzb25hLWZ1bmN0aW9uYCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4ocnVudGltZVBhdGgsICdzcmMvc2VydmljZXMvY29tcGFueS1wZXJzb25hLXNlcnZpY2UudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBDT01QQU5ZX0lORk9fVEFCTEU6IHRoaXMuY29tcGFueUluZm9UYWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFBFUlNPTkFTX1RBQkxFOiB0aGlzLnBlcnNvbmFzVGFibGUudGFibGVOYW1lLFxuICAgICAgICBDSEFUX0hJU1RPUllfVEFCTEU6IHByb3BzLmNoYXRIaXN0b3J5VGFibGVOYW1lIHx8ICcnLFxuICAgICAgICBOT0RFX09QVElPTlM6IFwiLS1lbmFibGUtc291cmNlLW1hcHNcIlxuICAgICAgfSxcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcbiAgICAgICAgc291cmNlTWFwOiB0cnVlLFxuICAgICAgICB0YXJnZXQ6IFwiZXMyMDIyXCJcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zXG4gICAgdGhpcy5jb21wYW55SW5mb1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmNvbXBhbnlJbmZvRnVuY3Rpb24pO1xuICAgIHRoaXMucGVyc29uYXNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGhpcy5wZXJzb25hc0Z1bmN0aW9uKTtcbiAgICB0aGlzLmNvbXBhbnlJbmZvVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRoaXMuY29tcGFueVBlcnNvbmFGdW5jdGlvbik7XG4gICAgdGhpcy5wZXJzb25hc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmNvbXBhbnlQZXJzb25hRnVuY3Rpb24pO1xuICAgIFxuICAgIC8vIEdyYW50IGFnZW50IGZ1bmN0aW9uIGFjY2VzcyB0byBjb21wYW55X2luZm8gYW5kIHBlcnNvbmFzIHRhYmxlc1xuICAgIGlmIChwcm9wcy5leGlzdGluZ0FnZW50RnVuY3Rpb24pIHtcbiAgICAgIHRoaXMuY29tcGFueUluZm9UYWJsZS5ncmFudFJlYWREYXRhKHByb3BzLmV4aXN0aW5nQWdlbnRGdW5jdGlvbik7XG4gICAgICB0aGlzLnBlcnNvbmFzVGFibGUuZ3JhbnRSZWFkRGF0YShwcm9wcy5leGlzdGluZ0FnZW50RnVuY3Rpb24pO1xuICAgICAgXG4gICAgICAvLyBBZGQgZW52aXJvbm1lbnQgdmFyaWFibGVzIHRvIGFnZW50IGZ1bmN0aW9uIHNvIGl0IGtub3dzIHdoaWNoIHRhYmxlcyB0byB1c2VcbiAgICAgIGlmIChwcm9wcy5leGlzdGluZ0FnZW50RnVuY3Rpb24gaW5zdGFuY2VvZiBsYW1iZGEuRnVuY3Rpb24pIHtcbiAgICAgICAgcHJvcHMuZXhpc3RpbmdBZ2VudEZ1bmN0aW9uLmFkZEVudmlyb25tZW50KCdDT01QQU5ZX0lORk9fVEFCTEUnLCB0aGlzLmNvbXBhbnlJbmZvVGFibGUudGFibGVOYW1lKTtcbiAgICAgICAgcHJvcHMuZXhpc3RpbmdBZ2VudEZ1bmN0aW9uLmFkZEVudmlyb25tZW50KCdQRVJTT05BU19UQUJMRScsIHRoaXMucGVyc29uYXNUYWJsZS50YWJsZU5hbWUpO1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIEFkZGVkIENPTVBBTllfSU5GT19UQUJMRSBhbmQgUEVSU09OQVNfVEFCTEUgZW52IHZhcnMgdG8gYWdlbnQgZnVuY3Rpb25gKTtcbiAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgLy8gR3JhbnQgcmVhZCBhY2Nlc3MgdG8gY2hhdCBoaXN0b3J5IHRhYmxlIGlmIHByb3ZpZGVkXG4gICAgaWYgKHByb3BzLmNoYXRIaXN0b3J5VGFibGVBcm4pIHtcbiAgICAgIHRoaXMuY29tcGFueVBlcnNvbmFGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ2R5bmFtb2RiOlF1ZXJ5JywgJ2R5bmFtb2RiOkdldEl0ZW0nLCAnZHluYW1vZGI6U2NhbiddLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5jaGF0SGlzdG9yeVRhYmxlQXJuLCBgJHtwcm9wcy5jaGF0SGlzdG9yeVRhYmxlQXJufS9pbmRleC8qYF1cbiAgICAgIH0pKTtcbiAgICB9XG5cbiAgICAvLyBBdXRvLWF0dGFjaCB0byBBUEkgR2F0ZXdheSBpZiBjb25maWd1cmVkXG4gICAgaWYgKHByb3BzLmFwaUdhdGV3YXlDb25maWcpIHtcbiAgICAgIHRoaXMuYXR0YWNoVG9BcGlHYXRld2F5KHByb3BzLmFwaUdhdGV3YXlDb25maWcuZXhpc3RpbmdBcGksIHByb3BzLmFwaUdhdGV3YXlDb25maWcuYmFzZVBhdGgpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBdHRhY2ggTWFuYWdlbWVudCBBUEkgZW5kcG9pbnRzIHRvIGFuIGV4aXN0aW5nIEFQSSBHYXRld2F5XG4gICAqL1xuICBwdWJsaWMgYXR0YWNoVG9BcGlHYXRld2F5KGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpLCBiYXNlUGF0aDogc3RyaW5nID0gJ2FnZW50Jyk6IHZvaWQge1xuICAgIC8vIENsZWFuIGJhc2VQYXRoIC0gcmVtb3ZlIGxlYWRpbmcvdHJhaWxpbmcgc2xhc2hlcyBhbmQgZW5zdXJlIGl0J3MgYSB2YWxpZCByZXNvdXJjZSBwYXRoXG4gICAgY29uc3QgY2xlYW5CYXNlUGF0aCA9IGJhc2VQYXRoLnJlcGxhY2UoL15cXC8rfFxcLyskL2csICcnKSB8fCAnYWdlbnQnO1xuICAgIFxuICAgIC8vIFRyeSB0byBnZXQgZXhpc3RpbmcgcmVzb3VyY2Ugb3IgY3JlYXRlIG5ldyBvbmVcbiAgICBsZXQgYWdlbnRSZXNvdXJjZTogYXBpZ2F0ZXdheS5SZXNvdXJjZTtcbiAgICB0cnkge1xuICAgICAgLy8gQ2hlY2sgaWYgcmVzb3VyY2UgYWxyZWFkeSBleGlzdHMgYnkgdHJ5aW5nIHRvIGdldCBpdFxuICAgICAgYWdlbnRSZXNvdXJjZSA9IGFwaS5yb290LnJlc291cmNlRm9yUGF0aChjbGVhbkJhc2VQYXRoKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gUmVzb3VyY2UgZG9lc24ndCBleGlzdCwgY3JlYXRlIGl0XG4gICAgICBhZ2VudFJlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoY2xlYW5CYXNlUGF0aCk7XG4gICAgfVxuXG4gICAgLy8gQ29tcGFueSBJbmZvIGVuZHBvaW50czogL2FnZW50L2NvbXBhbnkve3RlbmFudElkfVxuICAgIGNvbnN0IGNvbXBhbnlSZXNvdXJjZSA9IGFnZW50UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2NvbXBhbnknKTtcbiAgICBjb25zdCBjb21wYW55VGVuYW50UmVzb3VyY2UgPSBjb21wYW55UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3t0ZW5hbnRJZH0nKTtcbiAgICBcbiAgICBjb21wYW55VGVuYW50UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmNvbXBhbnlJbmZvRnVuY3Rpb24pKTtcbiAgICBjb21wYW55VGVuYW50UmVzb3VyY2UuYWRkTWV0aG9kKCdQQVRDSCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuY29tcGFueUluZm9GdW5jdGlvbikpO1xuICAgIGNvbXBhbnlUZW5hbnRSZXNvdXJjZS5hZGRDb3JzUHJlZmxpZ2h0KHtcbiAgICAgIGFsbG93T3JpZ2luczogWycqJ10sXG4gICAgICBhbGxvd01ldGhvZHM6IFsnR0VUJywgJ1BBVENIJywgJ09QVElPTlMnXSxcbiAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbiddLFxuICAgIH0pO1xuXG4gICAgLy8gUGVyc29uYXMgZW5kcG9pbnRzOiAvYWdlbnQvcGVyc29uYXMve3RlbmFudElkfSBhbmQgL2FnZW50L3BlcnNvbmFzL3t0ZW5hbnRJZH0ve3BlcnNvbmFJZH1cbiAgICBjb25zdCBwZXJzb25hc1Jlc291cmNlID0gYWdlbnRSZXNvdXJjZS5hZGRSZXNvdXJjZSgncGVyc29uYXMnKTtcbiAgICBjb25zdCBwZXJzb25hc1RlbmFudFJlc291cmNlID0gcGVyc29uYXNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3RlbmFudElkfScpO1xuICAgIFxuICAgIHBlcnNvbmFzVGVuYW50UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLnBlcnNvbmFzRnVuY3Rpb24pKTtcbiAgICBwZXJzb25hc1RlbmFudFJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMucGVyc29uYXNGdW5jdGlvbikpO1xuICAgIHBlcnNvbmFzVGVuYW50UmVzb3VyY2UuYWRkQ29yc1ByZWZsaWdodCh7XG4gICAgICBhbGxvd09yaWdpbnM6IFsnKiddLFxuICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQT1NUJywgJ09QVElPTlMnXSxcbiAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbiddLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGVyc29uYXNJZFJlc291cmNlID0gcGVyc29uYXNUZW5hbnRSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3BlcnNvbmFJZH0nKTtcbiAgICBwZXJzb25hc0lkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLnBlcnNvbmFzRnVuY3Rpb24pKTtcbiAgICBwZXJzb25hc0lkUmVzb3VyY2UuYWRkTWV0aG9kKCdQQVRDSCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMucGVyc29uYXNGdW5jdGlvbikpO1xuICAgIHBlcnNvbmFzSWRSZXNvdXJjZS5hZGRNZXRob2QoJ0RFTEVURScsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMucGVyc29uYXNGdW5jdGlvbikpO1xuICAgIHBlcnNvbmFzSWRSZXNvdXJjZS5hZGRDb3JzUHJlZmxpZ2h0KHtcbiAgICAgIGFsbG93T3JpZ2luczogWycqJ10sXG4gICAgICBhbGxvd01ldGhvZHM6IFsnR0VUJywgJ1BBVENIJywgJ0RFTEVURScsICdPUFRJT05TJ10sXG4gICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXSxcbiAgICB9KTtcblxuICAgIC8vIENvbXBhbnktUGVyc29uYSBlbmRwb2ludHM6IC9hZ2VudC9jb21wYW55LXBlcnNvbmEve3RlbmFudElkfS97cGVyc29uYUlkfVxuICAgIGNvbnN0IGNvbXBhbnlQZXJzb25hUmVzb3VyY2UgPSBhZ2VudFJlc291cmNlLmFkZFJlc291cmNlKCdjb21wYW55LXBlcnNvbmEnKTtcbiAgICBjb25zdCBjb21wYW55UGVyc29uYVRlbmFudFJlc291cmNlID0gY29tcGFueVBlcnNvbmFSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3RlbmFudElkfScpO1xuICAgIGNvbnN0IGNvbXBhbnlQZXJzb25hSWRSZXNvdXJjZSA9IGNvbXBhbnlQZXJzb25hVGVuYW50UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3twZXJzb25hSWR9Jyk7XG4gICAgXG4gICAgY29tcGFueVBlcnNvbmFJZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5jb21wYW55UGVyc29uYUZ1bmN0aW9uKSk7XG4gICAgY29tcGFueVBlcnNvbmFJZFJlc291cmNlLmFkZENvcnNQcmVmbGlnaHQoe1xuICAgICAgYWxsb3dPcmlnaW5zOiBbJyonXSxcbiAgICAgIGFsbG93TWV0aG9kczogWydHRVQnLCAnT1BUSU9OUyddLFxuICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdBdXRob3JpemF0aW9uJ10sXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgYSBMYW1iZGEgZnVuY3Rpb24gcGVybWlzc2lvbiB0byBzZW5kIG1lc3NhZ2VzIHRvIHRoZSByZWxlYXNlIHF1ZXVlXG4gICAqL1xuICBwdWJsaWMgZ3JhbnRTZW5kVG9RdWV1ZShsYW1iZGFGdW5jdGlvbjogbGFtYmRhLklGdW5jdGlvbik6IHZvaWQge1xuICAgIHRoaXMucmVsZWFzZVF1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKGxhbWJkYUZ1bmN0aW9uKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAZGVwcmVjYXRlZCBVc2UgYXR0YWNoVG9BcGlHYXRld2F5KCkgaW5zdGVhZC4gVGhpcyBtZXRob2Qgd2lsbCBiZSByZW1vdmVkIGluIGEgZnV0dXJlIHZlcnNpb24uXG4gICAqL1xuICBwdWJsaWMgZ3JhbnRBcGlHYXRld2F5SW52b2tlKHJvbGU6IGlhbS5JUm9sZSk6IHZvaWQge1xuICAgIGNvbnNvbGUud2FybignZ3JhbnRBcGlHYXRld2F5SW52b2tlKCkgaXMgZGVwcmVjYXRlZC4gVXNlIGF0dGFjaFRvQXBpR2F0ZXdheSgpIGZvciBhdXRvbWF0aWMgaW50ZWdyYXRpb24uJyk7XG4gICAgXG4gICAgdGhpcy5jb21wYW55SW5mb0Z1bmN0aW9uLmdyYW50SW52b2tlKHJvbGUpO1xuICAgIHRoaXMucGVyc29uYXNGdW5jdGlvbi5ncmFudEludm9rZShyb2xlKTtcbiAgICB0aGlzLmNvbXBhbnlQZXJzb25hRnVuY3Rpb24uZ3JhbnRJbnZva2Uocm9sZSk7XG4gIH1cblxuICBwcml2YXRlIGZpbmRSZWxlYXNlUm91dGVyUGFja2FnZVBhdGgoKTogc3RyaW5nIHtcbiAgICB0cnkge1xuICAgICAgLy8gVHJ5IHRvIHJlc29sdmUgdGhlIHBhY2thZ2UgaW4gdGhlIGNvbnN1bWluZyBhcHBsaWNhdGlvblxuICAgICAgY29uc3QgcGFja2FnZUpzb25QYXRoID0gcmVxdWlyZS5yZXNvbHZlKCdAdG9sZHlhb25jZS9reC1yZWxlYXNlLXJvdXRlci9wYWNrYWdlLmpzb24nKTtcbiAgICAgIHJldHVybiBwYXRoLmRpcm5hbWUocGFja2FnZUpzb25QYXRoKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgLy8gRmFsbGJhY2sgZm9yIGRldmVsb3BtZW50IC0gbG9vayBmb3IgdGhlIHBhY2thZ2UgaW4gdGhlIG1vbm9yZXBvXG4gICAgICBjb25zdCBmYWxsYmFja1BhdGggPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vLi4vcmVsZWFzZS1yb3V0ZXInKTtcbiAgICAgIGlmIChyZXF1aXJlKCdmcycpLmV4aXN0c1N5bmMoZmFsbGJhY2tQYXRoKSkge1xuICAgICAgICByZXR1cm4gZmFsbGJhY2tQYXRoO1xuICAgICAgfVxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZmluZCBAdG9sZHlhb25jZS9reC1yZWxlYXNlLXJvdXRlciBwYWNrYWdlLiBQbGVhc2UgZW5zdXJlIGl0J3MgaW5zdGFsbGVkLmApO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZmluZFJ1bnRpbWVQYWNrYWdlUGF0aCgpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAvLyBUcnkgdG8gcmVzb2x2ZSB0aGUgcGFja2FnZSBpbiB0aGUgY29uc3VtaW5nIGFwcGxpY2F0aW9uXG4gICAgICBjb25zdCBwYWNrYWdlSnNvblBhdGggPSByZXF1aXJlLnJlc29sdmUoJ0B0b2xkeWFvbmNlL2t4LWxhbmdjaGFpbi1hZ2VudC1ydW50aW1lL3BhY2thZ2UuanNvbicpO1xuICAgICAgcmV0dXJuIHBhdGguZGlybmFtZShwYWNrYWdlSnNvblBhdGgpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBGYWxsYmFjayBmb3IgZGV2ZWxvcG1lbnQgLSBsb29rIGZvciB0aGUgcGFja2FnZSBpbiB0aGUgbW9ub3JlcG9cbiAgICAgIGNvbnN0IGZhbGxiYWNrUGF0aCA9IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi8uLi9ydW50aW1lJyk7XG4gICAgICBpZiAocmVxdWlyZSgnZnMnKS5leGlzdHNTeW5jKGZhbGxiYWNrUGF0aCkpIHtcbiAgICAgICAgcmV0dXJuIGZhbGxiYWNrUGF0aDtcbiAgICAgIH1cbiAgICAgIHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGZpbmQgQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUgcGFja2FnZS4gUGxlYXNlIGVuc3VyZSBpdCdzIGluc3RhbGxlZC5gKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBEZWxheWVkUmVwbGllc1N0YWNrIC0gU3RhbmRhbG9uZSBTdGFjayB2ZXJzaW9uIChmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSlcbiAqIEBkZXByZWNhdGVkIFVzZSBEZWxheWVkUmVwbGllcyBjb25zdHJ1Y3Qgd2l0aGluIHlvdXIgZXhpc3Rpbmcgc3RhY2sgaW5zdGVhZCB0byBhdm9pZCBjcm9zcy1zdGFjayByZWZlcmVuY2UgaXNzdWVzXG4gKi9cbmV4cG9ydCBjbGFzcyBEZWxheWVkUmVwbGllc1N0YWNrIGV4dGVuZHMgU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgZGVsYXllZFJlcGxpZXM6IERlbGF5ZWRSZXBsaWVzO1xuICBcbiAgLy8gRXhwb3NlIGluZGl2aWR1YWwgcmVzb3VyY2VzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gIHB1YmxpYyByZWFkb25seSByZWxlYXNlUXVldWU6IHNxcy5RdWV1ZTtcbiAgcHVibGljIHJlYWRvbmx5IHJlbGVhc2VSb3V0ZXJGdW5jdGlvbjogbGFtYmRhTm9kZWpzLk5vZGVqc0Z1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgY29tcGFueUluZm9UYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHB1YmxpYyByZWFkb25seSBwZXJzb25hc1RhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHVibGljIHJlYWRvbmx5IGNvbXBhbnlJbmZvRnVuY3Rpb246IGxhbWJkYU5vZGVqcy5Ob2RlanNGdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IHBlcnNvbmFzRnVuY3Rpb246IGxhbWJkYU5vZGVqcy5Ob2RlanNGdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGNvbXBhbnlQZXJzb25hRnVuY3Rpb246IGxhbWJkYU5vZGVqcy5Ob2RlanNGdW5jdGlvbjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRGVsYXllZFJlcGxpZXNTdGFja1Byb3BzID0ge30pIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgRGVsYXllZFJlcGxpZXMgY29uc3RydWN0XG4gICAgdGhpcy5kZWxheWVkUmVwbGllcyA9IG5ldyBEZWxheWVkUmVwbGllcyh0aGlzLCAnRGVsYXllZFJlcGxpZXMnLCB7XG4gICAgICBldmVudEJ1c05hbWU6IHByb3BzLmV2ZW50QnVzTmFtZSxcbiAgICAgIGV4aXN0aW5nQWdlbnRGdW5jdGlvbjogcHJvcHMuZXhpc3RpbmdBZ2VudEZ1bmN0aW9uLFxuICAgICAgYXBpR2F0ZXdheUNvbmZpZzogcHJvcHMuYXBpR2F0ZXdheUNvbmZpZyxcbiAgICB9KTtcblxuICAgIC8vIEV4cG9zZSByZXNvdXJjZXMgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAgICB0aGlzLnJlbGVhc2VRdWV1ZSA9IHRoaXMuZGVsYXllZFJlcGxpZXMucmVsZWFzZVF1ZXVlO1xuICAgIHRoaXMucmVsZWFzZVJvdXRlckZ1bmN0aW9uID0gdGhpcy5kZWxheWVkUmVwbGllcy5yZWxlYXNlUm91dGVyRnVuY3Rpb247XG4gICAgdGhpcy5jb21wYW55SW5mb1RhYmxlID0gdGhpcy5kZWxheWVkUmVwbGllcy5jb21wYW55SW5mb1RhYmxlO1xuICAgIHRoaXMucGVyc29uYXNUYWJsZSA9IHRoaXMuZGVsYXllZFJlcGxpZXMucGVyc29uYXNUYWJsZTtcbiAgICB0aGlzLmNvbXBhbnlJbmZvRnVuY3Rpb24gPSB0aGlzLmRlbGF5ZWRSZXBsaWVzLmNvbXBhbnlJbmZvRnVuY3Rpb247XG4gICAgdGhpcy5wZXJzb25hc0Z1bmN0aW9uID0gdGhpcy5kZWxheWVkUmVwbGllcy5wZXJzb25hc0Z1bmN0aW9uO1xuICAgIHRoaXMuY29tcGFueVBlcnNvbmFGdW5jdGlvbiA9IHRoaXMuZGVsYXllZFJlcGxpZXMuY29tcGFueVBlcnNvbmFGdW5jdGlvbjtcblxuICAgIC8vIEV4cG9ydCB2YWx1ZXMgZm9yIGludGVncmF0aW9uXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIlJlcGx5UmVsZWFzZVF1ZXVlVXJsXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnJlbGVhc2VRdWV1ZS5xdWV1ZVVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlVSTCBvZiB0aGUgcmVwbHkgcmVsZWFzZSBxdWV1ZVwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7aWR9LVJlcGx5UmVsZWFzZVF1ZXVlVXJsYFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIlJlcGx5UmVsZWFzZVF1ZXVlQXJuXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnJlbGVhc2VRdWV1ZS5xdWV1ZUFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFSTiBvZiB0aGUgcmVwbHkgcmVsZWFzZSBxdWV1ZVwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7aWR9LVJlcGx5UmVsZWFzZVF1ZXVlQXJuYFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIlJlbGVhc2VSb3V0ZXJGdW5jdGlvbkFyblwiLCB7XG4gICAgICB2YWx1ZTogdGhpcy5yZWxlYXNlUm91dGVyRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogXCJBUk4gb2YgdGhlIHJlbGVhc2Ugcm91dGVyIGZ1bmN0aW9uXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHtpZH0tUmVsZWFzZVJvdXRlckZ1bmN0aW9uQXJuYFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIkNvbXBhbnlJbmZvVGFibGVOYW1lXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmNvbXBhbnlJbmZvVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IFwiTmFtZSBvZiB0aGUgY29tcGFueSBpbmZvIHRhYmxlXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHtpZH0tQ29tcGFueUluZm9UYWJsZU5hbWVgXG4gICAgfSk7XG5cbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiUGVyc29uYXNUYWJsZU5hbWVcIiwge1xuICAgICAgdmFsdWU6IHRoaXMucGVyc29uYXNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogXCJOYW1lIG9mIHRoZSBwZXJzb25hcyB0YWJsZVwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7aWR9LVBlcnNvbmFzVGFibGVOYW1lYFxuICAgIH0pO1xuXG4gICAgbmV3IENmbk91dHB1dCh0aGlzLCBcIkNvbXBhbnlJbmZvRnVuY3Rpb25Bcm5cIiwge1xuICAgICAgdmFsdWU6IHRoaXMuY29tcGFueUluZm9GdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFSTiBvZiB0aGUgY29tcGFueSBpbmZvIGZ1bmN0aW9uXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHtpZH0tQ29tcGFueUluZm9GdW5jdGlvbkFybmBcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJQZXJzb25hc0Z1bmN0aW9uQXJuXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnBlcnNvbmFzRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogXCJBUk4gb2YgdGhlIHBlcnNvbmFzIGZ1bmN0aW9uXCIsXG4gICAgICBleHBvcnROYW1lOiBgJHtpZH0tUGVyc29uYXNGdW5jdGlvbkFybmBcbiAgICB9KTtcblxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJDb21wYW55UGVyc29uYUZ1bmN0aW9uQXJuXCIsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmNvbXBhbnlQZXJzb25hRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogXCJBUk4gb2YgdGhlIGNvbXBhbnkgcGVyc29uYSBmdW5jdGlvblwiLFxuICAgICAgZXhwb3J0TmFtZTogYCR7aWR9LUNvbXBhbnlQZXJzb25hRnVuY3Rpb25Bcm5gXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgYSBMYW1iZGEgZnVuY3Rpb24gcGVybWlzc2lvbiB0byBzZW5kIG1lc3NhZ2VzIHRvIHRoZSByZWxlYXNlIHF1ZXVlXG4gICAqL1xuICBwdWJsaWMgZ3JhbnRTZW5kVG9RdWV1ZShsYW1iZGFGdW5jdGlvbjogbGFtYmRhLklGdW5jdGlvbik6IHZvaWQge1xuICAgIHRoaXMuZGVsYXllZFJlcGxpZXMuZ3JhbnRTZW5kVG9RdWV1ZShsYW1iZGFGdW5jdGlvbik7XG4gIH1cblxuICAvKipcbiAgICogQXR0YWNoIE1hbmFnZW1lbnQgQVBJIGVuZHBvaW50cyB0byBhbiBleGlzdGluZyBBUEkgR2F0ZXdheVxuICAgKi9cbiAgcHVibGljIGF0dGFjaFRvQXBpR2F0ZXdheShhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaSwgYmFzZVBhdGg/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLmRlbGF5ZWRSZXBsaWVzLmF0dGFjaFRvQXBpR2F0ZXdheShhcGksIGJhc2VQYXRoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAZGVwcmVjYXRlZCBVc2UgYXR0YWNoVG9BcGlHYXRld2F5KCkgaW5zdGVhZC4gVGhpcyBtZXRob2Qgd2lsbCBiZSByZW1vdmVkIGluIGEgZnV0dXJlIHZlcnNpb24uXG4gICAqL1xuICBwdWJsaWMgZ3JhbnRBcGlHYXRld2F5SW52b2tlKHJvbGU6IGlhbS5JUm9sZSk6IHZvaWQge1xuICAgIHRoaXMuZGVsYXllZFJlcGxpZXMuZ3JhbnRBcGlHYXRld2F5SW52b2tlKHJvbGUpO1xuICB9XG59Il19