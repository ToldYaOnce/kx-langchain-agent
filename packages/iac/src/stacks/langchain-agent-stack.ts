import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import { LangchainAgent, LangchainAgentProps } from '../constructs/langchain-agent.js';

export interface LangchainAgentStackProps extends StackProps {
  /**
   * Properties for the LangchainAgent construct
   */
  agentProps: LangchainAgentProps;
  
  /**
   * Optional stack name prefix
   */
  stackNamePrefix?: string;
}

/**
 * Stack wrapper for the LangchainAgent construct
 * Provides a complete deployment unit for the agent
 */
export class LangchainAgentStack extends Stack {
  public readonly agent: LangchainAgent;
  
  constructor(scope: Construct, id: string, props: LangchainAgentStackProps) {
    super(scope, id, props);
    
    // Create the LangchainAgent construct
    this.agent = new LangchainAgent(this, 'LangchainAgent', props.agentProps);
    
    // Add stack-level tags
    this.addStackTags();
  }
  
  /**
   * Add common tags to the stack
   */
  private addStackTags(): void {
    this.tags.setTag('Project', 'KxGen');
    this.tags.setTag('Component', 'LangchainAgent');
    this.tags.setTag('ManagedBy', 'CDK');
  }
}

/**
 * Helper function to create a complete LangchainAgent stack
 */
export function createLangchainAgentStack(
  scope: Construct,
  id: string,
  props: {
    eventBusArn: string;
    messagesTableName: string;
    leadsTableName: string;
    bedrockModelId?: string;
    opensearchCollectionArn?: string;
    putEventsRoleArn?: string;
    env?: {
      account?: string;
      region?: string;
    };
  }
): LangchainAgentStack {
  return new LangchainAgentStack(scope, id, {
    env: props.env,
    agentProps: {
      eventBus: props.eventBusArn,
      existingTables: props.messagesTableName && props.leadsTableName ? {
        messagesTableName: props.messagesTableName,
        leadsTableName: props.leadsTableName,
      } : undefined,
      bedrockModelId: props.bedrockModelId || 'anthropic.claude-3-sonnet-20240229-v1:0',
      opensearchCollectionArn: props.opensearchCollectionArn,
      putEventsRoleArn: props.putEventsRoleArn,
    },
  });
}
