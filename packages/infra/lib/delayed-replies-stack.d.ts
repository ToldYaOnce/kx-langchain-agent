import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
export interface DelayedRepliesProps {
    eventBusName?: string;
    existingAgentFunction?: lambda.IFunction;
    apiGatewayConfig?: {
        existingApi: apigateway.RestApi;
        basePath?: string;
    };
    chatHistoryTableName?: string;
    chatHistoryTableArn?: string;
    channelsTableName?: string;
}
export interface DelayedRepliesStackProps extends StackProps {
    eventBusName?: string;
    existingAgentFunction?: lambda.IFunction;
    apiGatewayConfig?: {
        existingApi: apigateway.RestApi;
        basePath?: string;
    };
    channelsTableName?: string;
    chatHistoryTableName?: string;
    chatHistoryTableArn?: string;
}
/**
 * DelayedReplies Construct - Use this within an existing Stack to avoid cross-stack reference issues
 * This is the recommended approach following the pattern from kx-auth
 */
export declare class DelayedReplies extends Construct {
    readonly releaseQueue: sqs.Queue;
    readonly releaseRouterFunction: lambdaNodejs.NodejsFunction;
    readonly companyInfoTable: dynamodb.Table;
    readonly personasTable: dynamodb.Table;
    readonly companyInfoFunction: lambdaNodejs.NodejsFunction;
    readonly personasFunction: lambdaNodejs.NodejsFunction;
    readonly companyPersonaFunction: lambdaNodejs.NodejsFunction;
    constructor(scope: Construct, id: string, props?: DelayedRepliesProps);
    /**
     * Attach Management API endpoints to an existing API Gateway
     */
    attachToApiGateway(api: apigateway.RestApi, basePath?: string): void;
    /**
     * Grant a Lambda function permission to send messages to the release queue
     */
    grantSendToQueue(lambdaFunction: lambda.IFunction): void;
    /**
     * @deprecated Use attachToApiGateway() instead. This method will be removed in a future version.
     */
    grantApiGatewayInvoke(role: iam.IRole): void;
    private findReleaseRouterPackagePath;
    private findRuntimePackagePath;
}
/**
 * DelayedRepliesStack - Standalone Stack version (for backward compatibility)
 * @deprecated Use DelayedReplies construct within your existing stack instead to avoid cross-stack reference issues
 */
export declare class DelayedRepliesStack extends Stack {
    readonly delayedReplies: DelayedReplies;
    readonly releaseQueue: sqs.Queue;
    readonly releaseRouterFunction: lambdaNodejs.NodejsFunction;
    readonly companyInfoTable: dynamodb.Table;
    readonly personasTable: dynamodb.Table;
    readonly companyInfoFunction: lambdaNodejs.NodejsFunction;
    readonly personasFunction: lambdaNodejs.NodejsFunction;
    readonly companyPersonaFunction: lambdaNodejs.NodejsFunction;
    constructor(scope: Construct, id: string, props?: DelayedRepliesStackProps);
    /**
     * Grant a Lambda function permission to send messages to the release queue
     */
    grantSendToQueue(lambdaFunction: lambda.IFunction): void;
    /**
     * Attach Management API endpoints to an existing API Gateway
     */
    attachToApiGateway(api: apigateway.RestApi, basePath?: string): void;
    /**
     * @deprecated Use attachToApiGateway() instead. This method will be removed in a future version.
     */
    grantApiGatewayInvoke(role: iam.IRole): void;
}
