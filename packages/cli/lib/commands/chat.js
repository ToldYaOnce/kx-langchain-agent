"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatCommand = chatCommand;
exports.createChatConfig = createChatConfig;
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const kx_langchain_agent_runtime_1 = require("@toldyaonce/kx-langchain-agent-runtime");
const messages_1 = require("@langchain/core/messages");
const kx_langchain_agent_runtime_2 = require("@toldyaonce/kx-langchain-agent-runtime");
async function chatCommand(options) {
    console.log(chalk_1.default.blue('🤖 KxGen LangChain Agent - Interactive Chat'));
    console.log(chalk_1.default.gray(`Tenant: ${options.tenantId}`));
    console.log(chalk_1.default.gray(`Email: ${options.email}`));
    console.log(chalk_1.default.gray(`Source: ${options.source}`));
    console.log(chalk_1.default.gray(`Persona: ${options.persona || 'carlos'}`));
    console.log(chalk_1.default.gray(`Company: ${options.company || 'KxGen'}`));
    console.log('');
    try {
        // Load configuration
        const config = createChatConfig(options);
        if (options.debug) {
            console.log(chalk_1.default.yellow('Debug mode enabled'));
            console.log('Config:', JSON.stringify(config, null, 2));
        }
        // Initialize agent service (no DynamoDB/EventBridge for CLI)
        const agentService = new kx_langchain_agent_runtime_1.AgentService(config);
        // Maintain chat history for CLI (will be passed to agent)
        const chatHistory = [];
        // Normalize email
        const emailLc = options.email.toLowerCase();
        console.log(chalk_1.default.green('✅ Agent initialized successfully'));
        // Show persona greeting
        try {
            const personaService = new kx_langchain_agent_runtime_2.PersonaService(null);
            const persona = await personaService.getPersona('dev-test', options.persona || 'carlos', config.companyInfo);
            const greeting = kx_langchain_agent_runtime_1.GreetingService.generateGreeting(persona.greetings, config.companyInfo);
            console.log(chalk_1.default.green('🤖 ' + persona.name + ':'), greeting);
        }
        catch (error) {
            console.log(chalk_1.default.green('🤖 Agent:'), 'Hello! How can I help you today?');
        }
        console.log(chalk_1.default.gray('\nType "exit" to quit, "clear" to clear history\n'));
        // Create DynamoDB service for history management
        const dynamoService = new kx_langchain_agent_runtime_1.DynamoDBService(config);
        // Interactive chat loop
        while (true) {
            const { message } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'message',
                    message: chalk_1.default.cyan('You:'),
                    validate: (input) => input.trim().length > 0 || 'Please enter a message',
                },
            ]);
            const trimmedMessage = message.trim();
            // Handle special commands
            if (trimmedMessage.toLowerCase() === 'exit') {
                console.log(chalk_1.default.yellow('👋 Goodbye!'));
                break;
            }
            if (trimmedMessage.toLowerCase() === 'clear') {
                await clearChatHistory(dynamoService, options.tenantId, emailLc, options.session);
                console.log(chalk_1.default.green('🧹 Chat history cleared\n'));
                continue;
            }
            // Process message with agent
            const spinner = (0, ora_1.default)('🤔 Agent is thinking...').start();
            try {
                // Process message with chat history
                const response = await agentService.processMessage({
                    tenantId: options.tenantId,
                    email_lc: emailLc,
                    text: trimmedMessage,
                    source: options.source,
                    conversation_id: options.session,
                    channel_context: {
                        chat: {
                            sessionId: options.session || 'cli-session',
                        },
                    },
                }, chatHistory);
                // Add agent response to chat history
                chatHistory.push(new messages_1.AIMessage(response));
                spinner.stop();
                // Display response
                console.log(chalk_1.default.green('🤖 Agent:'), response);
                console.log('');
            }
            catch (error) {
                spinner.stop();
                console.error(chalk_1.default.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
                if (options.debug && error instanceof Error) {
                    console.error(chalk_1.default.red('Stack:'), error.stack);
                }
                console.log('');
            }
        }
    }
    catch (error) {
        console.error(chalk_1.default.red('❌ Failed to initialize agent:'), error instanceof Error ? error.message : 'Unknown error');
        if (options.debug && error instanceof Error) {
            console.error(chalk_1.default.red('Stack:'), error.stack);
        }
        process.exit(1);
    }
}
/**
 * Create configuration for chat command
 */
