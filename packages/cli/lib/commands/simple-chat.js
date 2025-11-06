"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simpleChatCmd = void 0;
exports.simpleChatCommand = simpleChatCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const readline = __importStar(require("readline"));
const kx_langchain_agent_runtime_1 = require("@toldyaonce/kx-langchain-agent-runtime");
const chat_js_1 = require("./chat.js");
async function simpleChatCommand(options) {
    try {
        console.log(chalk_1.default.blue('🤖 KxGen LangChain Agent - Simple Chat'));
        console.log(chalk_1.default.gray(`Tenant: ${options.tenantId}`));
        console.log(chalk_1.default.gray(`Email: ${options.email}`));
        console.log(chalk_1.default.gray(`Persona: ${options.persona || 'carlos'}`));
        console.log(chalk_1.default.gray(`Session: ${options.session || 'default'}`));
        const config = (0, chat_js_1.createChatConfig)(options);
        const agentService = new kx_langchain_agent_runtime_1.AgentService(config);
        const emailLc = options.email.toLowerCase();
        console.log(chalk_1.default.green('✅ Agent initialized successfully'));
        // Show persona greeting
        try {
            const { PersonaService } = await Promise.resolve().then(() => __importStar(require('@toldyaonce/kx-langchain-agent-runtime')));
            const { GreetingService } = await Promise.resolve().then(() => __importStar(require('@toldyaonce/kx-langchain-agent-runtime')));
            const personaService = new PersonaService(null);
            const persona = await personaService.getPersona(options.tenantId, options.persona || 'carlos', config.companyInfo);
            const greeting = GreetingService.generateGreeting(persona.greetings, config.companyInfo);
            console.log(chalk_1.default.green('🤖 ' + persona.name + ':'), greeting);
        }
        catch (error) {
            console.log(chalk_1.default.green('🤖 Agent:'), 'Hello! How can I help you today?');
        }
        // Check if running in watch mode
        const isWatchMode = process.env.TSX_WATCH === '1' || process.argv.includes('watch');
        if (isWatchMode) {
            console.log(chalk_1.default.yellow('⚡ Running in watch mode - will restart when files change'));
            console.log(chalk_1.default.gray('💡 Use "npm run dev:chat-stable" for stable chat without auto-restart'));
        }
        console.log(chalk_1.default.gray('\\nType "exit" to quit, "clear" to clear history\\n'));
        // Create readline interface
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: chalk_1.default.cyan('You: ')
        });
        // Handle process cleanup for watch mode
        const cleanup = () => {
            console.log(chalk_1.default.yellow('\n🔄 Restarting due to file changes...'));
            rl.close();
            process.exit(0);
        };
        // Listen for signals that indicate tsx watch is restarting
        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGUSR2', cleanup); // tsx watch uses this signal
        // Interactive chat loop
        rl.prompt();
        rl.on('line', async (input) => {
            const trimmedMessage = input.trim();
            if (trimmedMessage.toLowerCase() === 'exit') {
                console.log(chalk_1.default.blue('\\n👋 Goodbye!'));
                rl.close();
                process.exit(0);
            }
            if (!trimmedMessage) {
                rl.prompt();
                return;
            }
            if (trimmedMessage.toLowerCase() === 'clear') {
                console.log(chalk_1.default.green('🧹 Chat history cleared\\n'));
                rl.prompt();
                return;
            }
            // Process message with agent
            const spinner = (0, ora_1.default)('🤔 Agent is thinking...').start();
            try {
                const response = await agentService.processMessage({
                    tenantId: options.tenantId,
                    email_lc: emailLc,
                    text: trimmedMessage,
                    source: options.source || 'chat',
                    conversation_id: options.session || 'default',
                    channel_context: {
                        chat: {
                            sessionId: options.session || 'default',
                            clientId: 'cli',
                        },
                    },
                });
                spinner.stop();
                // Display the response
                console.log(chalk_1.default.green('🤖 Agent:'), response);
            }
            catch (error) {
                spinner.stop();
                console.error(chalk_1.default.red('❌ Error:'), error instanceof Error ? error.message : String(error));
                if (options.debug) {
                    console.error(chalk_1.default.gray('Debug info:'), error);
                }
            }
            console.log(''); // Empty line for spacing
            rl.prompt();
        });
        rl.on('close', () => {
            console.log(chalk_1.default.blue('\\n👋 Goodbye!'));
            process.exit(0);
        });
    }
    catch (error) {
        console.error(chalk_1.default.red('❌ Failed to initialize chat:'), error);
        process.exit(1);
    }
}
exports.simpleChatCmd = new commander_1.Command('simple-chat')
    .description('Simple interactive chat with the agent (using readline)')
    .requiredOption('--tenantId <id>', 'Tenant ID')
    .requiredOption('--email <email>', 'User email address')
    .option('--persona <persona>', 'Agent persona to use', 'carlos')
    .option('--source <source>', 'Message source', 'chat')
    .option('--session <session>', 'Session/conversation ID', 'default')
    .option('--debug', 'Enable debug output')
    .option('--company <company>', 'Company name', 'Planet Fitness')
    .option('--industry <industry>', 'Company industry', 'Fitness & Wellness')
    .option('--description <description>', 'Company description')
    .option('--products <products>', 'Key products/services')
    .option('--benefits <benefits>', 'Key benefits')
    .option('--target <target>', 'Target customers')
    .option('--differentiators <differentiators>', 'What makes the company different')
    .action(simpleChatCommand);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlLWNoYXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tbWFuZHMvc2ltcGxlLWNoYXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBV0EsOENBNkhDO0FBeElELHlDQUFvQztBQUNwQyxrREFBMEI7QUFDMUIsOENBQXNCO0FBQ3RCLG1EQUFxQztBQUNyQyx1RkFBc0U7QUFDdEUsdUNBQStEO0FBTXhELEtBQUssVUFBVSxpQkFBaUIsQ0FBQyxPQUEwQjtJQUNoRSxJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsd0NBQXdDLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyxXQUFXLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxPQUFPLENBQUMsT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxPQUFPLENBQUMsT0FBTyxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVwRSxNQUFNLE1BQU0sR0FBRyxJQUFBLDBCQUFnQixFQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sWUFBWSxHQUFHLElBQUkseUNBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM5QyxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBRTVD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QUFhLENBQUM7S0FDcEQsV0FBVyxDQUFDLHlEQUF5RCxDQUFDO0tBQ3RFLGNBQWMsQ0FBQyxpQkFBaUIsRUFBRSxXQUFXLENBQUM7S0FDOUMsY0FBYyxDQUFDLGlCQUFpQixFQUFFLG9CQUFvQixDQUFDO0tBQ3ZELE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxzQkFBc0IsRUFBRSxRQUFRLENBQUM7S0FDL0QsTUFBTSxDQUFDLG1CQUFtQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sQ0FBQztLQUNyRCxNQUFNLENBQUMscUJBQXFCLEVBQUUseUJBQXlCLEVBQUUsU0FBUyxDQUFDO0tBQ25FLE1BQU0sQ0FBQyxTQUFTLEVBQUUscUJBQXFCLENBQUM7S0FDeEMsTUFBTSxDQUFDLHFCQUFxQixFQUFFLGNBQWMsRUFBRSxnQkFBZ0IsQ0FBQztLQUMvRCxNQUFNLENBQUMsdUJBQXVCLEVBQUUsa0JBQWtCLEVBQUUsb0JBQW9CLENBQUM7S0FDekUsTUFBTSxDQUFDLDZCQUE2QixFQUFFLHFCQUFxQixDQUFDO0tBQzVELE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSx1QkFBdUIsQ0FBQztLQUN4RCxNQUFNLENBQUMsdUJBQXVCLEVBQUUsY0FBYyxDQUFDO0tBQy9DLE1BQU0sQ0FBQyxtQkFBbUIsRUFBRSxrQkFBa0IsQ0FBQztLQUMvQyxNQUFNLENBQUMscUNBQXFDLEVBQUUsa0NBQWtDLENBQUM7S0FDakYsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnY29tbWFuZGVyJztcbmltcG9ydCBjaGFsayBmcm9tICdjaGFsayc7XG5pbXBvcnQgb3JhIGZyb20gJ29yYSc7XG5pbXBvcnQgKiBhcyByZWFkbGluZSBmcm9tICdyZWFkbGluZSc7XG5pbXBvcnQgeyBBZ2VudFNlcnZpY2UgfSBmcm9tICdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZSc7XG5pbXBvcnQgeyBjcmVhdGVDaGF0Q29uZmlnLCB0eXBlIENoYXRPcHRpb25zIH0gZnJvbSAnLi9jaGF0LmpzJztcblxuaW50ZXJmYWNlIFNpbXBsZUNoYXRPcHRpb25zIGV4dGVuZHMgQ2hhdE9wdGlvbnMge1xuICBzZXNzaW9uPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2ltcGxlQ2hhdENvbW1hbmQob3B0aW9uczogU2ltcGxlQ2hhdE9wdGlvbnMpIHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKCfwn6SWIEt4R2VuIExhbmdDaGFpbiBBZ2VudCAtIFNpbXBsZSBDaGF0JykpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFRlbmFudDogJHtvcHRpb25zLnRlbmFudElkfWApKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGBFbWFpbDogJHtvcHRpb25zLmVtYWlsfWApKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGBQZXJzb25hOiAke29wdGlvbnMucGVyc29uYSB8fCAnY2FybG9zJ31gKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgU2Vzc2lvbjogJHtvcHRpb25zLnNlc3Npb24gfHwgJ2RlZmF1bHQnfWApKTtcblxuICAgIGNvbnN0IGNvbmZpZyA9IGNyZWF0ZUNoYXRDb25maWcob3B0aW9ucyk7XG4gICAgY29uc3QgYWdlbnRTZXJ2aWNlID0gbmV3IEFnZW50U2VydmljZShjb25maWcpO1xuICAgIGNvbnN0IGVtYWlsTGMgPSBvcHRpb25zLmVtYWlsLnRvTG93ZXJDYXNlKCk7XG5cbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmVlbign4pyFIEFnZW50IGluaXRpYWxpemVkIHN1Y2Nlc3NmdWxseScpKTtcbiAgICBcbiAgICAvLyBTaG93IHBlcnNvbmEgZ3JlZXRpbmdcbiAgICB0cnkge1xuICAgICAgY29uc3QgeyBQZXJzb25hU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZScpO1xuICAgICAgY29uc3QgeyBHcmVldGluZ1NlcnZpY2UgfSA9IGF3YWl0IGltcG9ydCgnQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUnKTtcbiAgICAgIFxuICAgICAgY29uc3QgcGVyc29uYVNlcnZpY2UgPSBuZXcgUGVyc29uYVNlcnZpY2UobnVsbCk7XG4gICAgICBjb25zdCBwZXJzb25hID0gYXdhaXQgcGVyc29uYVNlcnZpY2UuZ2V0UGVyc29uYShvcHRpb25zLnRlbmFudElkLCBvcHRpb25zLnBlcnNvbmEgfHwgJ2NhcmxvcycsIGNvbmZpZy5jb21wYW55SW5mbyk7XG4gICAgICBjb25zdCBncmVldGluZyA9IEdyZWV0aW5nU2VydmljZS5nZW5lcmF0ZUdyZWV0aW5nKHBlcnNvbmEuZ3JlZXRpbmdzLCBjb25maWcuY29tcGFueUluZm8pO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmVlbign8J+kliAnICsgcGVyc29uYS5uYW1lICsgJzonKSwgZ3JlZXRpbmcpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmVlbign8J+kliBBZ2VudDonKSwgJ0hlbGxvISBIb3cgY2FuIEkgaGVscCB5b3UgdG9kYXk/Jyk7XG4gICAgfVxuICAgIFxuICAgIC8vIENoZWNrIGlmIHJ1bm5pbmcgaW4gd2F0Y2ggbW9kZVxuICAgIGNvbnN0IGlzV2F0Y2hNb2RlID0gcHJvY2Vzcy5lbnYuVFNYX1dBVENIID09PSAnMScgfHwgcHJvY2Vzcy5hcmd2LmluY2x1ZGVzKCd3YXRjaCcpO1xuICAgIFxuICAgIGlmIChpc1dhdGNoTW9kZSkge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsueWVsbG93KCfimqEgUnVubmluZyBpbiB3YXRjaCBtb2RlIC0gd2lsbCByZXN0YXJ0IHdoZW4gZmlsZXMgY2hhbmdlJykpO1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JheSgn8J+SoSBVc2UgXCJucG0gcnVuIGRldjpjaGF0LXN0YWJsZVwiIGZvciBzdGFibGUgY2hhdCB3aXRob3V0IGF1dG8tcmVzdGFydCcpKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JheSgnXFxcXG5UeXBlIFwiZXhpdFwiIHRvIHF1aXQsIFwiY2xlYXJcIiB0byBjbGVhciBoaXN0b3J5XFxcXG4nKSk7XG5cbiAgICAvLyBDcmVhdGUgcmVhZGxpbmUgaW50ZXJmYWNlXG4gICAgY29uc3QgcmwgPSByZWFkbGluZS5jcmVhdGVJbnRlcmZhY2Uoe1xuICAgICAgaW5wdXQ6IHByb2Nlc3Muc3RkaW4sXG4gICAgICBvdXRwdXQ6IHByb2Nlc3Muc3Rkb3V0LFxuICAgICAgcHJvbXB0OiBjaGFsay5jeWFuKCdZb3U6ICcpXG4gICAgfSk7XG5cbiAgICAvLyBIYW5kbGUgcHJvY2VzcyBjbGVhbnVwIGZvciB3YXRjaCBtb2RlXG4gICAgY29uc3QgY2xlYW51cCA9ICgpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdygnXFxu8J+UhCBSZXN0YXJ0aW5nIGR1ZSB0byBmaWxlIGNoYW5nZXMuLi4nKSk7XG4gICAgICBybC5jbG9zZSgpO1xuICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgIH07XG5cbiAgICAvLyBMaXN0ZW4gZm9yIHNpZ25hbHMgdGhhdCBpbmRpY2F0ZSB0c3ggd2F0Y2ggaXMgcmVzdGFydGluZ1xuICAgIHByb2Nlc3Mub24oJ1NJR1RFUk0nLCBjbGVhbnVwKTtcbiAgICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBjbGVhbnVwKTtcbiAgICBwcm9jZXNzLm9uKCdTSUdVU1IyJywgY2xlYW51cCk7IC8vIHRzeCB3YXRjaCB1c2VzIHRoaXMgc2lnbmFsXG5cbiAgICAvLyBJbnRlcmFjdGl2ZSBjaGF0IGxvb3BcbiAgICBybC5wcm9tcHQoKTtcbiAgICBcbiAgICBybC5vbignbGluZScsIGFzeW5jIChpbnB1dCkgPT4ge1xuICAgICAgY29uc3QgdHJpbW1lZE1lc3NhZ2UgPSBpbnB1dC50cmltKCk7XG5cbiAgICAgIGlmICh0cmltbWVkTWVzc2FnZS50b0xvd2VyQ2FzZSgpID09PSAnZXhpdCcpIHtcbiAgICAgICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZSgnXFxcXG7wn5GLIEdvb2RieWUhJykpO1xuICAgICAgICBybC5jbG9zZSgpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghdHJpbW1lZE1lc3NhZ2UpIHtcbiAgICAgICAgcmwucHJvbXB0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHRyaW1tZWRNZXNzYWdlLnRvTG93ZXJDYXNlKCkgPT09ICdjbGVhcicpIHtcbiAgICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oJ/Cfp7kgQ2hhdCBoaXN0b3J5IGNsZWFyZWRcXFxcbicpKTtcbiAgICAgICAgcmwucHJvbXB0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gUHJvY2VzcyBtZXNzYWdlIHdpdGggYWdlbnRcbiAgICAgIGNvbnN0IHNwaW5uZXIgPSBvcmEoJ/CfpJQgQWdlbnQgaXMgdGhpbmtpbmcuLi4nKS5zdGFydCgpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGFnZW50U2VydmljZS5wcm9jZXNzTWVzc2FnZSh7XG4gICAgICAgICAgdGVuYW50SWQ6IG9wdGlvbnMudGVuYW50SWQsXG4gICAgICAgICAgZW1haWxfbGM6IGVtYWlsTGMsXG4gICAgICAgICAgdGV4dDogdHJpbW1lZE1lc3NhZ2UsXG4gICAgICAgICAgc291cmNlOiBvcHRpb25zLnNvdXJjZSB8fCAnY2hhdCcsXG4gICAgICAgICAgY29udmVyc2F0aW9uX2lkOiBvcHRpb25zLnNlc3Npb24gfHwgJ2RlZmF1bHQnLFxuICAgICAgICAgIGNoYW5uZWxfY29udGV4dDoge1xuICAgICAgICAgICAgY2hhdDoge1xuICAgICAgICAgICAgICBzZXNzaW9uSWQ6IG9wdGlvbnMuc2Vzc2lvbiB8fCAnZGVmYXVsdCcsXG4gICAgICAgICAgICAgIGNsaWVudElkOiAnY2xpJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc3Bpbm5lci5zdG9wKCk7XG5cbiAgICAgICAgLy8gRGlzcGxheSB0aGUgcmVzcG9uc2VcbiAgICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oJ/CfpJYgQWdlbnQ6JyksIHJlc3BvbnNlKTtcblxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgc3Bpbm5lci5zdG9wKCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinYwgRXJyb3I6JyksIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSk7XG4gICAgICAgIFxuICAgICAgICBpZiAob3B0aW9ucy5kZWJ1Zykge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsuZ3JheSgnRGVidWcgaW5mbzonKSwgZXJyb3IpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnNvbGUubG9nKCcnKTsgLy8gRW1wdHkgbGluZSBmb3Igc3BhY2luZ1xuICAgICAgcmwucHJvbXB0KCk7XG4gICAgfSk7XG5cbiAgICBybC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKCdcXFxcbvCfkYsgR29vZGJ5ZSEnKSk7XG4gICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgfSk7XG5cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGNoYWxrLnJlZCgn4p2MIEZhaWxlZCB0byBpbml0aWFsaXplIGNoYXQ6JyksIGVycm9yKTtcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn1cblxuZXhwb3J0IGNvbnN0IHNpbXBsZUNoYXRDbWQgPSBuZXcgQ29tbWFuZCgnc2ltcGxlLWNoYXQnKVxuICAuZGVzY3JpcHRpb24oJ1NpbXBsZSBpbnRlcmFjdGl2ZSBjaGF0IHdpdGggdGhlIGFnZW50ICh1c2luZyByZWFkbGluZSknKVxuICAucmVxdWlyZWRPcHRpb24oJy0tdGVuYW50SWQgPGlkPicsICdUZW5hbnQgSUQnKVxuICAucmVxdWlyZWRPcHRpb24oJy0tZW1haWwgPGVtYWlsPicsICdVc2VyIGVtYWlsIGFkZHJlc3MnKVxuICAub3B0aW9uKCctLXBlcnNvbmEgPHBlcnNvbmE+JywgJ0FnZW50IHBlcnNvbmEgdG8gdXNlJywgJ2NhcmxvcycpXG4gIC5vcHRpb24oJy0tc291cmNlIDxzb3VyY2U+JywgJ01lc3NhZ2Ugc291cmNlJywgJ2NoYXQnKVxuICAub3B0aW9uKCctLXNlc3Npb24gPHNlc3Npb24+JywgJ1Nlc3Npb24vY29udmVyc2F0aW9uIElEJywgJ2RlZmF1bHQnKVxuICAub3B0aW9uKCctLWRlYnVnJywgJ0VuYWJsZSBkZWJ1ZyBvdXRwdXQnKVxuICAub3B0aW9uKCctLWNvbXBhbnkgPGNvbXBhbnk+JywgJ0NvbXBhbnkgbmFtZScsICdQbGFuZXQgRml0bmVzcycpXG4gIC5vcHRpb24oJy0taW5kdXN0cnkgPGluZHVzdHJ5PicsICdDb21wYW55IGluZHVzdHJ5JywgJ0ZpdG5lc3MgJiBXZWxsbmVzcycpXG4gIC5vcHRpb24oJy0tZGVzY3JpcHRpb24gPGRlc2NyaXB0aW9uPicsICdDb21wYW55IGRlc2NyaXB0aW9uJylcbiAgLm9wdGlvbignLS1wcm9kdWN0cyA8cHJvZHVjdHM+JywgJ0tleSBwcm9kdWN0cy9zZXJ2aWNlcycpXG4gIC5vcHRpb24oJy0tYmVuZWZpdHMgPGJlbmVmaXRzPicsICdLZXkgYmVuZWZpdHMnKVxuICAub3B0aW9uKCctLXRhcmdldCA8dGFyZ2V0PicsICdUYXJnZXQgY3VzdG9tZXJzJylcbiAgLm9wdGlvbignLS1kaWZmZXJlbnRpYXRvcnMgPGRpZmZlcmVudGlhdG9ycz4nLCAnV2hhdCBtYWtlcyB0aGUgY29tcGFueSBkaWZmZXJlbnQnKVxuICAuYWN0aW9uKHNpbXBsZUNoYXRDb21tYW5kKTtcbiJdfQ==