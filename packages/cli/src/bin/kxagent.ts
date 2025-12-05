#!/usr/bin/env node

import { program } from 'commander';
import { config } from 'dotenv';
import { chatCommand } from '../commands/chat.js';
import { simpleChatCmd } from '../commands/simple-chat.js';
import { simulateCommand } from '../commands/simulate.js';
import { modelsCommand } from '../commands/models.js';
import { createPersonasCommand } from '../commands/personas.js';
import { createIntentsCommand } from '../commands/intents.js';
import { createTestStructuredCommand } from '../commands/test-structured.js';
import { createTestGoalsCommand } from '../commands/test-goals.js';
import { createTestConversationsCommand } from '../commands/test-conversations.js';

// Load environment variables from .env.local
config({ path: '.env.local' });

program
  .name('kxagent')
  .description('KxGen LangChain Agent CLI - Local development and testing tool')
  .version('1.0.0');

// Chat command
program
  .command('chat')
  .description('Run interactive chat with the agent')
  .requiredOption('--tenantId <id>', 'Tenant ID')
  .requiredOption('--email <addr>', 'Email address')
  .option('--source <source>', 'Message source (chat|sms|email)', 'chat')
  .option('--model <id>', 'Bedrock model ID')
  .option('--persona <id>', 'Agent persona ID (e.g., king-mo)')
  .option('--conversation-id <id>', 'Conversation/channel ID (alias: --session)')
  .option('--session <id>', 'Session ID for chat (deprecated, use --conversation-id)')
  .option('--company <name>', 'Company name (fallback if not in DynamoDB)')
  .option('--industry <type>', 'Company industry (fallback)')
  .option('--description <desc>', 'Company description (fallback)')
  .option('--products <products>', 'Company products/services (fallback)')
  .option('--benefits <benefits>', 'Key company benefits (fallback)')
  .option('--target <customers>', 'Target customers (fallback)')
  .option('--differentiators <diff>', 'What makes company different (fallback)')
  .option('--rag', 'Enable RAG retrieval')
  .option('--history-limit <num>', 'History limit', '50')
  .option('--debug', 'Enable debug logging')
  .action(chatCommand);

// Simulate inbound command
program
  .command('simulate')
  .description('Simulate inbound message processing')
  .command('inbound')
  .description('Simulate inbound message')
  .requiredOption('--tenantId <id>', 'Tenant ID')
  .requiredOption('--source <source>', 'Message source (sms|email|chat)')
  .requiredOption('--text <text>', 'Message text')
  .option('--phone <phone>', 'Phone number (for SMS)')
  .option('--email <addr>', 'Email address')
  .option('--put-events', 'Publish to actual EventBridge bus')
  .action(simulateCommand);

// Intents commands
program.addCommand(createIntentsCommand());

// Test structured response command
program.addCommand(createTestStructuredCommand());

// Test goals orchestration command
program.addCommand(createTestGoalsCommand());
program.addCommand(createTestConversationsCommand());

// Simple chat command
program.addCommand(simpleChatCmd);

// Models commands
const modelsCmd = program
  .command('models')
  .description('Manage Bedrock models');

modelsCmd
  .command('list')
  .description('List available Bedrock models')
  .action(modelsCommand.list);

modelsCmd
  .command('test')
  .description('Test a model with a prompt')
  .requiredOption('--model <id>', 'Model ID')
  .requiredOption('--prompt <text>', 'Test prompt')
  .action(modelsCommand.test);

// Personas commands
program.addCommand(createPersonasCommand());

// Parse command line arguments
program.parse();
