import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as events from 'aws-cdk-lib/aws-events';
import { LangchainAgent } from './langchain-agent.js';

describe('LangchainAgent', () => {
  let app: App;
  let stack: Stack;
  let eventBus: events.IEventBus;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
    eventBus = events.EventBus.fromEventBusArn(
      stack,
      'TestEventBus',
      'arn:aws:events:us-east-1:123456789012:event-bus/test-bus'
    );
  });

  it('should create Lambda functions', () => {
    new LangchainAgent(stack, 'TestAgent', {
      eventBus,
      messagesTableName: 'test-messages',
      leadsTableName: 'test-leads',
      bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    });

    const template = Template.fromStack(stack);

    // Should create AgentRouter and Agent functions
    template.resourceCountIs('AWS::Lambda::Function', 2);

    // Should have correct runtime
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs20.x',
    });

    // Should have environment variables
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          MESSAGES_TABLE: 'test-messages',
          LEADS_TABLE: 'test-leads',
          BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
        },
      },
    });
  });

  it('should create EventBridge rule', () => {
    new LangchainAgent(stack, 'TestAgent', {
      eventBus,
      messagesTableName: 'test-messages',
      leadsTableName: 'test-leads',
      bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    });

    const template = Template.fromStack(stack);

    // Should create EventBridge rule
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['kxgen.messaging'],
        'detail-type': ['lead.message.created'],
      },
    });
  });

  it('should create indexer function when OpenSearch is provided', () => {
    new LangchainAgent(stack, 'TestAgent', {
      eventBus,
      messagesTableName: 'test-messages',
      leadsTableName: 'test-leads',
      bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      opensearchCollectionArn: 'arn:aws:aoss:us-east-1:123456789012:collection/test-collection',
    });

    const template = Template.fromStack(stack);

    // Should create 3 functions (router, agent, indexer)
    template.resourceCountIs('AWS::Lambda::Function', 3);
  });

  it('should create IAM roles with correct permissions', () => {
    new LangchainAgent(stack, 'TestAgent', {
      eventBus,
      messagesTableName: 'test-messages',
      leadsTableName: 'test-leads',
      bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    });

    const template = Template.fromStack(stack);

    // Should create IAM roles
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [{
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com',
          },
          Action: 'sts:AssumeRole',
        }],
      },
    });

    // Should have DynamoDB permissions
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [{
          Effect: 'Allow',
          Action: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:Query',
            'dynamodb:UpdateItem',
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
          ],
        }],
      },
    });
  });
});
