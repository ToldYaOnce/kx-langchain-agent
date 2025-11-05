import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
export interface DelayedRepliesStackProps extends StackProps {
    eventBusName?: string;
    existingAgentLambdaArn?: string;
}
export declare class DelayedRepliesStack extends Stack {
    readonly releaseQueue: sqs.Queue;
    readonly releaseRouterFunction: lambdaNodejs.NodejsFunction;
    constructor(scope: Construct, id: string, props?: DelayedRepliesStackProps);
    /**
     * Grant an existing Lambda function permission to send messages to the release queue
     */
    grantSendToQueue(lambdaFunction: lambda.IFunction): void;
}
//# sourceMappingURL=delayed-replies-stack.d.ts.map