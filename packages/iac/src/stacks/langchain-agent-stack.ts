import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
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
    
    // Export physical names for cross-environment references
    this.exportPhysicalNames();
    
    // Add stack-level tags
    this.addStackTags();
  }
  
  /**
   * Export physical names as CDK outputs for cross-environment references
   */
  private exportPhysicalNames(): void {
    const physicalNames = this.agent.getPhysicalNames();
    
    // Agent Router Function
    new CfnOutput(this, 'AgentRouterFunctionArn', {
      value: physicalNames.agentRouterFunctionArn,
      description: 'ARN of the Agent Router Lambda function',
      exportName: `${this.stackName}-AgentRouterFunctionArn`,
    });
    
    new CfnOutput(this, 'AgentRouterFunctionName', {
      value: physicalNames.agentRouterFunctionName,
      description: 'Name of the Agent Router Lambda function',
      exportName: `${this.stackName}-AgentRouterFunctionName`,
    });
    
    if (physicalNames.agentRouterRoleArn) {
      new CfnOutput(this, 'AgentRouterRoleArn', {
        value: physicalNames.agentRouterRoleArn,
        description: 'ARN of the Agent Router IAM role',
        exportName: `${this.stackName}-AgentRouterRoleArn`,
      });
    }
    
    // Agent Function
    new CfnOutput(this, 'AgentFunctionArn', {
      value: physicalNames.agentFunctionArn,
      description: 'ARN of the Agent Lambda function',
      exportName: `${this.stackName}-AgentFunctionArn`,
    });
    
    new CfnOutput(this, 'AgentFunctionName', {
      value: physicalNames.agentFunctionName,
      description: 'Name of the Agent Lambda function',
      exportName: `${this.stackName}-AgentFunctionName`,
    });
    
    if (physicalNames.agentRoleArn) {
      new CfnOutput(this, 'AgentRoleArn', {
        value: physicalNames.agentRoleArn,
        description: 'ARN of the Agent IAM role',
        exportName: `${this.stackName}-AgentRoleArn`,
      });
    }
    
    // Indexer Function (if exists)
    if (physicalNames.indexerFunctionArn) {
      new CfnOutput(this, 'IndexerFunctionArn', {
        value: physicalNames.indexerFunctionArn,
        description: 'ARN of the Indexer Lambda function',
        exportName: `${this.stackName}-IndexerFunctionArn`,
      });
    }
    
    if (physicalNames.indexerFunctionName) {
      new CfnOutput(this, 'IndexerFunctionName', {
        value: physicalNames.indexerFunctionName,
        description: 'Name of the Indexer Lambda function',
        exportName: `${this.stackName}-IndexerFunctionName`,
      });
    }
    
    if (physicalNames.indexerRoleArn) {
      new CfnOutput(this, 'IndexerRoleArn', {
        value: physicalNames.indexerRoleArn,
        description: 'ARN of the Indexer IAM role',
        exportName: `${this.stackName}-IndexerRoleArn`,
      });
    }
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
