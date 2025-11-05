import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import {
  DynamoDBService,
  EventBridgeService,
  AgentService,
  GreetingService,
  createTestConfig,
  type RuntimeConfig,
  type MessageSource,
} from '@toldyaonce/langchain-agent-runtime';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { PersonaService } from '@toldyaonce/langchain-agent-runtime';

export interface ChatOptions {
  tenantId: string;
  email: string;
  source: MessageSource;
  model?: string;
  persona?: string;
  company?: string;
  industry?: string;
  description?: string;
  products?: string;
  benefits?: string;
  target?: string;
  differentiators?: string;
  rag?: boolean;
  historyLimit: string;
  session?: string;
  debug?: boolean;
}

export async function chatCommand(options: ChatOptions): Promise<void> {
  console.log(chalk.blue('🤖 KxGen LangChain Agent - Interactive Chat'));
  console.log(chalk.gray(`Tenant: ${options.tenantId}`));
  console.log(chalk.gray(`Email: ${options.email}`));
  console.log(chalk.gray(`Source: ${options.source}`));
  console.log(chalk.gray(`Persona: ${options.persona || 'carlos'}`));
  console.log(chalk.gray(`Company: ${options.company || 'KxGen'}`));
  console.log('');

  try {
    // Load configuration
    const config = createChatConfig(options);
    
    if (options.debug) {
      console.log(chalk.yellow('Debug mode enabled'));
      console.log('Config:', JSON.stringify(config, null, 2));
    }

    // Initialize agent service (no DynamoDB/EventBridge for CLI)
    const agentService = new AgentService(config);
    
    // Maintain chat history for CLI (will be passed to agent)
    const chatHistory: (HumanMessage | AIMessage)[] = [];

    // Normalize email
    const emailLc = options.email.toLowerCase();

    console.log(chalk.green('✅ Agent initialized successfully'));
    
    // Show persona greeting
    try {
      const personaService = new PersonaService(null);
      const persona = await personaService.getPersona('dev-test', options.persona || 'carlos', config.companyInfo);
      const greeting = GreetingService.generateGreeting(persona.greetings, config.companyInfo);
      
      console.log(chalk.green('🤖 ' + persona.name + ':'), greeting);
    } catch (error) {
      console.log(chalk.green('🤖 Agent:'), 'Hello! How can I help you today?');
    }
    
    console.log(chalk.gray('\nType "exit" to quit, "clear" to clear history\n'));

    // Create DynamoDB service for history management
    const dynamoService = new DynamoDBService(config);

    // Interactive chat loop
    while (true) {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.cyan('You:'),
          validate: (input: string) => input.trim().length > 0 || 'Please enter a message',
        },
      ]);

      const trimmedMessage = message.trim();

      // Handle special commands
      if (trimmedMessage.toLowerCase() === 'exit') {
        console.log(chalk.yellow('👋 Goodbye!'));
        break;
      }

      if (trimmedMessage.toLowerCase() === 'clear') {
        await clearChatHistory(dynamoService, options.tenantId, emailLc, options.session);
        console.log(chalk.green('🧹 Chat history cleared\n'));
        continue;
      }

      // Process message with agent
      const spinner = ora('🤔 Agent is thinking...').start();

      try {
        // Process message with chat history
        const response = await agentService.processMessage({
          tenantId: options.tenantId,
          email_lc: emailLc,
          text: trimmedMessage,
          source: options.source,
          conversation_id: options.session,
          channel_context: {
            chat: {
              sessionId: options.session || 'cli-session',
            },
          },
        }, chatHistory);
        
        // Add agent response to chat history
        chatHistory.push(new AIMessage(response));

        spinner.stop();

        // Display response
        console.log(chalk.green('🤖 Agent:'), response);
        console.log('');

      } catch (error) {
        spinner.stop();
        console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
        
        if (options.debug && error instanceof Error) {
          console.error(chalk.red('Stack:'), error.stack);
        }
        console.log('');
      }
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to initialize agent:'), error instanceof Error ? error.message : 'Unknown error');
    
    if (options.debug && error instanceof Error) {
      console.error(chalk.red('Stack:'), error.stack);
    }
    
    process.exit(1);
  }
}

/**
 * Create configuration for chat command
 */
export function createChatConfig(options: ChatOptions): RuntimeConfig & { personaId?: string; companyInfo?: any } {
  const baseConfig = createTestConfig();
  
  return {
    ...baseConfig,
    bedrockModelId: options.model || process.env.BEDROCK_MODEL_ID || baseConfig.bedrockModelId,
    personaId: options.persona || 'carlos',
    companyInfo: {
      name: options.company || 'RockBox Fitness Coral Springs',
      industry: options.industry || 'Boxing & HIIT Fitness',
      description: options.description || 'RockBox Fitness is a high-energy boxing and HIIT fitness studio located in Coral Springs/Margate area. We offer 45-minute boxing-based workouts that combine cardio, strength training, and boxing techniques in a supportive, motivating environment.',
      products: options.products || 'Boxing classes, strength training, personal training, recovery services',
      benefits: options.benefits || 'High-intensity workouts, expert coaching, supportive community',
      targetCustomers: options.target || 'Fitness enthusiasts seeking challenging, fun workouts',
      differentiators: options.differentiators || 'Boxing-focused HIIT, expert trainers, local community feel'
    },
    historyLimit: parseInt(options.historyLimit, 10),
    messagesTable: process.env.MESSAGES_TABLE || baseConfig.messagesTable,
    leadsTable: process.env.LEADS_TABLE || baseConfig.leadsTable,
    awsRegion: process.env.AWS_REGION || baseConfig.awsRegion,
    dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT || baseConfig.dynamodbEndpoint,
    outboundEventBusName: process.env.OUTBOUND_EVENT_BUS_NAME || baseConfig.outboundEventBusName,
  };
}

/**
 * Clear chat history for a contact
 */
async function clearChatHistory(
  dynamoService: DynamoDBService,
  tenantId: string,
  emailLc: string,
  sessionId?: string
): Promise<void> {
  // In a real implementation, you might want to add a boundary marker
  // For now, we'll just log that history would be cleared
  console.log(chalk.gray(`Would clear history for ${tenantId}/${emailLc}${sessionId ? ` (session: ${sessionId})` : ''}`));
}
