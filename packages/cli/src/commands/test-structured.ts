import { Command } from 'commander';
import chalk from 'chalk';
import { AgentService, createTestConfig, type AgentResponse } from '@toldyaonce/kx-langchain-agent-runtime';
import { PersonaService, type CompanyInfo } from '@toldyaonce/kx-langchain-agent-runtime';

interface TestStructuredOptions {
  tenantId: string;
  email: string;
  persona: string;
  company?: string;
  industry?: string;
  description?: string;
  products?: string;
  benefits?: string;
  target?: string;
  differentiators?: string;
  debug?: boolean;
}

function createCompanyInfo(options: TestStructuredOptions): CompanyInfo {
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

async function testStructuredResponse(message: string, options: TestStructuredOptions) {
  try {
    console.log(chalk.blue(`\\n🧪 Testing structured response for: "${message}"`));
    console.log(chalk.gray(`Using persona: ${options.persona}`));
    console.log(chalk.gray(`Company: ${options.company || 'Planet Fitness'}`));

    // Create test configuration
    const config = createTestConfig();
    const companyInfo = createCompanyInfo(options);

    // Create agent service
    const agentService = new AgentService({
      ...config,
      personaId: options.persona,
      companyInfo
    });

    // Process message and get structured response
    const startTime = Date.now();
    const response: AgentResponse = await agentService.processMessageStructured({
      tenantId: options.tenantId,
      email_lc: options.email.toLowerCase(),
      text: message,
      source: 'api',
      conversation_id: 'test-session-' + Date.now()
    });
    const totalTime = Date.now() - startTime;

    // Display structured response
    console.log(chalk.green(`\\n✅ Response generated in ${totalTime}ms`));
    console.log(chalk.yellow('\\n📋 STRUCTURED RESPONSE:'));
    console.log(JSON.stringify(response, null, 2));

    // Display formatted summary
    console.log(chalk.cyan('\\n📊 SUMMARY:'));
    console.log(`   Success: ${response.success ? '✅' : '❌'}`);
    console.log(`   Processing Time: ${response.metadata.processingTimeMs}ms`);
    console.log(`   Total Time: ${totalTime}ms`);
    console.log(`   Message Length: ${response.message.length} characters`);
    
    if (response.intent) {
      console.log(chalk.magenta('\\n🎯 INTENT DETECTED:'));
      console.log(`   ID: ${response.intent.id}`);
      console.log(`   Name: ${response.intent.name}`);
      console.log(`   Confidence: ${(response.intent.confidence * 100).toFixed(1)}%`);
      console.log(`   Priority: ${response.intent.priority}`);
      console.log(`   Triggers: ${response.intent.matchedTriggers.join(', ')}`);
      console.log(`   Patterns: ${response.intent.matchedPatterns.join(', ')}`);
      if (response.intent.actions && response.intent.actions.length > 0) {
        console.log(`   Actions: ${response.intent.actions.join(', ')}`);
      }
    } else {
      console.log(chalk.gray('\\n🎯 No intent detected (or low confidence)'));
    }

    if (response.followUp && response.followUp.length > 0) {
      console.log(chalk.blue('\\n🔄 FOLLOW-UP SUGGESTIONS:'));
      response.followUp.forEach(suggestion => {
        console.log(`   • ${suggestion}`);
      });
    }

    if (response.error) {
      console.log(chalk.red('\\n❌ ERROR:'));
      console.log(`   Code: ${response.error.code}`);
      console.log(`   Message: ${response.error.message}`);
    }

    console.log(chalk.green('\\n💬 RESPONSE MESSAGE:'));
    console.log(response.message);

  } catch (error) {
    console.error(chalk.red('\\n❌ Error testing structured response:'), error);
  }
}

export function createTestStructuredCommand(): Command {
  const cmd = new Command('test-structured')
    .description('Test structured response format with intent detection')
    .argument('<message>', 'Message to test')
    .option('--tenantId <tenantId>', 'Tenant ID', 'dev-test')
    .option('--email <email>', 'User email', 'dev@example.com')
    .option('--persona <persona>', 'Persona to use', 'carlos')
    .option('--company <company>', 'Company name', 'Planet Fitness')
    .option('--industry <industry>', 'Company industry', 'Fitness & Wellness')
    .option('--description <description>', 'Company description')
    .option('--products <products>', 'Company products/services')
    .option('--benefits <benefits>', 'Company benefits/value props')
    .option('--target <target>', 'Target customers')
    .option('--differentiators <differentiators>', 'Key differentiators')
    .option('--debug', 'Enable debug output')
    .action(async (message: string, options: TestStructuredOptions) => {
      await testStructuredResponse(message, options);
    });

  return cmd;
}
