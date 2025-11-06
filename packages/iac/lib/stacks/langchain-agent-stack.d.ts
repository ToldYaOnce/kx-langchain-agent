import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
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
export declare class LangchainAgentStack extends Stack {
    readonly agent: LangchainAgent;
    constructor(scope: Construct, id: string, props: LangchainAgentStackProps);
    /**
     * Add common tags to the stack
     */
    private addStackTags;
}
/**
 * Helper function to create a complete LangchainAgent stack
 */
export declare function createLangchainAgentStack(scope: Construct, id: string, props: {
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
}): LangchainAgentStack;
