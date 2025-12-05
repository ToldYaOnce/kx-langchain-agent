import { Command } from 'commander';
import chalk from 'chalk';
import { GoalOrchestrator, PersonaService, type CompanyInfo } from '@toldyaonce/kx-langchain-agent-runtime';

interface TestGoalsOptions {
  tenantId: string;
  email: string;
  persona: string;
  sessionId?: string;
  company?: string;
  industry?: string;
  description?: string;
  products?: string;
  benefits?: string;
  target?: string;
  differentiators?: string;
  debug?: boolean;
}

function createCompanyInfo(options: TestGoalsOptions): CompanyInfo {
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

async function testGoalOrchestration(message: string, options: TestGoalsOptions) {
  try {
    console.log(chalk.blue(`\n🎯 Testing Goal Orchestration`));
    console.log(chalk.gray(`Message: "${message}"`));
    console.log(chalk.gray(`Persona: ${options.persona}`));
    console.log(chalk.gray(`Session: ${options.sessionId || 'test-session'}`));

    // Create services
    const personaService = new PersonaService(null);
    const goalOrchestrator = new GoalOrchestrator();
    const companyInfo = createCompanyInfo(options);

    // Load persona
    const persona = await personaService.getPersona('default', options.persona, companyInfo);
    
    if (!persona.goalConfiguration?.enabled) {
      console.log(chalk.yellow('❌ Goal configuration is not enabled for this persona'));
      return;
    }

    console.log(chalk.green(`✅ Goals enabled with ${persona.goalConfiguration.goals.length} goals configured`));

    // Run orchestration
    const result = await goalOrchestrator.orchestrateGoals(
      message,
      options.sessionId || 'test-session',
      options.email.toLowerCase(),
      options.tenantId,
      persona.goalConfiguration as any // Type compatibility - CLI uses different goal schema
    );

    // Display results
    console.log(chalk.cyan('\n📊 ORCHESTRATION RESULTS:'));
    
    // Goal State Summary
    console.log(chalk.magenta('\n🎯 Goal Progress:'));
    console.log(`   Active Goals: ${result.activeGoals.length}`);
    console.log(`   Completed Goals: ${result.completedGoals.length}`);
    if (result.stateUpdates.newlyCompleted.length > 0) {
      console.log(`   Newly Completed: ${result.stateUpdates.newlyCompleted.join(', ')}`);
    }
    if (result.stateUpdates.newlyActivated.length > 0) {
      console.log(`   Newly Activated: ${result.stateUpdates.newlyActivated.join(', ')}`);
    }

    // Extracted Information
    if (Object.keys(result.extractedInfo).length > 0) {
      console.log(chalk.green('\n📧 Extracted Information:'));
      Object.entries(result.extractedInfo).forEach(([key, value]) => {
        console.log(`   ${key}: ${JSON.stringify(value, null, 2)}`);
      });
    }

    // Goal Recommendations
    if (result.recommendations.length > 0) {
      console.log(chalk.yellow('\n🎯 Goal Recommendations:'));
      result.recommendations.forEach(rec => {
        const status = rec.shouldPursue ? '✅ PURSUE' : '⏸️  WAIT';
        console.log(`   ${status} ${rec.goalId} (priority: ${rec.priority})`);
        console.log(`      Approach: ${rec.approach}`);
        console.log(`      Reason: ${rec.reason}`);
        console.log(`      Message: "${rec.message}"`);
        console.log('');
      });
    } else {
      console.log(chalk.gray('\n🎯 No goal recommendations at this time'));
    }

    // State Updates
    if (result.stateUpdates.newlyCompleted.length > 0) {
      console.log(chalk.green('\n✅ Newly Completed Goals:'));
      result.stateUpdates.newlyCompleted.forEach(goalId => {
        console.log(`   • ${goalId}`);
      });
    }

    if (result.stateUpdates.newlyActivated.length > 0) {
      console.log(chalk.blue('\n🔄 Newly Activated Goals:'));
      result.stateUpdates.newlyActivated.forEach(goalId => {
        console.log(`   • ${goalId}`);
      });
    }

    if (result.stateUpdates.declined.length > 0) {
      console.log(chalk.red('\n❌ Declined Goals:'));
      result.stateUpdates.declined.forEach(goalId => {
        console.log(`   • ${goalId}`);
      });
    }

    // Triggered Intents
    if (result.triggeredIntents.length > 0) {
      console.log(chalk.magenta('\n🚀 Triggered Intents:'));
      result.triggeredIntents.forEach(intentId => {
        console.log(`   • ${intentId}`);
      });
    }

    // Goal State Summary
    console.log(chalk.cyan('\n📋 Current Goal State:'));
    const stateSummary = goalOrchestrator.getGoalState(
      options.sessionId || 'test-session',
      options.email.toLowerCase(),
      options.tenantId
    );
    console.log(JSON.stringify(stateSummary, null, 2));

  } catch (error) {
    console.error(chalk.red('\n❌ Error testing goal orchestration:'), error);
  }
}

export function createTestGoalsCommand(): Command {
  const cmd = new Command('test-goals')
    .description('Test goal orchestration system')
    .argument('<message>', 'Message to test')
    .option('--tenantId <tenantId>', 'Tenant ID', 'dev-test')
    .option('--email <email>', 'User email', 'dev@example.com')
    .option('--persona <persona>', 'Persona to use', 'carlos')
    .option('--sessionId <sessionId>', 'Session ID', 'test-session')
    .option('--company <company>', 'Company name', 'Planet Fitness')
    .option('--industry <industry>', 'Company industry', 'Fitness & Wellness')
    .option('--description <description>', 'Company description')
    .option('--products <products>', 'Company products/services')
    .option('--benefits <benefits>', 'Company benefits/value props')
    .option('--target <target>', 'Target customers')
    .option('--differentiators <differentiators>', 'Key differentiators')
    .option('--debug', 'Enable debug output')
    .action(async (message: string, options: TestGoalsOptions) => {
      await testGoalOrchestration(message, options);
    });

  return cmd;
}
