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
        const result = await goalOrchestrator.orchestrateGoals(message, options.sessionId || 'test-session', options.email.toLowerCase(), options.tenantId, persona.goalConfiguration);
        // Display results
        console.log(chalk_1.default.cyan('\n📊 ORCHESTRATION RESULTS:'));
        // Interest Analysis
        console.log(chalk_1.default.magenta('\n🧠 Interest Analysis:'));
        console.log(`   Interest Level: ${result.interestAnalysis.interestLevel}`);
        console.log(`   Urgency Level: ${result.interestAnalysis.urgencyLevel}`);
        console.log(`   Confidence: ${(result.interestAnalysis.confidence * 100).toFixed(1)}%`);
        if (result.interestAnalysis.indicators.positive.length > 0) {
            console.log(`   Positive Indicators: ${result.interestAnalysis.indicators.positive.join(', ')}`);
        }
        if (result.interestAnalysis.indicators.negative.length > 0) {
            console.log(`   Negative Indicators: ${result.interestAnalysis.indicators.negative.join(', ')}`);
        }
        if (result.interestAnalysis.indicators.urgency.length > 0) {
            console.log(`   Urgency Indicators: ${result.interestAnalysis.indicators.urgency.join(', ')}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1nb2Fscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jb21tYW5kcy90ZXN0LWdvYWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBeUtBLHdEQXFCQztBQTlMRCx5Q0FBb0M7QUFDcEMsa0RBQTBCO0FBQzFCLHVGQUE0RztBQWlCNUcsU0FBUyxpQkFBaUIsQ0FBQyxPQUF5QjtJQUNsRCxPQUFPO1FBQ0wsUUFBUSxFQUFFLGFBQWE7UUFDdkIsSUFBSSxFQUFFLE9BQU8sQ0FBQyxPQUFPLElBQUksZ0JBQWdCO1FBQ3pDLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxJQUFJLG9CQUFvQjtRQUNsRCxXQUFXLEVBQUUsT0FBTyxDQUFDLFdBQVcsSUFBSSx1REFBdUQ7UUFDM0YsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRLElBQUksbURBQW1EO1FBQ2pGLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxJQUFJLHFFQUFxRTtRQUNuRyxlQUFlLEVBQUUsT0FBTyxDQUFDLE1BQU0sSUFBSSx5RkFBeUY7UUFDNUgsZUFBZSxFQUFFLE9BQU8sQ0FBQyxlQUFlLElBQUksaUVBQWlFO1FBQzdHLGVBQWUsRUFBRTtZQUNmLE9BQU8sRUFBRSxJQUFJO1lBQ2IsT0FBTyxFQUFFLEVBQUU7WUFDWCxjQUFjLEVBQUU7Z0JBQ2QsRUFBRSxFQUFFLFVBQVU7Z0JBQ2QsSUFBSSxFQUFFLGlCQUFpQjtnQkFDdkIsV0FBVyxFQUFFLHNEQUFzRDtnQkFDbkUsUUFBUSxFQUFFO29CQUNSLElBQUksRUFBRSxnQkFBZ0I7b0JBQ3RCLFFBQVEsRUFBRSw2RUFBNkU7aUJBQ3hGO2dCQUNELE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDO2FBQ25DO1lBQ0QsVUFBVSxFQUFFO2dCQUNWLFNBQVMsRUFBRSxHQUFHO2dCQUNkLHNCQUFzQixFQUFFLG9CQUFvQjthQUM3QztTQUNGO1FBQ0QsU0FBUyxFQUFFLElBQUksSUFBSSxFQUFFO1FBQ3JCLFNB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LGtCQUFrQixDQUFDO1NBQy9DLE1BQU0sQ0FBQyxxQ0FBcUMsRUFBRSxxQkFBcUIsQ0FBQztTQUNwRSxNQUFNLENBQUMsU0FBUyxFQUFFLHFCQUFxQixDQUFDO1NBQ3hDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsT0FBZSxFQUFFLE9BQXlCLEVBQUUsRUFBRTtRQUMzRCxNQUFNLHFCQUFxQixDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNoRCxDQUFDLENBQUMsQ0FBQztJQUVMLE9BQU8sR0FBRyxDQUFDO0FBQ2IsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbW1hbmQgfSBmcm9tICdjb21tYW5kZXInO1xuaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCB7IEdvYWxPcmNoZXN0cmF0b3IsIFBlcnNvbmFTZXJ2aWNlLCB0eXBlIENvbXBhbnlJbmZvIH0gZnJvbSAnQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUnO1xuXG5pbnRlcmZhY2UgVGVzdEdvYWxzT3B0aW9ucyB7XG4gIHRlbmFudElkOiBzdHJpbmc7XG4gIGVtYWlsOiBzdHJpbmc7XG4gIHBlcnNvbmE6IHN0cmluZztcbiAgc2Vzc2lvbklkPzogc3RyaW5nO1xuICBjb21wYW55Pzogc3RyaW5nO1xuICBpbmR1c3RyeT86IHN0cmluZztcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG4gIHByb2R1Y3RzPzogc3RyaW5nO1xuICBiZW5lZml0cz86IHN0cmluZztcbiAgdGFyZ2V0Pzogc3RyaW5nO1xuICBkaWZmZXJlbnRpYXRvcnM/OiBzdHJpbmc7XG4gIGRlYnVnPzogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQ29tcGFueUluZm8ob3B0aW9uczogVGVzdEdvYWxzT3B0aW9ucyk6IENvbXBhbnlJbmZvIHtcbiAgcmV0dXJuIHtcbiAgICB0ZW5hbnRJZDogJ3Rlc3QtdGVuYW50JyxcbiAgICBuYW1lOiBvcHRpb25zLmNvbXBhbnkgfHwgJ1BsYW5ldCBGaXRuZXNzJyxcbiAgICBpbmR1c3RyeTogb3B0aW9ucy5pbmR1c3RyeSB8fCAnRml0bmVzcyAmIFdlbGxuZXNzJyxcbiAgICBkZXNjcmlwdGlvbjogb3B0aW9ucy5kZXNjcmlwdGlvbiB8fCAnQW1lcmljYVxcJ3MgbW9zdCBwb3B1bGFyIGd5bSB3aXRoIG92ZXIgMiw0MDAgbG9jYXRpb25zJyxcbiAgICBwcm9kdWN0czogb3B0aW9ucy5wcm9kdWN0cyB8fCAnR3ltIG1lbWJlcnNoaXBzLCBmaXRuZXNzIGVxdWlwbWVudCwgZ3JvdXAgY2xhc3NlcycsXG4gICAgYmVuZWZpdHM6IG9wdGlvbnMuYmVuZWZpdHMgfHwgJ0FmZm9yZGFibGUgcHJpY2luZywganVkZ21lbnQtZnJlZSBlbnZpcm9ubWVudCwgY29udmVuaWVudCBsb2NhdGlvbnMnLFxuICAgIHRhcmdldEN1c3RvbWVyczogb3B0aW9ucy50YXJnZXQgfHwgJ1Blb3BsZSBvZiBhbGwgZml0bmVzcyBsZXZlbHMgbG9va2luZyBmb3IgYW4gYWZmb3JkYWJsZSwgbm9uLWludGltaWRhdGluZyBneW0gZXhwZXJpZW5jZScsXG4gICAgZGlmZmVyZW50aWF0b3JzOiBvcHRpb25zLmRpZmZlcmVudGlhdG9ycyB8fCAnTG93IGNvc3QsIG5vLWp1ZGdtZW50IGF0bW9zcGhlcmUsIGJlZ2lubmVyLWZyaWVuZGx5IGVudmlyb25tZW50JyxcbiAgICBpbnRlbnRDYXB0dXJpbmc6IHtcbiAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICBpbnRlbnRzOiBbXSxcbiAgICAgIGZhbGxiYWNrSW50ZW50OiB7XG4gICAgICAgIGlkOiAnZmFsbGJhY2snLFxuICAgICAgICBuYW1lOiAnRmFsbGJhY2sgSW50ZW50JyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdEZWZhdWx0IHJlc3BvbnNlIHdoZW4gbm8gc3BlY2lmaWMgaW50ZW50IGlzIGRldGVjdGVkJyxcbiAgICAgICAgcmVzcG9uc2U6IHtcbiAgICAgICAgICB0eXBlOiAnY29udmVyc2F0aW9uYWwnLFxuICAgICAgICAgIHRlbXBsYXRlOiAnSSB1bmRlcnN0YW5kIHlvdVxcJ3JlIGludGVyZXN0ZWQgaW4gbGVhcm5pbmcgbW9yZS4gSG93IGNhbiBJIGhlbHAgeW91IHRvZGF5PydcbiAgICAgICAgfSxcbiAgICAgICAgYWN0aW9uczogWydjb250aW51ZV9jb252ZXJzYXRpb24nXVxuICAgICAgfSxcbiAgICAgIGNvbmZpZGVuY2U6IHtcbiAgICAgICAgdGhyZXNob2xkOiAwLjcsXG4gICAgICAgIG11bHRpcGxlSW50ZW50SGFuZGxpbmc6ICdoaWdoZXN0X2NvbmZpZGVuY2UnXG4gICAgICB9XG4gICAgfSxcbiAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCksXG4gICAgdXBkYXRlZEF0OiBuZXcgRGF0ZSgpXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRlc3RHb2FsT3JjaGVzdHJhdGlvbihtZXNzYWdlOiBzdHJpbmcsIG9wdGlvbnM6IFRlc3RHb2Fsc09wdGlvbnMpIHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKGBcXG7wn46vIFRlc3RpbmcgR29hbCBPcmNoZXN0cmF0aW9uYCkpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYE1lc3NhZ2U6IFwiJHttZXNzYWdlfVwiYCkpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFBlcnNvbmE6ICR7b3B0aW9ucy5wZXJzb25hfWApKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGBTZXNzaW9uOiAke29wdGlvbnMuc2Vzc2lvbklkIHx8ICd0ZXN0LXNlc3Npb24nfWApKTtcblxuICAgIC8vIENyZWF0ZSBzZXJ2aWNlc1xuICAgIGNvbnN0IHBlcnNvbmFTZXJ2aWNlID0gbmV3IFBlcnNvbmFTZXJ2aWNlKG51bGwpO1xuICAgIGNvbnN0IGdvYWxPcmNoZXN0cmF0b3IgPSBuZXcgR29hbE9yY2hlc3RyYXRvcigpO1xuICAgIGNvbnN0IGNvbXBhbnlJbmZvID0gY3JlYXRlQ29tcGFueUluZm8ob3B0aW9ucyk7XG5cbiAgICAvLyBMb2FkIHBlcnNvbmFcbiAgICBjb25zdCBwZXJzb25hID0gYXdhaXQgcGVyc29uYVNlcnZpY2UuZ2V0UGVyc29uYSgnZGVmYXVsdCcsIG9wdGlvbnMucGVyc29uYSwgY29tcGFueUluZm8pO1xuICAgIFxuICAgIGlmICghcGVyc29uYS5nb2FsQ29uZmlndXJhdGlvbj8uZW5hYmxlZCkge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsueWVsbG93KCfinYwgR29hbCBjb25maWd1cmF0aW9uIGlzIG5vdCBlbmFibGVkIGZvciB0aGlzIHBlcnNvbmEnKSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oYOKchSBHb2FscyBlbmFibGVkIHdpdGggJHtwZXJzb25hLmdvYWxDb25maWd1cmF0aW9uLmdvYWxzLmxlbmd0aH0gZ29hbHMgY29uZmlndXJlZGApKTtcblxuICAgIC8vIFJ1biBvcmNoZXN0cmF0aW9uXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ29hbE9yY2hlc3RyYXRvci5vcmNoZXN0cmF0ZUdvYWxzKFxuICAgICAgbWVzc2FnZSxcbiAgICAgIG9wdGlvbnMuc2Vzc2lvbklkIHx8ICd0ZXN0LXNlc3Npb24nLFxuICAgICAgb3B0aW9ucy5lbWFpbC50b0xvd2VyQ2FzZSgpLFxuICAgICAgb3B0aW9ucy50ZW5hbnRJZCxcbiAgICAgIHBlcnNvbmEuZ29hbENvbmZpZ3VyYXRpb25cbiAgICApO1xuXG4gICAgLy8gRGlzcGxheSByZXN1bHRzXG4gICAgY29uc29sZS5sb2coY2hhbGsuY3lhbignXFxu8J+TiiBPUkNIRVNUUkFUSU9OIFJFU1VMVFM6JykpO1xuICAgIFxuICAgIC8vIEludGVyZXN0IEFuYWx5c2lzXG4gICAgY29uc29sZS5sb2coY2hhbGsubWFnZW50YSgnXFxu8J+noCBJbnRlcmVzdCBBbmFseXNpczonKSk7XG4gICAgY29uc29sZS5sb2coYCAgIEludGVyZXN0IExldmVsOiAke3Jlc3VsdC5pbnRlcmVzdEFuYWx5c2lzLmludGVyZXN0TGV2ZWx9YCk7XG4gICAgY29uc29sZS5sb2coYCAgIFVyZ2VuY3kgTGV2ZWw6ICR7cmVzdWx0LmludGVyZXN0QW5hbHlzaXMudXJnZW5jeUxldmVsfWApO1xuICAgIGNvbnNvbGUubG9nKGAgICBDb25maWRlbmNlOiAkeyhyZXN1bHQuaW50ZXJlc3RBbmFseXNpcy5jb25maWRlbmNlICogMTAwKS50b0ZpeGVkKDEpfSVgKTtcbiAgICBcbiAgICBpZiAocmVzdWx0LmludGVyZXN0QW5hbHlzaXMuaW5kaWNhdG9ycy5wb3NpdGl2ZS5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAgUG9zaXRpdmUgSW5kaWNhdG9yczogJHtyZXN1bHQuaW50ZXJlc3RBbmFseXNpcy5pbmRpY2F0b3JzLnBvc2l0aXZlLmpvaW4oJywgJyl9YCk7XG4gICAgfVxuICAgIGlmIChyZXN1bHQuaW50ZXJlc3RBbmFseXNpcy5pbmRpY2F0b3JzLm5lZ2F0aXZlLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBOZWdhdGl2ZSBJbmRpY2F0b3JzOiAke3Jlc3VsdC5pbnRlcmVzdEFuYWx5c2lzLmluZGljYXRvcnMubmVnYXRpdmUuam9pbignLCAnKX1gKTtcbiAgICB9XG4gICAgaWYgKHJlc3VsdC5pbnRlcmVzdEFuYWx5c2lzLmluZGljYXRvcnMudXJnZW5jeS5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhgICAgVXJnZW5jeSBJbmRpY2F0b3JzOiAke3Jlc3VsdC5pbnRlcmVzdEFuYWx5c2lzLmluZGljYXRvcnMudXJnZW5jeS5qb2luKCcsICcpfWApO1xuICAgIH1cblxuICAgIC8vIEV4dHJhY3RlZCBJbmZvcm1hdGlvblxuICAgIGlmIChPYmplY3Qua2V5cyhyZXN1bHQuZXh0cmFjdGVkSW5mbykubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oJ1xcbvCfk6cgRXh0cmFjdGVkIEluZm9ybWF0aW9uOicpKTtcbiAgICAgIE9iamVjdC5lbnRyaWVzKHJlc3VsdC5leHRyYWN0ZWRJbmZvKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgICR7a2V5fTogJHtKU09OLnN0cmluZ2lmeSh2YWx1ZSwgbnVsbCwgMil9YCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHb2FsIFJlY29tbWVuZGF0aW9uc1xuICAgIGlmIChyZXN1bHQucmVjb21tZW5kYXRpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdygnXFxu8J+OryBHb2FsIFJlY29tbWVuZGF0aW9uczonKSk7XG4gICAgICByZXN1bHQucmVjb21tZW5kYXRpb25zLmZvckVhY2gocmVjID0+IHtcbiAgICAgICAgY29uc3Qgc3RhdHVzID0gcmVjLnNob3VsZFB1cnN1ZSA/ICfinIUgUFVSU1VFJyA6ICfij7jvuI8gIFdBSVQnO1xuICAgICAgICBjb25zb2xlLmxvZyhgICAgJHtzdGF0dXN9ICR7cmVjLmdvYWxJZH0gKHByaW9yaXR5OiAke3JlYy5wcmlvcml0eX0pYCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAgICBBcHByb2FjaDogJHtyZWMuYXBwcm9hY2h9YCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICAgICBSZWFzb246ICR7cmVjLnJlYXNvbn1gKTtcbiAgICAgICAgY29uc29sZS5sb2coYCAgICAgIE1lc3NhZ2U6IFwiJHtyZWMubWVzc2FnZX1cImApO1xuICAgICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JheSgnXFxu8J+OryBObyBnb2FsIHJlY29tbWVuZGF0aW9ucyBhdCB0aGlzIHRpbWUnKSk7XG4gICAgfVxuXG4gICAgLy8gU3RhdGUgVXBkYXRlc1xuICAgIGlmIChyZXN1bHQuc3RhdGVVcGRhdGVzLm5ld2x5Q29tcGxldGVkLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCdcXG7inIUgTmV3bHkgQ29tcGxldGVkIEdvYWxzOicpKTtcbiAgICAgIHJlc3VsdC5zdGF0ZVVwZGF0ZXMubmV3bHlDb21wbGV0ZWQuZm9yRWFjaChnb2FsSWQgPT4ge1xuICAgICAgICBjb25zb2xlLmxvZyhgICAg4oCiICR7Z29hbElkfWApO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHJlc3VsdC5zdGF0ZVVwZGF0ZXMubmV3bHlBY3RpdmF0ZWQubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZSgnXFxu8J+UhCBOZXdseSBBY3RpdmF0ZWQgR29hbHM6JykpO1xuICAgICAgcmVzdWx0LnN0YXRlVXBkYXRlcy5uZXdseUFjdGl2YXRlZC5mb3JFYWNoKGdvYWxJZCA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDigKIgJHtnb2FsSWR9YCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAocmVzdWx0LnN0YXRlVXBkYXRlcy5kZWNsaW5lZC5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5yZWQoJ1xcbuKdjCBEZWNsaW5lZCBHb2FsczonKSk7XG4gICAgICByZXN1bHQuc3RhdGVVcGRhdGVzLmRlY2xpbmVkLmZvckVhY2goZ29hbElkID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIOKAoiAke2dvYWxJZH1gKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFRyaWdnZXJlZCBJbnRlbnRzXG4gICAgaWYgKHJlc3VsdC50cmlnZ2VyZWRJbnRlbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLm1hZ2VudGEoJ1xcbvCfmoAgVHJpZ2dlcmVkIEludGVudHM6JykpO1xuICAgICAgcmVzdWx0LnRyaWdnZXJlZEludGVudHMuZm9yRWFjaChpbnRlbnRJZCA9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDigKIgJHtpbnRlbnRJZH1gKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIEdvYWwgU3RhdGUgU3VtbWFyeVxuICAgIGNvbnNvbGUubG9nKGNoYWxrLmN5YW4oJ1xcbvCfk4sgQ3VycmVudCBHb2FsIFN0YXRlOicpKTtcbiAgICBjb25zdCBzdGF0ZVN1bW1hcnkgPSBnb2FsT3JjaGVzdHJhdG9yLmdldEdvYWxTdGF0ZShcbiAgICAgIG9wdGlvbnMuc2Vzc2lvbklkIHx8ICd0ZXN0LXNlc3Npb24nLFxuICAgICAgb3B0aW9ucy5lbWFpbC50b0xvd2VyQ2FzZSgpLFxuICAgICAgb3B0aW9ucy50ZW5hbnRJZFxuICAgICk7XG4gICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkoc3RhdGVTdW1tYXJ5LCBudWxsLCAyKSk7XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGNoYWxrLnJlZCgnXFxu4p2MIEVycm9yIHRlc3RpbmcgZ29hbCBvcmNoZXN0cmF0aW9uOicpLCBlcnJvcik7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRlc3RHb2Fsc0NvbW1hbmQoKTogQ29tbWFuZCB7XG4gIGNvbnN0IGNtZCA9IG5ldyBDb21tYW5kKCd0ZXN0LWdvYWxzJylcbiAgICAuZGVzY3JpcHRpb24oJ1Rlc3QgZ29hbCBvcmNoZXN0cmF0aW9uIHN5c3RlbScpXG4gICAgLmFyZ3VtZW50KCc8bWVzc2FnZT4nLCAnTWVzc2FnZSB0byB0ZXN0JylcbiAgICAub3B0aW9uKCctLXRlbmFudElkIDx0ZW5hbnRJZD4nLCAnVGVuYW50IElEJywgJ2Rldi10ZXN0JylcbiAgICAub3B0aW9uKCctLWVtYWlsIDxlbWFpbD4nLCAnVXNlciBlbWFpbCcsICdkZXZAZXhhbXBsZS5jb20nKVxuICAgIC5vcHRpb24oJy0tcGVyc29uYSA8cGVyc29uYT4nLCAnUGVyc29uYSB0byB1c2UnLCAnY2FybG9zJylcbiAgICAub3B0aW9uKCctLXNlc3Npb25JZCA8c2Vzc2lvbklkPicsICdTZXNzaW9uIElEJywgJ3Rlc3Qtc2Vzc2lvbicpXG4gICAgLm9wdGlvbignLS1jb21wYW55IDxjb21wYW55PicsICdDb21wYW55IG5hbWUnLCAnUGxhbmV0IEZpdG5lc3MnKVxuICAgIC5vcHRpb24oJy0taW5kdXN0cnkgPGluZHVzdHJ5PicsICdDb21wYW55IGluZHVzdHJ5JywgJ0ZpdG5lc3MgJiBXZWxsbmVzcycpXG4gICAgLm9wdGlvbignLS1kZXNjcmlwdGlvbiA8ZGVzY3JpcHRpb24+JywgJ0NvbXBhbnkgZGVzY3JpcHRpb24nKVxuICAgIC5vcHRpb24oJy0tcHJvZHVjdHMgPHByb2R1Y3RzPicsICdDb21wYW55IHByb2R1Y3RzL3NlcnZpY2VzJylcbiAgICAub3B0aW9uKCctLWJlbmVmaXRzIDxiZW5lZml0cz4nLCAnQ29tcGFueSBiZW5lZml0cy92YWx1ZSBwcm9wcycpXG4gICAgLm9wdGlvbignLS10YXJnZXQgPHRhcmdldD4nLCAnVGFyZ2V0IGN1c3RvbWVycycpXG4gICAgLm9wdGlvbignLS1kaWZmZXJlbnRpYXRvcnMgPGRpZmZlcmVudGlhdG9ycz4nLCAnS2V5IGRpZmZlcmVudGlhdG9ycycpXG4gICAgLm9wdGlvbignLS1kZWJ1ZycsICdFbmFibGUgZGVidWcgb3V0cHV0JylcbiAgICAuYWN0aW9uKGFzeW5jIChtZXNzYWdlOiBzdHJpbmcsIG9wdGlvbnM6IFRlc3RHb2Fsc09wdGlvbnMpID0+IHtcbiAgICAgIGF3YWl0IHRlc3RHb2FsT3JjaGVzdHJhdGlvbihtZXNzYWdlLCBvcHRpb25zKTtcbiAgICB9KTtcblxuICByZXR1cm4gY21kO1xufVxuIl19