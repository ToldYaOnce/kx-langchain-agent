#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { createLangchainAgentStack } from './stacks/langchain-agent-stack.js';

const app = new App();

// Example deployment - customize based on your environment
const exampleStack = createLangchainAgentStack(app, 'KxGenLangchainAgentExample', {
  eventBusArn: process.env.EVENT_BUS_ARN || 'arn:aws:events:us-east-1:123456789012:event-bus/kxgen-events',
  messagesTableName: process.env.MESSAGES_TABLE || 'kxgen-messages',
  leadsTableName: process.env.LEADS_TABLE || 'kxgen-leads',
  bedrockModelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0',
  opensearchCollectionArn: process.env.OPENSEARCH_COLLECTION_ARN,
  putEventsRoleArn: process.env.PUT_EVENTS_ROLE_ARN,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});

app.synth();
