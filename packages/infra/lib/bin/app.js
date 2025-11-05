#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DelayedRepliesStack } from "../lib/delayed-replies-stack";
const app = new cdk.App();
new DelayedRepliesStack(app, "DelayedRepliesStack", {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
    eventBusName: process.env.EVENT_BUS_NAME || "default",
    existingAgentLambdaArn: process.env.EXISTING_AGENT_LAMBDA_ARN,
});
app.synth();
//# sourceMappingURL=app.js.map