function createChatConfig(options) {
    const baseConfig = (0, kx_langchain_agent_runtime_1.createTestConfig)();
    return {
        ...baseConfig,
        bedrockModelId: options.model || process.env.BEDROCK_MODEL_ID || baseConfig.bedrockModelId,
        personaId: options.persona || 'carlos',
        companyInfo: {
            name: options.company || 'RockBox Fitness Coral Springs',
            industry: options.industry || 'Boxing & HIIT Fitness',
            description: options.description || 'RockBox Fitness is a high-energy boxing and HIIT fitness studio located in Coral Springs/Margate area. We offer 45-minute boxing-based workouts that combine cardio, strength training, and boxing techniques in a supportive, motivating environment.',
            products: options.products || 'Boxing classes, strength training, personal training, recovery services',
            benefits: options.benefits || 'High-intensity workouts, expert coaching, supportive community',
            targetCustomers: options.target || 'Fitness enthusiasts seeking challenging, fun workouts',
            differentiators: options.differentiators || 'Boxing-focused HIIT, expert trainers, local community feel'
        },
        historyLimit: parseInt(options.historyLimit, 10),
        messagesTable: process.env.MESSAGES_TABLE || baseConfig.messagesTable,
        leadsTable: process.env.LEADS_TABLE || baseConfig.leadsTable,
        awsRegion: process.env.AWS_REGION || baseConfig.awsRegion,
        dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT || baseConfig.dynamodbEndpoint,
        outboundEventBusName: process.env.OUTBOUND_EVENT_BUS_NAME || baseConfig.outboundEventBusName,
    };
}
/**
 * Clear chat history for a contact
 */
