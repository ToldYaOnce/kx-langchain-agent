#!/usr/bin/env node
/**
 * Example: Basic LangChain Agent Deployment
 * 
 * This example shows how to deploy the LangChain agent with minimal configuration.
 * Assumes you have existing DynamoDB tables and EventBridge bus.
 */

import { App } from 'aws-cdk-lib';
import { createLangchainAgentStack } from '@kxgen/langchain-agent-iac';

const app = new App();

// Basic deployment with required parameters
const basicStack = createLangchainAgentStack(app, 'KxGenLangchainAgentBasic', {
  // Required: EventBridge bus ARN (injected, not created)
  eventBusArn: process.env.EVENT_BUS_ARN || 'arn:aws:events:us-east-1:123456789012:event-bus/kxgen-events',
  
  // Required: DynamoDB table names (must exist)
  messagesTableName: process.env.MESSAGES_TABLE || 'kxgen-messages',
  leadsTableName: process.env.LEADS_TABLE || 'kxgen-leads',
  
  // Required: Bedrock model ID
  bedrockModelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0',
  
  // Deployment environment
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});

// Advanced deployment with RAG and cross-account EventBridge
const advancedStack = createLangchainAgentStack(app, 'KxGenLangchainAgentAdvanced', {
  eventBusArn: 'arn:aws:events:us-east-1:OTHER-ACCOUNT:event-bus/shared-events',
  messagesTableName: 'kxgen-messages-prod',
  leadsTableName: 'kxgen-leads-prod',
  bedrockModelId: 'anthropic.claude-3-opus-20240229-v1:0',
  
  // Optional: OpenSearch Serverless for RAG
  opensearchCollectionArn: process.env.OPENSEARCH_COLLECTION_ARN,
  
  // Optional: Cross-account EventBridge role
  putEventsRoleArn: process.env.PUT_EVENTS_ROLE_ARN,
  
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
});

app.synth();

/*
To deploy this example:

1. Set environment variables:
   export EVENT_BUS_ARN=arn:aws:events:us-east-1:123456789012:event-bus/your-bus
   export MESSAGES_TABLE=your-messages-table
   export LEADS_TABLE=your-leads-table
   export BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

2. Install dependencies:
   npm install @kxgen/langchain-agent-iac

3. Deploy:
   cdk synth
   cdk deploy KxGenLangchainAgentBasic

4. Verify deployment:
   aws lambda list-functions --query 'Functions[?contains(FunctionName, `agent`)].FunctionName'
   aws events list-rules --event-bus-name your-bus-name
*/
