import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as path from "path";

export interface DelayedRepliesStackProps extends StackProps {
  eventBusName?: string;
  existingAgentLambdaArn?: string;
}

export class DelayedRepliesStack extends Stack {
  public readonly releaseQueue: sqs.Queue;
  public readonly releaseRouterFunction: lambda.NodejsFunction;

  constructor(scope: Construct, id: string, props: DelayedRepliesStackProps = {}) {
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
    this.releaseRouterFunction = new lambda.NodejsFunction(this, "ReleaseRouterFunction", {
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
      const agentLambdaRole = iam.Role.fromRoleArn(this, "ExistingAgentRole", 
        props.existingAgentLambdaArn.replace(":function:", ":role/")
      );
      
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
  }

  /**
   * Grant an existing Lambda function permission to send messages to the release queue
   */
  public grantSendToQueue(lambdaFunction: lambda.IFunction): void {
    this.releaseQueue.grantSendMessages(lambdaFunction);
  }
}
