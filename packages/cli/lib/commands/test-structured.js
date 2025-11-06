"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestStructuredCommand = createTestStructuredCommand;
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
async function testStructuredResponse(message, options) {
    try {
        console.log(chalk_1.default.blue(`\\n🧪 Testing structured response for: "${message}"`));
        console.log(chalk_1.default.gray(`Using persona: ${options.persona}`));
        console.log(chalk_1.default.gray(`Company: ${options.company || 'Planet Fitness'}`));
        // Create test configuration
        const config = (0, kx_langchain_agent_runtime_1.createTestConfig)();
        const companyInfo = createCompanyInfo(options);
        // Create agent service
        const agentService = new kx_langchain_agent_runtime_1.AgentService({
            ...config,
            personaId: options.persona,
            companyInfo
        });
        // Process message and get structured response
        const startTime = Date.now();
        const response = await agentService.processMessageStructured({
            tenantId: options.tenantId,
            email_lc: options.email.toLowerCase(),
            text: message,
            source: 'api',
            conversation_id: 'test-session-' + Date.now()
        });
        const totalTime = Date.now() - startTime;
        // Display structured response
        console.log(chalk_1.default.green(`\\n✅ Response generated in ${totalTime}ms`));
        console.log(chalk_1.default.yellow('\\n📋 STRUCTURED RESPONSE:'));
        console.log(JSON.stringify(response, null, 2));
        // Display formatted summary
        console.log(chalk_1.default.cyan('\\n📊 SUMMARY:'));
        console.log(`   Success: ${response.success ? '✅' : '❌'}`);
        console.log(`   Processing Time: ${response.metadata.processingTimeMs}ms`);
        console.log(`   Total Time: ${totalTime}ms`);
        console.log(`   Message Length: ${response.message.length} characters`);
        if (response.intent) {
            console.log(chalk_1.default.magenta('\\n🎯 INTENT DETECTED:'));
            console.log(`   ID: ${response.intent.id}`);
            console.log(`   Name: ${response.intent.name}`);
            console.log(`   Confidence: ${(response.intent.confidence * 100).toFixed(1)}%`);
            console.log(`   Priority: ${response.intent.priority}`);
            console.log(`   Triggers: ${response.intent.matchedTriggers.join(', ')}`);
            console.log(`   Patterns: ${response.intent.matchedPatterns.join(', ')}`);
            if (response.intent.actions && response.intent.actions.length > 0) {
                console.log(`   Actions: ${response.intent.actions.join(', ')}`);
            }
        }
        else {
            console.log(chalk_1.default.gray('\\n🎯 No intent detected (or low confidence)'));
        }
        if (response.followUp && response.followUp.length > 0) {
            console.log(chalk_1.default.blue('\\n🔄 FOLLOW-UP SUGGESTIONS:'));
            response.followUp.forEach(suggestion => {
                console.log(`   • ${suggestion}`);
            });
        }
        if (response.error) {
            console.log(chalk_1.default.red('\\n❌ ERROR:'));
            console.log(`   Code: ${response.error.code}`);
            console.log(`   Message: ${response.error.message}`);
        }
        console.log(chalk_1.default.green('\\n💬 RESPONSE MESSAGE:'));
        console.log(response.message);
    }
    catch (error) {
        console.error(chalk_1.default.red('\\n❌ Error testing structured response:'), error);
    }
}
function createTestStructuredCommand() {
    const cmd = new commander_1.Command('test-structured')
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
        .action(async (message, options) => {
        await testStructuredResponse(message, options);
    });
    return cmd;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1zdHJ1Y3R1cmVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2NvbW1hbmRzL3Rlc3Qtc3RydWN0dXJlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQWdJQSxrRUFvQkM7QUFwSkQseUNBQW9DO0FBQ3BDLGtEQUEwQjtBQUMxQix1RkFBNEc7QUFpQjVHLFNBQVMsaUJBQWlCLENBQUMsT0FBOEI7SUFDdkQsT0FBTztRQUNMLFFBQVEsRUFBRSxhQUFhO1FBQ3ZCLElBQUksRUFBRSxPQUFPLENBQUMsT0FBTyxJQUFJLGdCQUFnQjtRQUN6QyxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsSUFBSSxvQkFBb0I7UUFDbEQsV0FBVyxFQUFFLE9BQU8sQ0FBQyxXQUFXLElBQUksdURBQXVEO1FBQzNGLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxJQUFJLG1EQUFtRDtRQUNqRixRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsSUFBSSxxRUFBcUU7UUFDbkcsZUFBZSxFQUFFLE9BQU8sQ0FBQyxNQUFNLElBQUkseUZBQXlGO1FBQzVILGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZSxJQUFJLGlFQUFpRTtRQUM3RyxlQUFlLEVBQUU7WUFDZixPQUFPLEVBQUUsSUFBSTtZQUNiLE9BQU8sRUFBRSxFQUFFO1lBQ1gsY0FBYyxFQUFFO2dCQUNkLEVBQUUsRUFBRSxVQUFVO2dCQUNkLElBQUksRUFBRSxpQkFBaUI7Z0JBQ3ZCLFdBQVcsRUFBRSxzREFBc0Q7Z0JBQ25FLFFBQVEsRUFBRTtvQkFDUixJQUFJLEVBQUUsZ0JBQWdCO29CQUN0QixRQUFRLEVBQUUsNkVBQTZFO2lCQUN4RjtnQkFDRCxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQzthQUNuQztZQUNELFVBQVUsRUFBRTtnQkFDVixTQUFTLEVBQUUsR0FBRztnQkFDZCxzQkFBc0IsRUFBRSxvQkFBb0I7YUFDN0M7U0FDRjtRQUNELFNBQVMsRUFBRSxJQUFJLElBQUksRUFB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QWMsRUFBRSxnQkFBZ0IsQ0FBQztTQUMvRCxNQUFNLENBQUMsdUJBQXVCLEVBQUUsa0JBQWtCLEVBQUUsb0JBQW9CLENBQUM7U0FDekUsTUFBTSxDQUFDLDZCQUE2QixFQUFFLHFCQUFxQixDQUFDO1NBQzVELE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSwyQkFBMkIsQ0FBQztTQUM1RCxNQUFNLENBQUMsdUJBQXVCLEVBQUUsOEJBQThCLENBQUM7U0FDL0QsTUFBTSxDQUFDLG1CQUFtQixFQUFFLGtCQUFrQixDQUFDO1NBQy9DLE1BQU0sQ0FBQyxxQ0FBcUMsRUFBRSxxQkFBcUIsQ0FBQztTQUNwRSxNQUFNLENBQUMsU0FBUyxFQUFFLHFCQUFxQixDQUFDO1NBQ3hDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsT0FBZSxFQUFFLE9BQThCLEVBQUUsRUFBRTtRQUNoRSxNQUFNLHNCQUFzQixDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNqRCxDQUFDLENBQUMsQ0FBQztJQUVMLE9BQU8sR0FBRyxDQUFDO0FBQ2IsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbW1hbmQgfSBmcm9tICdjb21tYW5kZXInO1xuaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCB7IEFnZW50U2VydmljZSwgY3JlYXRlVGVzdENvbmZpZywgdHlwZSBBZ2VudFJlc3BvbnNlIH0gZnJvbSAnQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUnO1xuaW1wb3J0IHsgUGVyc29uYVNlcnZpY2UsIHR5cGUgQ29tcGFueUluZm8gfSBmcm9tICdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZSc7XG5cbmludGVyZmFjZSBUZXN0U3RydWN0dXJlZE9wdGlvbnMge1xuICB0ZW5hbnRJZDogc3RyaW5nO1xuICBlbWFpbDogc3RyaW5nO1xuICBwZXJzb25hOiBzdHJpbmc7XG4gIGNvbXBhbnk/OiBzdHJpbmc7XG4gIGluZHVzdHJ5Pzogc3RyaW5nO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZztcbiAgcHJvZHVjdHM/OiBzdHJpbmc7XG4gIGJlbmVmaXRzPzogc3RyaW5nO1xuICB0YXJnZXQ/OiBzdHJpbmc7XG4gIGRpZmZlcmVudGlhdG9ycz86IHN0cmluZztcbiAgZGVidWc/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDb21wYW55SW5mbyhvcHRpb25zOiBUZXN0U3RydWN0dXJlZE9wdGlvbnMpOiBDb21wYW55SW5mbyB7XG4gIHJldHVybiB7XG4gICAgdGVuYW50SWQ6ICd0ZXN0LXRlbmFudCcsXG4gICAgbmFtZTogb3B0aW9ucy5jb21wYW55IHx8ICdQbGFuZXQgRml0bmVzcycsXG4gICAgaW5kdXN0cnk6IG9wdGlvbnMuaW5kdXN0cnkgfHwgJ0ZpdG5lc3MgJiBXZWxsbmVzcycsXG4gICAgZGVzY3JpcHRpb246IG9wdGlvbnMuZGVzY3JpcHRpb24gfHwgJ0FtZXJpY2FcXCdzIG1vc3QgcG9wdWxhciBneW0gd2l0aCBvdmVyIDIsNDAwIGxvY2F0aW9ucycsXG4gICAgcHJvZHVjdHM6IG9wdGlvbnMucHJvZHVjdHMgfHwgJ0d5bSBtZW1iZXJzaGlwcywgZml0bmVzcyBlcXVpcG1lbnQsIGdyb3VwIGNsYXNzZXMnLFxuICAgIGJlbmVmaXRzOiBvcHRpb25zLmJlbmVmaXRzIHx8ICdBZmZvcmRhYmxlIHByaWNpbmcsIGp1ZGdtZW50LWZyZWUgZW52aXJvbm1lbnQsIGNvbnZlbmllbnQgbG9jYXRpb25zJyxcbiAgICB0YXJnZXRDdXN0b21lcnM6IG9wdGlvbnMudGFyZ2V0IHx8ICdQZW9wbGUgb2YgYWxsIGZpdG5lc3MgbGV2ZWxzIGxvb2tpbmcgZm9yIGFuIGFmZm9yZGFibGUsIG5vbi1pbnRpbWlkYXRpbmcgZ3ltIGV4cGVyaWVuY2UnLFxuICAgIGRpZmZlcmVudGlhdG9yczogb3B0aW9ucy5kaWZmZXJlbnRpYXRvcnMgfHwgJ0xvdyBjb3N0LCBuby1qdWRnbWVudCBhdG1vc3BoZXJlLCBiZWdpbm5lci1mcmllbmRseSBlbnZpcm9ubWVudCcsXG4gICAgaW50ZW50Q2FwdHVyaW5nOiB7XG4gICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgaW50ZW50czogW10sXG4gICAgICBmYWxsYmFja0ludGVudDoge1xuICAgICAgICBpZDogJ2ZhbGxiYWNrJyxcbiAgICAgICAgbmFtZTogJ0ZhbGxiYWNrIEludGVudCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRGVmYXVsdCByZXNwb25zZSB3aGVuIG5vIHNwZWNpZmljIGludGVudCBpcyBkZXRlY3RlZCcsXG4gICAgICAgIHJlc3BvbnNlOiB7XG4gICAgICAgICAgdHlwZTogJ2NvbnZlcnNhdGlvbmFsJyxcbiAgICAgICAgICB0ZW1wbGF0ZTogJ0kgdW5kZXJzdGFuZCB5b3VcXCdyZSBpbnRlcmVzdGVkIGluIGxlYXJuaW5nIG1vcmUuIEhvdyBjYW4gSSBoZWxwIHlvdSB0b2RheT8nXG4gICAgICAgIH0sXG4gICAgICAgIGFjdGlvbnM6IFsnY29udGludWVfY29udmVyc2F0aW9uJ11cbiAgICAgIH0sXG4gICAgICBjb25maWRlbmNlOiB7XG4gICAgICAgIHRocmVzaG9sZDogMC43LFxuICAgICAgICBtdWx0aXBsZUludGVudEhhbmRsaW5nOiAnaGlnaGVzdF9jb25maWRlbmNlJ1xuICAgICAgfVxuICAgIH0sXG4gICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKVxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiB0ZXN0U3RydWN0dXJlZFJlc3BvbnNlKG1lc3NhZ2U6IHN0cmluZywgb3B0aW9uczogVGVzdFN0cnVjdHVyZWRPcHRpb25zKSB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZShgXFxcXG7wn6eqIFRlc3Rpbmcgc3RydWN0dXJlZCByZXNwb25zZSBmb3I6IFwiJHttZXNzYWdlfVwiYCkpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFVzaW5nIHBlcnNvbmE6ICR7b3B0aW9ucy5wZXJzb25hfWApKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGBDb21wYW55OiAke29wdGlvbnMuY29tcGFueSB8fCAnUGxhbmV0IEZpdG5lc3MnfWApKTtcblxuICAgIC8vIENyZWF0ZSB0ZXN0IGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBjb25maWcgPSBjcmVhdGVUZXN0Q29uZmlnKCk7XG4gICAgY29uc3QgY29tcGFueUluZm8gPSBjcmVhdGVDb21wYW55SW5mbyhvcHRpb25zKTtcblxuICAgIC8vIENyZWF0ZSBhZ2VudCBzZXJ2aWNlXG4gICAgY29uc3QgYWdlbnRTZXJ2aWNlID0gbmV3IEFnZW50U2VydmljZSh7XG4gICAgICAuLi5jb25maWcsXG4gICAgICBwZXJzb25hSWQ6IG9wdGlvbnMucGVyc29uYSxcbiAgICAgIGNvbXBhbnlJbmZvXG4gICAgfSk7XG5cbiAgICAvLyBQcm9jZXNzIG1lc3NhZ2UgYW5kIGdldCBzdHJ1Y3R1cmVkIHJlc3BvbnNlXG4gICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICBjb25zdCByZXNwb25zZTogQWdlbnRSZXNwb25zZSA9IGF3YWl0IGFnZW50U2VydmljZS5wcm9jZXNzTWVzc2FnZVN0cnVjdHVyZWQoe1xuICAgICAgdGVuYW50SWQ6IG9wdGlvbnMudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogb3B0aW9ucy5lbWFpbC50b0xvd2VyQ2FzZSgpLFxuICAgICAgdGV4dDogbWVzc2FnZSxcbiAgICAgIHNvdXJjZTogJ2FwaScsXG4gICAgICBjb252ZXJzYXRpb25faWQ6ICd0ZXN0LXNlc3Npb24tJyArIERhdGUubm93KClcbiAgICB9KTtcbiAgICBjb25zdCB0b3RhbFRpbWUgPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xuXG4gICAgLy8gRGlzcGxheSBzdHJ1Y3R1cmVkIHJlc3BvbnNlXG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oYFxcXFxu4pyFIFJlc3BvbnNlIGdlbmVyYXRlZCBpbiAke3RvdGFsVGltZX1tc2ApKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay55ZWxsb3coJ1xcXFxu8J+TiyBTVFJVQ1RVUkVEIFJFU1BPTlNFOicpKTtcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShyZXNwb25zZSwgbnVsbCwgMikpO1xuXG4gICAgLy8gRGlzcGxheSBmb3JtYXR0ZWQgc3VtbWFyeVxuICAgIGNvbnNvbGUubG9nKGNoYWxrLmN5YW4oJ1xcXFxu8J+TiiBTVU1NQVJZOicpKTtcbiAgICBjb25zb2xlLmxvZyhgICAgU3VjY2VzczogJHtyZXNwb25zZS5zdWNjZXNzID8gJ+KchScgOiAn4p2MJ31gKTtcbiAgICBjb25zb2xlLmxvZyhgICAgUHJvY2Vzc2luZyBUaW1lOiAke3Jlc3BvbnNlLm1ldGFkYXRhLnByb2Nlc3NpbmdUaW1lTXN9bXNgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgVG90YWwgVGltZTogJHt0b3RhbFRpbWV9bXNgKTtcbiAgICBjb25zb2xlLmxvZyhgICAgTWVzc2FnZSBMZW5ndGg6ICR7cmVzcG9uc2UubWVzc2FnZS5sZW5ndGh9IGNoYXJhY3RlcnNgKTtcbiAgICBcbiAgICBpZiAocmVzcG9uc2UuaW50ZW50KSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5tYWdlbnRhKCdcXFxcbvCfjq8gSU5URU5UIERFVEVDVEVEOicpKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBJRDogJHtyZXNwb25zZS5pbnRlbnQuaWR9YCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgTmFtZTogJHtyZXNwb25zZS5pbnRlbnQubmFtZX1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBDb25maWRlbmNlOiAkeyhyZXNwb25zZS5pbnRlbnQuY29uZmlkZW5jZSAqIDEwMCkudG9GaXhlZCgxKX0lYCk7XG4gICAgICBjb25zb2xlLmxvZyhgICAgUHJpb3JpdHk6ICR7cmVzcG9uc2UuaW50ZW50LnByaW9yaXR5fWApO1xuICAgICAgY29uc29sZS5sb2coYCAgIFRyaWdnZXJzOiAke3Jlc3BvbnNlLmludGVudC5tYXRjaGVkVHJpZ2dlcnMuam9pbignLCAnKX1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBQYXR0ZXJuczogJHtyZXNwb25zZS5pbnRlbnQubWF0Y2hlZFBhdHRlcm5zLmpvaW4oJywgJyl9YCk7XG4gICAgICBpZiAocmVzcG9uc2UuaW50ZW50LmFjdGlvbnMgJiYgcmVzcG9uc2UuaW50ZW50LmFjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhgICAgQWN0aW9uczogJHtyZXNwb25zZS5pbnRlbnQuYWN0aW9ucy5qb2luKCcsICcpfWApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KCdcXFxcbvCfjq8gTm8gaW50ZW50IGRldGVjdGVkIChvciBsb3cgY29uZmlkZW5jZSknKSk7XG4gICAgfVxuXG4gICAgaWYgKHJlc3BvbnNlLmZvbGxvd1VwICYmIHJlc3BvbnNlLmZvbGxvd1VwLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmJsdWUoJ1xcXFxu8J+UhCBGT0xMT1ctVVAgU1VHR0VTVElPTlM6JykpO1xuICAgICAgcmVzcG9uc2UuZm9sbG93VXAuZm9yRWFjaChzdWdnZXN0aW9uID0+IHtcbiAgICAgICAgY29uc29sZS5sb2coYCAgIOKAoiAke3N1Z2dlc3Rpb259YCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAocmVzcG9uc2UuZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnJlZCgnXFxcXG7inYwgRVJST1I6JykpO1xuICAgICAgY29uc29sZS5sb2coYCAgIENvZGU6ICR7cmVzcG9uc2UuZXJyb3IuY29kZX1gKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgICBNZXNzYWdlOiAke3Jlc3BvbnNlLmVycm9yLm1lc3NhZ2V9YCk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oJ1xcXFxu8J+SrCBSRVNQT05TRSBNRVNTQUdFOicpKTtcbiAgICBjb25zb2xlLmxvZyhyZXNwb25zZS5tZXNzYWdlKTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCdcXFxcbuKdjCBFcnJvciB0ZXN0aW5nIHN0cnVjdHVyZWQgcmVzcG9uc2U6JyksIGVycm9yKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGVzdFN0cnVjdHVyZWRDb21tYW5kKCk6IENvbW1hbmQge1xuICBjb25zdCBjbWQgPSBuZXcgQ29tbWFuZCgndGVzdC1zdHJ1Y3R1cmVkJylcbiAgICAuZGVzY3JpcHRpb24oJ1Rlc3Qgc3RydWN0dXJlZCByZXNwb25zZSBmb3JtYXQgd2l0aCBpbnRlbnQgZGV0ZWN0aW9uJylcbiAgICAuYXJndW1lbnQoJzxtZXNzYWdlPicsICdNZXNzYWdlIHRvIHRlc3QnKVxuICAgIC5vcHRpb24oJy0tdGVuYW50SWQgPHRlbmFudElkPicsICdUZW5hbnQgSUQnLCAnZGV2LXRlc3QnKVxuICAgIC5vcHRpb24oJy0tZW1haWwgPGVtYWlsPicsICdVc2VyIGVtYWlsJywgJ2RldkBleGFtcGxlLmNvbScpXG4gICAgLm9wdGlvbignLS1wZXJzb25hIDxwZXJzb25hPicsICdQZXJzb25hIHRvIHVzZScsICdjYXJsb3MnKVxuICAgIC5vcHRpb24oJy0tY29tcGFueSA8Y29tcGFueT4nLCAnQ29tcGFueSBuYW1lJywgJ1BsYW5ldCBGaXRuZXNzJylcbiAgICAub3B0aW9uKCctLWluZHVzdHJ5IDxpbmR1c3RyeT4nLCAnQ29tcGFueSBpbmR1c3RyeScsICdGaXRuZXNzICYgV2VsbG5lc3MnKVxuICAgIC5vcHRpb24oJy0tZGVzY3JpcHRpb24gPGRlc2NyaXB0aW9uPicsICdDb21wYW55IGRlc2NyaXB0aW9uJylcbiAgICAub3B0aW9uKCctLXByb2R1Y3RzIDxwcm9kdWN0cz4nLCAnQ29tcGFueSBwcm9kdWN0cy9zZXJ2aWNlcycpXG4gICAgLm9wdGlvbignLS1iZW5lZml0cyA8YmVuZWZpdHM+JywgJ0NvbXBhbnkgYmVuZWZpdHMvdmFsdWUgcHJvcHMnKVxuICAgIC5vcHRpb24oJy0tdGFyZ2V0IDx0YXJnZXQ+JywgJ1RhcmdldCBjdXN0b21lcnMnKVxuICAgIC5vcHRpb24oJy0tZGlmZmVyZW50aWF0b3JzIDxkaWZmZXJlbnRpYXRvcnM+JywgJ0tleSBkaWZmZXJlbnRpYXRvcnMnKVxuICAgIC5vcHRpb24oJy0tZGVidWcnLCAnRW5hYmxlIGRlYnVnIG91dHB1dCcpXG4gICAgLmFjdGlvbihhc3luYyAobWVzc2FnZTogc3RyaW5nLCBvcHRpb25zOiBUZXN0U3RydWN0dXJlZE9wdGlvbnMpID0+IHtcbiAgICAgIGF3YWl0IHRlc3RTdHJ1Y3R1cmVkUmVzcG9uc2UobWVzc2FnZSwgb3B0aW9ucyk7XG4gICAgfSk7XG5cbiAgcmV0dXJuIGNtZDtcbn1cbiJdfQ==