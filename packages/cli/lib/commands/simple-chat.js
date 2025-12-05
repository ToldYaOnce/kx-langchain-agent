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
const messages_1 = require("@langchain/core/messages");
const kx_langchain_agent_runtime_1 = require("@toldyaonce/kx-langchain-agent-runtime");
const chat_js_1 = require("./chat.js");
const local_session_store_js_1 = require("../lib/local-session-store.js");
const local_channel_state_service_js_1 = require("../lib/local-channel-state-service.js");
async function simpleChatCommand(options) {
    try {
        console.log(chalk_1.default.blue('🤖 KxGen LangChain Agent - Simple Chat (with local persistence)'));
        console.log(chalk_1.default.gray(`Tenant: ${options.tenantId}`));
        console.log(chalk_1.default.gray(`Email: ${options.email}`));
        console.log(chalk_1.default.gray(`Persona: ${options.persona || 'carlos'}`));
        console.log(chalk_1.default.gray(`Session: ${options.session || 'default'}`));
        const config = (0, chat_js_1.createChatConfig)(options);
        const emailLc = options.email.toLowerCase();
        // Initialize local session store (for LOCAL DEV ONLY)
        const sessionStore = new local_session_store_js_1.LocalSessionStore();
        const sessionId = `${options.tenantId}-${emailLc}-${options.session || 'default'}`;
        // Clear session on startup (fresh start each time you run dev:chat)
        sessionStore.clearSession(sessionId);
        console.log(chalk_1.default.cyan(`🔄 Starting fresh local session (local dev mode)`));
        // Create local channel state service
        const localChannelStateService = new local_channel_state_service_js_1.LocalChannelStateService(sessionStore, sessionId);
        // Inject local channel state service into config
        config.channelStateService = localChannelStateService;
        const agentService = new kx_langchain_agent_runtime_1.AgentService(config);
        // Start logging to file
        sessionStore.startLogging(sessionId);
        console.log(chalk_1.default.gray(`📝 Logging to: ${sessionStore.getLogFilePath()}`));
        // Intercept console.log to also write to log file (LOCAL DEV ONLY)
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...args) => {
            originalLog(...args);
            const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)).join(' ') + '\n';
            sessionStore.appendLog(message);
        };
        console.error = (...args) => {
            originalError(...args);
            const message = '[ERROR] ' + args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg, null, 2)).join(' ') + '\n';
            sessionStore.appendLog(message);
        };
        console.log(chalk_1.default.green('✅ Agent initialized successfully'));
        // Show persona greeting
        try {
            const { PersonaService } = await Promise.resolve().then(() => __importStar(require('@toldyaonce/kx-langchain-agent-runtime')));
            const { GreetingService } = await Promise.resolve().then(() => __importStar(require('@toldyaonce/kx-langchain-agent-runtime')));
            const personaService = new PersonaService(null);
            const persona = await personaService.getPersona(options.tenantId, options.persona || 'carlos', config.companyInfo);
            const greeting = GreetingService.generateGreeting((persona.greetings || persona.greetingConfig), config.companyInfo);
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
            prompt: chalk_1.default.cyan('You: '),
            terminal: true
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
                sessionStore.clearSession(sessionId);
                console.log(chalk_1.default.green('🧹 Chat history and workflow state cleared\\n'));
                rl.prompt();
                return;
            }
            // Save user message to local session
            sessionStore.addMessage(sessionId, new messages_1.HumanMessage(trimmedMessage));
            // Process message with agent
            const spinner = (0, ora_1.default)('🤔 Agent is thinking...').start();
            try {
                // Load previous messages for context
                const previousMessages = sessionStore.getMessages(sessionId);
                const result = await agentService.processMessage({
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
                }, previousMessages // Pass message history
                );
                spinner.stop();
                // Extract response and follow-up (processMessage returns an object)
                const response = typeof result === 'string' ? result : result.response;
                const followUp = typeof result === 'object' && result.followUpQuestion ? result.followUpQuestion : undefined;
                // Save agent response to local session
                sessionStore.addMessage(sessionId, new messages_1.AIMessage(response));
                // Display the response
                console.log(chalk_1.default.green('🤖 Agent:'), response);
                // Display follow-up question if present (with a slight delay for UX)
                if (followUp) {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
                    console.log(chalk_1.default.yellow('💬 Follow-up:'), followUp);
                    // Also save follow-up to session for context
                    sessionStore.addMessage(sessionId, new messages_1.AIMessage(followUp));
                }
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
            // Restore original console
            console.log = originalLog;
            console.error = originalError;
            console.log(chalk_1.default.blue('\\n👋 Goodbye!'));
            console.log(chalk_1.default.gray(`📝 Session log saved to: ${sessionStore.getLogFilePath()}`));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlLWNoYXQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tbWFuZHMvc2ltcGxlLWNoYXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBY0EsOENBNExDO0FBMU1ELHlDQUFvQztBQUNwQyxrREFBMEI7QUFDMUIsOENBQXNCO0FBQ3RCLG1EQUFxQztBQUNyQyx1REFBbUU7QUFDbkUsdUZBQXNFO0FBQ3RFLHVDQUErRDtBQUMvRCwwRUFBa0U7QUFDbEUsMEZBQWlGO0FBTTFFLEtBQUssVUFBVSxpQkFBaUIsQ0FBQyxPQUEwQjtJQUNoRSxJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsaUVBQWlFLENBQUMsQ0FBQyxDQUFDO1FBQzNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyxXQUFXLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxPQUFPLENBQUMsT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxPQUFPLENBQUMsT0FBTyxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVwRSxNQUFNLE1BQU0sR0FBRyxJQUFBLDBCQUFnQixFQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7UUFFNUMsc0RBQXNEO1FBQ3RE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O0tBQ3JELE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSx5QkFBeUIsRUFBRSxTQUFTLENBQUM7S0FDbkUsTUFBTSxDQUFDLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQztLQUN4QyxNQUFNLENBQUMscUJBQXFCLEVBQUUsY0FBYyxFQUFFLGdCQUFnQixDQUFDO0tBQy9ELE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsQ0FBQztLQUN6RSxNQUFNLENBQUMsNkJBQTZCLEVBQUUscUJBQXFCLENBQUM7S0FDNUQsTUFBTSxDQUFDLHVCQUF1QixFQUFFLHVCQUF1QixDQUFDO0tBQ3hELE1BQU0sQ0FBQyx1QkFBdUIsRUFBRSxjQUFjLENBQUM7S0FDL0MsTUFBTSxDQUFDLG1CQUFtQixFQUFFLGtCQUFrQixDQUFDO0tBQy9DLE1BQU0sQ0FBQyxxQ0FBcUMsRUFBRSxrQ0FBa0MsQ0FBQztLQUNqRixNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbW1hbmQgfSBmcm9tICdjb21tYW5kZXInO1xuaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCBvcmEgZnJvbSAnb3JhJztcbmltcG9ydCAqIGFzIHJlYWRsaW5lIGZyb20gJ3JlYWRsaW5lJztcbmltcG9ydCB7IEh1bWFuTWVzc2FnZSwgQUlNZXNzYWdlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL21lc3NhZ2VzJztcbmltcG9ydCB7IEFnZW50U2VydmljZSB9IGZyb20gJ0B0b2xkeWFvbmNlL2t4LWxhbmdjaGFpbi1hZ2VudC1ydW50aW1lJztcbmltcG9ydCB7IGNyZWF0ZUNoYXRDb25maWcsIHR5cGUgQ2hhdE9wdGlvbnMgfSBmcm9tICcuL2NoYXQuanMnO1xuaW1wb3J0IHsgTG9jYWxTZXNzaW9uU3RvcmUgfSBmcm9tICcuLi9saWIvbG9jYWwtc2Vzc2lvbi1zdG9yZS5qcyc7XG5pbXBvcnQgeyBMb2NhbENoYW5uZWxTdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi9saWIvbG9jYWwtY2hhbm5lbC1zdGF0ZS1zZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIFNpbXBsZUNoYXRPcHRpb25zIGV4dGVuZHMgQ2hhdE9wdGlvbnMge1xuICBzZXNzaW9uPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2ltcGxlQ2hhdENvbW1hbmQob3B0aW9uczogU2ltcGxlQ2hhdE9wdGlvbnMpIHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKCfwn6SWIEt4R2VuIExhbmdDaGFpbiBBZ2VudCAtIFNpbXBsZSBDaGF0ICh3aXRoIGxvY2FsIHBlcnNpc3RlbmNlKScpKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGBUZW5hbnQ6ICR7b3B0aW9ucy50ZW5hbnRJZH1gKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgRW1haWw6ICR7b3B0aW9ucy5lbWFpbH1gKSk7XG4gICAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgUGVyc29uYTogJHtvcHRpb25zLnBlcnNvbmEgfHwgJ2Nhcmxvcyd9YCkpO1xuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFNlc3Npb246ICR7b3B0aW9ucy5zZXNzaW9uIHx8ICdkZWZhdWx0J31gKSk7XG5cbiAgICBjb25zdCBjb25maWcgPSBjcmVhdGVDaGF0Q29uZmlnKG9wdGlvbnMpO1xuICAgIGNvbnN0IGVtYWlsTGMgPSBvcHRpb25zLmVtYWlsLnRvTG93ZXJDYXNlKCk7XG4gICAgXG4gICAgLy8gSW5pdGlhbGl6ZSBsb2NhbCBzZXNzaW9uIHN0b3JlIChmb3IgTE9DQUwgREVWIE9OTFkpXG4gICAgY29uc3Qgc2Vzc2lvblN0b3JlID0gbmV3IExvY2FsU2Vzc2lvblN0b3JlKCk7XG4gICAgY29uc3Qgc2Vzc2lvbklkID0gYCR7b3B0aW9ucy50ZW5hbnRJZH0tJHtlbWFpbExjfS0ke29wdGlvbnMuc2Vzc2lvbiB8fCAnZGVmYXVsdCd9YDtcbiAgICBcbiAgICAvLyBDbGVhciBzZXNzaW9uIG9uIHN0YXJ0dXAgKGZyZXNoIHN0YXJ0IGVhY2ggdGltZSB5b3UgcnVuIGRldjpjaGF0KVxuICAgIHNlc3Npb25TdG9yZS5jbGVhclNlc3Npb24oc2Vzc2lvbklkKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5jeWFuKGDwn5SEIFN0YXJ0aW5nIGZyZXNoIGxvY2FsIHNlc3Npb24gKGxvY2FsIGRldiBtb2RlKWApKTtcbiAgICBcbiAgICAvLyBDcmVhdGUgbG9jYWwgY2hhbm5lbCBzdGF0ZSBzZXJ2aWNlXG4gICAgY29uc3QgbG9jYWxDaGFubmVsU3RhdGVTZXJ2aWNlID0gbmV3IExvY2FsQ2hhbm5lbFN0YXRlU2VydmljZShzZXNzaW9uU3RvcmUsIHNlc3Npb25JZCk7XG4gICAgXG4gICAgLy8gSW5qZWN0IGxvY2FsIGNoYW5uZWwgc3RhdGUgc2VydmljZSBpbnRvIGNvbmZpZ1xuICAgIChjb25maWcgYXMgYW55KS5jaGFubmVsU3RhdGVTZXJ2aWNlID0gbG9jYWxDaGFubmVsU3RhdGVTZXJ2aWNlO1xuICAgIFxuICAgIGNvbnN0IGFnZW50U2VydmljZSA9IG5ldyBBZ2VudFNlcnZpY2UoY29uZmlnKTtcblxuICAgIC8vIFN0YXJ0IGxvZ2dpbmcgdG8gZmlsZVxuICAgIHNlc3Npb25TdG9yZS5zdGFydExvZ2dpbmcoc2Vzc2lvbklkKTtcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGDwn5OdIExvZ2dpbmcgdG86ICR7c2Vzc2lvblN0b3JlLmdldExvZ0ZpbGVQYXRoKCl9YCkpO1xuXG4gICAgLy8gSW50ZXJjZXB0IGNvbnNvbGUubG9nIHRvIGFsc28gd3JpdGUgdG8gbG9nIGZpbGUgKExPQ0FMIERFViBPTkxZKVxuICAgIGNvbnN0IG9yaWdpbmFsTG9nID0gY29uc29sZS5sb2c7XG4gICAgY29uc3Qgb3JpZ2luYWxFcnJvciA9IGNvbnNvbGUuZXJyb3I7XG4gICAgY29uc29sZS5sb2cgPSAoLi4uYXJncykgPT4ge1xuICAgICAgb3JpZ2luYWxMb2coLi4uYXJncyk7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYXJncy5tYXAoYXJnID0+IHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnID8gYXJnIDogSlNPTi5zdHJpbmdpZnkoYXJnLCBudWxsLCAyKSkuam9pbignICcpICsgJ1xcbic7XG4gICAgICBzZXNzaW9uU3RvcmUuYXBwZW5kTG9nKG1lc3NhZ2UpO1xuICAgIH07XG4gICAgY29uc29sZS5lcnJvciA9ICguLi5hcmdzKSA9PiB7XG4gICAgICBvcmlnaW5hbEVycm9yKC4uLmFyZ3MpO1xuICAgICAgY29uc3QgbWVzc2FnZSA9ICdbRVJST1JdICcgKyBhcmdzLm1hcChhcmcgPT4gdHlwZW9mIGFyZyA9PT0gJ3N0cmluZycgPyBhcmcgOiBKU09OLnN0cmluZ2lmeShhcmcsIG51bGwsIDIpKS5qb2luKCcgJykgKyAnXFxuJztcbiAgICAgIHNlc3Npb25TdG9yZS5hcHBlbmRMb2cobWVzc2FnZSk7XG4gICAgfTtcblxuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCfinIUgQWdlbnQgaW5pdGlhbGl6ZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgIFxuICAgIC8vIFNob3cgcGVyc29uYSBncmVldGluZ1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7IFBlcnNvbmFTZXJ2aWNlIH0gPSBhd2FpdCBpbXBvcnQoJ0B0b2xkeWFvbmNlL2t4LWxhbmdjaGFpbi1hZ2VudC1ydW50aW1lJyk7XG4gICAgICBjb25zdCB7IEdyZWV0aW5nU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZScpO1xuICAgICAgXG4gICAgICBjb25zdCBwZXJzb25hU2VydmljZSA9IG5ldyBQZXJzb25hU2VydmljZShudWxsKTtcbiAgICAgIGNvbnN0IHBlcnNvbmEgPSBhd2FpdCBwZXJzb25hU2VydmljZS5nZXRQZXJzb25hKG9wdGlvbnMudGVuYW50SWQsIG9wdGlvbnMucGVyc29uYSB8fCAnY2FybG9zJywgY29uZmlnLmNvbXBhbnlJbmZvKTtcbiAgICAgIGNvbnN0IGdyZWV0aW5nID0gR3JlZXRpbmdTZXJ2aWNlLmdlbmVyYXRlR3JlZXRpbmcoKHBlcnNvbmEuZ3JlZXRpbmdzIHx8IHBlcnNvbmEuZ3JlZXRpbmdDb25maWcpIGFzIGFueSwgY29uZmlnLmNvbXBhbnlJbmZvKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oJ/CfpJYgJyArIHBlcnNvbmEubmFtZSArICc6JyksIGdyZWV0aW5nKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oJ/CfpJYgQWdlbnQ6JyksICdIZWxsbyEgSG93IGNhbiBJIGhlbHAgeW91IHRvZGF5PycpO1xuICAgIH1cbiAgICBcbiAgICAvLyBDaGVjayBpZiBydW5uaW5nIGluIHdhdGNoIG1vZGVcbiAgICBjb25zdCBpc1dhdGNoTW9kZSA9IHByb2Nlc3MuZW52LlRTWF9XQVRDSCA9PT0gJzEnIHx8IHByb2Nlc3MuYXJndi5pbmNsdWRlcygnd2F0Y2gnKTtcbiAgICBcbiAgICBpZiAoaXNXYXRjaE1vZGUpIHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdygn4pqhIFJ1bm5pbmcgaW4gd2F0Y2ggbW9kZSAtIHdpbGwgcmVzdGFydCB3aGVuIGZpbGVzIGNoYW5nZScpKTtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoJ/CfkqEgVXNlIFwibnBtIHJ1biBkZXY6Y2hhdC1zdGFibGVcIiBmb3Igc3RhYmxlIGNoYXQgd2l0aG91dCBhdXRvLXJlc3RhcnQnKSk7XG4gICAgfVxuICAgIFxuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoJ1xcXFxuVHlwZSBcImV4aXRcIiB0byBxdWl0LCBcImNsZWFyXCIgdG8gY2xlYXIgaGlzdG9yeVxcXFxuJykpO1xuXG4gICAgLy8gQ3JlYXRlIHJlYWRsaW5lIGludGVyZmFjZVxuICAgIGNvbnN0IHJsID0gcmVhZGxpbmUuY3JlYXRlSW50ZXJmYWNlKHtcbiAgICAgIGlucHV0OiBwcm9jZXNzLnN0ZGluLFxuICAgICAgb3V0cHV0OiBwcm9jZXNzLnN0ZG91dCxcbiAgICAgIHByb21wdDogY2hhbGsuY3lhbignWW91OiAnKSxcbiAgICAgIHRlcm1pbmFsOiB0cnVlXG4gICAgfSk7XG5cbiAgICAvLyBIYW5kbGUgcHJvY2VzcyBjbGVhbnVwIGZvciB3YXRjaCBtb2RlXG4gICAgY29uc3QgY2xlYW51cCA9ICgpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdygnXFxu8J+UhCBSZXN0YXJ0aW5nIGR1ZSB0byBmaWxlIGNoYW5nZXMuLi4nKSk7XG4gICAgICBybC5jbG9zZSgpO1xuICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgIH07XG5cbiAgICAvLyBMaXN0ZW4gZm9yIHNpZ25hbHMgdGhhdCBpbmRpY2F0ZSB0c3ggd2F0Y2ggaXMgcmVzdGFydGluZ1xuICAgIHByb2Nlc3Mub24oJ1NJR1RFUk0nLCBjbGVhbnVwKTtcbiAgICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBjbGVhbnVwKTtcbiAgICBwcm9jZXNzLm9uKCdTSUdVU1IyJywgY2xlYW51cCk7IC8vIHRzeCB3YXRjaCB1c2VzIHRoaXMgc2lnbmFsXG5cbiAgICAvLyBJbnRlcmFjdGl2ZSBjaGF0IGxvb3BcbiAgICBybC5wcm9tcHQoKTtcbiAgICBcbiAgICBybC5vbignbGluZScsIGFzeW5jIChpbnB1dCkgPT4ge1xuICAgICAgY29uc3QgdHJpbW1lZE1lc3NhZ2UgPSBpbnB1dC50cmltKCk7XG5cbiAgICAgIGlmICh0cmltbWVkTWVzc2FnZS50b0xvd2VyQ2FzZSgpID09PSAnZXhpdCcpIHtcbiAgICAgICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZSgnXFxcXG7wn5GLIEdvb2RieWUhJykpO1xuICAgICAgICBybC5jbG9zZSgpO1xuICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICB9XG5cbiAgICAgIGlmICghdHJpbW1lZE1lc3NhZ2UpIHtcbiAgICAgICAgcmwucHJvbXB0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHRyaW1tZWRNZXNzYWdlLnRvTG93ZXJDYXNlKCkgPT09ICdjbGVhcicpIHtcbiAgICAgICAgc2Vzc2lvblN0b3JlLmNsZWFyU2Vzc2lvbihzZXNzaW9uSWQpO1xuICAgICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmVlbign8J+nuSBDaGF0IGhpc3RvcnkgYW5kIHdvcmtmbG93IHN0YXRlIGNsZWFyZWRcXFxcbicpKTtcbiAgICAgICAgcmwucHJvbXB0KCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgLy8gU2F2ZSB1c2VyIG1lc3NhZ2UgdG8gbG9jYWwgc2Vzc2lvblxuICAgICAgc2Vzc2lvblN0b3JlLmFkZE1lc3NhZ2Uoc2Vzc2lvbklkLCBuZXcgSHVtYW5NZXNzYWdlKHRyaW1tZWRNZXNzYWdlKSk7XG5cbiAgICAgIC8vIFByb2Nlc3MgbWVzc2FnZSB3aXRoIGFnZW50XG4gICAgICBjb25zdCBzcGlubmVyID0gb3JhKCfwn6SUIEFnZW50IGlzIHRoaW5raW5nLi4uJykuc3RhcnQoKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gTG9hZCBwcmV2aW91cyBtZXNzYWdlcyBmb3IgY29udGV4dFxuICAgICAgICBjb25zdCBwcmV2aW91c01lc3NhZ2VzID0gc2Vzc2lvblN0b3JlLmdldE1lc3NhZ2VzKHNlc3Npb25JZCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhZ2VudFNlcnZpY2UucHJvY2Vzc01lc3NhZ2UoXG4gICAgICAgICAge1xuICAgICAgICAgICAgdGVuYW50SWQ6IG9wdGlvbnMudGVuYW50SWQsXG4gICAgICAgICAgICBlbWFpbF9sYzogZW1haWxMYyxcbiAgICAgICAgICAgIHRleHQ6IHRyaW1tZWRNZXNzYWdlLFxuICAgICAgICAgICAgc291cmNlOiBvcHRpb25zLnNvdXJjZSB8fCAnY2hhdCcsXG4gICAgICAgICAgICBjb252ZXJzYXRpb25faWQ6IG9wdGlvbnMuc2Vzc2lvbiB8fCAnZGVmYXVsdCcsXG4gICAgICAgICAgICBjaGFubmVsX2NvbnRleHQ6IHtcbiAgICAgICAgICAgICAgY2hhdDoge1xuICAgICAgICAgICAgICAgIHNlc3Npb25JZDogb3B0aW9ucy5zZXNzaW9uIHx8ICdkZWZhdWx0JyxcbiAgICAgICAgICAgICAgICBjbGllbnRJZDogJ2NsaScsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgcHJldmlvdXNNZXNzYWdlcyAgLy8gUGFzcyBtZXNzYWdlIGhpc3RvcnlcbiAgICAgICAgKTtcblxuICAgICAgICBzcGlubmVyLnN0b3AoKTtcblxuICAgICAgICAvLyBFeHRyYWN0IHJlc3BvbnNlIGFuZCBmb2xsb3ctdXAgKHByb2Nlc3NNZXNzYWdlIHJldHVybnMgYW4gb2JqZWN0KVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnID8gcmVzdWx0IDogcmVzdWx0LnJlc3BvbnNlO1xuICAgICAgICBjb25zdCBmb2xsb3dVcCA9IHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnICYmIHJlc3VsdC5mb2xsb3dVcFF1ZXN0aW9uID8gcmVzdWx0LmZvbGxvd1VwUXVlc3Rpb24gOiB1bmRlZmluZWQ7XG5cbiAgICAgICAgLy8gU2F2ZSBhZ2VudCByZXNwb25zZSB0byBsb2NhbCBzZXNzaW9uXG4gICAgICAgIHNlc3Npb25TdG9yZS5hZGRNZXNzYWdlKHNlc3Npb25JZCwgbmV3IEFJTWVzc2FnZShyZXNwb25zZSkpO1xuXG4gICAgICAgIC8vIERpc3BsYXkgdGhlIHJlc3BvbnNlXG4gICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCfwn6SWIEFnZW50OicpLCByZXNwb25zZSk7XG5cbiAgICAgICAgLy8gRGlzcGxheSBmb2xsb3ctdXAgcXVlc3Rpb24gaWYgcHJlc2VudCAod2l0aCBhIHNsaWdodCBkZWxheSBmb3IgVVgpXG4gICAgICAgIGlmIChmb2xsb3dVcCkge1xuICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwKSk7IC8vIDEgc2Vjb25kIGRlbGF5XG4gICAgICAgICAgY29uc29sZS5sb2coY2hhbGsueWVsbG93KCfwn5KsIEZvbGxvdy11cDonKSwgZm9sbG93VXApO1xuICAgICAgICAgIC8vIEFsc28gc2F2ZSBmb2xsb3ctdXAgdG8gc2Vzc2lvbiBmb3IgY29udGV4dFxuICAgICAgICAgIHNlc3Npb25TdG9yZS5hZGRNZXNzYWdlKHNlc3Npb25JZCwgbmV3IEFJTWVzc2FnZShmb2xsb3dVcCkpO1xuICAgICAgICB9XG5cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIHNwaW5uZXIuc3RvcCgpO1xuICAgICAgICBjb25zb2xlLmVycm9yKGNoYWxrLnJlZCgn4p2MIEVycm9yOicpLCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikpO1xuICAgICAgICBcbiAgICAgICAgaWYgKG9wdGlvbnMuZGVidWcpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGNoYWxrLmdyYXkoJ0RlYnVnIGluZm86JyksIGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZygnJyk7IC8vIEVtcHR5IGxpbmUgZm9yIHNwYWNpbmdcbiAgICAgIHJsLnByb21wdCgpO1xuICAgIH0pO1xuXG4gICAgcmwub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgLy8gUmVzdG9yZSBvcmlnaW5hbCBjb25zb2xlXG4gICAgICBjb25zb2xlLmxvZyA9IG9yaWdpbmFsTG9nO1xuICAgICAgY29uc29sZS5lcnJvciA9IG9yaWdpbmFsRXJyb3I7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKCdcXFxcbvCfkYsgR29vZGJ5ZSEnKSk7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGDwn5OdIFNlc3Npb24gbG9nIHNhdmVkIHRvOiAke3Nlc3Npb25TdG9yZS5nZXRMb2dGaWxlUGF0aCgpfWApKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICB9KTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinYwgRmFpbGVkIHRvIGluaXRpYWxpemUgY2hhdDonKSwgZXJyb3IpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufVxuXG5leHBvcnQgY29uc3Qgc2ltcGxlQ2hhdENtZCA9IG5ldyBDb21tYW5kKCdzaW1wbGUtY2hhdCcpXG4gIC5kZXNjcmlwdGlvbignU2ltcGxlIGludGVyYWN0aXZlIGNoYXQgd2l0aCB0aGUgYWdlbnQgKHVzaW5nIHJlYWRsaW5lKScpXG4gIC5yZXF1aXJlZE9wdGlvbignLS10ZW5hbnRJZCA8aWQ+JywgJ1RlbmFudCBJRCcpXG4gIC5yZXF1aXJlZE9wdGlvbignLS1lbWFpbCA8ZW1haWw+JywgJ1VzZXIgZW1haWwgYWRkcmVzcycpXG4gIC5vcHRpb24oJy0tcGVyc29uYSA8cGVyc29uYT4nLCAnQWdlbnQgcGVyc29uYSB0byB1c2UnLCAnY2FybG9zJylcbiAgLm9wdGlvbignLS1zb3VyY2UgPHNvdXJjZT4nLCAnTWVzc2FnZSBzb3VyY2UnLCAnY2hhdCcpXG4gIC5vcHRpb24oJy0tc2Vzc2lvbiA8c2Vzc2lvbj4nLCAnU2Vzc2lvbi9jb252ZXJzYXRpb24gSUQnLCAnZGVmYXVsdCcpXG4gIC5vcHRpb24oJy0tZGVidWcnLCAnRW5hYmxlIGRlYnVnIG91dHB1dCcpXG4gIC5vcHRpb24oJy0tY29tcGFueSA8Y29tcGFueT4nLCAnQ29tcGFueSBuYW1lJywgJ1BsYW5ldCBGaXRuZXNzJylcbiAgLm9wdGlvbignLS1pbmR1c3RyeSA8aW5kdXN0cnk+JywgJ0NvbXBhbnkgaW5kdXN0cnknLCAnRml0bmVzcyAmIFdlbGxuZXNzJylcbiAgLm9wdGlvbignLS1kZXNjcmlwdGlvbiA8ZGVzY3JpcHRpb24+JywgJ0NvbXBhbnkgZGVzY3JpcHRpb24nKVxuICAub3B0aW9uKCctLXByb2R1Y3RzIDxwcm9kdWN0cz4nLCAnS2V5IHByb2R1Y3RzL3NlcnZpY2VzJylcbiAgLm9wdGlvbignLS1iZW5lZml0cyA8YmVuZWZpdHM+JywgJ0tleSBiZW5lZml0cycpXG4gIC5vcHRpb24oJy0tdGFyZ2V0IDx0YXJnZXQ+JywgJ1RhcmdldCBjdXN0b21lcnMnKVxuICAub3B0aW9uKCctLWRpZmZlcmVudGlhdG9ycyA8ZGlmZmVyZW50aWF0b3JzPicsICdXaGF0IG1ha2VzIHRoZSBjb21wYW55IGRpZmZlcmVudCcpXG4gIC5hY3Rpb24oc2ltcGxlQ2hhdENvbW1hbmQpO1xuIl19