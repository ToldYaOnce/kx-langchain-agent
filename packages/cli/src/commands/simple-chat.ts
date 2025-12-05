import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { AgentService } from '@toldyaonce/kx-langchain-agent-runtime';
import { createChatConfig, type ChatOptions } from './chat.js';
import { LocalSessionStore } from '../lib/local-session-store.js';
import { LocalChannelStateService } from '../lib/local-channel-state-service.js';

interface SimpleChatOptions extends ChatOptions {
  session?: string;
}

export async function simpleChatCommand(options: SimpleChatOptions) {
  try {
    console.log(chalk.blue('🤖 KxGen LangChain Agent - Simple Chat (with local persistence)'));
    console.log(chalk.gray(`Tenant: ${options.tenantId}`));
    console.log(chalk.gray(`Email: ${options.email}`));
    console.log(chalk.gray(`Persona: ${options.persona || 'carlos'}`));
    console.log(chalk.gray(`Session: ${options.session || 'default'}`));

    const config = createChatConfig(options);
    const emailLc = options.email.toLowerCase();
    
    // Initialize local session store (for LOCAL DEV ONLY)
    const sessionStore = new LocalSessionStore();
    const sessionId = `${options.tenantId}-${emailLc}-${options.session || 'default'}`;
    
    // Clear session on startup (fresh start each time you run dev:chat)
    sessionStore.clearSession(sessionId);
    console.log(chalk.cyan(`🔄 Starting fresh local session (local dev mode)`));
    
    // Create local channel state service
    const localChannelStateService = new LocalChannelStateService(sessionStore, sessionId);
    
    // Inject local channel state service into config
    (config as any).channelStateService = localChannelStateService;
    
    const agentService = new AgentService(config);

    // Start logging to file
    sessionStore.startLogging(sessionId);
    console.log(chalk.gray(`📝 Logging to: ${sessionStore.getLogFilePath()}`));

    // Intercept console.log to also write to log file (LOCAL DEV ONLY)
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => {
      originalLog(...args);
      const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)).join(' ') + '\n';
      sessionStore.appendLog(message);
    };
    console.error = (...args) => {
      originalError(...args);
      const message = '[ERROR] ' + args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)).join(' ') + '\n';
      sessionStore.appendLog(message);
    };

    console.log(chalk.green('✅ Agent initialized successfully'));
    
    // Show persona greeting
    try {
      const { PersonaService } = await import('@toldyaonce/kx-langchain-agent-runtime');
      const { GreetingService } = await import('@toldyaonce/kx-langchain-agent-runtime');
      
      const personaService = new PersonaService(null);
      const persona = await personaService.getPersona(options.tenantId, options.persona || 'carlos', config.companyInfo);
      const greeting = GreetingService.generateGreeting((persona.greetings || persona.greetingConfig) as any, config.companyInfo);
      
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
      prompt: chalk.cyan('You: '),
      terminal: true
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
        sessionStore.clearSession(sessionId);
        console.log(chalk.green('🧹 Chat history and workflow state cleared\\n'));
        rl.prompt();
        return;
      }

      // Save user message to local session
      sessionStore.addMessage(sessionId, new HumanMessage(trimmedMessage));

      // Process message with agent
      const spinner = ora('🤔 Agent is thinking...').start();

      try {
        // Load previous messages for context
        const previousMessages = sessionStore.getMessages(sessionId);
        
        const result = await agentService.processMessage(
          {
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
          },
          previousMessages  // Pass message history
        );

        spinner.stop();

        // Extract response and follow-up (processMessage returns an object)
        const response = typeof result === 'string' ? result : result.response;
        const followUp = typeof result === 'object' && result.followUpQuestion ? result.followUpQuestion : undefined;

        // Save agent response to local session
        sessionStore.addMessage(sessionId, new AIMessage(response));

        // Display the response
        console.log(chalk.green('🤖 Agent:'), response);

        // Display follow-up question if present (with a slight delay for UX)
        if (followUp) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
          console.log(chalk.yellow('💬 Follow-up:'), followUp);
          // Also save follow-up to session for context
          sessionStore.addMessage(sessionId, new AIMessage(followUp));
        }

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
      // Restore original console
      console.log = originalLog;
      console.error = originalError;
      console.log(chalk.blue('\\n👋 Goodbye!'));
      console.log(chalk.gray(`📝 Session log saved to: ${sessionStore.getLogFilePath()}`));
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
