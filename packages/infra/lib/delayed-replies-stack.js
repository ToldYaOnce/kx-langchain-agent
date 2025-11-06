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
exports.DelayedRepliesStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const lambdaNodejs = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const sources = __importStar(require("aws-cdk-lib/aws-lambda-event-sources"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const aws_cdk_lib_2 = require("aws-cdk-lib");
const path = __importStar(require("path"));
class DelayedRepliesStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props = {}) {
        super(scope, id, props);
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
        this.releaseRouterFunction = new lambdaNodejs.NodejsFunction(this, "ReleaseRouterFunction", {
            entry: path.join(__dirname, "../../release-router/src/handler.ts"),
            handler: "handler",
            runtime: lambda.Runtime.NODEJS_20_X,
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 256,
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
            maxBatchingWindow: aws_cdk_lib_1.Duration.seconds(5),
            reportBatchItemFailures: true
        }));
        // Grant permissions
        this.releaseQueue.grantConsumeMessages(this.releaseRouterFunction);
        // Allow release router to put events to EventBridge
        this.releaseRouterFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ["events:PutEvents"],
            resources: [
                `arn:aws:events:${this.region}:${this.account}:event-bus/${eventBusName}`,
                `arn:aws:events:${this.region}:${this.account}:event-bus/default`
            ]
        }));
        // If existing Agent Lambda is provided, grant it permission to send to our queue
        if (props.existingAgentLambdaArn) {
            const agentLambdaRole = iam.Role.fromRoleArn(this, "ExistingAgentRole", props.existingAgentLambdaArn.replace(":function:", ":role/"));
            this.releaseQueue.grantSendMessages(agentLambdaRole);
        }
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
            removalPolicy: aws_cdk_lib_2.RemovalPolicy.RETAIN, // Use DESTROY for dev environments
            pointInTimeRecovery: true,
        });
        // Create Management API Lambda functions
        const commonLambdaProps = {
            runtime: lambda.Runtime.NODEJS_20_X,
            timeout: aws_cdk_lib_1.Duration.seconds(30),
            memorySize: 512,
            environment: {
                COMPANY_INFO_TABLE: this.companyInfoTable.tableName,
                PERSONAS_TABLE: this.personasTable.tableName,
                NODE_OPTIONS: "--enable-source-maps"
            },
            bundling: {
                minify: true,
                sourceMap: true,
                target: "es2022"
            }
        };
        this.companyInfoFunction = new lambdaNodejs.NodejsFunction(this, "CompanyInfoFunction", {
            ...commonLambdaProps,
            entry: path.join(__dirname, "../../runtime/src/services/company-info-service.ts"),
            handler: "handler", // This will be provided by getApiMethodHandlers
            functionName: `${id}-company-info-service`,
            bundling: {
                ...commonLambdaProps.bundling,
                externalModules: [
                    "@aws-sdk/client-dynamodb",
                    "@aws-sdk/lib-dynamodb"
                ]
            }
        });
        this.personasFunction = new lambdaNodejs.NodejsFunction(this, "PersonasFunction", {
            ...commonLambdaProps,
            entry: path.join(__dirname, "../../runtime/src/services/personas-service.ts"),
            handler: "handler", // This will be provided by getApiMethodHandlers
            functionName: `${id}-personas-service`,
            bundling: {
                ...commonLambdaProps.bundling,
                externalModules: [
                    "@aws-sdk/client-dynamodb",
                    "@aws-sdk/lib-dynamodb"
                ]
            }
        });
        this.companyPersonaFunction = new lambdaNodejs.NodejsFunction(this, "CompanyPersonaFunction", {
            ...commonLambdaProps,
            entry: path.join(__dirname, "../../runtime/src/services/company-persona-service.ts"),
            handler: "handler", // This will be provided by getApiMethodHandlers
            functionName: `${id}-company-persona-service`,
            bundling: {
                ...commonLambdaProps.bundling,
                externalModules: [
                    "@aws-sdk/client-dynamodb",
                    "@aws-sdk/lib-dynamodb"
                ]
            }
        });
        // Grant DynamoDB permissions to Management API functions
        this.companyInfoTable.grantReadWriteData(this.companyInfoFunction);
        this.personasTable.grantReadWriteData(this.personasFunction);
        this.companyInfoTable.grantReadData(this.companyPersonaFunction);
        this.personasTable.grantReadData(this.companyPersonaFunction);
        // Management API Lambda function ARNs for consumer integration
        new aws_cdk_lib_1.CfnOutput(this, "CompanyInfoFunctionArn", {
            value: this.companyInfoFunction.functionArn,
            description: "ARN of the company info service function",
            exportName: `${id}-CompanyInfoFunctionArn`
        });
        new aws_cdk_lib_1.CfnOutput(this, "PersonasFunctionArn", {
            value: this.personasFunction.functionArn,
            description: "ARN of the personas service function",
            exportName: `${id}-PersonasFunctionArn`
        });
        new aws_cdk_lib_1.CfnOutput(this, "CompanyPersonaFunctionArn", {
            value: this.companyPersonaFunction.functionArn,
            description: "ARN of the company persona service function",
            exportName: `${id}-CompanyPersonaFunctionArn`
        });
        // Automatic API Gateway integration if provided
        if (props.apiGatewayConfig?.existingApi) {
            this.attachToApiGateway(props.apiGatewayConfig.existingApi, props.apiGatewayConfig.basePath);
        }
    }
    /**
     * Grant an existing Lambda function permission to send messages to the release queue
     */
    grantSendToQueue(lambdaFunction) {
        this.releaseQueue.grantSendMessages(lambdaFunction);
    }
    /**
     * Get Lambda function ARNs for attaching to consumer's API Gateway
     */
    getManagementApiFunctions() {
        return {
            companyInfo: {
                functionArn: this.companyInfoFunction.functionArn,
                functionName: this.companyInfoFunction.functionName,
                basePath: '/company-info'
            },
            personas: {
                functionArn: this.personasFunction.functionArn,
                functionName: this.personasFunction.functionName,
                basePath: '/personas'
            },
            companyPersona: {
                functionArn: this.companyPersonaFunction.functionArn,
                functionName: this.companyPersonaFunction.functionName,
                basePath: '/company-persona'
            }
        };
    }
    /**
     * Grant API Gateway permission to invoke the Management API functions
     * @deprecated Use attachToApiGateway() for automatic integration or LambdaIntegration for manual setup
     */
    grantApiGatewayInvoke(apiGatewayArn) {
        const apiGatewayPrincipal = new iam.ServicePrincipal('apigateway.amazonaws.com');
        this.companyInfoFunction.addPermission('ApiGatewayInvokeCompanyInfo', {
            principal: apiGatewayPrincipal,
            sourceArn: `${apiGatewayArn}/*/*`
        });
        this.personasFunction.addPermission('ApiGatewayInvokePersonas', {
            principal: apiGatewayPrincipal,
            sourceArn: `${apiGatewayArn}/*/*`
        });
        this.companyPersonaFunction.addPermission('ApiGatewayInvokeCompanyPersona', {
            principal: apiGatewayPrincipal,
            sourceArn: `${apiGatewayArn}/*/*`
        });
    }
    /**
     * Automatically attach Management API endpoints to an existing API Gateway
     * This follows the pattern from @toldyaonce/kx-notifications-and-messaging-cdk
     */
    attachToApiGateway(api, basePath = '') {
        // Company Info endpoints
        const companyInfoResource = api.root.resourceForPath(`${basePath}/company-info`);
        const companyInfoIntegration = new apigateway.LambdaIntegration(this.companyInfoFunction);
        companyInfoResource.addMethod('POST', companyInfoIntegration);
        companyInfoResource.addMethod('GET', companyInfoIntegration);
        companyInfoResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization']
        });
        const companyByIdResource = companyInfoResource.addResource('{tenantId}');
        companyByIdResource.addMethod('GET', companyInfoIntegration);
        companyByIdResource.addMethod('PATCH', companyInfoIntegration);
        companyByIdResource.addMethod('DELETE', companyInfoIntegration);
        companyByIdResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization']
        });
        // Personas endpoints
        const personasResource = api.root.resourceForPath(`${basePath}/personas`);
        const personasIntegration = new apigateway.LambdaIntegration(this.personasFunction);
        const personasByTenantResource = personasResource.addResource('{tenantId}');
        personasByTenantResource.addMethod('GET', personasIntegration);
        personasByTenantResource.addMethod('POST', personasIntegration);
        personasByTenantResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization']
        });
        const personaByIdResource = personasByTenantResource.addResource('{personaId}');
        personaByIdResource.addMethod('GET', personasIntegration);
        personaByIdResource.addMethod('PATCH', personasIntegration);
        personaByIdResource.addMethod('DELETE', personasIntegration);
        personaByIdResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization']
        });
        const randomPersonaResource = personasByTenantResource.addResource('random');
        randomPersonaResource.addMethod('GET', personasIntegration);
        randomPersonaResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization']
        });
        // Company Persona endpoints
        const companyPersonaResource = api.root.resourceForPath(`${basePath}/company-persona`);
        const companyPersonaIntegration = new apigateway.LambdaIntegration(this.companyPersonaFunction);
        const companyPersonaByTenantResource = companyPersonaResource.addResource('{tenantId}');
        companyPersonaByTenantResource.addMethod('GET', companyPersonaIntegration);
        companyPersonaByTenantResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization']
        });
        const companyPersonaByIdResource = companyPersonaByTenantResource.addResource('{personaId}');
        companyPersonaByIdResource.addMethod('GET', companyPersonaIntegration);
        companyPersonaByIdResource.addCorsPreflight({
            allowOrigins: ['*'],
            allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization']
        });
    }
}
exports.DelayedRepliesStack = DelayedRepliesStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVsYXllZC1yZXBsaWVzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2RlbGF5ZWQtcmVwbGllcy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSw2Q0FBcUU7QUFFckUseURBQTJDO0FBQzNDLCtEQUFpRDtBQUNqRCw0RUFBOEQ7QUFDOUQseURBQTJDO0FBQzNDLDhFQUFnRTtBQUNoRSxtRUFBcUQ7QUFDckQsdUVBQXlEO0FBQ3pELDZDQUE0QztBQUM1QywyQ0FBNkI7QUFXN0IsTUFBYSxtQkFBb0IsU0FBUSxtQkFBSztJQVM1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLFFBQWtDLEVBQUU7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLFlBQVksSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxTQUFTLENBQUM7UUFFbkYsaURBQWlEO1FBQ2pELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzRCxJQUFJLEVBQUUsSUFBSTtZQUNWLFNBQVMsRUFBRSxHQUFHLEVBQUUscUJBQXFCO1lBQ3JDLGlCQUFpQixFQUFFLHNCQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUN2Qyx5QkFBeUIsRUFBRSxLQUFLO1lBQ2hDLDRDQUE0QztZQUM1QyxlQUFlLEVBQUU7Z0JBQ2YsS0FBSyxFQUFFLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUU7b0JBQ3hELElBQUksRUFBRSxJQUFJO29CQUNWLFNBQVMsRUFBRSxHQUFHLEVBQUUseUJBQXlCO2lCQUMxQyxDQUFDO2dCQUNGLGVBQWUsRUFBRSxDQUFDO2FBQ25CO1NB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QUFHLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBRWhHLE1BQU0sOEJBQThCLEdBQUcsc0JBQXNCLENBQUMsV0FBVyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3hGLDhCQUE4QixDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUseUJBQXlCLENBQUMsQ0FBQztRQUMzRSw4QkFBOEIsQ0FBQyxnQkFBZ0IsQ0FBQztZQUM5QyxZQUFZLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDbkIsWUFBWSxFQUFFLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUM7WUFDbEUsWUFBWSxFQUFFLENBQUMsY0FBYyxFQUFFLGVBQWUsQ0FBQztTQUNoRCxDQUFDLENBQUM7UUFFSCxNQUFNLDBCQUEwQixHQUFHLDhCQUE4QixDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM3RiwwQkFBMEIsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLHlCQUF5QixDQUFDLENBQUM7UUFDdkUsMEJBQTBCLENBQUMsZ0JBQWdCLENBQUM7WUFDMUMsWUFBWSxFQUFFLENBQUMsR0FBRyxDQUFDO1lBQ25CLFlBQVksRUFBRSxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxDQUFDO1lBQ2xFLFlBQVksRUFBRSxDQUFDLGNBQWMsRUFBRSxlQUFlLENBQUM7U0FDaEQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBOVVELGtEQThVQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFN0YWNrLCBTdGFja1Byb3BzLCBEdXJhdGlvbiwgQ2ZuT3V0cHV0IH0gZnJvbSBcImF3cy1jZGstbGliXCI7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XHJcbmltcG9ydCAqIGFzIHNxcyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNxc1wiO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIjtcclxuaW1wb3J0ICogYXMgbGFtYmRhTm9kZWpzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqc1wiO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcclxuaW1wb3J0ICogYXMgc291cmNlcyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ldmVudC1zb3VyY2VzXCI7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcclxuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXlcIjtcclxuaW1wb3J0IHsgUmVtb3ZhbFBvbGljeSB9IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIERlbGF5ZWRSZXBsaWVzU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xyXG4gIGV2ZW50QnVzTmFtZT86IHN0cmluZztcclxuICBleGlzdGluZ0FnZW50TGFtYmRhQXJuPzogc3RyaW5nO1xyXG4gIGFwaUdhdGV3YXlDb25maWc/OiB7XHJcbiAgICBleGlzdGluZ0FwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xyXG4gICAgYmFzZVBhdGg/OiBzdHJpbmc7XHJcbiAgfTtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIERlbGF5ZWRSZXBsaWVzU3RhY2sgZXh0ZW5kcyBTdGFjayB7XHJcbiAgcHVibGljIHJlYWRvbmx5IHJlbGVhc2VRdWV1ZTogc3FzLlF1ZXVlO1xyXG4gIHB1YmxpYyByZWFkb25seSByZWxlYXNlUm91dGVyRnVuY3Rpb246IGxhbWJkYU5vZGVqcy5Ob2RlanNGdW5jdGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgY29tcGFueUluZm9UYWJsZTogZHluYW1vZGIuVGFibGU7XHJcbiAgcHVibGljIHJlYWRvbmx5IHBlcnNvbmFzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSBjb21wYW55SW5mb0Z1bmN0aW9uOiBsYW1iZGFOb2RlanMuTm9kZWpzRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IHBlcnNvbmFzRnVuY3Rpb246IGxhbWJkYU5vZGVqcy5Ob2RlanNGdW5jdGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgY29tcGFueVBlcnNvbmFGdW5jdGlvbjogbGFtYmRhTm9kZWpzLk5vZGVqc0Z1bmN0aW9uO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRGVsYXllZFJlcGxpZXNTdGFja1Byb3BzID0ge30pIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IGV2ZW50QnVzTmFtZSA9IHByb3BzLmV2ZW50QnVzTmFtZSB8fCBwcm9jZXNzLmVudi5FVkVOVF9CVVNfTkFNRSB8fCBcImRlZmF1bHRcIjtcclxuXHJcbiAgICAvLyBDcmVhdGUgRklGTyBxdWV1ZSBmb3IgZGVsYXllZCBtZXNzYWdlIHJlbGVhc2VzXHJcbiAgICB0aGlzLnJlbGVhc2VRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgXCJSZXBseVJlbGVhc2VRdWV1ZVwiLCB7XHJcbiAgICAgIGZpZm86IHRydWUsXHJcbiAgICAgIHF1ZXVlTmFtZTogYCR7aWR9LXJlcGx5LXJlbGVhc2UuZmlmb2AsXHJcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDYwKSxcclxuICAgICAgY29udGVudEJhc2VkRGVkdXBsaWNhdGlvbjogZmFsc2UsXHJcbiAgICAgIC8vIEFkZCBkZWFkIGxldHRlciBxdWV1ZSBmb3IgZmFpbGVkIG1lc3NhZ2VzXHJcbiAgICAgIGRlYWRMZXR0ZXJRdWV1ZToge1xyXG4gICAgICAgIHF1ZXVlOiBuZXcgc3FzLlF1ZXVlKHRoaXMsIFwiUmVwbHlSZWxlYXNlRGVhZExldHRlclF1ZXVlXCIsIHtcclxuICAgICAgICAgIGZpZm86IHRydWUsXHJcbiAgICAgICAgICBxdWV1ZU5hbWU6IGAke2lkfS1yZXBseS1yZWxlYXNlLWRscS5maWZvYCxcclxuICAgICAgICB9KSxcclxuICAgICAgICBtYXhSZWNlaXZlQ291bnQ6IDNcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIHJlbGVhc2Ugcm91dGVyIExhbWJkYSBmdW5jdGlvblxyXG4gICAgdGhpcy5yZWxlYXNlUm91dGVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZWpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsIFwiUmVsZWFzZVJvdXRlckZ1bmN0aW9uXCIsIHtcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLi4vcmVsZWFzZS1yb3V0ZXIvc3JjL2hhbmRsZXIudHNcIiksXHJcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlclwiLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcclxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBFVkVOVF9CVVNfTkFNRTogZXZlbnRCdXNOYW1lLFxyXG4gICAgICAgIE5PREVfT1BUSU9OUzogXCItLWVuYWJsZS1zb3VyY2UtbWFwc1wiXHJcbiAgICAgIH0sXHJcbiAgICAgIGJ1bmRsaW5nOiB7XHJcbiAgICAgICAgbWluaWZ5OiB0cnVlLFxyXG4gICAgICAgIHNvdXJjZU1hcDogdHJ1ZSxcclxuICAgICAgICB0YXJnZXQ6IFwiZXMyMDIyXCJcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIFNRUyBldmVudCBzb3VyY2UgdG8gTGFtYmRhXHJcbiAgICB0aGlzLnJlbGVhc2VSb3V0ZXJGdW5jdGlvbi5hZGRFdmVudFNvdXJjZShuZXcgc291cmNlcy5TcXNFdmVudFNvdXJjZSh0aGlzLnJlbGVhc2VRdWV1ZSwge1xyXG4gICAgICBiYXRjaFNpemU6IDUsXHJcbiAgICAgIG1heEJhdGNoaW5nV2luZG93OiBEdXJhdGlvbi5zZWNvbmRzKDUpLFxyXG4gICAgICByZXBvcnRCYXRjaEl0ZW1GYWlsdXJlczogdHJ1ZVxyXG4gICAgfSkpO1xyXG5cclxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zXHJcbiAgICB0aGlzLnJlbGVhc2VRdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyh0aGlzLnJlbGVhc2VSb3V0ZXJGdW5jdGlvbik7XHJcblxyXG4gICAgLy8gQWxsb3cgcmVsZWFzZSByb3V0ZXIgdG8gcHV0IGV2ZW50cyB0byBFdmVudEJyaWRnZVxyXG4gICAgdGhpcy5yZWxlYXNlUm91dGVyRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgYWN0aW9uczogW1wiZXZlbnRzOlB1dEV2ZW50c1wiXSxcclxuICAgICAgcmVzb3VyY2VzOiBbXHJcbiAgICAgICAgYGFybjphd3M6ZXZlbnRzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpldmVudC1idXMvJHtldmVudEJ1c05hbWV9YCxcclxuICAgICAgICBgYXJuOmF3czpldmVudHM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmV2ZW50LWJ1cy9kZWZhdWx0YFxyXG4gICAgICBdXHJcbiAgICB9KSk7XHJcblxyXG4gICAgLy8gSWYgZXhpc3RpbmcgQWdlbnQgTGFtYmRhIGlzIHByb3ZpZGVkLCBncmFudCBpdCBwZXJtaXNzaW9uIHRvIHNlbmQgdG8gb3VyIHF1ZXVlXHJcbiAgICBpZiAocHJvcHMuZXhpc3RpbmdBZ2VudExhbWJkYUFybikge1xyXG4gICAgICBjb25zdCBhZ2VudExhbWJkYVJvbGUgPSBpYW0uUm9sZS5mcm9tUm9sZUFybih0aGlzLCBcIkV4aXN0aW5nQWdlbnRSb2xlXCIsIFxyXG4gICAgICAgIHByb3BzLmV4aXN0aW5nQWdlbnRMYW1iZGFBcm4ucmVwbGFjZShcIjpmdW5jdGlvbjpcIiwgXCI6cm9sZS9cIilcclxuICAgICAgKTtcclxuICAgICAgXHJcbiAgICAgIHRoaXMucmVsZWFzZVF1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKGFnZW50TGFtYmRhUm9sZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRXhwb3J0IHZhbHVlcyBmb3IgaW50ZWdyYXRpb25cclxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJSZXBseVJlbGVhc2VRdWV1ZVVybFwiLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLnJlbGVhc2VRdWV1ZS5xdWV1ZVVybCxcclxuICAgICAgZGVzY3JpcHRpb246IFwiVVJMIG9mIHRoZSByZXBseSByZWxlYXNlIHF1ZXVlXCIsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGAke2lkfS1SZXBseVJlbGVhc2VRdWV1ZVVybGBcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJSZXBseVJlbGVhc2VRdWV1ZUFyblwiLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLnJlbGVhc2VRdWV1ZS5xdWV1ZUFybixcclxuICAgICAgZGVzY3JpcHRpb246IFwiQVJOIG9mIHRoZSByZXBseSByZWxlYXNlIHF1ZXVlXCIsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGAke2lkfS1SZXBseVJlbGVhc2VRdWV1ZUFybmBcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBDZm5PdXRwdXQodGhpcywgXCJSZWxlYXNlUm91dGVyRnVuY3Rpb25Bcm5cIiwge1xyXG4gICAgICB2YWx1ZTogdGhpcy5yZWxlYXNlUm91dGVyRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFSTiBvZiB0aGUgcmVsZWFzZSByb3V0ZXIgZnVuY3Rpb25cIixcclxuICAgICAgZXhwb3J0TmFtZTogYCR7aWR9LVJlbGVhc2VSb3V0ZXJGdW5jdGlvbkFybmBcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiB0YWJsZXMgZm9yIE1hbmFnZW1lbnQgQVBJXHJcbiAgICB0aGlzLmNvbXBhbnlJbmZvVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0NvbXBhbnlJbmZvVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYCR7aWR9LWNvbXBhbnktaW5mb2AsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAndGVuYW50SWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LlJFVEFJTiwgLy8gVXNlIERFU1RST1kgZm9yIGRldiBlbnZpcm9ubWVudHNcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogdHJ1ZSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMucGVyc29uYXNUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnUGVyc29uYXNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgJHtpZH0tcGVyc29uYXNgLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ3RlbmFudElkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAncGVyc29uYUlkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogUmVtb3ZhbFBvbGljeS5SRVRBSU4sIC8vIFVzZSBERVNUUk9ZIGZvciBkZXYgZW52aXJvbm1lbnRzXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgTWFuYWdlbWVudCBBUEkgTGFtYmRhIGZ1bmN0aW9uc1xyXG4gICAgY29uc3QgY29tbW9uTGFtYmRhUHJvcHMgPSB7XHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxyXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIENPTVBBTllfSU5GT19UQUJMRTogdGhpcy5jb21wYW55SW5mb1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICBQRVJTT05BU19UQUJMRTogdGhpcy5wZXJzb25hc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICBOT0RFX09QVElPTlM6IFwiLS1lbmFibGUtc291cmNlLW1hcHNcIlxyXG4gICAgICB9LFxyXG4gICAgICBidW5kbGluZzoge1xyXG4gICAgICAgIG1pbmlmeTogdHJ1ZSxcclxuICAgICAgICBzb3VyY2VNYXA6IHRydWUsXHJcbiAgICAgICAgdGFyZ2V0OiBcImVzMjAyMlwiXHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5jb21wYW55SW5mb0Z1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVqcy5Ob2RlanNGdW5jdGlvbih0aGlzLCBcIkNvbXBhbnlJbmZvRnVuY3Rpb25cIiwge1xyXG4gICAgICAuLi5jb21tb25MYW1iZGFQcm9wcyxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLi4vcnVudGltZS9zcmMvc2VydmljZXMvY29tcGFueS1pbmZvLXNlcnZpY2UudHNcIiksXHJcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlclwiLCAvLyBUaGlzIHdpbGwgYmUgcHJvdmlkZWQgYnkgZ2V0QXBpTWV0aG9kSGFuZGxlcnNcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtpZH0tY29tcGFueS1pbmZvLXNlcnZpY2VgLFxyXG4gICAgICBidW5kbGluZzoge1xyXG4gICAgICAgIC4uLmNvbW1vbkxhbWJkYVByb3BzLmJ1bmRsaW5nLFxyXG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogW1xyXG4gICAgICAgICAgXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIixcclxuICAgICAgICAgIFwiQGF3cy1zZGsvbGliLWR5bmFtb2RiXCJcclxuICAgICAgICBdXHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMucGVyc29uYXNGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlanMuTm9kZWpzRnVuY3Rpb24odGhpcywgXCJQZXJzb25hc0Z1bmN0aW9uXCIsIHtcclxuICAgICAgLi4uY29tbW9uTGFtYmRhUHJvcHMsXHJcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uLy4uL3J1bnRpbWUvc3JjL3NlcnZpY2VzL3BlcnNvbmFzLXNlcnZpY2UudHNcIiksXHJcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlclwiLCAvLyBUaGlzIHdpbGwgYmUgcHJvdmlkZWQgYnkgZ2V0QXBpTWV0aG9kSGFuZGxlcnNcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtpZH0tcGVyc29uYXMtc2VydmljZWAsXHJcbiAgICAgIGJ1bmRsaW5nOiB7XHJcbiAgICAgICAgLi4uY29tbW9uTGFtYmRhUHJvcHMuYnVuZGxpbmcsXHJcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbXHJcbiAgICAgICAgICBcIkBhd3Mtc2RrL2NsaWVudC1keW5hbW9kYlwiLFxyXG4gICAgICAgICAgXCJAYXdzLXNkay9saWItZHluYW1vZGJcIlxyXG4gICAgICAgIF1cclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5jb21wYW55UGVyc29uYUZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVqcy5Ob2RlanNGdW5jdGlvbih0aGlzLCBcIkNvbXBhbnlQZXJzb25hRnVuY3Rpb25cIiwge1xyXG4gICAgICAuLi5jb21tb25MYW1iZGFQcm9wcyxcclxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLi4vcnVudGltZS9zcmMvc2VydmljZXMvY29tcGFueS1wZXJzb25hLXNlcnZpY2UudHNcIiksXHJcbiAgICAgIGhhbmRsZXI6IFwiaGFuZGxlclwiLCAvLyBUaGlzIHdpbGwgYmUgcHJvdmlkZWQgYnkgZ2V0QXBpTWV0aG9kSGFuZGxlcnNcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtpZH0tY29tcGFueS1wZXJzb25hLXNlcnZpY2VgLFxyXG4gICAgICBidW5kbGluZzoge1xyXG4gICAgICAgIC4uLmNvbW1vbkxhbWJkYVByb3BzLmJ1bmRsaW5nLFxyXG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogW1xyXG4gICAgICAgICAgXCJAYXdzLXNkay9jbGllbnQtZHluYW1vZGJcIixcclxuICAgICAgICAgIFwiQGF3cy1zZGsvbGliLWR5bmFtb2RiXCJcclxuICAgICAgICBdXHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zIHRvIE1hbmFnZW1lbnQgQVBJIGZ1bmN0aW9uc1xyXG4gICAgdGhpcy5jb21wYW55SW5mb1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLmNvbXBhbnlJbmZvRnVuY3Rpb24pO1xyXG4gICAgdGhpcy5wZXJzb25hc1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0aGlzLnBlcnNvbmFzRnVuY3Rpb24pO1xyXG4gICAgdGhpcy5jb21wYW55SW5mb1RhYmxlLmdyYW50UmVhZERhdGEodGhpcy5jb21wYW55UGVyc29uYUZ1bmN0aW9uKTtcclxuICAgIHRoaXMucGVyc29uYXNUYWJsZS5ncmFudFJlYWREYXRhKHRoaXMuY29tcGFueVBlcnNvbmFGdW5jdGlvbik7XHJcblxyXG4gICAgLy8gTWFuYWdlbWVudCBBUEkgTGFtYmRhIGZ1bmN0aW9uIEFSTnMgZm9yIGNvbnN1bWVyIGludGVncmF0aW9uXHJcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiQ29tcGFueUluZm9GdW5jdGlvbkFyblwiLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmNvbXBhbnlJbmZvRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFSTiBvZiB0aGUgY29tcGFueSBpbmZvIHNlcnZpY2UgZnVuY3Rpb25cIixcclxuICAgICAgZXhwb3J0TmFtZTogYCR7aWR9LUNvbXBhbnlJbmZvRnVuY3Rpb25Bcm5gXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiUGVyc29uYXNGdW5jdGlvbkFyblwiLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLnBlcnNvbmFzRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFSTiBvZiB0aGUgcGVyc29uYXMgc2VydmljZSBmdW5jdGlvblwiLCBcclxuICAgICAgZXhwb3J0TmFtZTogYCR7aWR9LVBlcnNvbmFzRnVuY3Rpb25Bcm5gXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgQ2ZuT3V0cHV0KHRoaXMsIFwiQ29tcGFueVBlcnNvbmFGdW5jdGlvbkFyblwiLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmNvbXBhbnlQZXJzb25hRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFSTiBvZiB0aGUgY29tcGFueSBwZXJzb25hIHNlcnZpY2UgZnVuY3Rpb25cIixcclxuICAgICAgZXhwb3J0TmFtZTogYCR7aWR9LUNvbXBhbnlQZXJzb25hRnVuY3Rpb25Bcm5gXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBdXRvbWF0aWMgQVBJIEdhdGV3YXkgaW50ZWdyYXRpb24gaWYgcHJvdmlkZWRcclxuICAgIGlmIChwcm9wcy5hcGlHYXRld2F5Q29uZmlnPy5leGlzdGluZ0FwaSkge1xyXG4gICAgICB0aGlzLmF0dGFjaFRvQXBpR2F0ZXdheShwcm9wcy5hcGlHYXRld2F5Q29uZmlnLmV4aXN0aW5nQXBpLCBwcm9wcy5hcGlHYXRld2F5Q29uZmlnLmJhc2VQYXRoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdyYW50IGFuIGV4aXN0aW5nIExhbWJkYSBmdW5jdGlvbiBwZXJtaXNzaW9uIHRvIHNlbmQgbWVzc2FnZXMgdG8gdGhlIHJlbGVhc2UgcXVldWVcclxuICAgKi9cclxuICBwdWJsaWMgZ3JhbnRTZW5kVG9RdWV1ZShsYW1iZGFGdW5jdGlvbjogbGFtYmRhLklGdW5jdGlvbik6IHZvaWQge1xyXG4gICAgdGhpcy5yZWxlYXNlUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMobGFtYmRhRnVuY3Rpb24pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IExhbWJkYSBmdW5jdGlvbiBBUk5zIGZvciBhdHRhY2hpbmcgdG8gY29uc3VtZXIncyBBUEkgR2F0ZXdheVxyXG4gICAqL1xyXG4gIHB1YmxpYyBnZXRNYW5hZ2VtZW50QXBpRnVuY3Rpb25zKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgY29tcGFueUluZm86IHtcclxuICAgICAgICBmdW5jdGlvbkFybjogdGhpcy5jb21wYW55SW5mb0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxyXG4gICAgICAgIGZ1bmN0aW9uTmFtZTogdGhpcy5jb21wYW55SW5mb0Z1bmN0aW9uLmZ1bmN0aW9uTmFtZSxcclxuICAgICAgICBiYXNlUGF0aDogJy9jb21wYW55LWluZm8nXHJcbiAgICAgIH0sXHJcbiAgICAgIHBlcnNvbmFzOiB7XHJcbiAgICAgICAgZnVuY3Rpb25Bcm46IHRoaXMucGVyc29uYXNGdW5jdGlvbi5mdW5jdGlvbkFybixcclxuICAgICAgICBmdW5jdGlvbk5hbWU6IHRoaXMucGVyc29uYXNGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXHJcbiAgICAgICAgYmFzZVBhdGg6ICcvcGVyc29uYXMnXHJcbiAgICAgIH0sXHJcbiAgICAgIGNvbXBhbnlQZXJzb25hOiB7XHJcbiAgICAgICAgZnVuY3Rpb25Bcm46IHRoaXMuY29tcGFueVBlcnNvbmFGdW5jdGlvbi5mdW5jdGlvbkFybixcclxuICAgICAgICBmdW5jdGlvbk5hbWU6IHRoaXMuY29tcGFueVBlcnNvbmFGdW5jdGlvbi5mdW5jdGlvbk5hbWUsXHJcbiAgICAgICAgYmFzZVBhdGg6ICcvY29tcGFueS1wZXJzb25hJ1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR3JhbnQgQVBJIEdhdGV3YXkgcGVybWlzc2lvbiB0byBpbnZva2UgdGhlIE1hbmFnZW1lbnQgQVBJIGZ1bmN0aW9uc1xyXG4gICAqIEBkZXByZWNhdGVkIFVzZSBhdHRhY2hUb0FwaUdhdGV3YXkoKSBmb3IgYXV0b21hdGljIGludGVncmF0aW9uIG9yIExhbWJkYUludGVncmF0aW9uIGZvciBtYW51YWwgc2V0dXBcclxuICAgKi9cclxuICBwdWJsaWMgZ3JhbnRBcGlHYXRld2F5SW52b2tlKGFwaUdhdGV3YXlBcm46IHN0cmluZyk6IHZvaWQge1xyXG4gICAgY29uc3QgYXBpR2F0ZXdheVByaW5jaXBhbCA9IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnYXBpZ2F0ZXdheS5hbWF6b25hd3MuY29tJyk7XHJcbiAgICBcclxuICAgIHRoaXMuY29tcGFueUluZm9GdW5jdGlvbi5hZGRQZXJtaXNzaW9uKCdBcGlHYXRld2F5SW52b2tlQ29tcGFueUluZm8nLCB7XHJcbiAgICAgIHByaW5jaXBhbDogYXBpR2F0ZXdheVByaW5jaXBhbCxcclxuICAgICAgc291cmNlQXJuOiBgJHthcGlHYXRld2F5QXJufS8qLypgXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLnBlcnNvbmFzRnVuY3Rpb24uYWRkUGVybWlzc2lvbignQXBpR2F0ZXdheUludm9rZVBlcnNvbmFzJywge1xyXG4gICAgICBwcmluY2lwYWw6IGFwaUdhdGV3YXlQcmluY2lwYWwsXHJcbiAgICAgIHNvdXJjZUFybjogYCR7YXBpR2F0ZXdheUFybn0vKi8qYFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5jb21wYW55UGVyc29uYUZ1bmN0aW9uLmFkZFBlcm1pc3Npb24oJ0FwaUdhdGV3YXlJbnZva2VDb21wYW55UGVyc29uYScsIHtcclxuICAgICAgcHJpbmNpcGFsOiBhcGlHYXRld2F5UHJpbmNpcGFsLFxyXG4gICAgICBzb3VyY2VBcm46IGAke2FwaUdhdGV3YXlBcm59LyovKmBcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQXV0b21hdGljYWxseSBhdHRhY2ggTWFuYWdlbWVudCBBUEkgZW5kcG9pbnRzIHRvIGFuIGV4aXN0aW5nIEFQSSBHYXRld2F5XHJcbiAgICogVGhpcyBmb2xsb3dzIHRoZSBwYXR0ZXJuIGZyb20gQHRvbGR5YW9uY2Uva3gtbm90aWZpY2F0aW9ucy1hbmQtbWVzc2FnaW5nLWNka1xyXG4gICAqL1xyXG4gIHB1YmxpYyBhdHRhY2hUb0FwaUdhdGV3YXkoYXBpOiBhcGlnYXRld2F5LlJlc3RBcGksIGJhc2VQYXRoOiBzdHJpbmcgPSAnJyk6IHZvaWQge1xyXG4gICAgLy8gQ29tcGFueSBJbmZvIGVuZHBvaW50c1xyXG4gICAgY29uc3QgY29tcGFueUluZm9SZXNvdXJjZSA9IGFwaS5yb290LnJlc291cmNlRm9yUGF0aChgJHtiYXNlUGF0aH0vY29tcGFueS1pbmZvYCk7XHJcbiAgICBjb25zdCBjb21wYW55SW5mb0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGhpcy5jb21wYW55SW5mb0Z1bmN0aW9uKTtcclxuICAgIFxyXG4gICAgY29tcGFueUluZm9SZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBjb21wYW55SW5mb0ludGVncmF0aW9uKTtcclxuICAgIGNvbXBhbnlJbmZvUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBjb21wYW55SW5mb0ludGVncmF0aW9uKTtcclxuICAgIGNvbXBhbnlJbmZvUmVzb3VyY2UuYWRkQ29yc1ByZWZsaWdodCh7XHJcbiAgICAgIGFsbG93T3JpZ2luczogWycqJ10sXHJcbiAgICAgIGFsbG93TWV0aG9kczogWydHRVQnLCAnUE9TVCcsICdQVVQnLCAnUEFUQ0gnLCAnREVMRVRFJywgJ09QVElPTlMnXSxcclxuICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdBdXRob3JpemF0aW9uJ11cclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGNvbXBhbnlCeUlkUmVzb3VyY2UgPSBjb21wYW55SW5mb1Jlc291cmNlLmFkZFJlc291cmNlKCd7dGVuYW50SWR9Jyk7XHJcbiAgICBjb21wYW55QnlJZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgY29tcGFueUluZm9JbnRlZ3JhdGlvbik7XHJcbiAgICBjb21wYW55QnlJZFJlc291cmNlLmFkZE1ldGhvZCgnUEFUQ0gnLCBjb21wYW55SW5mb0ludGVncmF0aW9uKTtcclxuICAgIGNvbXBhbnlCeUlkUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBjb21wYW55SW5mb0ludGVncmF0aW9uKTtcclxuICAgIGNvbXBhbnlCeUlkUmVzb3VyY2UuYWRkQ29yc1ByZWZsaWdodCh7XHJcbiAgICAgIGFsbG93T3JpZ2luczogWycqJ10sXHJcbiAgICAgIGFsbG93TWV0aG9kczogWydHRVQnLCAnUE9TVCcsICdQVVQnLCAnUEFUQ0gnLCAnREVMRVRFJywgJ09QVElPTlMnXSxcclxuICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdBdXRob3JpemF0aW9uJ11cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFBlcnNvbmFzIGVuZHBvaW50c1xyXG4gICAgY29uc3QgcGVyc29uYXNSZXNvdXJjZSA9IGFwaS5yb290LnJlc291cmNlRm9yUGF0aChgJHtiYXNlUGF0aH0vcGVyc29uYXNgKTtcclxuICAgIGNvbnN0IHBlcnNvbmFzSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLnBlcnNvbmFzRnVuY3Rpb24pO1xyXG4gICAgXHJcbiAgICBjb25zdCBwZXJzb25hc0J5VGVuYW50UmVzb3VyY2UgPSBwZXJzb25hc1Jlc291cmNlLmFkZFJlc291cmNlKCd7dGVuYW50SWR9Jyk7XHJcbiAgICBwZXJzb25hc0J5VGVuYW50UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBwZXJzb25hc0ludGVncmF0aW9uKTtcclxuICAgIHBlcnNvbmFzQnlUZW5hbnRSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBwZXJzb25hc0ludGVncmF0aW9uKTtcclxuICAgIHBlcnNvbmFzQnlUZW5hbnRSZXNvdXJjZS5hZGRDb3JzUHJlZmxpZ2h0KHtcclxuICAgICAgYWxsb3dPcmlnaW5zOiBbJyonXSxcclxuICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQT1NUJywgJ1BVVCcsICdQQVRDSCcsICdERUxFVEUnLCAnT1BUSU9OUyddLFxyXG4gICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgcGVyc29uYUJ5SWRSZXNvdXJjZSA9IHBlcnNvbmFzQnlUZW5hbnRSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3BlcnNvbmFJZH0nKTtcclxuICAgIHBlcnNvbmFCeUlkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBwZXJzb25hc0ludGVncmF0aW9uKTtcclxuICAgIHBlcnNvbmFCeUlkUmVzb3VyY2UuYWRkTWV0aG9kKCdQQVRDSCcsIHBlcnNvbmFzSW50ZWdyYXRpb24pO1xyXG4gICAgcGVyc29uYUJ5SWRSZXNvdXJjZS5hZGRNZXRob2QoJ0RFTEVURScsIHBlcnNvbmFzSW50ZWdyYXRpb24pO1xyXG4gICAgcGVyc29uYUJ5SWRSZXNvdXJjZS5hZGRDb3JzUHJlZmxpZ2h0KHtcclxuICAgICAgYWxsb3dPcmlnaW5zOiBbJyonXSxcclxuICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQT1NUJywgJ1BVVCcsICdQQVRDSCcsICdERUxFVEUnLCAnT1BUSU9OUyddLFxyXG4gICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgcmFuZG9tUGVyc29uYVJlc291cmNlID0gcGVyc29uYXNCeVRlbmFudFJlc291cmNlLmFkZFJlc291cmNlKCdyYW5kb20nKTtcclxuICAgIHJhbmRvbVBlcnNvbmFSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIHBlcnNvbmFzSW50ZWdyYXRpb24pO1xyXG4gICAgcmFuZG9tUGVyc29uYVJlc291cmNlLmFkZENvcnNQcmVmbGlnaHQoe1xyXG4gICAgICBhbGxvd09yaWdpbnM6IFsnKiddLFxyXG4gICAgICBhbGxvd01ldGhvZHM6IFsnR0VUJywgJ1BPU1QnLCAnUFVUJywgJ1BBVENIJywgJ0RFTEVURScsICdPUFRJT05TJ10sXHJcbiAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbiddXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDb21wYW55IFBlcnNvbmEgZW5kcG9pbnRzXHJcbiAgICBjb25zdCBjb21wYW55UGVyc29uYVJlc291cmNlID0gYXBpLnJvb3QucmVzb3VyY2VGb3JQYXRoKGAke2Jhc2VQYXRofS9jb21wYW55LXBlcnNvbmFgKTtcclxuICAgIGNvbnN0IGNvbXBhbnlQZXJzb25hSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0aGlzLmNvbXBhbnlQZXJzb25hRnVuY3Rpb24pO1xyXG4gICAgXHJcbiAgICBjb25zdCBjb21wYW55UGVyc29uYUJ5VGVuYW50UmVzb3VyY2UgPSBjb21wYW55UGVyc29uYVJlc291cmNlLmFkZFJlc291cmNlKCd7dGVuYW50SWR9Jyk7XHJcbiAgICBjb21wYW55UGVyc29uYUJ5VGVuYW50UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBjb21wYW55UGVyc29uYUludGVncmF0aW9uKTtcclxuICAgIGNvbXBhbnlQZXJzb25hQnlUZW5hbnRSZXNvdXJjZS5hZGRDb3JzUHJlZmxpZ2h0KHtcclxuICAgICAgYWxsb3dPcmlnaW5zOiBbJyonXSxcclxuICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQT1NUJywgJ1BVVCcsICdQQVRDSCcsICdERUxFVEUnLCAnT1BUSU9OUyddLFxyXG4gICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ0F1dGhvcml6YXRpb24nXVxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3QgY29tcGFueVBlcnNvbmFCeUlkUmVzb3VyY2UgPSBjb21wYW55UGVyc29uYUJ5VGVuYW50UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3twZXJzb25hSWR9Jyk7XHJcbiAgICBjb21wYW55UGVyc29uYUJ5SWRSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGNvbXBhbnlQZXJzb25hSW50ZWdyYXRpb24pO1xyXG4gICAgY29tcGFueVBlcnNvbmFCeUlkUmVzb3VyY2UuYWRkQ29yc1ByZWZsaWdodCh7XHJcbiAgICAgIGFsbG93T3JpZ2luczogWycqJ10sXHJcbiAgICAgIGFsbG93TWV0aG9kczogWydHRVQnLCAnUE9TVCcsICdQVVQnLCAnUEFUQ0gnLCAnREVMRVRFJywgJ09QVElPTlMnXSxcclxuICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdBdXRob3JpemF0aW9uJ11cclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=