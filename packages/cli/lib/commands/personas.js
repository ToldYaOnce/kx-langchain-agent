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
            if (persona.personality) {
                console.log(`Tone: ${persona.personality.tone}`);
                console.log(`Style: ${persona.personality.style}\n`);
            }
            else if (persona.personalityTraits) {
                console.log(`Uses numeric personality traits\n`);
            }
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
            // Show personality (old format) or traits (new format)
            if (persona.personality) {
                console.log('Personality (Legacy):');
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
            }
            // Show new personality traits if present
            if (persona.personalityTraits) {
                console.log('\nPersonality Traits:');
                const traits = persona.personalityTraits;
                console.log(`  Enthusiasm: ${traits.enthusiasm}/10`);
                console.log(`  Warmth: ${traits.warmth}/10`);
                console.log(`  Professionalism: ${traits.professionalism}/10`);
                console.log(`  Sales Aggression: ${traits.salesAggression}/10`);
            }
            // Show personality quirks if present
            if (persona.personalityQuirks) {
                console.log('\nPersonality Quirks:');
                persona.personalityQuirks.forEach((quirk) => {
                    console.log(`  • ${quirk}`);
                });
            }
            console.log('\nResponse Guidelines:');
            persona.responseGuidelines?.forEach?.((guideline) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyc29uYXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tbWFuZHMvcGVyc29uYXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFNQSxzREFvSkM7QUExSkQseUNBQW9DO0FBQ3BDLGdHQUFnRztBQUNoRyx1RkFBc0Y7QUFDdEYsdUZBQTBFO0FBRzFFLFNBQWdCLHFCQUFxQjtJQUNuQyxNQUFNLFFBQVEsR0FBRyxJQUFJLG1CQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDekMsUUFBUSxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBRTlDLDBCQUEwQjtJQUMxQixRQUFRO1NBQ0wsT0FBTyxDQUFDLE1BQU0sQ0FBQztTQUNmLFdBQVcsQ0FBQywrQkFBK0IsQ0FBQztTQUM1QyxNQUFNLENBQUMsR0FBRyxFQUFFO1FBQ1gsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBRTdDLE1BQU0saUJBQWlCLEdBQUcsMkNBQWMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBRS9ELGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRTtZQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssT0FBTyxDQUFDLElBQUksS0FBSyxPQUFPLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNqRCxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssT0FBTyxDQUFDLFdBQVcsSUFBSSxDQUFDLENBQUM7UUFDNUMsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLDhEQUE4RCxDQUFDLENBQUM7SUFDOUUsQ0FBQyxDQUFDLENBQUM7SUFFTCxpQkFBaUI7SUFDakIsUUFBUTtTQUNMLE9BQU8sQ0FBQyxNQUFNLENBQUM7U0FDZixXQUFXLENBQUMseUNBQXlDLENBQUM7U0FDdEQsY0FBYyxDQUFDLGdCQUFnQixFQUFFLG9CQUFvQixDQUFDO1NBQ3RELE1BQU0sQ0FBQyxpQkFBaUIs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Q0wsQ0FBQztZQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztZQUNyQyxPQUFPLENBQUMsa0JBQTBCLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQyxTQUFjLEVBQUUsRUFBRTtnQkFDaEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDbEMsQ0FBQyxDQUFDLENBQUM7WUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLENBQUM7WUFDeEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7WUFDNUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUIsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxRSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xCLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVMLE9BQU8sUUFBUSxDQUFDO0FBQ2xCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnY29tbWFuZGVyJztcbi8vIE5vdGU6IGxpc3RQZXJzb25hcyBhbmQgZ2V0UGVyc29uYSBhcmUgbm90IGV4cG9ydGVkIGZyb20gcnVudGltZSwgdXNpbmcgUGVyc29uYVNlcnZpY2UgaW5zdGVhZFxuaW1wb3J0IHsgQWdlbnRTZXJ2aWNlLCBQZXJzb25hU2VydmljZSB9IGZyb20gJ0B0b2xkeWFvbmNlL2t4LWxhbmdjaGFpbi1hZ2VudC1ydW50aW1lJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RDb25maWcgfSBmcm9tICdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZSc7XG5pbXBvcnQgdHlwZSB7IEFnZW50Q29udGV4dCB9IGZyb20gJ0B0b2xkeWFvbmNlL2t4LWxhbmdjaGFpbi1hZ2VudC1ydW50aW1lJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVBlcnNvbmFzQ29tbWFuZCgpOiBDb21tYW5kIHtcbiAgY29uc3QgcGVyc29uYXMgPSBuZXcgQ29tbWFuZCgncGVyc29uYXMnKTtcbiAgcGVyc29uYXMuZGVzY3JpcHRpb24oJ01hbmFnZSBhZ2VudCBwZXJzb25hcycpO1xuXG4gIC8vIExpc3QgYXZhaWxhYmxlIHBlcnNvbmFzXG4gIHBlcnNvbmFzXG4gICAgLmNvbW1hbmQoJ2xpc3QnKVxuICAgIC5kZXNjcmlwdGlvbignTGlzdCBhdmFpbGFibGUgYWdlbnQgcGVyc29uYXMnKVxuICAgIC5hY3Rpb24oKCkgPT4ge1xuICAgICAgY29uc29sZS5sb2coJ/Cfjq0gQXZhaWxhYmxlIEFnZW50IFBlcnNvbmFzXFxuJyk7XG4gICAgICBcbiAgICAgIGNvbnN0IGF2YWlsYWJsZVBlcnNvbmFzID0gUGVyc29uYVNlcnZpY2UubGlzdERlZmF1bHRQZXJzb25hcygpO1xuICAgICAgXG4gICAgICBhdmFpbGFibGVQZXJzb25hcy5mb3JFYWNoKHBlcnNvbmEgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhg4pePICR7cGVyc29uYS5uYW1lfSAoJHtwZXJzb25hLmlkfSlgKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgJHtwZXJzb25hLmRlc2NyaXB0aW9ufVxcbmApO1xuICAgICAgfSk7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGBVc2UgXCJreGFnZW50IHBlcnNvbmFzIHRlc3QgLS1wZXJzb25hIDxpZD5cIiB0byB0ZXN0IGEgcGVyc29uYWApO1xuICAgIH0pO1xuXG4gIC8vIFRlc3QgYSBwZXJzb25hXG4gIHBlcnNvbmFzXG4gICAgLmNvbW1hbmQoJ3Rlc3QnKVxuICAgIC5kZXNjcmlwdGlvbignVGVzdCBhIHBlcnNvbmEgd2l0aCBzYW1wbGUgY29udmVyc2F0aW9uJylcbiAgICAucmVxdWlyZWRPcHRpb24oJy0tcGVyc29uYSA8aWQ+JywgJ1BlcnNvbmEgSUQgdG8gdGVzdCcpXG4gICAgLm9wdGlvbignLS1wcm9tcHQgPHRleHQ+JywgJ0N1c3RvbSB0ZXN0IHByb21wdCcsICdIZWxsbyEgSVxcJ20gaW50ZXJlc3RlZCBpbiBsZWFybmluZyBhYm91dCBLeEdlbi4gQ2FuIHlvdSB0ZWxsIG1lIHdoYXQgeW91IGRvPycpXG4gICAgLm9wdGlvbignLS10ZW5hbnQtaWQgPGlkPicsICdUZW5hbnQgSUQgZm9yIHRlc3RpbmcnLCAndGVzdC10ZW5hbnQnKVxuICAgIC5vcHRpb24oJy0tZW1haWwgPGVtYWlsPicsICdFbWFpbCBmb3IgdGVzdGluZycsICd0ZXN0QGV4YW1wbGUuY29tJylcbiAgICAuYWN0aW9uKGFzeW5jIChvcHRpb25zKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZygn8J+OrSBUZXN0aW5nIEFnZW50IFBlcnNvbmEnKTtcbiAgICAgICAgY29uc29sZS5sb2coYFBlcnNvbmE6ICR7b3B0aW9ucy5wZXJzb25hfWApO1xuICAgICAgICBjb25zb2xlLmxvZyhgUHJvbXB0OiAke29wdGlvbnMucHJvbXB0fVxcbmApO1xuXG4gICAgICAgIC8vIEdldCBwZXJzb25hIGluZm9cbiAgICAgICAgLy8gQ3JlYXRlIGEgcGVyc29uYSBzZXJ2aWNlIGluc3RhbmNlIHRvIGdldCBwZXJzb25hIGRldGFpbHNcbiAgICAgICAgY29uc3QgcGVyc29uYVNlcnZpY2UgPSBuZXcgUGVyc29uYVNlcnZpY2UobnVsbCk7IC8vIG51bGwgZm9yIER5bmFtb0RCIHNlcnZpY2Ugc2luY2Ugd2UncmUgdXNpbmcgc3RhdGljIHBlcnNvbmFzXG4gICAgICAgIGNvbnN0IHBlcnNvbmEgPSBhd2FpdCBwZXJzb25hU2VydmljZS5nZXRQZXJzb25hKG9wdGlvbnMucGVyc29uYSwgJ2RlZmF1bHQtdGVuYW50Jyk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDwn6SWICR7cGVyc29uYS5uYW1lfTogJHtwZXJzb25hLmRlc2NyaXB0aW9ufWApO1xuICAgICAgICBpZiAocGVyc29uYS5wZXJzb25hbGl0eSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGBUb25lOiAke3BlcnNvbmEucGVyc29uYWxpdHkudG9uZX1gKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgU3R5bGU6ICR7cGVyc29uYS5wZXJzb25hbGl0eS5zdHlsZX1cXG5gKTtcbiAgICAgICAgfSBlbHNlIGlmICgocGVyc29uYSBhcyBhbnkpLnBlcnNvbmFsaXR5VHJhaXRzKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coYFVzZXMgbnVtZXJpYyBwZXJzb25hbGl0eSB0cmFpdHNcXG5gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENyZWF0ZSBhZ2VudCB3aXRoIHBlcnNvbmEgKHdpbGwgdXNlIGNvbXBhbnkgaW5mbyBmcm9tIEpTT04pXG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IGNyZWF0ZVRlc3RDb25maWcoKTtcbiAgICAgICAgLy8gTm90ZTogcGVyc29uYUlkIGlzIHBhc3NlZCB2aWEgQWdlbnRTZXJ2aWNlIGNvbnN0cnVjdG9yIG9wdGlvbnNcbiAgICAgICAgLy8gRG9uJ3Qgb3ZlcnJpZGUgY29tcGFueSBpbmZvIC0gbGV0IGl0IHVzZSB0aGUgdmFsdWVzIGZyb20gdGhlIEpTT04gZmlsZVxuICAgICAgICBcbiAgICAgICAgY29uc3QgYWdlbnQgPSBuZXcgQWdlbnRTZXJ2aWNlKGNvbmZpZyk7XG5cbiAgICAgICAgLy8gQ3JlYXRlIHRlc3QgY29udGV4dFxuICAgICAgICBjb25zdCBjb250ZXh0OiBBZ2VudENvbnRleHQgPSB7XG4gICAgICAgICAgdGVuYW50SWQ6IG9wdGlvbnMudGVuYW50SWQsXG4gICAgICAgICAgZW1haWxfbGM6IG9wdGlvbnMuZW1haWwudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICB0ZXh0OiBvcHRpb25zLnByb21wdCxcbiAgICAgICAgICBzb3VyY2U6ICdjaGF0JyxcbiAgICAgICAgICBjb252ZXJzYXRpb25faWQ6IGB0ZXN0LSR7RGF0ZS5ub3coKX1gLFxuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5KsIEFnZW50IFJlc3BvbnNlOicpO1xuICAgICAgICBjb25zb2xlLmxvZygn4pSAJy5yZXBlYXQoNTApKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYWdlbnQucHJvY2Vzc01lc3NhZ2UoY29udGV4dCk7XG4gICAgICAgIGNvbnNvbGUubG9nKHJlc3BvbnNlKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKCfilIAnLnJlcGVhdCg1MCkpO1xuICAgICAgICBjb25zb2xlLmxvZygn4pyFIFRlc3QgY29tcGxldGVkIHN1Y2Nlc3NmdWxseScpO1xuXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgUGVyc29uYSBUZXN0IEVycm9yOicsIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3IpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgLy8gU2hvdyBwZXJzb25hIGRldGFpbHNcbiAgcGVyc29uYXNcbiAgICAuY29tbWFuZCgnc2hvdycpXG4gICAgLmRlc2NyaXB0aW9uKCdTaG93IGRldGFpbGVkIGluZm9ybWF0aW9uIGFib3V0IGEgcGVyc29uYScpXG4gICAgLnJlcXVpcmVkT3B0aW9uKCctLXBlcnNvbmEgPGlkPicsICdQZXJzb25hIElEIHRvIHNob3cnKVxuICAgIC5hY3Rpb24oYXN5bmMgKG9wdGlvbnMpID0+IHtcbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIENyZWF0ZSBhIHBlcnNvbmEgc2VydmljZSBpbnN0YW5jZSB0byBnZXQgcGVyc29uYSBkZXRhaWxzXG4gICAgICAgIGNvbnN0IHBlcnNvbmFTZXJ2aWNlID0gbmV3IFBlcnNvbmFTZXJ2aWNlKG51bGwpOyAvLyBudWxsIGZvciBEeW5hbW9EQiBzZXJ2aWNlIHNpbmNlIHdlJ3JlIHVzaW5nIHN0YXRpYyBwZXJzb25hc1xuICAgICAgICBjb25zdCBwZXJzb25hID0gYXdhaXQgcGVyc29uYVNlcnZpY2UuZ2V0UGVyc29uYShvcHRpb25zLnBlcnNvbmEsICdkZWZhdWx0LXRlbmFudCcpO1xuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coYPCfjq0gUGVyc29uYTogJHtwZXJzb25hLm5hbWV9XFxuYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGBEZXNjcmlwdGlvbjogJHtwZXJzb25hLmRlc2NyaXB0aW9ufVxcbmApO1xuICAgICAgICBcbiAgICAgICAgLy8gU2hvdyBwZXJzb25hbGl0eSAob2xkIGZvcm1hdCkgb3IgdHJhaXRzIChuZXcgZm9ybWF0KVxuICAgICAgICBpZiAocGVyc29uYS5wZXJzb25hbGl0eSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdQZXJzb25hbGl0eSAoTGVnYWN5KTonKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICBUb25lOiAke3BlcnNvbmEucGVyc29uYWxpdHkudG9uZX1gKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICBTdHlsZTogJHtwZXJzb25hLnBlcnNvbmFsaXR5LnN0eWxlfWApO1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChwZXJzb25hLnBlcnNvbmFsaXR5Lmxhbmd1YWdlUXVpcmtzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnXFxuICBMYW5ndWFnZSBRdWlya3M6Jyk7XG4gICAgICAgICAgICBwZXJzb25hLnBlcnNvbmFsaXR5Lmxhbmd1YWdlUXVpcmtzLmZvckVhY2gocXVpcmsgPT4ge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgIOKAoiAke3F1aXJrfWApO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIGlmIChwZXJzb25hLnBlcnNvbmFsaXR5LnNwZWNpYWxCZWhhdmlvcnMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdcXG4gIFNwZWNpYWwgQmVoYXZpb3JzOicpO1xuICAgICAgICAgICAgcGVyc29uYS5wZXJzb25hbGl0eS5zcGVjaWFsQmVoYXZpb3JzLmZvckVhY2goYmVoYXZpb3IgPT4ge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgIOKAoiAke2JlaGF2aW9yfWApO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBTaG93IG5ldyBwZXJzb25hbGl0eSB0cmFpdHMgaWYgcHJlc2VudFxuICAgICAgICBpZiAoKHBlcnNvbmEgYXMgYW55KS5wZXJzb25hbGl0eVRyYWl0cykge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdcXG5QZXJzb25hbGl0eSBUcmFpdHM6Jyk7XG4gICAgICAgICAgY29uc3QgdHJhaXRzID0gKHBlcnNvbmEgYXMgYW55KS5wZXJzb25hbGl0eVRyYWl0cztcbiAgICAgICAgICBjb25zb2xlLmxvZyhgICBFbnRodXNpYXNtOiAke3RyYWl0cy5lbnRodXNpYXNtfS8xMGApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgIFdhcm10aDogJHt0cmFpdHMud2FybXRofS8xMGApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgIFByb2Zlc3Npb25hbGlzbTogJHt0cmFpdHMucHJvZmVzc2lvbmFsaXNtfS8xMGApO1xuICAgICAgICAgIGNvbnNvbGUubG9nKGAgIFNhbGVzIEFnZ3Jlc3Npb246ICR7dHJhaXRzLnNhbGVzQWdncmVzc2lvbn0vMTBgKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gU2hvdyBwZXJzb25hbGl0eSBxdWlya3MgaWYgcHJlc2VudFxuICAgICAgICBpZiAoKHBlcnNvbmEgYXMgYW55KS5wZXJzb25hbGl0eVF1aXJrcykge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCdcXG5QZXJzb25hbGl0eSBRdWlya3M6Jyk7XG4gICAgICAgICAgKHBlcnNvbmEgYXMgYW55KS5wZXJzb25hbGl0eVF1aXJrcy5mb3JFYWNoKChxdWlyazogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICDigKIgJHtxdWlya31gKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc29sZS5sb2coJ1xcblJlc3BvbnNlIEd1aWRlbGluZXM6Jyk7XG4gICAgICAgIChwZXJzb25hLnJlc3BvbnNlR3VpZGVsaW5lcyBhcyBhbnkpPy5mb3JFYWNoPy4oKGd1aWRlbGluZTogYW55KSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coYCAg4oCiICR7Z3VpZGVsaW5lfWApO1xuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnNvbGUubG9nKCdcXG5TeXN0ZW0gUHJvbXB0IFByZXZpZXc6Jyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfilIAnLnJlcGVhdCg1MCkpO1xuICAgICAgICBjb25zb2xlLmxvZyhwZXJzb25hLnN5c3RlbVByb21wdC5zdWJzdHJpbmcoMCwgMzAwKSArICcuLi4nKTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KUgCcucmVwZWF0KDUwKSk7XG4gICAgICAgIFxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yOicsIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3IpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgcmV0dXJuIHBlcnNvbmFzO1xufVxuIl19