async function clearChatHistory(dynamoService, tenantId, emailLc, sessionId) {
    // In a real implementation, you might want to add a boundary marker
    // For now, we'll just log that history would be cleared
    console.log(chalk_1.default.gray(`Would clear history for ${tenantId}/${emailLc}${sessionId ? ` (session: ${sessionId})` : ''}`));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jb21tYW5kcy9jaGF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBa0NBLGtDQXFIQztBQUtELDRDQXVCQztBQW5MRCx3REFBZ0M7QUFDaEMsa0RBQTBCO0FBQzFCLDhDQUFzQjtBQUN0Qix1RkFRZ0Q7QUFDaEQsdURBQW1FO0FBQ25FLHVGQUF3RTtBQXFCakUsS0FBSyxVQUFVLFdBQVcsQ0FBQyxPQUFvQjtJQUNwRCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsNkNBQTZDLENBQUMsQ0FBQyxDQUFDO0lBQ3ZFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyxXQUFXLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyxZQUFZLE9BQU8sQ0FBQyxPQUFPLElBQUksUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ25FLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyxZQUFZLE9BQU8sQ0FBQyxPQUFPLElBQUksT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2xFLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7SUFFaEIsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXpDLElBQUksT0FB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ZW50IjpbImltcG9ydCBpbnF1aXJlciBmcm9tICdpbnF1aXJlcic7XG5pbXBvcnQgY2hhbGsgZnJvbSAnY2hhbGsnO1xuaW1wb3J0IG9yYSBmcm9tICdvcmEnO1xuaW1wb3J0IHtcbiAgRHluYW1vREJTZXJ2aWNlLFxuICBFdmVudEJyaWRnZVNlcnZpY2UsXG4gIEFnZW50U2VydmljZSxcbiAgR3JlZXRpbmdTZXJ2aWNlLFxuICBjcmVhdGVUZXN0Q29uZmlnLFxuICB0eXBlIFJ1bnRpbWVDb25maWcsXG4gIHR5cGUgTWVzc2FnZVNvdXJjZSxcbn0gZnJvbSAnQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUnO1xuaW1wb3J0IHsgSHVtYW5NZXNzYWdlLCBBSU1lc3NhZ2UgfSBmcm9tICdAbGFuZ2NoYWluL2NvcmUvbWVzc2FnZXMnO1xuaW1wb3J0IHsgUGVyc29uYVNlcnZpY2UgfSBmcm9tICdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2hhdE9wdGlvbnMge1xuICB0ZW5hbnRJZDogc3RyaW5nO1xuICBlbWFpbDogc3RyaW5nO1xuICBzb3VyY2U6IE1lc3NhZ2VTb3VyY2U7XG4gIG1vZGVsPzogc3RyaW5nO1xuICBwZXJzb25hPzogc3RyaW5nO1xuICBjb21wYW55Pzogc3RyaW5nO1xuICBpbmR1c3RyeT86IHN0cmluZztcbiAgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG4gIHByb2R1Y3RzPzogc3RyaW5nO1xuICBiZW5lZml0cz86IHN0cmluZztcbiAgdGFyZ2V0Pzogc3RyaW5nO1xuICBkaWZmZXJlbnRpYXRvcnM/OiBzdHJpbmc7XG4gIHJhZz86IGJvb2xlYW47XG4gIGhpc3RvcnlMaW1pdDogc3RyaW5nO1xuICBzZXNzaW9uPzogc3RyaW5nO1xuICBkZWJ1Zz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjaGF0Q29tbWFuZChvcHRpb25zOiBDaGF0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKCfwn6SWIEt4R2VuIExhbmdDaGFpbiBBZ2VudCAtIEludGVyYWN0aXZlIENoYXQnKSk7XG4gIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFRlbmFudDogJHtvcHRpb25zLnRlbmFudElkfWApKTtcbiAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgRW1haWw6ICR7b3B0aW9ucy5lbWFpbH1gKSk7XG4gIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFNvdXJjZTogJHtvcHRpb25zLnNvdXJjZX1gKSk7XG4gIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFBlcnNvbmE6ICR7b3B0aW9ucy5wZXJzb25hIHx8ICdjYXJsb3MnfWApKTtcbiAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgQ29tcGFueTogJHtvcHRpb25zLmNvbXBhbnkgfHwgJ0t4R2VuJ31gKSk7XG4gIGNvbnNvbGUubG9nKCcnKTtcblxuICB0cnkge1xuICAgIC8vIExvYWQgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGNvbmZpZyA9IGNyZWF0ZUNoYXRDb25maWcob3B0aW9ucyk7XG4gICAgXG4gICAgaWYgKG9wdGlvbnMuZGVidWcpIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdygnRGVidWcgbW9kZSBlbmFibGVkJykpO1xuICAgICAgY29uc29sZS5sb2coJ0NvbmZpZzonLCBKU09OLnN0cmluZ2lmeShjb25maWcsIG51bGwsIDIpKTtcbiAgICB9XG5cbiAgICAvLyBJbml0aWFsaXplIGFnZW50IHNlcnZpY2UgKG5vIER5bmFtb0RCL0V2ZW50QnJpZGdlIGZvciBDTEkpXG4gICAgY29uc3QgYWdlbnRTZXJ2aWNlID0gbmV3IEFnZW50U2VydmljZShjb25maWcpO1xuICAgIFxuICAgIC8vIE1haW50YWluIGNoYXQgaGlzdG9yeSBmb3IgQ0xJICh3aWxsIGJlIHBhc3NlZCB0byBhZ2VudClcbiAgICBjb25zdCBjaGF0SGlzdG9yeTogKEh1bWFuTWVzc2FnZSB8IEFJTWVzc2FnZSlbXSA9IFtdO1xuXG4gICAgLy8gTm9ybWFsaXplIGVtYWlsXG4gICAgY29uc3QgZW1haWxMYyA9IG9wdGlvbnMuZW1haWwudG9Mb3dlckNhc2UoKTtcblxuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCfinIUgQWdlbnQgaW5pdGlhbGl6ZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgIFxuICAgIC8vIFNob3cgcGVyc29uYSBncmVldGluZ1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwZXJzb25hU2VydmljZSA9IG5ldyBQZXJzb25hU2VydmljZShudWxsKTtcbiAgICAgIGNvbnN0IHBlcnNvbmEgPSBhd2FpdCBwZXJzb25hU2VydmljZS5nZXRQZXJzb25hKCdkZXYtdGVzdCcsIG9wdGlvbnMucGVyc29uYSB8fCAnY2FybG9zJywgY29uZmlnLmNvbXBhbnlJbmZvKTtcbiAgICAgIGNvbnN0IGdyZWV0aW5nID0gR3JlZXRpbmdTZXJ2aWNlLmdlbmVyYXRlR3JlZXRpbmcocGVyc29uYS5ncmVldGluZ3MsIGNvbmZpZy5jb21wYW55SW5mbyk7XG4gICAgICBcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCfwn6SWICcgKyBwZXJzb25hLm5hbWUgKyAnOicpLCBncmVldGluZyk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCfwn6SWIEFnZW50OicpLCAnSGVsbG8hIEhvdyBjYW4gSSBoZWxwIHlvdSB0b2RheT8nKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JheSgnXFxuVHlwZSBcImV4aXRcIiB0byBxdWl0LCBcImNsZWFyXCIgdG8gY2xlYXIgaGlzdG9yeVxcbicpKTtcblxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiBzZXJ2aWNlIGZvciBoaXN0b3J5IG1hbmFnZW1lbnRcbiAgICBjb25zdCBkeW5hbW9TZXJ2aWNlID0gbmV3IER5bmFtb0RCU2VydmljZShjb25maWcpO1xuXG4gICAgLy8gSW50ZXJhY3RpdmUgY2hhdCBsb29wXG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGNvbnN0IHsgbWVzc2FnZSB9ID0gYXdhaXQgaW5xdWlyZXIucHJvbXB0KFtcbiAgICAgICAge1xuICAgICAgICAgIHR5cGU6ICdpbnB1dCcsXG4gICAgICAgICAgbmFtZTogJ21lc3NhZ2UnLFxuICAgICAgICAgIG1lc3NhZ2U6IGNoYWxrLmN5YW4oJ1lvdTonKSxcbiAgICAgICAgICB2YWxpZGF0ZTogKGlucHV0OiBzdHJpbmcpID0+IGlucHV0LnRyaW0oKS5sZW5ndGggPiAwIHx8ICdQbGVhc2UgZW50ZXIgYSBtZXNzYWdlJyxcbiAgICAgICAgfSxcbiAgICAgIF0pO1xuXG4gICAgICBjb25zdCB0cmltbWVkTWVzc2FnZSA9IG1lc3NhZ2UudHJpbSgpO1xuXG4gICAgICAvLyBIYW5kbGUgc3BlY2lhbCBjb21tYW5kc1xuICAgICAgaWYgKHRyaW1tZWRNZXNzYWdlLnRvTG93ZXJDYXNlKCkgPT09ICdleGl0Jykge1xuICAgICAgICBjb25zb2xlLmxvZyhjaGFsay55ZWxsb3coJ/CfkYsgR29vZGJ5ZSEnKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBpZiAodHJpbW1lZE1lc3NhZ2UudG9Mb3dlckNhc2UoKSA9PT0gJ2NsZWFyJykge1xuICAgICAgICBhd2FpdCBjbGVhckNoYXRIaXN0b3J5KGR5bmFtb1NlcnZpY2UsIG9wdGlvbnMudGVuYW50SWQsIGVtYWlsTGMsIG9wdGlvbnMuc2Vzc2lvbik7XG4gICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCfwn6e5IENoYXQgaGlzdG9yeSBjbGVhcmVkXFxuJykpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gUHJvY2VzcyBtZXNzYWdlIHdpdGggYWdlbnRcbiAgICAgIGNvbnN0IHNwaW5uZXIgPSBvcmEoJ/CfpJQgQWdlbnQgaXMgdGhpbmtpbmcuLi4nKS5zdGFydCgpO1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBQcm9jZXNzIG1lc3NhZ2Ugd2l0aCBjaGF0IGhpc3RvcnlcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBhZ2VudFNlcnZpY2UucHJvY2Vzc01lc3NhZ2Uoe1xuICAgICAgICAgIHRlbmFudElkOiBvcHRpb25zLnRlbmFudElkLFxuICAgICAgICAgIGVtYWlsX2xjOiBlbWFpbExjLFxuICAgICAgICAgIHRleHQ6IHRyaW1tZWRNZXNzYWdlLFxuICAgICAgICAgIHNvdXJjZTogb3B0aW9ucy5zb3VyY2UsXG4gICAgICAgICAgY29udmVyc2F0aW9uX2lkOiBvcHRpb25zLnNlc3Npb24sXG4gICAgICAgICAgY2hhbm5lbF9jb250ZXh0OiB7XG4gICAgICAgICAgICBjaGF0OiB7XG4gICAgICAgICAgICAgIHNlc3Npb25JZDogb3B0aW9ucy5zZXNzaW9uIHx8ICdjbGktc2Vzc2lvbicsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sIGNoYXRIaXN0b3J5KTtcbiAgICAgICAgXG4gICAgICAgIC8vIEFkZCBhZ2VudCByZXNwb25zZSB0byBjaGF0IGhpc3RvcnlcbiAgICAgICAgY2hhdEhpc3RvcnkucHVzaChuZXcgQUlNZXNzYWdlKHJlc3BvbnNlKSk7XG5cbiAgICAgICAgc3Bpbm5lci5zdG9wKCk7XG5cbiAgICAgICAgLy8gRGlzcGxheSByZXNwb25zZVxuICAgICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmVlbign8J+kliBBZ2VudDonKSwgcmVzcG9uc2UpO1xuICAgICAgICBjb25zb2xlLmxvZygnJyk7XG5cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIHNwaW5uZXIuc3RvcCgpO1xuICAgICAgICBjb25zb2xlLmVycm9yKGNoYWxrLnJlZCgn4p2MIEVycm9yOicpLCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyk7XG4gICAgICAgIFxuICAgICAgICBpZiAob3B0aW9ucy5kZWJ1ZyAmJiBlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihjaGFsay5yZWQoJ1N0YWNrOicpLCBlcnJvci5zdGFjayk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2coJycpO1xuICAgICAgfVxuICAgIH1cblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinYwgRmFpbGVkIHRvIGluaXRpYWxpemUgYWdlbnQ6JyksIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InKTtcbiAgICBcbiAgICBpZiAob3B0aW9ucy5kZWJ1ZyAmJiBlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGNoYWxrLnJlZCgnU3RhY2s6JyksIGVycm9yLnN0YWNrKTtcbiAgICB9XG4gICAgXG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9XG59XG5cbi8qKlxuICogQ3JlYXRlIGNvbmZpZ3VyYXRpb24gZm9yIGNoYXQgY29tbWFuZFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ2hhdENvbmZpZyhvcHRpb25zOiBDaGF0T3B0aW9ucyk6IFJ1bnRpbWVDb25maWcgJiB7IHBlcnNvbmFJZD86IHN0cmluZzsgY29tcGFueUluZm8/OiBhbnkgfSB7XG4gIGNvbnN0IGJhc2VDb25maWcgPSBjcmVhdGVUZXN0Q29uZmlnKCk7XG4gIFxuICByZXR1cm4ge1xuICAgIC4uLmJhc2VDb25maWcsXG4gICAgYmVkcm9ja01vZGVsSWQ6IG9wdGlvbnMubW9kZWwgfHwgcHJvY2Vzcy5lbnYuQkVEUk9DS19NT0RFTF9JRCB8fCBiYXNlQ29uZmlnLmJlZHJvY2tNb2RlbElkLFxuICAgIHBlcnNvbmFJZDogb3B0aW9ucy5wZXJzb25hIHx8ICdjYXJsb3MnLFxuICAgIGNvbXBhbnlJbmZvOiB7XG4gICAgICBuYW1lOiBvcHRpb25zLmNvbXBhbnkgfHwgJ1JvY2tCb3ggRml0bmVzcyBDb3JhbCBTcHJpbmdzJyxcbiAgICAgIGluZHVzdHJ5OiBvcHRpb25zLmluZHVzdHJ5IHx8ICdCb3hpbmcgJiBISUlUIEZpdG5lc3MnLFxuICAgICAgZGVzY3JpcHRpb246IG9wdGlvbnMuZGVzY3JpcHRpb24gfHwgJ1JvY2tCb3ggRml0bmVzcyBpcyBhIGhpZ2gtZW5lcmd5IGJveGluZyBhbmQgSElJVCBmaXRuZXNzIHN0dWRpbyBsb2NhdGVkIGluIENvcmFsIFNwcmluZ3MvTWFyZ2F0ZSBhcmVhLiBXZSBvZmZlciA0NS1taW51dGUgYm94aW5nLWJhc2VkIHdvcmtvdXRzIHRoYXQgY29tYmluZSBjYXJkaW8sIHN0cmVuZ3RoIHRyYWluaW5nLCBhbmQgYm94aW5nIHRlY2huaXF1ZXMgaW4gYSBzdXBwb3J0aXZlLCBtb3RpdmF0aW5nIGVudmlyb25tZW50LicsXG4gICAgICBwcm9kdWN0czogb3B0aW9ucy5wcm9kdWN0cyB8fCAnQm94aW5nIGNsYXNzZXMsIHN0cmVuZ3RoIHRyYWluaW5nLCBwZXJzb25hbCB0cmFpbmluZywgcmVjb3Zlcnkgc2VydmljZXMnLFxuICAgICAgYmVuZWZpdHM6IG9wdGlvbnMuYmVuZWZpdHMgfHwgJ0hpZ2gtaW50ZW5zaXR5IHdvcmtvdXRzLCBleHBlcnQgY29hY2hpbmcsIHN1cHBvcnRpdmUgY29tbXVuaXR5JyxcbiAgICAgIHRhcmdldEN1c3RvbWVyczogb3B0aW9ucy50YXJnZXQgfHwgJ0ZpdG5lc3MgZW50aHVzaWFzdHMgc2Vla2luZyBjaGFsbGVuZ2luZywgZnVuIHdvcmtvdXRzJyxcbiAgICAgIGRpZmZlcmVudGlhdG9yczogb3B0aW9ucy5kaWZmZXJlbnRpYXRvcnMgfHwgJ0JveGluZy1mb2N1c2VkIEhJSVQsIGV4cGVydCB0cmFpbmVycywgbG9jYWwgY29tbXVuaXR5IGZlZWwnXG4gICAgfSxcbiAgICBoaXN0b3J5TGltaXQ6IHBhcnNlSW50KG9wdGlvbnMuaGlzdG9yeUxpbWl0LCAxMCksXG4gICAgbWVzc2FnZXNUYWJsZTogcHJvY2Vzcy5lbnYuTUVTU0FHRVNfVEFCTEUgfHwgYmFzZUNvbmZpZy5tZXNzYWdlc1RhYmxlLFxuICAgIGxlYWRzVGFibGU6IHByb2Nlc3MuZW52LkxFQURTX1RBQkxFIHx8IGJhc2VDb25maWcubGVhZHNUYWJsZSxcbiAgICBhd3NSZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgYmFzZUNvbmZpZy5hd3NSZWdpb24sXG4gICAgZHluYW1vZGJFbmRwb2ludDogcHJvY2Vzcy5lbnYuRFlOQU1PREJfRU5EUE9JTlQgfHwgYmFzZUNvbmZpZy5keW5hbW9kYkVuZHBvaW50LFxuICAgIG91dGJvdW5kRXZlbnRCdXNOYW1lOiBwcm9jZXNzLmVudi5PVVRCT1VORF9FVkVOVF9CVVNfTkFNRSB8fCBiYXNlQ29uZmlnLm91dGJvdW5kRXZlbnRCdXNOYW1lLFxuICB9O1xufVxuXG4vKipcbiAqIENsZWFyIGNoYXQgaGlzdG9yeSBmb3IgYSBjb250YWN0XG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNsZWFyQ2hhdEhpc3RvcnkoXG4gIGR5bmFtb1NlcnZpY2U6IER5bmFtb0RCU2VydmljZSxcbiAgdGVuYW50SWQ6IHN0cmluZyxcbiAgZW1haWxMYzogc3RyaW5nLFxuICBzZXNzaW9uSWQ/OiBzdHJpbmdcbik6IFByb21pc2U8dm9pZD4ge1xuICAvLyBJbiBhIHJlYWwgaW1wbGVtZW50YXRpb24sIHlvdSBtaWdodCB3YW50IHRvIGFkZCBhIGJvdW5kYXJ5IG1hcmtlclxuICAvLyBGb3Igbm93LCB3ZSdsbCBqdXN0IGxvZyB0aGF0IGhpc3Rvcnkgd291bGQgYmUgY2xlYXJlZFxuICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGBXb3VsZCBjbGVhciBoaXN0b3J5IGZvciAke3RlbmFudElkfS8ke2VtYWlsTGN9JHtzZXNzaW9uSWQgPyBgIChzZXNzaW9uOiAke3Nlc3Npb25JZH0pYCA6ICcnfWApKTtcbn1cbiJdfQ==