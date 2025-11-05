import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
export interface DelayedRepliesStackProps extends StackProps {
    eventBusName?: string;
    existingAgentLambdaArn?: string;
    apiGatewayConfig?: {
        existingApi: apigateway.RestApi;
        basePath?: string;
    };
}
export declare class DelayedRepliesStack extends Stack {
    readonly releaseQueue: sqs.Queue;
    readonly releaseRouterFunction: lambdaNodejs.NodejsFunction;
    readonly companyInfoTable: dynamodb.Table;
    readonly personasTable: dynamodb.Table;
    readonly companyInfoFunction: lambdaNodejs.NodejsFunction;
    readonly personasFunction: lambdaNodejs.NodejsFunction;
    readonly companyPersonaFunction: lambdaNodejs.NodejsFunction;
    constructor(scope: Construct, id: string, props?: DelayedRepliesStackProps);
    /**
     * Grant an existing Lambda function permission to send messages to the release queue
     */
    grantSendToQueue(lambdaFunction: lambda.IFunction): void;
    /**
     * Get Lambda function ARNs for attaching to consumer's API Gateway
     */
    getManagementApiFunctions(): {
        companyInfo: {
            functionArn: string;
            functionName: string;
            basePath: string;
        };
        personas: {
            functionArn: string;
            functionName: string;
            basePath: string;
        };
        companyPersona: {
            functionArn: string;
            functionName: string;
            basePath: string;
        };
    };
    /**
     * Grant API Gateway permission to invoke the Management API functions
     * @deprecated Use attachToApiGateway() for automatic integration or LambdaIntegration for manual setup
     */
    grantApiGatewayInvoke(apiGatewayArn: string): void;
    /**
     * Automatically attach Management API endpoints to an existing API Gateway
     * This follows the pattern from @toldyaonce/kx-notifications-and-messaging-cdk
     */
    attachToApiGateway(api: apigateway.RestApi, basePath?: string): void;
}
//# sourceMappingURL=delayed-replies-stack.d.ts.map