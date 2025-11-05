import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { PersonaService, IntentService, type CompanyInfo } from '@toldyaonce/langchain-agent-runtime';

interface IntentOptions {
  persona?: string;
  tenantId?: string;
  company?: string;
  industry?: string;
  description?: string;
  products?: string;
  benefits?: string;
  target?: string;
  differentiators?: string;
}

function createCompanyInfo(options: IntentOptions): CompanyInfo {
  return {
    tenantId: 'test-tenant',
    name: options.company || 'Planet Fitness',
    industry: options.industry || 'Fitness & Wellness',
    description: options.description || 'America\'s most popular gym with over 2,400 locations',
    products: options.products || 'Gym memberships, fitness equipment, group classes',
    benefits: options.benefits || 'Affordable pricing, judgment-free environment, convenient locations',
    targetCustomers: options.target || 'People of all fitness levels looking for an affordable, non-intimidating gym experience',
    differentiators: options.differentiators || 'Low cost, no-judgment atmosphere, beginner-friendly environment',
    intentCapturing: {
      enabled: true,
      intents: [],
      fallbackIntent: {
        id: 'fallback',
        name: 'Fallback Intent',
        description: 'Default response when no specific intent is detected',
        response: {
          type: 'conversational',
          template: 'I understand you\'re interested in learning more. How can I help you today?'
        },
        actions: ['continue_conversation']
      },
      confidence: {
        threshold: 0.7,
        multipleIntentHandling: 'highest_confidence'
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

async function listIntents(options: IntentOptions) {
  try {
    const personaService = new PersonaService(null);
    const companyInfo = createCompanyInfo(options);
    const persona = await personaService.getPersona(
      options.tenantId || 'dev-test',
      options.persona || 'carlos',
      companyInfo
    );

    console.log(chalk.blue(`\\n📋 Intents for ${persona.name} (${options.persona || 'carlos'})`));
    if (!persona.intentCapturing?.enabled) {
      console.log(chalk.yellow('❌ Intent capturing is disabled for this persona'));
      return;
    }

    const { intents, fallbackIntent, confidence } = persona.intentCapturing;
    
    console.log(chalk.green(`\\n✅ Intent capturing enabled (threshold: ${confidence.threshold})`));
    console.log(chalk.gray(`   Multiple intent handling: ${confidence.multipleIntentHandling}`));
    
    console.log(chalk.blue('\\n🎯 Configured Intents:'));
    for (const intent of intents) {
      console.log(chalk.white(`\\n  ${intent.id} (${intent.priority} priority)`));
      console.log(chalk.gray(`    ${intent.description}`));
      console.log(chalk.cyan(`    Triggers: ${intent.triggers.slice(0, 5).join(', ')}${intent.triggers.length > 5 ? '...' : ''}`));
      console.log(chalk.cyan(`    Patterns: ${intent.patterns.slice(0, 3).join(', ')}${intent.patterns.length > 3 ? '...' : ''}`));
      console.log(chalk.magenta(`    Actions: ${intent.actions.join(', ')}`));
    }

    console.log(chalk.blue('\\n🔄 Fallback Intent:'));
    console.log(chalk.white(`  ${fallbackIntent.id}`));
    console.log(chalk.gray(`    ${fallbackIntent.description}`));
    console.log(chalk.magenta(`    Actions: ${fallbackIntent.actions.join(', ')}`));

  } catch (error) {
    console.error(chalk.red('❌ Error listing intents:'), error);
    process.exit(1);
  }
}

async function testIntent(message: string, options: IntentOptions) {
  try {
    const personaService = new PersonaService(null);
    const intentService = new IntentService();
    const companyInfo = createCompanyInfo(options);
    
    const persona = await personaService.getPersona(
      options.tenantId || 'dev-test',
      options.persona || 'carlos',
      companyInfo
    );

    console.log(chalk.blue(`\\n🧪 Testing intent detection for: "${message}"`));
    console.log(chalk.gray(`Using persona: ${persona.name} (${options.persona || 'carlos'})`));
    
    if (!persona.intentCapturing?.enabled) {
      console.log(chalk.yellow('❌ Intent capturing is disabled for this persona'));
      return;
    }

    const intentMatch = await intentService.detectIntent(
      message,
      persona,
      companyInfo,
      {
        tenantId: options.tenantId || 'dev-test',
        userId: 'test-user',
        sessionId: 'test-session',
        channel: 'cli'
      }
    );

    if (!intentMatch) {
      console.log(chalk.yellow('\\n❌ No intent detected'));
      return;
    }

    console.log(chalk.green(`\\n✅ Intent detected: ${intentMatch.intent.id}`));
    console.log(chalk.white(`   Name: ${intentMatch.intent.name}`));
    console.log(chalk.white(`   Confidence: ${(intentMatch.confidence * 100).toFixed(1)}%`));
    console.log(chalk.white(`   Priority: ${intentMatch.intent.priority}`));
    
    if (intentMatch.matchedTriggers.length > 0) {
      console.log(chalk.cyan(`   Matched triggers: ${intentMatch.matchedTriggers.join(', ')}`));
    }
    
    if (intentMatch.matchedPatterns.length > 0) {
      console.log(chalk.cyan(`   Matched patterns: ${intentMatch.matchedPatterns.join(', ')}`));
    }

    console.log(chalk.blue('\\n💬 Response:'));
    console.log(chalk.white(`   ${intentMatch.response}`));
    
    if (intentMatch.followUp && intentMatch.followUp.length > 0) {
      console.log(chalk.blue('\\n🔄 Follow-up suggestions:'));
      for (const followUp of intentMatch.followUp) {
        console.log(chalk.white(`   • ${followUp}`));
      }
    }

    console.log(chalk.blue('\\n⚡ Actions:'));
    console.log(chalk.magenta(`   ${intentMatch.actions.join(', ')}`));

  } catch (error) {
    console.error(chalk.red('❌ Error testing intent:'), error);
    process.exit(1);
  }
}

async function interactiveTest(options: IntentOptions) {
  try {
    const personaService = new PersonaService(null);
    const intentService = new IntentService();
    const companyInfo = createCompanyInfo(options);
    
    const persona = await personaService.getPersona(
      options.tenantId || 'dev-test',
      options.persona || 'carlos',
      companyInfo
    );

    console.log(chalk.blue(`\\n🎯 Interactive Intent Testing`));
    console.log(chalk.gray(`Persona: ${persona.name} (${options.persona || 'carlos'})`));
    console.log(chalk.gray(`Company: ${companyInfo.name}`));
    console.log(chalk.gray('Type "exit" to quit\\n'));

    if (!persona.intentCapturing?.enabled) {
      console.log(chalk.yellow('❌ Intent capturing is disabled for this persona'));
      return;
    }

    while (true) {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.green('Test message:'),
          validate: (input: string) => input.trim().length > 0 || 'Please enter a message'
        }
      ]);

      if (message.toLowerCase().trim() === 'exit') {
        console.log(chalk.blue('\\n👋 Goodbye!'));
        break;
      }

      const intentMatch = await intentService.detectIntent(
        message,
        persona,
        companyInfo,
        {
          tenantId: options.tenantId || 'dev-test',
          userId: 'test-user',
          sessionId: 'test-session',
          channel: 'cli'
        }
      );

      if (!intentMatch) {
        console.log(chalk.yellow('❌ No intent detected\\n'));
        continue;
      }

      console.log(chalk.green(`✅ ${intentMatch.intent.name} (${(intentMatch.confidence * 100).toFixed(1)}%)`));
      console.log(chalk.white(`💬 ${intentMatch.response}`));
      
      if (intentMatch.followUp && intentMatch.followUp.length > 0) {
        console.log(chalk.blue(`🔄 ${intentMatch.followUp.join(' ')}`));
      }
      console.log('');
    }

  } catch (error) {
    console.error(chalk.red('❌ Error in interactive test:'), error);
    process.exit(1);
  }
}

export function createIntentsCommand(): Command {
  const intentsCmd = new Command('intents');
  intentsCmd.description('Manage and test intent capturing');

  // Add global options
  intentsCmd.option('--persona <persona>', 'Persona to use (carlos, professional, casual)', 'carlos');
  intentsCmd.option('--tenant-id <tenantId>', 'Tenant ID', 'dev-test');
  intentsCmd.option('--company <company>', 'Company name', 'Planet Fitness');
  intentsCmd.option('--industry <industry>', 'Company industry', 'Fitness & Wellness');
  intentsCmd.option('--description <description>', 'Company description');
  intentsCmd.option('--products <products>', 'Key products/services');
  intentsCmd.option('--benefits <benefits>', 'Key benefits');
  intentsCmd.option('--target <target>', 'Target customers');
  intentsCmd.option('--differentiators <differentiators>', 'What makes the company different');

  // List intents command
  intentsCmd
    .command('list')
    .description('List all configured intents for a persona')
    .action(async () => {
      const options = intentsCmd.opts();
      await listIntents(options);
    });

  // Test intent command
  intentsCmd
    .command('test <message>')
    .description('Test intent detection for a specific message')
    .action(async (message: string) => {
      const options = intentsCmd.opts();
      await testIntent(message, options);
    });

  // Interactive test command
  intentsCmd
    .command('interactive')
    .alias('i')
    .description('Interactive intent testing')
    .action(async () => {
      const options = intentsCmd.opts();
      await interactiveTest(options);
    });

  return intentsCmd;
}

export const intentsCommand = createIntentsCommand;