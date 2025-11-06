"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelsCommand = void 0;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const aws_1 = require("@langchain/aws");
const kx_langchain_agent_runtime_1 = require("@toldyaonce/kx-langchain-agent-runtime");
// Common Bedrock model IDs
const BEDROCK_MODELS = [
    {
        id: 'anthropic.claude-3-sonnet-20240229-v1:0',
        name: 'Claude 3 Sonnet',
        description: 'Balanced performance and speed',
        provider: 'Anthropic',
    },
    {
        id: 'anthropic.claude-3-haiku-20240307-v1:0',
        name: 'Claude 3 Haiku',
        description: 'Fast and efficient',
        provider: 'Anthropic',
    },
    {
        id: 'anthropic.claude-3-opus-20240229-v1:0',
        name: 'Claude 3 Opus',
        description: 'Most capable model',
        provider: 'Anthropic',
    },
    {
        id: 'amazon.titan-text-express-v1',
        name: 'Titan Text Express',
        description: 'Fast text generation',
        provider: 'Amazon',
    },
    {
        id: 'amazon.titan-text-lite-v1',
        name: 'Titan Text Lite',
        description: 'Lightweight text model',
        provider: 'Amazon',
    },
    {
        id: 'meta.llama2-70b-chat-v1',
        name: 'Llama 2 70B Chat',
        description: 'Open source conversational model',
        provider: 'Meta',
    },
    {
        id: 'mistral.mistral-7b-instruct-v0:2',
        name: 'Mistral 7B Instruct',
        description: 'Efficient instruction-following model',
        provider: 'Mistral AI',
    },
];
exports.modelsCommand = {
    async list() {
        console.log(chalk_1.default.blue('🤖 Available Bedrock Models'));
        console.log('');
        console.log(chalk_1.default.cyan('Supported Models:'));
        console.log('');
        for (const model of BEDROCK_MODELS) {
            console.log(`${chalk_1.default.green('●')} ${chalk_1.default.bold(model.name)} (${model.provider})`);
            console.log(`  ID: ${chalk_1.default.gray(model.id)}`);
            console.log(`  Description: ${model.description}`);
            console.log('');
        }
        console.log(chalk_1.default.yellow('Note: Model availability depends on your AWS region and account access.'));
        console.log(chalk_1.default.gray('Use "kxagent models test --model <id> --prompt <text>" to test a specific model.'));
    },
    async test(options) {
        console.log(chalk_1.default.blue('🧪 Testing Bedrock Model'));
        console.log(chalk_1.default.gray(`Model: ${options.model}`));
        console.log(chalk_1.default.gray(`Prompt: ${options.prompt}`));
        console.log('');
        try {
            // Load configuration
            const config = (0, kx_langchain_agent_runtime_1.createTestConfig)();
            // Create model instance
            const model = new aws_1.ChatBedrockConverse({
                model: options.model,
                region: config.awsRegion,
                temperature: 0.7,
                maxTokens: 500,
            });
            // Test the model
            const spinner = (0, ora_1.default)('🤔 Generating response...').start();
            try {
                const response = await model.invoke(options.prompt);
                spinner.stop();
                console.log(chalk_1.default.green('✅ Model Response:'));
                console.log('');
                console.log(response.content);
                console.log('');
                // Show model info if available
                if (response.response_metadata) {
                    console.log(chalk_1.default.gray('Response Metadata:'));
                    console.log(chalk_1.default.gray(JSON.stringify(response.response_metadata, null, 2)));
                }
            }
            catch (error) {
                spinner.stop();
                if (error instanceof Error) {
                    if (error.message.includes('AccessDeniedException')) {
                        console.error(chalk_1.default.red('❌ Access Denied: You may not have access to this model in your AWS account/region'));
                        console.log(chalk_1.default.yellow('💡 Try requesting access in the AWS Bedrock console'));
                    }
                    else if (error.message.includes('ValidationException')) {
                        console.error(chalk_1.default.red('❌ Invalid Model: The specified model ID may not exist or be available'));
                        console.log(chalk_1.default.yellow('💡 Use "kxagent models list" to see supported models'));
                    }
                    else {
                        console.error(chalk_1.default.red('❌ Model Error:'), error.message);
                    }
                }
                else {
                    console.error(chalk_1.default.red('❌ Unknown error occurred'));
                }
                process.exit(1);
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('❌ Failed to initialize model:'), error instanceof Error ? error.message : 'Unknown error');
            if (error instanceof Error && error.message.includes('region')) {
                console.log(chalk_1.default.yellow('💡 Make sure AWS_REGION is set correctly in your environment'));
            }
            process.exit(1);
        }
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2NvbW1hbmRzL21vZGVscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxrREFBMEI7QUFDMUIsOENBQXNCO0FBQ3RCLHdDQUFxRDtBQUNyRCx1RkFBMEU7QUFPMUUsMkJBQTJCO0FBQzNCLE1BQU0sY0FBYyxHQUFHO0lBQ3JCO1FBQ0UsRUFBRSxFQUFFLHlDQUF5QztRQUM3QyxJQUFJLEVBQUUsaUJBQWlCO1FBQ3ZCLFdBQVcsRUFBRSxnQ0FBZ0M7UUFDN0MsUUFBUSxFQUFFLFdBQVc7S0FDdEI7SUFDRDtRQUNFLEVBQUUsRUFBRSx3Q0FBd0M7UUFDNUMsSUFBSSxFQUFFLGdCQUFnQjtRQUN0QixXQUFXLEVBQUUsb0JBQW9CO1FBQ2pDLFFBQVEsRUFBRSxXQUFXO0tBQ3RCO0lBQ0Q7UUFDRSxFQUFFLEVBQUUsdUNBQXVDO1FBQzNDLElBQUksRUFBRSxlQUFlO1FBQ3JCLFdBQVcsRUFBRSxvQkFBb0I7UUFDakMsUUFBUSxFQUFFLFdBQVc7S0FDdEI7SUFDRDtRQUNFLEVBQUUsRUFBRSw4QkFBOEI7UUFDbEMsSUFBSSxFQUFFLG9CQUFvQjtRQUMxQixXQUFXLEVBQUUsc0JBQXNCO1FBQ25DLFFBQVEsRUFBRSxRQUFRO0tBQ25CO0lBQ0Q7UUFDRSxFQUFFLEVBQUUsMkJBQTJCO1FBQy9CLElBQUksRUFBRSxpQkFBaUI7UUFDdkIsV0FBVyxFQUFFLHdCQUF3QjtRQUNyQyxRQUFRLEVBQUUsUUFBUTtLQUNuQjtJQUNEO1FBQ0UsRUFBRSxFQUFFLHlCQUF5QjtRQUM3QixJQUFJLEVBQUUsa0JBQWtCO1FBQ3hCLFdBQVcsRUFBRSxrQ0FBa0M7UUFDL0MsUUFBUSxFQUFFLE1BQU07S0FDakI7SUFDRDtRQUNFLEVBQUUsRUFBRSxrQ0FBa0M7UUFDdEMsSUFBSSxFQUFFLHFCQUFxQjtRQUMzQixXQUFXLEVBQUUsdUNBQXVDO1FBQ3BELFFBQVEsRUFBRSxZQUFZO0tB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SyxDQUFDLGVBQUssQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO2dCQUN2RCxDQUFDO2dCQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEIsQ0FBQztRQUVILENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxlQUFLLENBQUMsR0FBRyxDQUFDLCtCQUErQixDQUFDLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUM7WUFFcEgsSUFBSSxLQUFLLFlBQVksS0FBSyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQy9ELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLE1BQU0sQ0FBQyw4REFBOEQsQ0FBQyxDQUFDLENBQUM7WUFDNUYsQ0FBQztZQUVELE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEIsQ0FBQztJQUNILENBQUM7Q0FDRixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCBvcmEgZnJvbSAnb3JhJztcbmltcG9ydCB7IENoYXRCZWRyb2NrQ29udmVyc2UgfSBmcm9tICdAbGFuZ2NoYWluL2F3cyc7XG5pbXBvcnQgeyBjcmVhdGVUZXN0Q29uZmlnIH0gZnJvbSAnQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUnO1xuXG5pbnRlcmZhY2UgVGVzdE1vZGVsT3B0aW9ucyB7XG4gIG1vZGVsOiBzdHJpbmc7XG4gIHByb21wdDogc3RyaW5nO1xufVxuXG4vLyBDb21tb24gQmVkcm9jayBtb2RlbCBJRHNcbmNvbnN0IEJFRFJPQ0tfTU9ERUxTID0gW1xuICB7XG4gICAgaWQ6ICdhbnRocm9waWMuY2xhdWRlLTMtc29ubmV0LTIwMjQwMjI5LXYxOjAnLFxuICAgIG5hbWU6ICdDbGF1ZGUgMyBTb25uZXQnLFxuICAgIGRlc2NyaXB0aW9uOiAnQmFsYW5jZWQgcGVyZm9ybWFuY2UgYW5kIHNwZWVkJyxcbiAgICBwcm92aWRlcjogJ0FudGhyb3BpYycsXG4gIH0sXG4gIHtcbiAgICBpZDogJ2FudGhyb3BpYy5jbGF1ZGUtMy1oYWlrdS0yMDI0MDMwNy12MTowJyxcbiAgICBuYW1lOiAnQ2xhdWRlIDMgSGFpa3UnLFxuICAgIGRlc2NyaXB0aW9uOiAnRmFzdCBhbmQgZWZmaWNpZW50JyxcbiAgICBwcm92aWRlcjogJ0FudGhyb3BpYycsXG4gIH0sXG4gIHtcbiAgICBpZDogJ2FudGhyb3BpYy5jbGF1ZGUtMy1vcHVzLTIwMjQwMjI5LXYxOjAnLFxuICAgIG5hbWU6ICdDbGF1ZGUgMyBPcHVzJyxcbiAgICBkZXNjcmlwdGlvbjogJ01vc3QgY2FwYWJsZSBtb2RlbCcsXG4gICAgcHJvdmlkZXI6ICdBbnRocm9waWMnLFxuICB9LFxuICB7XG4gICAgaWQ6ICdhbWF6b24udGl0YW4tdGV4dC1leHByZXNzLXYxJyxcbiAgICBuYW1lOiAnVGl0YW4gVGV4dCBFeHByZXNzJyxcbiAgICBkZXNjcmlwdGlvbjogJ0Zhc3QgdGV4dCBnZW5lcmF0aW9uJyxcbiAgICBwcm92aWRlcjogJ0FtYXpvbicsXG4gIH0sXG4gIHtcbiAgICBpZDogJ2FtYXpvbi50aXRhbi10ZXh0LWxpdGUtdjEnLFxuICAgIG5hbWU6ICdUaXRhbiBUZXh0IExpdGUnLFxuICAgIGRlc2NyaXB0aW9uOiAnTGlnaHR3ZWlnaHQgdGV4dCBtb2RlbCcsXG4gICAgcHJvdmlkZXI6ICdBbWF6b24nLFxuICB9LFxuICB7XG4gICAgaWQ6ICdtZXRhLmxsYW1hMi03MGItY2hhdC12MScsXG4gICAgbmFtZTogJ0xsYW1hIDIgNzBCIENoYXQnLFxuICAgIGRlc2NyaXB0aW9uOiAnT3BlbiBzb3VyY2UgY29udmVyc2F0aW9uYWwgbW9kZWwnLFxuICAgIHByb3ZpZGVyOiAnTWV0YScsXG4gIH0sXG4gIHtcbiAgICBpZDogJ21pc3RyYWwubWlzdHJhbC03Yi1pbnN0cnVjdC12MDoyJyxcbiAgICBuYW1lOiAnTWlzdHJhbCA3QiBJbnN0cnVjdCcsXG4gICAgZGVzY3JpcHRpb246ICdFZmZpY2llbnQgaW5zdHJ1Y3Rpb24tZm9sbG93aW5nIG1vZGVsJyxcbiAgICBwcm92aWRlcjogJ01pc3RyYWwgQUknLFxuICB9LFxuXTtcblxuZXhwb3J0IGNvbnN0IG1vZGVsc0NvbW1hbmQgPSB7XG4gIGFzeW5jIGxpc3QoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZSgn8J+kliBBdmFpbGFibGUgQmVkcm9jayBNb2RlbHMnKSk7XG4gICAgY29uc29sZS5sb2coJycpO1xuXG4gICAgY29uc29sZS5sb2coY2hhbGsuY3lhbignU3VwcG9ydGVkIE1vZGVsczonKSk7XG4gICAgY29uc29sZS5sb2coJycpO1xuXG4gICAgZm9yIChjb25zdCBtb2RlbCBvZiBCRURST0NLX01PREVMUykge1xuICAgICAgY29uc29sZS5sb2coYCR7Y2hhbGsuZ3JlZW4oJ+KXjycpfSAke2NoYWxrLmJvbGQobW9kZWwubmFtZSl9ICgke21vZGVsLnByb3ZpZGVyfSlgKTtcbiAgICAgIGNvbnNvbGUubG9nKGAgIElEOiAke2NoYWxrLmdyYXkobW9kZWwuaWQpfWApO1xuICAgICAgY29uc29sZS5sb2coYCAgRGVzY3JpcHRpb246ICR7bW9kZWwuZGVzY3JpcHRpb259YCk7XG4gICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coY2hhbGsueWVsbG93KCdOb3RlOiBNb2RlbCBhdmFpbGFiaWxpdHkgZGVwZW5kcyBvbiB5b3VyIEFXUyByZWdpb24gYW5kIGFjY291bnQgYWNjZXNzLicpKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KCdVc2UgXCJreGFnZW50IG1vZGVscyB0ZXN0IC0tbW9kZWwgPGlkPiAtLXByb21wdCA8dGV4dD5cIiB0byB0ZXN0IGEgc3BlY2lmaWMgbW9kZWwuJykpO1xuICB9LFxuXG4gIGFzeW5jIHRlc3Qob3B0aW9uczogVGVzdE1vZGVsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmJsdWUoJ/Cfp6ogVGVzdGluZyBCZWRyb2NrIE1vZGVsJykpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYE1vZGVsOiAke29wdGlvbnMubW9kZWx9YCkpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFByb21wdDogJHtvcHRpb25zLnByb21wdH1gKSk7XG4gICAgY29uc29sZS5sb2coJycpO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIExvYWQgY29uZmlndXJhdGlvblxuICAgICAgY29uc3QgY29uZmlnID0gY3JlYXRlVGVzdENvbmZpZygpO1xuICAgICAgXG4gICAgICAvLyBDcmVhdGUgbW9kZWwgaW5zdGFuY2VcbiAgICAgIGNvbnN0IG1vZGVsID0gbmV3IENoYXRCZWRyb2NrQ29udmVyc2Uoe1xuICAgICAgICBtb2RlbDogb3B0aW9ucy5tb2RlbCxcbiAgICAgICAgcmVnaW9uOiBjb25maWcuYXdzUmVnaW9uLFxuICAgICAgICB0ZW1wZXJhdHVyZTogMC43LFxuICAgICAgICBtYXhUb2tlbnM6IDUwMCxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBUZXN0IHRoZSBtb2RlbFxuICAgICAgY29uc3Qgc3Bpbm5lciA9IG9yYSgn8J+klCBHZW5lcmF0aW5nIHJlc3BvbnNlLi4uJykuc3RhcnQoKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBtb2RlbC5pbnZva2Uob3B0aW9ucy5wcm9tcHQpO1xuICAgICAgICBcbiAgICAgICAgc3Bpbm5lci5zdG9wKCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCfinIUgTW9kZWwgUmVzcG9uc2U6JykpO1xuICAgICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKHJlc3BvbnNlLmNvbnRlbnQpO1xuICAgICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgICAgIFxuICAgICAgICAvLyBTaG93IG1vZGVsIGluZm8gaWYgYXZhaWxhYmxlXG4gICAgICAgIGlmIChyZXNwb25zZS5yZXNwb25zZV9tZXRhZGF0YSkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoJ1Jlc3BvbnNlIE1ldGFkYXRhOicpKTtcbiAgICAgICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlLnJlc3BvbnNlX21ldGFkYXRhLCBudWxsLCAyKSkpO1xuICAgICAgICB9XG5cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIHNwaW5uZXIuc3RvcCgpO1xuICAgICAgICBcbiAgICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgICBpZiAoZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnQWNjZXNzRGVuaWVkRXhjZXB0aW9uJykpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinYwgQWNjZXNzIERlbmllZDogWW91IG1heSBub3QgaGF2ZSBhY2Nlc3MgdG8gdGhpcyBtb2RlbCBpbiB5b3VyIEFXUyBhY2NvdW50L3JlZ2lvbicpKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdygn8J+SoSBUcnkgcmVxdWVzdGluZyBhY2Nlc3MgaW4gdGhlIEFXUyBCZWRyb2NrIGNvbnNvbGUnKSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdWYWxpZGF0aW9uRXhjZXB0aW9uJykpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinYwgSW52YWxpZCBNb2RlbDogVGhlIHNwZWNpZmllZCBtb2RlbCBJRCBtYXkgbm90IGV4aXN0IG9yIGJlIGF2YWlsYWJsZScpKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdygn8J+SoSBVc2UgXCJreGFnZW50IG1vZGVscyBsaXN0XCIgdG8gc2VlIHN1cHBvcnRlZCBtb2RlbHMnKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinYwgTW9kZWwgRXJyb3I6JyksIGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGNoYWxrLnJlZCgn4p2MIFVua25vd24gZXJyb3Igb2NjdXJyZWQnKSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cblxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGNoYWxrLnJlZCgn4p2MIEZhaWxlZCB0byBpbml0aWFsaXplIG1vZGVsOicpLCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyk7XG4gICAgICBcbiAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ3JlZ2lvbicpKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdygn8J+SoSBNYWtlIHN1cmUgQVdTX1JFR0lPTiBpcyBzZXQgY29ycmVjdGx5IGluIHlvdXIgZW52aXJvbm1lbnQnKSk7XG4gICAgICB9XG4gICAgICBcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gIH0sXG59O1xuIl19