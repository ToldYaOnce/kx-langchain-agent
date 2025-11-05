import chalk from 'chalk';
import ora from 'ora';
import {
  createTestConfig,
  type InboundMessageEvent,
  type MessageSource,
} from '@toldyaonce/kx-langchain-agent-runtime';
import { AgentRouterHandler as routerHandler } from '@toldyaonce/kx-langchain-agent-runtime';

interface SimulateOptions {
  tenantId: string;
  source: MessageSource;
  text: string;
  phone?: string;
  email?: string;
  putEvents?: boolean;
}

export async function simulateCommand(options: SimulateOptions): Promise<void> {
  console.log(chalk.blue('🎭 Simulating Inbound Message'));
  console.log(chalk.gray(`Tenant: ${options.tenantId}`));
  console.log(chalk.gray(`Source: ${options.source}`));
  console.log(chalk.gray(`Text: ${options.text}`));
  console.log('');

  try {
    // Validate options
    if (options.source === 'sms' && !options.phone) {
      throw new Error('Phone number is required for SMS source');
    }
    
    if ((options.source === 'email' || options.source === 'chat') && !options.email) {
      throw new Error('Email address is required for email/chat source');
    }

    // Create mock EventBridge event
    const mockEvent = createMockInboundEvent(options);
    
    console.log(chalk.yellow('📨 Mock Event:'));
    console.log(JSON.stringify(mockEvent, null, 2));
    console.log('');

    if (options.putEvents) {
      console.log(chalk.yellow('⚠️  --put-events flag detected, but publishing to real EventBridge is not implemented in this demo'));
      console.log(chalk.gray('In a real implementation, this would publish the event to your configured EventBridge bus'));
      console.log('');
    }

    // Set up environment for local execution
    setupLocalEnvironment();

    // Invoke the router handler directly
    const spinner = ora('🔄 Processing message through agent router...').start();

    try {
      await routerHandler(mockEvent as any, createMockLambdaContext());
      
      spinner.stop();
      console.log(chalk.green('✅ Message processed successfully'));
      console.log(chalk.gray('Check your DynamoDB tables and EventBridge bus for results'));
      
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('❌ Processing failed:'), error instanceof Error ? error.message : 'Unknown error');
      
      if (error instanceof Error) {
        console.error(chalk.red('Stack:'), error.stack);
      }
    }

  } catch (error) {
    console.error(chalk.red('❌ Simulation failed:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * Create a mock inbound message event
 */
function createMockInboundEvent(options: SimulateOptions): InboundMessageEvent {
  const now = new Date().toISOString();
  
  return {
    source: 'kxgen.messaging',
    'detail-type': 'lead.message.created',
    detail: {
      tenantId: options.tenantId,
      email_lc: options.email?.toLowerCase(),
      phone_e164: options.phone,
      source: options.source,
      text: options.text,
      timestamps: {
        received: now,
        processed: now,
      },
      channel_context: createChannelContext(options),
      provider: {
        mock: true,
        cli_generated: true,
      },
    },
  };
}

/**
 * Create channel context based on source
 */
function createChannelContext(options: SimulateOptions) {
  switch (options.source) {
    case 'sms':
      return {
        sms: {
          from: options.phone!,
          to: '+1234567890', // Mock destination
          messageId: `mock-sms-${Date.now()}`,
        },
      };
    
    case 'email':
      return {
        email: {
          from: options.email!,
          to: 'agent@kxgen.com', // Mock destination
          msgId: `mock-email-${Date.now()}`,
          threadId: `thread-${Date.now()}`,
        },
      };
    
    case 'chat':
      return {
        chat: {
          sessionId: `mock-session-${Date.now()}`,
          clientId: 'cli-client',
        },
      };
    
    default:
      return {};
  }
}

/**
 * Set up environment variables for local execution
 */
function setupLocalEnvironment(): void {
  const config = createTestConfig();
  
  // Set environment variables that the handlers expect
  process.env.MESSAGES_TABLE = process.env.MESSAGES_TABLE || config.messagesTable;
  process.env.LEADS_TABLE = process.env.LEADS_TABLE || config.leadsTable;
  process.env.BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || config.bedrockModelId;
  process.env.AWS_REGION = process.env.AWS_REGION || config.awsRegion;
  process.env.OUTBOUND_EVENT_BUS_NAME = process.env.OUTBOUND_EVENT_BUS_NAME || config.outboundEventBusName;
  process.env.HISTORY_LIMIT = process.env.HISTORY_LIMIT || config.historyLimit.toString();
  
  if (config.dynamodbEndpoint) {
    process.env.DYNAMODB_ENDPOINT = config.dynamodbEndpoint;
  }
}

/**
 * Create a mock Lambda context
 */
function createMockLambdaContext(): any {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'mock-function',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:mock-function',
    memoryLimitInMB: '512',
    awsRequestId: `mock-request-${Date.now()}`,
    logGroupName: '/aws/lambda/mock-function',
    logStreamName: `${new Date().toISOString().split('T')[0]}/[$LATEST]${Math.random().toString(36).substring(7)}`,
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
}
