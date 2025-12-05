"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestGoalsCommand = createTestGoalsCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
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
async function testGoalOrchestration(message, options) {
    try {
        console.log(chalk_1.default.blue(`\n🎯 Testing Goal Orchestration`));
        console.log(chalk_1.default.gray(`Message: "${message}"`));
        console.log(chalk_1.default.gray(`Persona: ${options.persona}`));
        console.log(chalk_1.default.gray(`Session: ${options.sessionId || 'test-session'}`));
        // Create services
        const personaService = new kx_langchain_agent_runtime_1.PersonaService(null);
        const goalOrchestrator = new kx_langchain_agent_runtime_1.GoalOrchestrator();
        const companyInfo = createCompanyInfo(options);
        // Load persona
        const persona = await personaService.getPersona('default', options.persona, companyInfo);
        if (!persona.goalConfiguration?.enabled) {
            console.log(chalk_1.default.yellow('❌ Goal configuration is not enabled for this persona'));
            return;
        }
        console.log(chalk_1.default.green(`✅ Goals enabled with ${persona.goalConfiguration.goals.length} goals configured`));
        // Run orchestration
        const result = await goalOrchestrator.orchestrateGoals(message, options.sessionId || 'test-session', options.email.toLowerCase(), options.tenantId, persona.goalConfiguration // Type compatibility - CLI uses different goal schema
        );
        // Display results
        console.log(chalk_1.default.cyan('\n📊 ORCHESTRATION RESULTS:'));
        // Goal State Summary
        console.log(chalk_1.default.magenta('\n🎯 Goal Progress:'));
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
            console.log(chalk_1.default.green('\n📧 Extracted Information:'));
            Object.entries(result.extractedInfo).forEach(([key, value]) => {
                console.log(`   ${key}: ${JSON.stringify(value, null, 2)}`);
            });
        }
        // Goal Recommendations
        if (result.recommendations.length > 0) {
            console.log(chalk_1.default.yellow('\n🎯 Goal Recommendations:'));
            result.recommendations.forEach(rec => {
                const status = rec.shouldPursue ? '✅ PURSUE' : '⏸️  WAIT';
                console.log(`   ${status} ${rec.goalId} (priority: ${rec.priority})`);
                console.log(`      Approach: ${rec.approach}`);
                console.log(`      Reason: ${rec.reason}`);
                console.log(`      Message: "${rec.message}"`);
                console.log('');
            });
        }
        else {
            console.log(chalk_1.default.gray('\n🎯 No goal recommendations at this time'));
        }
        // State Updates
        if (result.stateUpdates.newlyCompleted.length > 0) {
            console.log(chalk_1.default.green('\n✅ Newly Completed Goals:'));
            result.stateUpdates.newlyCompleted.forEach(goalId => {
                console.log(`   • ${goalId}`);
            });
        }
        if (result.stateUpdates.newlyActivated.length > 0) {
            console.log(chalk_1.default.blue('\n🔄 Newly Activated Goals:'));
            result.stateUpdates.newlyActivated.forEach(goalId => {
                console.log(`   • ${goalId}`);
            });
        }
        if (result.stateUpdates.declined.length > 0) {
            console.log(chalk_1.default.red('\n❌ Declined Goals:'));
            result.stateUpdates.declined.forEach(goalId => {
                console.log(`   • ${goalId}`);
            });
        }
        // Triggered Intents
        if (result.triggeredIntents.length > 0) {
            console.log(chalk_1.default.magenta('\n🚀 Triggered Intents:'));
            result.triggeredIntents.forEach(intentId => {
                console.log(`   • ${intentId}`);
            });
        }
        // Goal State Summary
        console.log(chalk_1.default.cyan('\n📋 Current Goal State:'));
        const stateSummary = goalOrchestrator.getGoalState(options.sessionId || 'test-session', options.email.toLowerCase(), options.tenantId);
        console.log(JSON.stringify(stateSummary, null, 2));
    }
    catch (error) {
        console.error(chalk_1.default.red('\n❌ Error testing goal orchestration:'), error);
    }
}
function createTestGoalsCommand() {
    const cmd = new commander_1.Command('test-goals')
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
        .action(async (message, options) => {
        await testGoalOrchestration(message, options);
    });
    return cmd;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1nb2Fscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jb21tYW5kcy90ZXN0LWdvYWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBb0tBLHdEQXFCQztBQXpMRCx5Q0FBb0M7QUFDcEMsa0RBQTBCO0FBQzFCLHVGQUE0RztBQWlCNUcsU0FBUyxpQkFBaUIsQ0FBQyxPQUF5QjtJQUNsRCxPQUFPO1FBQ0wsUUFBUSxFQUFFLGFBQWE7UUFDdkIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPLElBQUksZ0JBQWdCO1FBQ3pDLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxJQUFJLG9CQUFvQjtRQUNsRCxXQUFXLEVBQUUsT0FBTyxDQUFDLFdBQVcsSUFBSSx1REFBdUQ7UUFDM0YsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRLElBQUksbURBQW1EO1FBQ2pGLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxJQUFJLHFFQUFxRTtRQUNuRyxlQUFlLEVBQUUsT0FBTyxDQUFDLE1BQU0sSUFBSSx5RkFBeUY7UUFDNUgsZUFBZSxFQUFFLE9BQU8sQ0FBQyxlQUFlLElBQUksaUVBQWlFO1FBQzdHLGVBQWUsRUFBRTtZQUNmLE9BQU8sRUFBRSxJQUFJO1lBQ2IsT0FBTyxFQUFFLEVBQUU7WUFDWCxjQUFjLEVBQUU7Z0JBQ2QsRUFBRSxFQUFFLFVBQVU7Z0JBQ2QsSUFBSSxFQUFFLGlCQUFpQjtnQkFDdkIsV0FBVyxFQUFFLHNEQUFzRDtnQkFDbkUsUUFBUSxFQUFFO29CQUNSLElBQUksRUFBRSxnQkFBZ0I7b0JBQ3RCLFFBQVEsRUFBRSw2RUFBNkU7aUJBQ3hGO2dCQUNELE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDO2FBQ25DO1lBQ0QsVUFBVSxFQUFFO2dCQUNWLFNBQVMsRUFBRSxHQUFHO2dCQUNkLHNCQUFzQixFQUFFLG9CQUFvQjthQUM3QztTQUNGO1FBQ0QsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFO1FBQ3JCLFNB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R0FBRyxJQUFJLG1CQUFPLENBQUMsWUFBWSxDQUFDO1NBQ2xDLFdBQVcsQ0FBQyxnQ0FBZ0MsQ0FBQztTQUM3QyxRQUFRLENBQUMsV0FBVyxFQUFFLGlCQUFpQixDQUFDO1NBQ3hDLE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxXQUFXLEVBQUUsVUFBVSxDQUFDO1NBQ3hELE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsaUJBQWlCLENBQUM7U0FDMUQsTUFBTSxDQUFDLHFCQUFxQixFQUFFLGdCQUFnQixFQUFFLFFBQVEsQ0FBQztTQUN6RCxNQUFNLENBQUMseUJBQXlCLEVBQUUsWUFBWSxFQUFFLGNBQWMsQ0FBQztTQUMvRCxNQUFNLENBQUMscUJBQXFCLEVBQUUsY0FBYyxFQUFFLGdCQUFnQixDQUFDO1NBQy9ELE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsQ0FBQztTQUN6RSxNQUFNLENBQUMsNkJBQTZCLEVBQUUscUJBQXFCLENBQUM7U0FDNUQsTUFBTSxDQUFDLHVCQUF1QixFQUFFLDJCQUEyQixDQUFDO1NBQzVELE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSw4QkFBOEIsQ0FBQztTQUMvRCxNQUFNLENBQUMsbUJBQW1CLEVBQUUsa0JBQWtCLENBQUM7U0FDL0MsTUFBTSxDQUFDLHFDQUFxQyxFQUFFLHFCQUFxQixDQUFDO1NBQ3BFLE1BQU0sQ0FBQyxTQUFTLEVBQUUscUJBQXFCLENBQUM7U0FDeEMsTUFBTSxDQUFDLEtBQUssRUFBRSxPQUFlLEVBQUUsT0FBeUIsRUFBRSxFQUFFO1FBQzNELE1BQU0scUJBQXFCLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2hELENBQUMsQ0FBQyxDQUFDO0lBRUwsT0FBTyxHQUFHLENBQUM7QUFDYixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29tbWFuZCB9IGZyb20gJ2NvbW1hbmRlcic7XG5pbXBvcnQgY2hhbGsgZnJvbSAnY2hhbGsnO1xuaW1wb3J0IHsgR29hbE9yY2hlc3RyYXRvciwgUGVyc29uYVNlcnZpY2UsIHR5cGUgQ29tcGFueUluZm8gfSBmcm9tICdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZSc7XG5cbmludGVyZmFjZSBUZXN0R29hbHNPcHRpb25zIHtcbiAgdGVuYW50SWQ6IHN0cmluZztcbiAgZW1haWw6IHN0cmluZztcbiAgcGVyc29uYTogc3RyaW5nO1xuICBzZXNzaW9uSWQ/OiBzdHJpbmc7XG4gIGNvbXBhbnk/OiBzdHJpbmc7XG4gIGluZHVzdHJ5Pzogc3RyaW5nO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZztcbiAgcHJvZHVjdHM/OiBzdHJpbmc7XG4gIGJlbmVmaXRzPzogc3RyaW5nO1xuICB0YXJnZXQ/OiBzdHJpbmc7XG4gIGRpZmZlcmVudGlhdG9ycz86IHN0cmluZztcbiAgZGVidWc/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDb21wYW55SW5mbyhvcHRpb25zOiBUZXN0R29hbHNPcHRpb25zKTogQ29tcGFueUluZm8ge1xuICByZXR1cm4ge1xuICAgIHRlbmFudElkOiAndGVzdC10ZW5hbnQnLFxuICAgIG5hbWU6IG9wdGlvbnMuY29tcGFueSB8fCAnUGxhbmV0IEZpdG5lc3MnLFxuICAgIGluZHVzdHJ5OiBvcHRpb25zLmluZHVzdHJ5IHx8ICdGaXRuZXNzICYgV2VsbG5lc3MnLFxuICAgIGRlc2NyaXB0aW9uOiBvcHRpb25zLmRlc2NyaXB0aW9uIHx8ICdBbWVyaWNhXFwncyBtb3N0IHBvcHVsYXIgZ3ltIHdpdGggb3ZlciAyLDQwMCBsb2NhdGlvbnMnLFxuICAgIHByb2R1Y3RzOiBvcHRpb25zLnByb2R1Y3RzIHx8ICdHeW0gbWVtYmVyc2hpcHMsIGZpdG5lc3MgZXF1aXBtZW50LCBncm91cCBjbGFzc2VzJyxcbiAgICBiZW5lZml0czogb3B0aW9ucy5iZW5lZml0cyB8fCAnQWZmb3JkYWJsZSBwcmljaW5nLCBqdWRnbWVudC1mcmVlIGVudmlyb25tZW50LCBjb252ZW5pZW50IGxvY2F0aW9ucycsXG4gICAgdGFyZ2V0Q3VzdG9tZXJzOiBvcHRpb25zLnRhcmdldCB8fCAnUGVvcGxlIG9mIGFsbCBmaXRuZXNzIGxldmVscyBsb29raW5nIGZvciBhbiBhZmZvcmRhYmxlLCBub24taW50aW1pZGF0aW5nIGd5bSBleHBlcmllbmNlJyxcbiAgICBkaWZmZXJlbnRpYXRvcnM6IG9wdGlvbnMuZGlmZmVyZW50aWF0b3JzIHx8ICdMb3cgY29zdCwgbm8tanVkZ21lbnQgYXRtb3NwaGVyZSwgYmVnaW5uZXItZnJpZW5kbHkgZW52aXJvbm1lbnQnLFxuICAgIGludGVudENhcHR1cmluZzoge1xuICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgIGludGVudHM6IFtdLFxuICAgICAgZmFsbGJhY2tJbnRlbnQ6IHtcbiAgICAgICAgaWQ6ICdmYWxsYmFjaycsXG4gICAgICAgIG5hbWU6ICdGYWxsYmFjayBJbnRlbnQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0RlZmF1bHQgcmVzcG9uc2Ugd2hlbiBubyBzcGVjaWZpYyBpbnRlbnQgaXMgZGV0ZWN0ZWQnLFxuICAgICAgICByZXNwb25zZToge1xuICAgICAgICAgIHR5cGU6ICdjb252ZXJzYXRpb25hbCcsXG4gICAgICAgICAgdGVtcGxhdGU6ICdJIHVuZGVyc3RhbmQgeW91XFwncmUgaW50ZXJlc3RlZCBpbiBsZWFybmluZyBtb3JlLiBIb3cgY2FuIEkgaGVscCB5b3UgdG9kYXk/J1xuICAgICAgICB9LFxuICAgICAgICBhY3Rpb25zOiBbJ2NvbnRpbnVlX2NvbnZlcnNhdGlvbiddXG4gICAgICB9LFxuICAgICAgY29uZmlkZW5jZToge1xuICAgICAgICB0aHJlc2hvbGQ6IDAuNyxcbiAgICAgICAgbXVsdGlwbGVJbnRlbnRIYW5kbGluZzogJ2hpZ2hlc3RfY29uZmlkZW5jZSdcbiAgICAgIH1cbiAgICB9LFxuICAgIGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcbiAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKClcbiAgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdGVzdEdvYWxPcmNoZXN0cmF0aW9uKG1lc3NhZ2U6IHN0cmluZywgb3B0aW9uczogVGVzdEdvYWxzT3B0aW9ucykge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmJsdWUoYFxcbvCfjq8gVGVzdGluZyBHb2FsIE9yY2hlc3RyYXRpb25gKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgTWVzc2FnZTogXCIke21lc3NhZ2V9XCJgKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgUGVyc29uYTogJHtvcHRpb25zLnBlcnNvbmF9YCkpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFNlc3Npb246ICR7b3B0aW9ucy5zZXNzaW9uSWQgfHwgJ3Rlc3Qtc2Vzc2lvbid9YCkpO1xuXG4gICAgLy8gQ3JlYXRlIHNlcnZpY2VzXG4gICAgY29uc3QgcGVyc29uYVNlcnZpY2UgPSBuZXcgUGVyc29uYVNlcnZpY2UobnVsbCk7XG4gICAgY29uc3QgZ29hbE9yY2hlc3RyYXRvciA9IG5ldyBHb2FsT3JjaGVzdHJhdG9yKCk7XG4gICAgY29uc3QgY29tcGFueUluZm8gPSBjcmVhdGVDb21wYW55SW5mbyhvcHRpb25zKTtcblxuICAgIC8vIExvYWQgcGVyc29uYVxuICAgIGNvbnN0IHBlcnNvbmEgPSBhd2FpdCBwZXJzb25hU2VydmljZS5nZXRQZXJzb25hKCdkZWZhdWx0Jywgb3B0aW9ucy5wZXJzb25hLCBjb21wYW55SW5mbyk7XG4gICAgXG4gICAgaWYgKCFwZXJzb25hLmdvYWxDb25maWd1cmF0aW9uPy5lbmFibGVkKSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay55ZWxsb3coJ+KdjCBHb2FsIGNvbmZpZ3VyYXRpb24gaXMgbm90IGVuYWJsZWQgZm9yIHRoaXMgcGVyc29uYScpKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmVlbihg4pyFIEdvYWxzIGVuYWJsZWQgd2l0aCAke3BlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb24uZ29hbHMubGVuZ3RofSBnb2FscyBjb25maWd1cmVkYCkpO1xuXG4gICAgLy8gUnVuIG9yY2hlc3RyYXRpb25cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnb2FsT3JjaGVzdHJhdG9yLm9yY2hlc3RyYXRlR29hbHMoXG4gICAgICBtZXNzYWdlLFxuICAgICAgb3B0aW9ucy5zZXNzaW9uSWQgfHwgJ3Rlc3Qtc2Vzc2lvbicsXG4gICAgICBvcHRpb25zLmVtYWlsLnRvTG93ZXJDYXNlKCksXG4gICAgICBvcHRpb25zLnRlbmFudElkLFxuICAgICAgcGVyc29uYS5nb2FsQ29uZmlndXJhdGlvbiBhcyBhbnkgLy8gVHlwZSBjb21wYXRpYmlsaXR5IC0gQ0xJIHVzZXMgZGlmZmVyZW50IGdvYWwgc2NoZW1hXG4gICAgKTtcblxuICAgIC8vIERpc3BsYXkgcmVzdWx0c1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmN5YW4oJ1xcbvCfk4ogT1JDSEVTVFJBVElPTiBSRVNVTFRTOicpKTtcbiAgICBcbiAgICAvLyBHb2FsIFN0YXRlIFN1bW1hcnlcbiAgICBjb25zb2xlLmxvZyhjaGFsay5tYWdlbnRhKCdcXG7wn46vIEdvYWwgUHJvZ3Jlc3M6JykpO1xuICAgIGNvbnNvbGUubG9nKGAgICBBY3RpdmUgR29hbHM6ICR7cmVzdWx0LmFjdGl2ZUdvYWxzLmxlbmd0aH1gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgQ29tcGxldGVkIEdvYWxzOiAke3Jlc3VsdC5jb21wbGV0ZWRHb2Fscy5sZW5ndGh9YCk7XG4gICAgaWYgKHJlc3VsdC5zdGF0ZVVwZGF0ZXMubmV3bHlDb21wbGV0ZWQubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coYCAgIE5ld2x5IENvbXBsZXRlZDogJHtyZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkLmpvaW4oJywgJyl9YCk7XG4gICAgfVxuICAgIGlmIChyZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5QWN0aXZhdGVkLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBOZXdseSBBY3RpdmF0ZWQ6ICR7cmVzdWx0LnN0YXRlVXBkYXRlcy5uZXdseUFjdGl2YXRlZC5qb2luKCcsICcpfWApO1xuICAgIH1cblxuICAgIC8vIEV4dHJhY3RlZCBJbmZvcm1hdGlvblxuICAgIGlmIChPYmplY3Qua2V5cyhyZXN1bHQuZXh0cmFjdGVkSW5mbykubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oJ1xcbvCfk6cgRXh0cmFjdGVkIEluZm9ybWF0aW9uOicpKTtcbiAgICAgIE9iamVjdC5lbnRyaWVzKHJlc3VsdC5leHRyYWN0ZWRJbmZvKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgICR7a2V5fTogJHtKU09OLnN0cmluZ2lmeSh2YWx1ZSwgbnVsbCwgMil9YCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHb2FsIFJlY29tbWVuZGF0aW9uc1xuICAgIGlmIChyZXN1bHQucmVjb21tZW5kYXRpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdygnXFxu8J+OryBHb2FsIFJlY29tbWVuZGF0aW9uczonKSk7XG4gICAgICByZXN1bHQucmVjb21tZW5kYXRpb25zLmZvckVhY2gocmVjID0+IHtcbiAgICAgICAgY29uc3Qgc3RhdHVzID0gcmVjLnNob3VsZFB1cnN1ZSA/ICfinIUgUFVSU1VFJyA6ICfij7jvuI8gIFdBSVQnO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAgJHtzdGF0dXN9ICR7cmVjLmdvYWxJZH0gKHByaW9yaXR5OiAke3JlYy5wcmlvcml0eX0pYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAgICBBcHByb2FjaDogJHtyZWMuYXBwcm9hY2h9YCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAgICBSZWFzb246ICR7cmVjLnJlYXNvbn1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgICAgIE1lc3NhZ2U6IFwiJHtyZWMubWVzc2FnZX1cImApO1xuICAgICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JheSgnXFxu8J+OryBObyBnb2FsIHJlY29tbWVuZGF0aW9ucyBhdCB0aGlzIHRpbWUnKSk7XG4gICAgfVxuXG4gICAgLy8gU3RhdGUgVXBkYXRlc1xuICAgIGlmIChyZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCdcXG7inIUgTmV3bHkgQ29tcGxldGVkIEdvYWxzOicpKTtcbiAgICAgIHJlc3VsdC5zdGF0ZVVwZGF0ZXMubmV3bHlDb21wbGV0ZWQuZm9yRWFjaChnb2FsSWQgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg4oCiICR7Z29hbElkfWApO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHJlc3VsdC5zdGF0ZVVwZGF0ZXMubmV3bHlBY3RpdmF0ZWQubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZSgnXFxu8J+UhCBOZXdseSBBY3RpdmF0ZWQgR29hbHM6JykpO1xuICAgICAgcmVzdWx0LnN0YXRlVXBkYXRlcy5uZXdseUFjdGl2YXRlZC5mb3JFYWNoKGdvYWxJZCA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDigKIgJHtnb2FsSWR9YCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAocmVzdWx0LnN0YXRlVXBkYXRlcy5kZWNsaW5lZC5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5yZWQoJ1xcbuKdjCBEZWNsaW5lZCBHb2FsczonKSk7XG4gICAgICByZXN1bHQuc3RhdGVVcGRhdGVzLmRlY2xpbmVkLmZvckVhY2goZ29hbElkID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIOKAoiAke2dvYWxJZH1gKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFRyaWdnZXJlZCBJbnRlbnRzXG4gICAgaWYgKHJlc3VsdC50cmlnZ2VyZWRJbnRlbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLm1hZ2VudGEoJ1xcbvCfmoAgVHJpZ2dlcmVkIEludGVudHM6JykpO1xuICAgICAgcmVzdWx0LnRyaWdnZXJlZEludGVudHMuZm9yRWFjaChpbnRlbnRJZCA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDigKIgJHtpbnRlbnRJZH1gKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEdvYWwgU3RhdGUgU3VtbWFyeVxuICAgIGNvbnNvbGUubG9nKGNoYWxrLmN5YW4oJ1xcbvCfk4sgQ3VycmVudCBHb2FsIFN0YXRlOicpKTtcbiAgICBjb25zdCBzdGF0ZVN1bW1hcnkgPSBnb2FsT3JjaGVzdHJhdG9yLmdldEdvYWxTdGF0ZShcbiAgICAgIG9wdGlvbnMuc2Vzc2lvbklkIHx8ICd0ZXN0LXNlc3Npb24nLFxuICAgICAgb3B0aW9ucy5lbWFpbC50b0xvd2VyQ2FzZSgpLFxuICAgICAgb3B0aW9ucy50ZW5hbnRJZFxuICAgICk7XG4gICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoc3RhdGVTdW1tYXJ5LCBudWxsLCAyKSk7XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGNoYWxrLnJlZCgnXFxu4p2MIEVycm9yIHRlc3RpbmcgZ29hbCBvcmNoZXN0cmF0aW9uOicpLCBlcnJvcik7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRlc3RHb2Fsc0NvbW1hbmQoKTogQ29tbWFuZCB7XG4gIGNvbnN0IGNtZCA9IG5ldyBDb21tYW5kKCd0ZXN0LWdvYWxzJylcbiAgICAuZGVzY3JpcHRpb24oJ1Rlc3QgZ29hbCBvcmNoZXN0cmF0aW9uIHN5c3RlbScpXG4gICAgLmFyZ3VtZW50KCc8bWVzc2FnZT4nLCAnTWVzc2FnZSB0byB0ZXN0JylcbiAgICAub3B0aW9uKCctLXRlbmFudElkIDx0ZW5hbnRJZD4nLCAnVGVuYW50IElEJywgJ2Rldi10ZXN0JylcbiAgICAub3B0aW9uKCctLWVtYWlsIDxlbWFpbD4nLCAnVXNlciBlbWFpbCcsICdkZXZAZXhhbXBsZS5jb20nKVxuICAgIC5vcHRpb24oJy0tcGVyc29uYSA8cGVyc29uYT4nLCAnUGVyc29uYSB0byB1c2UnLCAnY2FybG9zJylcbiAgICAub3B0aW9uKCctLXNlc3Npb25JZCA8c2Vzc2lvbklkPicsICdTZXNzaW9uIElEJywgJ3Rlc3Qtc2Vzc2lvbicpXG4gICAgLm9wdGlvbignLS1jb21wYW55IDxjb21wYW55PicsICdDb21wYW55IG5hbWUnLCAnUGxhbmV0IEZpdG5lc3MnKVxuICAgIC5vcHRpb24oJy0taW5kdXN0cnkgPGluZHVzdHJ5PicsICdDb21wYW55IGluZHVzdHJ5JywgJ0ZpdG5lc3MgJiBXZWxsbmVzcycpXG4gICAgLm9wdGlvbignLS1kZXNjcmlwdGlvbiA8ZGVzY3JpcHRpb24+JywgJ0NvbXBhbnkgZGVzY3JpcHRpb24nKVxuICAgIC5vcHRpb24oJy0tcHJvZHVjdHMgPHByb2R1Y3RzPicsICdDb21wYW55IHByb2R1Y3RzL3NlcnZpY2VzJylcbiAgICAub3B0aW9uKCctLWJlbmVmaXRzIDxiZW5lZml0cz4nLCAnQ29tcGFueSBiZW5lZml0cy92YWx1ZSBwcm9wcycpXG4gICAgLm9wdGlvbignLS10YXJnZXQgPHRhcmdldD4nLCAnVGFyZ2V0IGN1c3RvbWVycycpXG4gICAgLm9wdGlvbignLS1kaWZmZXJlbnRpYXRvcnMgPGRpZmZlcmVudGlhdG9ycz4nLCAnS2V5IGRpZmZlcmVudGlhdG9ycycpXG4gICAgLm9wdGlvbignLS1kZWJ1ZycsICdFbmFibGUgZGVidWcgb3V0cHV0JylcbiAgICAuYWN0aW9uKGFzeW5jIChtZXNzYWdlOiBzdHJpbmcsIG9wdGlvbnM6IFRlc3RHb2Fsc09wdGlvbnMpID0+IHtcbiAgICAgIGF3YWl0IHRlc3RHb2FsT3JjaGVzdHJhdGlvbihtZXNzYWdlLCBvcHRpb25zKTtcbiAgICB9KTtcblxuICByZXR1cm4gY21kO1xufVxuIl19