import { Command } from 'commander';
// Note: listPersonas and getPersona are not exported from runtime, using PersonaService instead
import { AgentService, PersonaService } from '@toldyaonce/langchain-agent-runtime';
import { createTestConfig } from '@toldyaonce/langchain-agent-runtime';
import type { AgentContext } from '@toldyaonce/langchain-agent-runtime';

export function createPersonasCommand(): Command {
  const personas = new Command('personas');
  personas.description('Manage agent personas');

  // List available personas
  personas
    .command('list')
    .description('List available agent personas')
    .action(() => {
      console.log('🎭 Available Agent Personas\n');
      
      const availablePersonas = PersonaService.listDefaultPersonas();
      
      availablePersonas.forEach(persona => {
        console.log(`● ${persona.name} (${persona.id})`);
        console.log(`  ${persona.description}\n`);
      });
      
      console.log(`Use "kxagent personas test --persona <id>" to test a persona`);
    });

  // Test a persona
  personas
    .command('test')
    .description('Test a persona with sample conversation')
    .requiredOption('--persona <id>', 'Persona ID to test')
    .option('--prompt <text>', 'Custom test prompt', 'Hello! I\'m interested in learning about KxGen. Can you tell me what you do?')
    .option('--tenant-id <id>', 'Tenant ID for testing', 'test-tenant')
    .option('--email <email>', 'Email for testing', 'test@example.com')
    .action(async (options) => {
      try {
        console.log('🎭 Testing Agent Persona');
        console.log(`Persona: ${options.persona}`);
        console.log(`Prompt: ${options.prompt}\n`);

        // Get persona info
        // Create a persona service instance to get persona details
        const personaService = new PersonaService(null); // null for DynamoDB service since we're using static personas
        const persona = await personaService.getPersona(options.persona, 'default-tenant');
        console.log(`🤖 ${persona.name}: ${persona.description}`);
        console.log(`Tone: ${persona.personality.tone}`);
        console.log(`Style: ${persona.personality.style}\n`);

        // Create agent with persona (will use company info from JSON)
        const config = createTestConfig();
        // Note: personaId is passed via AgentService constructor options
        // Don't override company info - let it use the values from the JSON file
        
        const agent = new AgentService(config);

        // Create test context
        const context: AgentContext = {
          tenantId: options.tenantId,
          email_lc: options.email.toLowerCase(),
          text: options.prompt,
          source: 'chat',
          conversation_id: `test-${Date.now()}`,
        };

        console.log('💬 Agent Response:');
        console.log('─'.repeat(50));
        
        const response = await agent.processMessage(context);
        console.log(response);
        
        console.log('─'.repeat(50));
        console.log('✅ Test completed successfully');

      } catch (error) {
        console.error('❌ Persona Test Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Show persona details
  personas
    .command('show')
    .description('Show detailed information about a persona')
    .requiredOption('--persona <id>', 'Persona ID to show')
    .action(async (options) => {
      try {
        // Create a persona service instance to get persona details
        const personaService = new PersonaService(null); // null for DynamoDB service since we're using static personas
        const persona = await personaService.getPersona(options.persona, 'default-tenant');
        
        console.log(`🎭 Persona: ${persona.name}\n`);
        console.log(`Description: ${persona.description}\n`);
        
        console.log('Personality:');
        console.log(`  Tone: ${persona.personality.tone}`);
        console.log(`  Style: ${persona.personality.style}`);
        
        if (persona.personality.languageQuirks) {
          console.log('\n  Language Quirks:');
          persona.personality.languageQuirks.forEach(quirk => {
            console.log(`    • ${quirk}`);
          });
        }
        
        if (persona.personality.specialBehaviors) {
          console.log('\n  Special Behaviors:');
          persona.personality.specialBehaviors.forEach(behavior => {
            console.log(`    • ${behavior}`);
          });
        }
        
        console.log('\nResponse Guidelines:');
        persona.responseGuidelines.forEach(guideline => {
          console.log(`  • ${guideline}`);
        });
        
        console.log('\nSystem Prompt Preview:');
        console.log('─'.repeat(50));
        console.log(persona.systemPrompt.substring(0, 300) + '...');
        console.log('─'.repeat(50));
        
      } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return personas;
}
