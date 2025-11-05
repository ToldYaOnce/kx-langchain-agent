import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { AgentService } from '@toldyaonce/langchain-agent-runtime';
import { createChatConfig, type ChatOptions } from './chat.js';

interface SimpleChatOptions extends ChatOptions {
  session?: string;
}

export async function simpleChatCommand(options: SimpleChatOptions) {
  try {
    console.log(chalk.blue('🤖 KxGen LangChain Agent - Simple Chat'));
    console.log(chalk.gray(`Tenant: ${options.tenantId}`));
    console.log(chalk.gray(`Email: ${options.email}`));
    console.log(chalk.gray(`Persona: ${options.persona || 'carlos'}`));
    console.log(chalk.gray(`Session: ${options.session || 'default'}`));

    const config = createChatConfig(options);
    const agentService = new AgentService(config);
    const emailLc = options.email.toLowerCase();

    console.log(chalk.green('✅ Agent initialized successfully'));
    
    // Show persona greeting
    try {
      const { PersonaService } = await import('@toldyaonce/langchain-agent-runtime');
      const { GreetingService } = await import('@toldyaonce/langchain-agent-runtime');
      
      const personaService = new PersonaService(null);
      const persona = await personaService.getPersona(options.tenantId, options.persona || 'carlos', config.companyInfo);
      const greeting = GreetingService.generateGreeting(persona.greetings, config.companyInfo);
      
      console.log(chalk.green('🤖 ' + persona.name + ':'), greeting);
    } catch (error) {
      console.log(chalk.green('🤖 Agent:'), 'Hello! How can I help you today?');
    }
    
    // Check if running in watch mode
    const isWatchMode = process.env.TSX_WATCH === '1' || process.argv.includes('watch');
    
    if (isWatchMode) {
      console.log(chalk.yellow('⚡ Running in watch mode - will restart when files change'));
      console.log(chalk.gray('💡 Use "npm run dev:chat-stable" for stable chat without auto-restart'));
    }
    
    console.log(chalk.gray('\\nType "exit" to quit, "clear" to clear history\\n'));

    // Create readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('You: ')
    });

    // Handle process cleanup for watch mode
    const cleanup = () => {
      console.log(chalk.yellow('\n🔄 Restarting due to file changes...'));
      rl.close();
      process.exit(0);
    };

    // Listen for signals that indicate tsx watch is restarting
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGUSR2', cleanup); // tsx watch uses this signal

    // Interactive chat loop
    rl.prompt();
    
    rl.on('line', async (input) => {
      const trimmedMessage = input.trim();

      if (trimmedMessage.toLowerCase() === 'exit') {
        console.log(chalk.blue('\\n👋 Goodbye!'));
        rl.close();
        process.exit(0);
      }

      if (!trimmedMessage) {
        rl.prompt();
        return;
      }

      if (trimmedMessage.toLowerCase() === 'clear') {
        console.log(chalk.green('🧹 Chat history cleared\\n'));
        rl.prompt();
        return;
      }

      // Process message with agent
      const spinner = ora('🤔 Agent is thinking...').start();

      try {
        const response = await agentService.processMessage({
          tenantId: options.tenantId,
          email_lc: emailLc,
          text: trimmedMessage,
          source: options.source || 'chat',
          conversation_id: options.session || 'default',
          channel_context: {
            chat: {
              sessionId: options.session || 'default',
              clientId: 'cli',
            },
          },
        });

        spinner.stop();

        // Display the response
        console.log(chalk.green('🤖 Agent:'), response);

      } catch (error) {
        spinner.stop();
        console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
        
        if (options.debug) {
          console.error(chalk.gray('Debug info:'), error);
        }
      }

      console.log(''); // Empty line for spacing
      rl.prompt();
    });

    rl.on('close', () => {
      console.log(chalk.blue('\\n👋 Goodbye!'));
      process.exit(0);
    });

  } catch (error) {
    console.error(chalk.red('❌ Failed to initialize chat:'), error);
    process.exit(1);
  }
}

export const simpleChatCmd = new Command('simple-chat')
  .description('Simple interactive chat with the agent (using readline)')
  .requiredOption('--tenantId <id>', 'Tenant ID')
  .requiredOption('--email <email>', 'User email address')
  .option('--persona <persona>', 'Agent persona to use', 'carlos')
  .option('--source <source>', 'Message source', 'chat')
  .option('--session <session>', 'Session/conversation ID', 'default')
  .option('--debug', 'Enable debug output')
  .option('--company <company>', 'Company name', 'Planet Fitness')
  .option('--industry <industry>', 'Company industry', 'Fitness & Wellness')
  .option('--description <description>', 'Company description')
  .option('--products <products>', 'Key products/services')
  .option('--benefits <benefits>', 'Key benefits')
  .option('--target <target>', 'Target customers')
  .option('--differentiators <differentiators>', 'What makes the company different')
  .action(simpleChatCommand);
