"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPersonasCommand = createPersonasCommand;
const commander_1 = require("commander");
// Note: listPersonas and getPersona are not exported from runtime, using PersonaService instead
const kx_langchain_agent_runtime_1 = require("@toldyaonce/kx-langchain-agent-runtime");
const kx_langchain_agent_runtime_2 = require("@toldyaonce/kx-langchain-agent-runtime");
function createPersonasCommand() {
    const personas = new commander_1.Command('personas');
    personas.description('Manage agent personas');
    // List available personas
    personas
        .command('list')
        .description('List available agent personas')
        .action(() => {
        console.log('🎭 Available Agent Personas\n');
        const availablePersonas = kx_langchain_agent_runtime_1.PersonaService.listDefaultPersonas();
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
            const personaService = new kx_langchain_agent_runtime_1.PersonaService(null); // null for DynamoDB service since we're using static personas
            const persona = await personaService.getPersona(options.persona, 'default-tenant');
            console.log(`🤖 ${persona.name}: ${persona.description}`);
            console.log(`Tone: ${persona.personality.tone}`);
            console.log(`Style: ${persona.personality.style}\n`);
            // Create agent with persona (will use company info from JSON)
            const config = (0, kx_langchain_agent_runtime_2.createTestConfig)();
            // Note: personaId is passed via AgentService constructor options
            // Don't override company info - let it use the values from the JSON file
            const agent = new kx_langchain_agent_runtime_1.AgentService(config);
            // Create test context
            const context = {
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
        }
        catch (error) {
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
            const personaService = new kx_langchain_agent_runtime_1.PersonaService(null); // null for DynamoDB service since we're using static personas
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
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    return personas;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyc29uYXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tbWFuZHMvcGVyc29uYXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFNQSxzREEySEM7QUFqSUQseUNBQW9DO0FBQ3BDLGdHQUFnRztBQUNoRyx1RkFBc0Y7QUFDdEYsdUZBQTBFO0FBRzFFLFNBQWdCLHFCQUFxQjtJQUNuQyxNQUFNLFFBQVEsR0FBRyxJQUFJLG1CQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDekMsUUFBUSxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBRTlDLDBCQUEwQjtJQUMxQixRQUFRO1NBQ0wsT0FBTyxDQUFDLE1BQU0sQ0FBQztTQUNmLFdBQVcsQ0FBQywrQkFBK0IsQ0FBQztTQUM1QyxNQUFNLENBQUMsR0FBRyxFQUFFO1FBQ1gsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBRTdDLE1BQU0saUJBQWlCLEdBQUcsMkNBQWMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBRS9ELGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssT0FBTyxDQUFDLElBQUksS0FBSyxPQUFPLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNqRCxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssT0FBTyxDQUFDLFdBQVcsSUFBSSxDQUFDLENBQUM7UUFDNUMsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLDhEQUE4RCxDQUFDLENBQUM7SUFDOUUsQ0FBQyxDQUFDLENBQUM7SUFFTCxpQkFBaUI7SUFDakIsUUFBUTtTQUNMLE9BQU8sQ0FBQyxNQUFNLENBQUM7U0FDZixXQUFXLENBQUMseUNBQXlDLENBQUM7U0FDdEQsY0FBYyxDQUFDLGdCQUFnQixFQUFFLG9CQUFvQixDQUFDO1NBQ3RELE1BQU0sQ0FBQyxpQkFBaUIs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QyxTQUFTLFFBQVEsRUFBRSxDQUFDLENBQUM7Z0JBQ25DLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQztZQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztZQUN0QyxPQUFPLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFO2dCQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sU0FBUyxFQUFFLENBQUMsQ0FBQztZQUNsQyxDQUFDLENBQUMsQ0FBQztZQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUN4QyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM1QixPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQztZQUM1RCxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU5QixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEIsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUwsT0FBTyxRQUFRLENBQUM7QUFDbEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbW1hbmQgfSBmcm9tICdjb21tYW5kZXInO1xuLy8gTm90ZTogbGlzdFBlcnNvbmFzIGFuZCBnZXRQZXJzb25hIGFyZSBub3QgZXhwb3J0ZWQgZnJvbSBydW50aW1lLCB1c2luZyBQZXJzb25hU2VydmljZSBpbnN0ZWFkXG5pbXBvcnQgeyBBZ2VudFNlcnZpY2UsIFBlcnNvbmFTZXJ2aWNlIH0gZnJvbSAnQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdENvbmZpZyB9IGZyb20gJ0B0b2xkeWFvbmNlL2t4LWxhbmdjaGFpbi1hZ2VudC1ydW50aW1lJztcbmltcG9ydCB0eXBlIHsgQWdlbnRDb250ZXh0IH0gZnJvbSAnQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUnO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUGVyc29uYXNDb21tYW5kKCk6IENvbW1hbmQge1xuICBjb25zdCBwZXJzb25hcyA9IG5ldyBDb21tYW5kKCdwZXJzb25hcycpO1xuICBwZXJzb25hcy5kZXNjcmlwdGlvbignTWFuYWdlIGFnZW50IHBlcnNvbmFzJyk7XG5cbiAgLy8gTGlzdCBhdmFpbGFibGUgcGVyc29uYXNcbiAgcGVyc29uYXNcbiAgICAuY29tbWFuZCgnbGlzdCcpXG4gICAgLmRlc2NyaXB0aW9uKCdMaXN0IGF2YWlsYWJsZSBhZ2VudCBwZXJzb25hcycpXG4gICAgLmFjdGlvbigoKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZygn8J+OrSBBdmFpbGFibGUgQWdlbnQgUGVyc29uYXNcXG4nKTtcbiAgICAgIFxuICAgICAgY29uc3QgYXZhaWxhYmxlUGVyc29uYXMgPSBQZXJzb25hU2VydmljZS5saXN0RGVmYXVsdFBlcnNvbmFzKCk7XG4gICAgICBcbiAgICAgIGF2YWlsYWJsZVBlcnNvbmFzLmZvckVhY2gocGVyc29uYSA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGDil48gJHtwZXJzb25hLm5hbWV9ICgke3BlcnNvbmEuaWR9KWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAke3BlcnNvbmEuZGVzY3JpcHRpb259XFxuYCk7XG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coYFVzZSBcImt4YWdlbnQgcGVyc29uYXMgdGVzdCAtLXBlcnNvbmEgPGlkPlwiIHRvIHRlc3QgYSBwZXJzb25hYCk7XG4gICAgfSk7XG5cbiAgLy8gVGVzdCBhIHBlcnNvbmFcbiAgcGVyc29uYXNcbiAgICAuY29tbWFuZCgndGVzdCcpXG4gICAgLmRlc2NyaXB0aW9uKCdUZXN0IGEgcGVyc29uYSB3aXRoIHNhbXBsZSBjb252ZXJzYXRpb24nKVxuICAgIC5yZXF1aXJlZE9wdGlvbignLS1wZXJzb25hIDxpZD4nLCAnUGVyc29uYSBJRCB0byB0ZXN0JylcbiAgICAub3B0aW9uKCctLXByb21wdCA8dGV4dD4nLCAnQ3VzdG9tIHRlc3QgcHJvbXB0JywgJ0hlbGxvISBJXFwnbSBpbnRlcmVzdGVkIGluIGxlYXJuaW5nIGFib3V0IEt4R2VuLiBDYW4geW91IHRlbGwgbWUgd2hhdCB5b3UgZG8/JylcbiAgICAub3B0aW9uKCctLXRlbmFudC1pZCA8aWQ+JywgJ1RlbmFudCBJRCBmb3IgdGVzdGluZycsICd0ZXN0LXRlbmFudCcpXG4gICAgLm9wdGlvbignLS1lbWFpbCA8ZW1haWw+JywgJ0VtYWlsIGZvciB0ZXN0aW5nJywgJ3Rlc3RAZXhhbXBsZS5jb20nKVxuICAgIC5hY3Rpb24oYXN5bmMgKG9wdGlvbnMpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn46tIFRlc3RpbmcgQWdlbnQgUGVyc29uYScpO1xuICAgICAgICBjb25zb2xlLmxvZyhgUGVyc29uYTogJHtvcHRpb25zLnBlcnNvbmF9YCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBQcm9tcHQ6ICR7b3B0aW9ucy5wcm9tcHR9XFxuYCk7XG5cbiAgICAgICAgLy8gR2V0IHBlcnNvbmEgaW5mb1xuICAgICAgICAvLyBDcmVhdGUgYSBwZXJzb25hIHNlcnZpY2UgaW5zdGFuY2UgdG8gZ2V0IHBlcnNvbmEgZGV0YWlsc1xuICAgICAgICBjb25zdCBwZXJzb25hU2VydmljZSA9IG5ldyBQZXJzb25hU2VydmljZShudWxsKTsgLy8gbnVsbCBmb3IgRHluYW1vREIgc2VydmljZSBzaW5jZSB3ZSdyZSB1c2luZyBzdGF0aWMgcGVyc29uYXNcbiAgICAgICAgY29uc3QgcGVyc29uYSA9IGF3YWl0IHBlcnNvbmFTZXJ2aWNlLmdldFBlcnNvbmEob3B0aW9ucy5wZXJzb25hLCAnZGVmYXVsdC10ZW5hbnQnKTtcbiAgICAgICAgY29uc29sZS5sb2coYPCfpJYgJHtwZXJzb25hLm5hbWV9OiAke3BlcnNvbmEuZGVzY3JpcHRpb259YCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBUb25lOiAke3BlcnNvbmEucGVyc29uYWxpdHkudG9uZX1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYFN0eWxlOiAke3BlcnNvbmEucGVyc29uYWxpdHkuc3R5bGV9XFxuYCk7XG5cbiAgICAgICAgLy8gQ3JlYXRlIGFnZW50IHdpdGggcGVyc29uYSAod2lsbCB1c2UgY29tcGFueSBpbmZvIGZyb20gSlNPTilcbiAgICAgICAgY29uc3QgY29uZmlnID0gY3JlYXRlVGVzdENvbmZpZygpO1xuICAgICAgICAvLyBOb3RlOiBwZXJzb25hSWQgaXMgcGFzc2VkIHZpYSBBZ2VudFNlcnZpY2UgY29uc3RydWN0b3Igb3B0aW9uc1xuICAgICAgICAvLyBEb24ndCBvdmVycmlkZSBjb21wYW55IGluZm8gLSBsZXQgaXQgdXNlIHRoZSB2YWx1ZXMgZnJvbSB0aGUgSlNPTiBmaWxlXG4gICAgICAgIFxuICAgICAgICBjb25zdCBhZ2VudCA9IG5ldyBBZ2VudFNlcnZpY2UoY29uZmlnKTtcblxuICAgICAgICAvLyBDcmVhdGUgdGVzdCBjb250ZXh0XG4gICAgICAgIGNvbnN0IGNvbnRleHQ6IEFnZW50Q29udGV4dCA9IHtcbiAgICAgICAgICB0ZW5hbnRJZDogb3B0aW9ucy50ZW5hbnRJZCxcbiAgICAgICAgICBlbWFpbF9sYzogb3B0aW9ucy5lbWFpbC50b0xvd2VyQ2FzZSgpLFxuICAgICAgICAgIHRleHQ6IG9wdGlvbnMucHJvbXB0LFxuICAgICAgICAgIHNvdXJjZTogJ2NoYXQnLFxuICAgICAgICAgIGNvbnZlcnNhdGlvbl9pZDogYHRlc3QtJHtEYXRlLm5vdygpfWAsXG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc29sZS5sb2coJ/CfkqwgQWdlbnQgUmVzcG9uc2U6Jyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfilIAnLnJlcGVhdCg1MCkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBhZ2VudC5wcm9jZXNzTWVzc2FnZShjb250ZXh0KTtcbiAgICAgICAgY29uc29sZS5sb2cocmVzcG9uc2UpO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coJ+KUgCcucmVwZWF0KDUwKSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgVGVzdCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG5cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBQZXJzb25hIFRlc3QgRXJyb3I6JywgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvcik7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAvLyBTaG93IHBlcnNvbmEgZGV0YWlsc1xuICBwZXJzb25hc1xuICAgIC5jb21tYW5kKCdzaG93JylcbiAgICAuZGVzY3JpcHRpb24oJ1Nob3cgZGV0YWlsZWQgaW5mb3JtYXRpb24gYWJvdXQgYSBwZXJzb25hJylcbiAgICAucmVxdWlyZWRPcHRpb24oJy0tcGVyc29uYSA8aWQ+JywgJ1BlcnNvbmEgSUQgdG8gc2hvdycpXG4gICAgLmFjdGlvbihhc3luYyAob3B0aW9ucykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gQ3JlYXRlIGEgcGVyc29uYSBzZXJ2aWNlIGluc3RhbmNlIHRvIGdldCBwZXJzb25hIGRldGFpbHNcbiAgICAgICAgY29uc3QgcGVyc29uYVNlcnZpY2UgPSBuZXcgUGVyc29uYVNlcnZpY2UobnVsbCk7IC8vIG51bGwgZm9yIER5bmFtb0RCIHNlcnZpY2Ugc2luY2Ugd2UncmUgdXNpbmcgc3RhdGljIHBlcnNvbmFzXG4gICAgICAgIGNvbnN0IHBlcnNvbmEgPSBhd2FpdCBwZXJzb25hU2VydmljZS5nZXRQZXJzb25hKG9wdGlvbnMucGVyc29uYSwgJ2RlZmF1bHQtdGVuYW50Jyk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZyhg8J+OrSBQZXJzb25hOiAke3BlcnNvbmEubmFtZX1cXG5gKTtcbiAgICAgICAgY29uc29sZS5sb2coYERlc2NyaXB0aW9uOiAke3BlcnNvbmEuZGVzY3JpcHRpb259XFxuYCk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZygnUGVyc29uYWxpdHk6Jyk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgIFRvbmU6ICR7cGVyc29uYS5wZXJzb25hbGl0eS50b25lfWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgICBTdHlsZTogJHtwZXJzb25hLnBlcnNvbmFsaXR5LnN0eWxlfWApO1xuICAgICAgICBcbiAgICAgICAgaWYgKHBlcnNvbmEucGVyc29uYWxpdHkubGFuZ3VhZ2VRdWlya3MpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnXFxuICBMYW5ndWFnZSBRdWlya3M6Jyk7XG4gICAgICAgICAgcGVyc29uYS5wZXJzb25hbGl0eS5sYW5ndWFnZVF1aXJrcy5mb3JFYWNoKHF1aXJrID0+IHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgICAg4oCiICR7cXVpcmt9YCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChwZXJzb25hLnBlcnNvbmFsaXR5LnNwZWNpYWxCZWhhdmlvcnMpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnXFxuICBTcGVjaWFsIEJlaGF2aW9yczonKTtcbiAgICAgICAgICBwZXJzb25hLnBlcnNvbmFsaXR5LnNwZWNpYWxCZWhhdmlvcnMuZm9yRWFjaChiZWhhdmlvciA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgIOKAoiAke2JlaGF2aW9yfWApO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZygnXFxuUmVzcG9uc2UgR3VpZGVsaW5lczonKTtcbiAgICAgICAgcGVyc29uYS5yZXNwb25zZUd1aWRlbGluZXMuZm9yRWFjaChndWlkZWxpbmUgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgIOKAoiAke2d1aWRlbGluZX1gKTtcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBjb25zb2xlLmxvZygnXFxuU3lzdGVtIFByb21wdCBQcmV2aWV3OicpO1xuICAgICAgICBjb25zb2xlLmxvZygn4pSAJy5yZXBlYXQoNTApKTtcbiAgICAgICAgY29uc29sZS5sb2cocGVyc29uYS5zeXN0ZW1Qcm9tcHQuc3Vic3RyaW5nKDAsIDMwMCkgKyAnLi4uJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfilIAnLnJlcGVhdCg1MCkpO1xuICAgICAgICBcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvcjonLCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yKTtcbiAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gIHJldHVybiBwZXJzb25hcztcbn1cbiJdfQ==