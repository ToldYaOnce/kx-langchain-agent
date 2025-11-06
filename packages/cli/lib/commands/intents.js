"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.intentsCommand = void 0;
exports.createIntentsCommand = createIntentsCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const inquirer_1 = __importDefault(require("inquirer"));
const kx_langchain_agent_runtime_1 = require("@toldyaonce/kx-langchain-agent-runtime");
function createCompanyInfo(options) {
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
async function listIntents(options) {
    try {
        const personaService = new kx_langchain_agent_runtime_1.PersonaService(null);
        const companyInfo = createCompanyInfo(options);
        const persona = await personaService.getPersona(options.tenantId || 'dev-test', options.persona || 'carlos', companyInfo);
        console.log(chalk_1.default.blue(`\\n📋 Intents for ${persona.name} (${options.persona || 'carlos'})`));
        if (!persona.intentCapturing?.enabled) {
            console.log(chalk_1.default.yellow('❌ Intent capturing is disabled for this persona'));
            return;
        }
        const { intents, fallbackIntent, confidence } = persona.intentCapturing;
        console.log(chalk_1.default.green(`\\n✅ Intent capturing enabled (threshold: ${confidence.threshold})`));
        console.log(chalk_1.default.gray(`   Multiple intent handling: ${confidence.multipleIntentHandling}`));
        console.log(chalk_1.default.blue('\\n🎯 Configured Intents:'));
        for (const intent of intents) {
            console.log(chalk_1.default.white(`\\n  ${intent.id} (${intent.priority} priority)`));
            console.log(chalk_1.default.gray(`    ${intent.description}`));
            console.log(chalk_1.default.cyan(`    Triggers: ${intent.triggers.slice(0, 5).join(', ')}${intent.triggers.length > 5 ? '...' : ''}`));
            console.log(chalk_1.default.cyan(`    Patterns: ${intent.patterns.slice(0, 3).join(', ')}${intent.patterns.length > 3 ? '...' : ''}`));
            console.log(chalk_1.default.magenta(`    Actions: ${intent.actions.join(', ')}`));
        }
        console.log(chalk_1.default.blue('\\n🔄 Fallback Intent:'));
        console.log(chalk_1.default.white(`  ${fallbackIntent.id}`));
        console.log(chalk_1.default.gray(`    ${fallbackIntent.description}`));
        console.log(chalk_1.default.magenta(`    Actions: ${fallbackIntent.actions.join(', ')}`));
    }
    catch (error) {
        console.error(chalk_1.default.red('❌ Error listing intents:'), error);
        process.exit(1);
    }
}
async function testIntent(message, options) {
    try {
        const personaService = new kx_langchain_agent_runtime_1.PersonaService(null);
        const intentService = new kx_langchain_agent_runtime_1.IntentService();
        const companyInfo = createCompanyInfo(options);
        const persona = await personaService.getPersona(options.tenantId || 'dev-test', options.persona || 'carlos', companyInfo);
        console.log(chalk_1.default.blue(`\\n🧪 Testing intent detection for: "${message}"`));
        console.log(chalk_1.default.gray(`Using persona: ${persona.name} (${options.persona || 'carlos'})`));
        if (!persona.intentCapturing?.enabled) {
            console.log(chalk_1.default.yellow('❌ Intent capturing is disabled for this persona'));
            return;
        }
        const intentMatch = await intentService.detectIntent(message, persona, companyInfo, {
            tenantId: options.tenantId || 'dev-test',
            userId: 'test-user',
            sessionId: 'test-session',
            channel: 'cli'
        });
        if (!intentMatch) {
            console.log(chalk_1.default.yellow('\\n❌ No intent detected'));
            return;
        }
        console.log(chalk_1.default.green(`\\n✅ Intent detected: ${intentMatch.intent.id}`));
        console.log(chalk_1.default.white(`   Name: ${intentMatch.intent.name}`));
        console.log(chalk_1.default.white(`   Confidence: ${(intentMatch.confidence * 100).toFixed(1)}%`));
        console.log(chalk_1.default.white(`   Priority: ${intentMatch.intent.priority}`));
        if (intentMatch.matchedTriggers.length > 0) {
            console.log(chalk_1.default.cyan(`   Matched triggers: ${intentMatch.matchedTriggers.join(', ')}`));
        }
        if (intentMatch.matchedPatterns.length > 0) {
            console.log(chalk_1.default.cyan(`   Matched patterns: ${intentMatch.matchedPatterns.join(', ')}`));
        }
        console.log(chalk_1.default.blue('\\n💬 Response:'));
        console.log(chalk_1.default.white(`   ${intentMatch.response}`));
        if (intentMatch.followUp && intentMatch.followUp.length > 0) {
            console.log(chalk_1.default.blue('\\n🔄 Follow-up suggestions:'));
            for (const followUp of intentMatch.followUp) {
                console.log(chalk_1.default.white(`   • ${followUp}`));
            }
        }
        console.log(chalk_1.default.blue('\\n⚡ Actions:'));
        console.log(chalk_1.default.magenta(`   ${intentMatch.actions.join(', ')}`));
    }
    catch (error) {
        console.error(chalk_1.default.red('❌ Error testing intent:'), error);
        process.exit(1);
    }
}
async function interactiveTest(options) {
    try {
        const personaService = new kx_langchain_agent_runtime_1.PersonaService(null);
        const intentService = new kx_langchain_agent_runtime_1.IntentService();
        const companyInfo = createCompanyInfo(options);
        const persona = await personaService.getPersona(options.tenantId || 'dev-test', options.persona || 'carlos', companyInfo);
        console.log(chalk_1.default.blue(`\\n🎯 Interactive Intent Testing`));
        console.log(chalk_1.default.gray(`Persona: ${persona.name} (${options.persona || 'carlos'})`));
        console.log(chalk_1.default.gray(`Company: ${companyInfo.name}`));
        console.log(chalk_1.default.gray('Type "exit" to quit\\n'));
        if (!persona.intentCapturing?.enabled) {
            console.log(chalk_1.default.yellow('❌ Intent capturing is disabled for this persona'));
            return;
        }
        while (true) {
            const { message } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'message',
                    message: chalk_1.default.green('Test message:'),
                    validate: (input) => input.trim().length > 0 || 'Please enter a message'
                }
            ]);
            if (message.toLowerCase().trim() === 'exit') {
                console.log(chalk_1.default.blue('\\n👋 Goodbye!'));
                break;
            }
            const intentMatch = await intentService.detectIntent(message, persona, companyInfo, {
                tenantId: options.tenantId || 'dev-test',
                userId: 'test-user',
                sessionId: 'test-session',
                channel: 'cli'
            });
            if (!intentMatch) {
                console.log(chalk_1.default.yellow('❌ No intent detected\\n'));
                continue;
            }
            console.log(chalk_1.default.green(`✅ ${intentMatch.intent.name} (${(intentMatch.confidence * 100).toFixed(1)}%)`));
            console.log(chalk_1.default.white(`💬 ${intentMatch.response}`));
            if (intentMatch.followUp && intentMatch.followUp.length > 0) {
                console.log(chalk_1.default.blue(`🔄 ${intentMatch.followUp.join(' ')}`));
            }
            console.log('');
        }
    }
    catch (error) {
        console.error(chalk_1.default.red('❌ Error in interactive test:'), error);
        process.exit(1);
    }
}
function createIntentsCommand() {
    const intentsCmd = new commander_1.Command('intents');
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
        .action(async (message) => {
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
exports.intentsCommand = createIntentsCommand;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZW50cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jb21tYW5kcy9pbnRlbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OztBQXFPQSxvREE0Q0M7QUFqUkQseUNBQW9DO0FBQ3BDLGtEQUEwQjtBQUMxQix3REFBZ0M7QUFDaEMsdUZBQXlHO0FBY3pHLFNBQVMsaUJBQWlCLENBQUMsT0FBc0I7SUFDL0MsT0FBTztRQUNMLFFBQVEsRUFBRSxhQUFhO1FBQ3ZCLElBQUksRUFBRSxPQUFPLENBQUMsT0FBTyxJQUFJLGdCQUFnQjtRQUN6QyxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsSUFBSSxvQkFBb0I7UUFDbEQsV0FBVyxFQUFFLE9BQU8sQ0FBQyxXQUFXLElBQUksdURBQXVEO1FBQzNGLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxJQUFJLG1EQUFtRDtRQUNqRixRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsSUFBSSxxRUFBcUU7UUFDbkcsZUFBZSxFQUFFLE9BQU8sQ0FBQyxNQUFNLElBQUkseUZBQXlGO1FBQzVILGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZSxJQUFJLGlFQUFpRTtRQUM3RyxlQUFlLEVBQUU7WUFDZixPQUFPLEVBQUUsSUFBSTtZQUNiLE9BQU8sRUFBRSxFQUFFO1lBQ1gsY0FBYyxFQUFFO2dCQUNkLEVBQUUsRUFBRSxVQUFVO2dCQUNkLElBQUksRUFBRSxpQkFBaUI7Z0JBQ3ZCLFdBQVcsRUFBRSxzREFBc0Q7Z0JBQ25FLFFBQVEsRUFBRTtvQkFDUixJQUFJLEVBQUUsZ0JBQWdCO29CQUN0QixRQUFRLEVBQUUsNkVBQTZFO2lCQUN4RjtnQkFDRCxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQzthQUNuQztZQUNELFVBQVUsRUFBRTtnQkFDVixTQUFTLEVBQUUsR0FBRztnQkFDZCxzQkFBc0IsRUFBRSxvQkFBb0I7YUFDN0M7U0FDRjtRQUNELFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRTtR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LENBQUMsQ0FBQztJQUVMLDJCQUEyQjtJQUMzQixVQUFVO1NBQ1AsT0FBTyxDQUFDLGFBQWEsQ0FBQztTQUN0QixLQUFLLENBQUMsR0FBRyxDQUFDO1NBQ1YsV0FBVyxDQUFDLDRCQUE0QixDQUFDO1NBQ3pDLE1BQU0sQ0FBQyxLQUFLLElBQUksRUFBRTtRQUNqQixNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbEMsTUFBTSxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDakMsQ0FBQyxDQUFDLENBQUM7SUFFTCxPQUFPLFVBQVUsQ0FBQztBQUNwQixDQUFDO0FBRVksUUFBQSxjQUFjLEdBQUcsb0JBQW9CLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnY29tbWFuZGVyJztcbmltcG9ydCBjaGFsayBmcm9tICdjaGFsayc7XG5pbXBvcnQgaW5xdWlyZXIgZnJvbSAnaW5xdWlyZXInO1xuaW1wb3J0IHsgUGVyc29uYVNlcnZpY2UsIEludGVudFNlcnZpY2UsIHR5cGUgQ29tcGFueUluZm8gfSBmcm9tICdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZSc7XG5cbmludGVyZmFjZSBJbnRlbnRPcHRpb25zIHtcbiAgcGVyc29uYT86IHN0cmluZztcbiAgdGVuYW50SWQ/OiBzdHJpbmc7XG4gIGNvbXBhbnk/OiBzdHJpbmc7XG4gIGluZHVzdHJ5Pzogc3RyaW5nO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZztcbiAgcHJvZHVjdHM/OiBzdHJpbmc7XG4gIGJlbmVmaXRzPzogc3RyaW5nO1xuICB0YXJnZXQ/OiBzdHJpbmc7XG4gIGRpZmZlcmVudGlhdG9ycz86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29tcGFueUluZm8ob3B0aW9uczogSW50ZW50T3B0aW9ucyk6IENvbXBhbnlJbmZvIHtcbiAgcmV0dXJuIHtcbiAgICB0ZW5hbnRJZDogJ3Rlc3QtdGVuYW50JyxcbiAgICBuYW1lOiBvcHRpb25zLmNvbXBhbnkgfHwgJ1BsYW5ldCBGaXRuZXNzJyxcbiAgICBpbmR1c3RyeTogb3B0aW9ucy5pbmR1c3RyeSB8fCAnRml0bmVzcyAmIFdlbGxuZXNzJyxcbiAgICBkZXNjcmlwdGlvbjogb3B0aW9ucy5kZXNjcmlwdGlvbiB8fCAnQW1lcmljYVxcJ3MgbW9zdCBwb3B1bGFyIGd5bSB3aXRoIG92ZXIgMiw0MDAgbG9jYXRpb25zJyxcbiAgICBwcm9kdWN0czogb3B0aW9ucy5wcm9kdWN0cyB8fCAnR3ltIG1lbWJlcnNoaXBzLCBmaXRuZXNzIGVxdWlwbWVudCwgZ3JvdXAgY2xhc3NlcycsXG4gICAgYmVuZWZpdHM6IG9wdGlvbnMuYmVuZWZpdHMgfHwgJ0FmZm9yZGFibGUgcHJpY2luZywganVkZ21lbnQtZnJlZSBlbnZpcm9ubWVudCwgY29udmVuaWVudCBsb2NhdGlvbnMnLFxuICAgIHRhcmdldEN1c3RvbWVyczogb3B0aW9ucy50YXJnZXQgfHwgJ1Blb3BsZSBvZiBhbGwgZml0bmVzcyBsZXZlbHMgbG9va2luZyBmb3IgYW4gYWZmb3JkYWJsZSwgbm9uLWludGltaWRhdGluZyBneW0gZXhwZXJpZW5jZScsXG4gICAgZGlmZmVyZW50aWF0b3JzOiBvcHRpb25zLmRpZmZlcmVudGlhdG9ycyB8fCAnTG93IGNvc3QsIG5vLWp1ZGdtZW50IGF0bW9zcGhlcmUsIGJlZ2lubmVyLWZyaWVuZGx5IGVudmlyb25tZW50JyxcbiAgICBpbnRlbnRDYXB0dXJpbmc6IHtcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBpbnRlbnRzOiBbXSxcbiAgICAgIGZhbGxiYWNrSW50ZW50OiB7XG4gICAgICAgIGlkOiAnZmFsbGJhY2snLFxuICAgICAgICBuYW1lOiAnRmFsbGJhY2sgSW50ZW50JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdEZWZhdWx0IHJlc3BvbnNlIHdoZW4gbm8gc3BlY2lmaWMgaW50ZW50IGlzIGRldGVjdGVkJyxcbiAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICB0eXBlOiAnY29udmVyc2F0aW9uYWwnLFxuICAgICAgICAgIHRlbXBsYXRlOiAnSSB1bmRlcnN0YW5kIHlvdVxcJ3JlIGludGVyZXN0ZWQgaW4gbGVhcm5pbmcgbW9yZS4gSG93IGNhbiBJIGhlbHAgeW91IHRvZGF5PydcbiAgICAgICAgfSxcbiAgICAgICAgYWN0aW9uczogWydjb250aW51ZV9jb252ZXJzYXRpb24nXVxuICAgICAgfSxcbiAgICAgIGNvbmZpZGVuY2U6IHtcbiAgICAgICAgdGhyZXNob2xkOiAwLjcsXG4gICAgICAgIG11bHRpcGxlSW50ZW50SGFuZGxpbmc6ICdoaWdoZXN0X2NvbmZpZGVuY2UnXG4gICAgICB9XG4gICAgfSxcbiAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGxpc3RJbnRlbnRzKG9wdGlvbnM6IEludGVudE9wdGlvbnMpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwZXJzb25hU2VydmljZSA9IG5ldyBQZXJzb25hU2VydmljZShudWxsKTtcbiAgICBjb25zdCBjb21wYW55SW5mbyA9IGNyZWF0ZUNvbXBhbnlJbmZvKG9wdGlvbnMpO1xuICAgIGNvbnN0IHBlcnNvbmEgPSBhd2FpdCBwZXJzb25hU2VydmljZS5nZXRQZXJzb25hKFxuICAgICAgb3B0aW9ucy50ZW5hbnRJZCB8fCAnZGV2LXRlc3QnLFxuICAgICAgb3B0aW9ucy5wZXJzb25hIHx8ICdjYXJsb3MnLFxuICAgICAgY29tcGFueUluZm9cbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZShgXFxcXG7wn5OLIEludGVudHMgZm9yICR7cGVyc29uYS5uYW1lfSAoJHtvcHRpb25zLnBlcnNvbmEgfHwgJ2Nhcmxvcyd9KWApKTtcbiAgICBpZiAoIXBlcnNvbmEuaW50ZW50Q2FwdHVyaW5nPy5lbmFibGVkKSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay55ZWxsb3coJ+KdjCBJbnRlbnQgY2FwdHVyaW5nIGlzIGRpc2FibGVkIGZvciB0aGlzIHBlcnNvbmEnKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgeyBpbnRlbnRzLCBmYWxsYmFja0ludGVudCwgY29uZmlkZW5jZSB9ID0gcGVyc29uYS5pbnRlbnRDYXB0dXJpbmc7XG4gICAgXG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oYFxcXFxu4pyFIEludGVudCBjYXB0dXJpbmcgZW5hYmxlZCAodGhyZXNob2xkOiAke2NvbmZpZGVuY2UudGhyZXNob2xkfSlgKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgICAgTXVsdGlwbGUgaW50ZW50IGhhbmRsaW5nOiAke2NvbmZpZGVuY2UubXVsdGlwbGVJbnRlbnRIYW5kbGluZ31gKSk7XG4gICAgXG4gICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZSgnXFxcXG7wn46vIENvbmZpZ3VyZWQgSW50ZW50czonKSk7XG4gICAgZm9yIChjb25zdCBpbnRlbnQgb2YgaW50ZW50cykge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsud2hpdGUoYFxcXFxuICAke2ludGVudC5pZH0gKCR7aW50ZW50LnByaW9yaXR5fSBwcmlvcml0eSlgKSk7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGAgICAgJHtpbnRlbnQuZGVzY3JpcHRpb259YCkpO1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuY3lhbihgICAgIFRyaWdnZXJzOiAke2ludGVudC50cmlnZ2Vycy5zbGljZSgwLCA1KS5qb2luKCcsICcpfSR7aW50ZW50LnRyaWdnZXJzLmxlbmd0aCA+IDUgPyAnLi4uJyA6ICcnfWApKTtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmN5YW4oYCAgICBQYXR0ZXJuczogJHtpbnRlbnQucGF0dGVybnMuc2xpY2UoMCwgMykuam9pbignLCAnKX0ke2ludGVudC5wYXR0ZXJucy5sZW5ndGggPiAzID8gJy4uLicgOiAnJ31gKSk7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5tYWdlbnRhKGAgICAgQWN0aW9uczogJHtpbnRlbnQuYWN0aW9ucy5qb2luKCcsICcpfWApKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKCdcXFxcbvCflIQgRmFsbGJhY2sgSW50ZW50OicpKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay53aGl0ZShgICAke2ZhbGxiYWNrSW50ZW50LmlkfWApKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGAgICAgJHtmYWxsYmFja0ludGVudC5kZXNjcmlwdGlvbn1gKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsubWFnZW50YShgICAgIEFjdGlvbnM6ICR7ZmFsbGJhY2tJbnRlbnQuYWN0aW9ucy5qb2luKCcsICcpfWApKTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinYwgRXJyb3IgbGlzdGluZyBpbnRlbnRzOicpLCBlcnJvcik7XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRlc3RJbnRlbnQobWVzc2FnZTogc3RyaW5nLCBvcHRpb25zOiBJbnRlbnRPcHRpb25zKSB7XG4gIHRyeSB7XG4gICAgY29uc3QgcGVyc29uYVNlcnZpY2UgPSBuZXcgUGVyc29uYVNlcnZpY2UobnVsbCk7XG4gICAgY29uc3QgaW50ZW50U2VydmljZSA9IG5ldyBJbnRlbnRTZXJ2aWNlKCk7XG4gICAgY29uc3QgY29tcGFueUluZm8gPSBjcmVhdGVDb21wYW55SW5mbyhvcHRpb25zKTtcbiAgICBcbiAgICBjb25zdCBwZXJzb25hID0gYXdhaXQgcGVyc29uYVNlcnZpY2UuZ2V0UGVyc29uYShcbiAgICAgIG9wdGlvbnMudGVuYW50SWQgfHwgJ2Rldi10ZXN0JyxcbiAgICAgIG9wdGlvbnMucGVyc29uYSB8fCAnY2FybG9zJyxcbiAgICAgIGNvbXBhbnlJbmZvXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKGNoYWxrLmJsdWUoYFxcXFxu8J+nqiBUZXN0aW5nIGludGVudCBkZXRlY3Rpb24gZm9yOiBcIiR7bWVzc2FnZX1cImApKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGBVc2luZyBwZXJzb25hOiAke3BlcnNvbmEubmFtZX0gKCR7b3B0aW9ucy5wZXJzb25hIHx8ICdjYXJsb3MnfSlgKSk7XG4gICAgXG4gICAgaWYgKCFwZXJzb25hLmludGVudENhcHR1cmluZz8uZW5hYmxlZCkge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsueWVsbG93KCfinYwgSW50ZW50IGNhcHR1cmluZyBpcyBkaXNhYmxlZCBmb3IgdGhpcyBwZXJzb25hJykpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGludGVudE1hdGNoID0gYXdhaXQgaW50ZW50U2VydmljZS5kZXRlY3RJbnRlbnQoXG4gICAgICBtZXNzYWdlLFxuICAgICAgcGVyc29uYSxcbiAgICAgIGNvbXBhbnlJbmZvLFxuICAgICAge1xuICAgICAgICB0ZW5hbnRJZDogb3B0aW9ucy50ZW5hbnRJZCB8fCAnZGV2LXRlc3QnLFxuICAgICAgICB1c2VySWQ6ICd0ZXN0LXVzZXInLFxuICAgICAgICBzZXNzaW9uSWQ6ICd0ZXN0LXNlc3Npb24nLFxuICAgICAgICBjaGFubmVsOiAnY2xpJ1xuICAgICAgfVxuICAgICk7XG5cbiAgICBpZiAoIWludGVudE1hdGNoKSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay55ZWxsb3coJ1xcXFxu4p2MIE5vIGludGVudCBkZXRlY3RlZCcpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmVlbihgXFxcXG7inIUgSW50ZW50IGRldGVjdGVkOiAke2ludGVudE1hdGNoLmludGVudC5pZH1gKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsud2hpdGUoYCAgIE5hbWU6ICR7aW50ZW50TWF0Y2guaW50ZW50Lm5hbWV9YCkpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLndoaXRlKGAgICBDb25maWRlbmNlOiAkeyhpbnRlbnRNYXRjaC5jb25maWRlbmNlICogMTAwKS50b0ZpeGVkKDEpfSVgKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsud2hpdGUoYCAgIFByaW9yaXR5OiAke2ludGVudE1hdGNoLmludGVudC5wcmlvcml0eX1gKSk7XG4gICAgXG4gICAgaWYgKGludGVudE1hdGNoLm1hdGNoZWRUcmlnZ2Vycy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5jeWFuKGAgICBNYXRjaGVkIHRyaWdnZXJzOiAke2ludGVudE1hdGNoLm1hdGNoZWRUcmlnZ2Vycy5qb2luKCcsICcpfWApKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKGludGVudE1hdGNoLm1hdGNoZWRQYXR0ZXJucy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5jeWFuKGAgICBNYXRjaGVkIHBhdHRlcm5zOiAke2ludGVudE1hdGNoLm1hdGNoZWRQYXR0ZXJucy5qb2luKCcsICcpfWApKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKCdcXFxcbvCfkqwgUmVzcG9uc2U6JykpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLndoaXRlKGAgICAke2ludGVudE1hdGNoLnJlc3BvbnNlfWApKTtcbiAgICBcbiAgICBpZiAoaW50ZW50TWF0Y2guZm9sbG93VXAgJiYgaW50ZW50TWF0Y2guZm9sbG93VXAubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZSgnXFxcXG7wn5SEIEZvbGxvdy11cCBzdWdnZXN0aW9uczonKSk7XG4gICAgICBmb3IgKGNvbnN0IGZvbGxvd1VwIG9mIGludGVudE1hdGNoLmZvbGxvd1VwKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLndoaXRlKGAgICDigKIgJHtmb2xsb3dVcH1gKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZSgnXFxcXG7imqEgQWN0aW9uczonKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsubWFnZW50YShgICAgJHtpbnRlbnRNYXRjaC5hY3Rpb25zLmpvaW4oJywgJyl9YCkpO1xuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihjaGFsay5yZWQoJ+KdjCBFcnJvciB0ZXN0aW5nIGludGVudDonKSwgZXJyb3IpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBpbnRlcmFjdGl2ZVRlc3Qob3B0aW9uczogSW50ZW50T3B0aW9ucykge1xuICB0cnkge1xuICAgIGNvbnN0IHBlcnNvbmFTZXJ2aWNlID0gbmV3IFBlcnNvbmFTZXJ2aWNlKG51bGwpO1xuICAgIGNvbnN0IGludGVudFNlcnZpY2UgPSBuZXcgSW50ZW50U2VydmljZSgpO1xuICAgIGNvbnN0IGNvbXBhbnlJbmZvID0gY3JlYXRlQ29tcGFueUluZm8ob3B0aW9ucyk7XG4gICAgXG4gICAgY29uc3QgcGVyc29uYSA9IGF3YWl0IHBlcnNvbmFTZXJ2aWNlLmdldFBlcnNvbmEoXG4gICAgICBvcHRpb25zLnRlbmFudElkIHx8ICdkZXYtdGVzdCcsXG4gICAgICBvcHRpb25zLnBlcnNvbmEgfHwgJ2NhcmxvcycsXG4gICAgICBjb21wYW55SW5mb1xuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKGBcXFxcbvCfjq8gSW50ZXJhY3RpdmUgSW50ZW50IFRlc3RpbmdgKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgUGVyc29uYTogJHtwZXJzb25hLm5hbWV9ICgke29wdGlvbnMucGVyc29uYSB8fCAnY2FybG9zJ30pYCkpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYENvbXBhbnk6ICR7Y29tcGFueUluZm8ubmFtZX1gKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JheSgnVHlwZSBcImV4aXRcIiB0byBxdWl0XFxcXG4nKSk7XG5cbiAgICBpZiAoIXBlcnNvbmEuaW50ZW50Q2FwdHVyaW5nPy5lbmFibGVkKSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay55ZWxsb3coJ+KdjCBJbnRlbnQgY2FwdHVyaW5nIGlzIGRpc2FibGVkIGZvciB0aGlzIHBlcnNvbmEnKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGNvbnN0IHsgbWVzc2FnZSB9ID0gYXdhaXQgaW5xdWlyZXIucHJvbXB0KFtcbiAgICAgICAge1xuICAgICAgICAgIHR5cGU6ICdpbnB1dCcsXG4gICAgICAgICAgbmFtZTogJ21lc3NhZ2UnLFxuICAgICAgICAgIG1lc3NhZ2U6IGNoYWxrLmdyZWVuKCdUZXN0IG1lc3NhZ2U6JyksXG4gICAgICAgICAgdmFsaWRhdGU6IChpbnB1dDogc3RyaW5nKSA9PiBpbnB1dC50cmltKCkubGVuZ3RoID4gMCB8fCAnUGxlYXNlIGVudGVyIGEgbWVzc2FnZSdcbiAgICAgICAgfVxuICAgICAgXSk7XG5cbiAgICAgIGlmIChtZXNzYWdlLnRvTG93ZXJDYXNlKCkudHJpbSgpID09PSAnZXhpdCcpIHtcbiAgICAgICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZSgnXFxcXG7wn5GLIEdvb2RieWUhJykpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgY29uc3QgaW50ZW50TWF0Y2ggPSBhd2FpdCBpbnRlbnRTZXJ2aWNlLmRldGVjdEludGVudChcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgcGVyc29uYSxcbiAgICAgICAgY29tcGFueUluZm8sXG4gICAgICAgIHtcbiAgICAgICAgICB0ZW5hbnRJZDogb3B0aW9ucy50ZW5hbnRJZCB8fCAnZGV2LXRlc3QnLFxuICAgICAgICAgIHVzZXJJZDogJ3Rlc3QtdXNlcicsXG4gICAgICAgICAgc2Vzc2lvbklkOiAndGVzdC1zZXNzaW9uJyxcbiAgICAgICAgICBjaGFubmVsOiAnY2xpJ1xuICAgICAgICB9XG4gICAgICApO1xuXG4gICAgICBpZiAoIWludGVudE1hdGNoKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdygn4p2MIE5vIGludGVudCBkZXRlY3RlZFxcXFxuJykpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oYOKchSAke2ludGVudE1hdGNoLmludGVudC5uYW1lfSAoJHsoaW50ZW50TWF0Y2guY29uZmlkZW5jZSAqIDEwMCkudG9GaXhlZCgxKX0lKWApKTtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLndoaXRlKGDwn5KsICR7aW50ZW50TWF0Y2gucmVzcG9uc2V9YCkpO1xuICAgICAgXG4gICAgICBpZiAoaW50ZW50TWF0Y2guZm9sbG93VXAgJiYgaW50ZW50TWF0Y2guZm9sbG93VXAubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKGDwn5SEICR7aW50ZW50TWF0Y2guZm9sbG93VXAuam9pbignICcpfWApKTtcbiAgICAgIH1cbiAgICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICB9XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGNoYWxrLnJlZCgn4p2MIEVycm9yIGluIGludGVyYWN0aXZlIHRlc3Q6JyksIGVycm9yKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUludGVudHNDb21tYW5kKCk6IENvbW1hbmQge1xuICBjb25zdCBpbnRlbnRzQ21kID0gbmV3IENvbW1hbmQoJ2ludGVudHMnKTtcbiAgaW50ZW50c0NtZC5kZXNjcmlwdGlvbignTWFuYWdlIGFuZCB0ZXN0IGludGVudCBjYXB0dXJpbmcnKTtcblxuICAvLyBBZGQgZ2xvYmFsIG9wdGlvbnNcbiAgaW50ZW50c0NtZC5vcHRpb24oJy0tcGVyc29uYSA8cGVyc29uYT4nLCAnUGVyc29uYSB0byB1c2UgKGNhcmxvcywgcHJvZmVzc2lvbmFsLCBjYXN1YWwpJywgJ2NhcmxvcycpO1xuICBpbnRlbnRzQ21kLm9wdGlvbignLS10ZW5hbnQtaWQgPHRlbmFudElkPicsICdUZW5hbnQgSUQnLCAnZGV2LXRlc3QnKTtcbiAgaW50ZW50c0NtZC5vcHRpb24oJy0tY29tcGFueSA8Y29tcGFueT4nLCAnQ29tcGFueSBuYW1lJywgJ1BsYW5ldCBGaXRuZXNzJyk7XG4gIGludGVudHNDbWQub3B0aW9uKCctLWluZHVzdHJ5IDxpbmR1c3RyeT4nLCAnQ29tcGFueSBpbmR1c3RyeScsICdGaXRuZXNzICYgV2VsbG5lc3MnKTtcbiAgaW50ZW50c0NtZC5vcHRpb24oJy0tZGVzY3JpcHRpb24gPGRlc2NyaXB0aW9uPicsICdDb21wYW55IGRlc2NyaXB0aW9uJyk7XG4gIGludGVudHNDbWQub3B0aW9uKCctLXByb2R1Y3RzIDxwcm9kdWN0cz4nLCAnS2V5IHByb2R1Y3RzL3NlcnZpY2VzJyk7XG4gIGludGVudHNDbWQub3B0aW9uKCctLWJlbmVmaXRzIDxiZW5lZml0cz4nLCAnS2V5IGJlbmVmaXRzJyk7XG4gIGludGVudHNDbWQub3B0aW9uKCctLXRhcmdldCA8dGFyZ2V0PicsICdUYXJnZXQgY3VzdG9tZXJzJyk7XG4gIGludGVudHNDbWQub3B0aW9uKCctLWRpZmZlcmVudGlhdG9ycyA8ZGlmZmVyZW50aWF0b3JzPicsICdXaGF0IG1ha2VzIHRoZSBjb21wYW55IGRpZmZlcmVudCcpO1xuXG4gIC8vIExpc3QgaW50ZW50cyBjb21tYW5kXG4gIGludGVudHNDbWRcbiAgICAuY29tbWFuZCgnbGlzdCcpXG4gICAgLmRlc2NyaXB0aW9uKCdMaXN0IGFsbCBjb25maWd1cmVkIGludGVudHMgZm9yIGEgcGVyc29uYScpXG4gICAgLmFjdGlvbihhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBvcHRpb25zID0gaW50ZW50c0NtZC5vcHRzKCk7XG4gICAgICBhd2FpdCBsaXN0SW50ZW50cyhvcHRpb25zKTtcbiAgICB9KTtcblxuICAvLyBUZXN0IGludGVudCBjb21tYW5kXG4gIGludGVudHNDbWRcbiAgICAuY29tbWFuZCgndGVzdCA8bWVzc2FnZT4nKVxuICAgIC5kZXNjcmlwdGlvbignVGVzdCBpbnRlbnQgZGV0ZWN0aW9uIGZvciBhIHNwZWNpZmljIG1lc3NhZ2UnKVxuICAgIC5hY3Rpb24oYXN5bmMgKG1lc3NhZ2U6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IGludGVudHNDbWQub3B0cygpO1xuICAgICAgYXdhaXQgdGVzdEludGVudChtZXNzYWdlLCBvcHRpb25zKTtcbiAgICB9KTtcblxuICAvLyBJbnRlcmFjdGl2ZSB0ZXN0IGNvbW1hbmRcbiAgaW50ZW50c0NtZFxuICAgIC5jb21tYW5kKCdpbnRlcmFjdGl2ZScpXG4gICAgLmFsaWFzKCdpJylcbiAgICAuZGVzY3JpcHRpb24oJ0ludGVyYWN0aXZlIGludGVudCB0ZXN0aW5nJylcbiAgICAuYWN0aW9uKGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG9wdGlvbnMgPSBpbnRlbnRzQ21kLm9wdHMoKTtcbiAgICAgIGF3YWl0IGludGVyYWN0aXZlVGVzdChvcHRpb25zKTtcbiAgICB9KTtcblxuICByZXR1cm4gaW50ZW50c0NtZDtcbn1cblxuZXhwb3J0IGNvbnN0IGludGVudHNDb21tYW5kID0gY3JlYXRlSW50ZW50c0NvbW1hbmQ7Il19