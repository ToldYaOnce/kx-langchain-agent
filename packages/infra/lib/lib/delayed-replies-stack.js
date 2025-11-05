import { Stack, Duration, CfnOutput } from "aws-cdk-lib";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { RemovalPolicy } from "aws-cdk-lib";
import * as path from "path";
export class DelayedRepliesStack extends Stack {
    releaseQueue;
    releaseRouterFunction;
    companyInfoTable;
    personasTable;
    companyInfoFunction;
    personasFunction;
    companyPersonaFunction;
    constructor(scope, id, props = {}) {
        super(scope, id, props);
        const eventBusName = props.eventBusName || process.env.EVENT_BUS_NAME || "default";
        // Create FIFO queue for delayed message releases
        this.releaseQueue = new sqs.Queue(this, "ReplyReleaseQueue", {
            fifo: true,
            queueName: `${id}-reply-release.fifo`,
            visibilityTimeout: Duration.seconds(60),
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
            timeout: Duration.seconds(30),
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
            maxBatchingWindow: Duration.seconds(5),
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
        new CfnOutput(this, "ReplyReleaseQueueUrl", {
            value: this.releaseQueue.queueUrl,
            description: "URL of the reply release queue",
            exportName: `${id}-ReplyReleaseQueueUrl`
        });
        new CfnOutput(this, "ReplyReleaseQueueArn", {
            value: this.releaseQueue.queueArn,
            description: "ARN of the reply release queue",
            exportName: `${id}-ReplyReleaseQueueArn`
        });
        new CfnOutput(this, "ReleaseRouterFunctionArn", {
            value: this.releaseRouterFunction.functionArn,
            description: "ARN of the release router function",
            exportName: `${id}-ReleaseRouterFunctionArn`
        });
        // Create DynamoDB tables for Management API
        this.companyInfoTable = new dynamodb.Table(this, 'CompanyInfoTable', {
            tableName: `${id}-company-info`,
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.RETAIN, // Use DESTROY for dev environments
            pointInTimeRecovery: true,
        });
        this.personasTable = new dynamodb.Table(this, 'PersonasTable', {
            tableName: `${id}-personas`,
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'personaId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.RETAIN, // Use DESTROY for dev environments
            pointInTimeRecovery: true,
        });
        // Create Management API Lambda functions
        const commonLambdaProps = {
            runtime: lambda.Runtime.NODEJS_20_X,
            timeout: Duration.seconds(30),
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
        new CfnOutput(this, "CompanyInfoFunctionArn", {
            value: this.companyInfoFunction.functionArn,
            description: "ARN of the company info service function",
            exportName: `${id}-CompanyInfoFunctionArn`
        });
        new CfnOutput(this, "PersonasFunctionArn", {
            value: this.personasFunction.functionArn,
            description: "ARN of the personas service function",
            exportName: `${id}-PersonasFunctionArn`
        });
        new CfnOutput(this, "CompanyPersonaFunctionArn", {
            value: this.companyPersonaFunction.functionArn,
            description: "ARN of the company persona service function",
            exportName: `${id}-CompanyPersonaFunctionArn`
        });
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
}
//# sourceMappingURL=delayed-replies-stack.js.map