"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulateCommand = simulateCommand;
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const kx_langchain_agent_runtime_1 = require("@toldyaonce/kx-langchain-agent-runtime");
const kx_langchain_agent_runtime_2 = require("@toldyaonce/kx-langchain-agent-runtime");
async function simulateCommand(options) {
    console.log(chalk_1.default.blue('🎭 Simulating Inbound Message'));
    console.log(chalk_1.default.gray(`Tenant: ${options.tenantId}`));
    console.log(chalk_1.default.gray(`Source: ${options.source}`));
    console.log(chalk_1.default.gray(`Text: ${options.text}`));
    console.log('');
    try {
        // Validate options
        if (options.source === 'sms' && !options.phone) {
            throw new Error('Phone number is required for SMS source');
        }
        if ((options.source === 'email' || options.source === 'chat') && !options.email) {
            throw new Error('Email address is required for email/chat source');
        }
        // Create mock EventBridge event
        const mockEvent = createMockInboundEvent(options);
        console.log(chalk_1.default.yellow('📨 Mock Event:'));
        console.log(JSON.stringify(mockEvent, null, 2));
        console.log('');
        if (options.putEvents) {
            console.log(chalk_1.default.yellow('⚠️  --put-events flag detected, but publishing to real EventBridge is not implemented in this demo'));
            console.log(chalk_1.default.gray('In a real implementation, this would publish the event to your configured EventBridge bus'));
            console.log('');
        }
        // Set up environment for local execution
        setupLocalEnvironment();
        // Invoke the router handler directly
        const spinner = (0, ora_1.default)('🔄 Processing message through agent router...').start();
        try {
            await (0, kx_langchain_agent_runtime_2.AgentRouterHandler)(mockEvent, createMockLambdaContext());
            spinner.stop();
            console.log(chalk_1.default.green('✅ Message processed successfully'));
            console.log(chalk_1.default.gray('Check your DynamoDB tables and EventBridge bus for results'));
        }
        catch (error) {
            spinner.stop();
            console.error(chalk_1.default.red('❌ Processing failed:'), error instanceof Error ? error.message : 'Unknown error');
            if (error instanceof Error) {
                console.error(chalk_1.default.red('Stack:'), error.stack);
            }
        }
    }
    catch (error) {
        console.error(chalk_1.default.red('❌ Simulation failed:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}
/**
 * Create a mock inbound message event
 */
function createMockInboundEvent(options) {
    const now = new Date().toISOString();
    return {
        source: 'kxgen.messaging',
        'detail-type': 'lead.message.created',
        detail: {
            tenantId: options.tenantId,
            email_lc: options.email?.toLowerCase(),
            phone_e164: options.phone,
            source: options.source,
            text: options.text,
            timestamps: {
                received: now,
                processed: now,
            },
            channel_context: createChannelContext(options),
            provider: {
                mock: true,
                cli_generated: true,
            },
        },
    };
}
/**
 * Create channel context based on source
 */
function createChannelContext(options) {
    switch (options.source) {
        case 'sms':
            return {
                sms: {
                    from: options.phone,
                    to: '+1234567890', // Mock destination
                    messageId: `mock-sms-${Date.now()}`,
                },
            };
        case 'email':
            return {
                email: {
                    from: options.email,
                    to: 'agent@kxgen.com', // Mock destination
                    msgId: `mock-email-${Date.now()}`,
                    threadId: `thread-${Date.now()}`,
                },
            };
        case 'chat':
            return {
                chat: {
                    sessionId: `mock-session-${Date.now()}`,
                    clientId: 'cli-client',
                },
            };
        default:
            return {};
    }
}
/**
 * Set up environment variables for local execution
 */
function setupLocalEnvironment() {
    const config = (0, kx_langchain_agent_runtime_1.createTestConfig)();
    // Set environment variables that the handlers expect
    process.env.MESSAGES_TABLE = process.env.MESSAGES_TABLE || config.messagesTable;
    process.env.LEADS_TABLE = process.env.LEADS_TABLE || config.leadsTable;
    process.env.BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || config.bedrockModelId;
    process.env.AWS_REGION = process.env.AWS_REGION || config.awsRegion;
    process.env.OUTBOUND_EVENT_BUS_NAME = process.env.OUTBOUND_EVENT_BUS_NAME || config.outboundEventBusName;
    process.env.HISTORY_LIMIT = process.env.HISTORY_LIMIT || config.historyLimit.toString();
    if (config.dynamodbEndpoint) {
        process.env.DYNAMODB_ENDPOINT = config.dynamodbEndpoint;
    }
}
/**
 * Create a mock Lambda context
 */
function createMockLambdaContext() {
    return {
        callbackWaitsForEmptyEventLoop: false,
        functionName: 'mock-function',
        functionVersion: '$LATEST',
        invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:mock-function',
        memoryLimitInMB: '512',
        awsRequestId: `mock-request-${Date.now()}`,
        logGroupName: '/aws/lambda/mock-function',
        logStreamName: `${new Date().toISOString().split('T')[0]}/[$LATEST]${Math.random().toString(36).substring(7)}`,
        getRemainingTimeInMillis: () => 30000,
        done: () => { },
        fail: () => { },
        succeed: () => { },
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltdWxhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvY29tbWFuZHMvc2ltdWxhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFrQkEsMENBd0RDO0FBMUVELGtEQUEwQjtBQUMxQiw4Q0FBc0I7QUFDdEIsdUZBSWdEO0FBQ2hELHVGQUE2RjtBQVd0RixLQUFLLFVBQVUsZUFBZSxDQUFDLE9BQXdCO0lBQzVELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLENBQUM7SUFDekQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN2RCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyxTQUFTLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUVoQixJQUFJLENBQUM7UUFDSCxtQkFBbUI7UUFDbkIsSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLEtBQUssSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUMvQyxNQUFNLElBQUksS0FBSyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDN0QsQ0FBQztRQUVELElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLE9BQU8sSUFBSSxPQUFPLENBQUMsTUFBTSxLQUFLLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2hGLE1BQU0sSUFBSSxLQUFLLENBQUMsaURBQWlELENBQUMsQ0FBQztRQUNyRSxD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QUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsYUFBYSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUM5Ryx3QkFBd0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxLQUFLO1FBQ3JDLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRSxDQUFDO1FBQ2QsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFFLENBQUM7UUFDZCxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUUsQ0FBQztLQUNsQixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBjaGFsayBmcm9tICdjaGFsayc7XG5pbXBvcnQgb3JhIGZyb20gJ29yYSc7XG5pbXBvcnQge1xuICBjcmVhdGVUZXN0Q29uZmlnLFxuICB0eXBlIEluYm91bmRNZXNzYWdlRXZlbnQsXG4gIHR5cGUgTWVzc2FnZVNvdXJjZSxcbn0gZnJvbSAnQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUnO1xuaW1wb3J0IHsgQWdlbnRSb3V0ZXJIYW5kbGVyIGFzIHJvdXRlckhhbmRsZXIgfSBmcm9tICdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZSc7XG5cbmludGVyZmFjZSBTaW11bGF0ZU9wdGlvbnMge1xuICB0ZW5hbnRJZDogc3RyaW5nO1xuICBzb3VyY2U6IE1lc3NhZ2VTb3VyY2U7XG4gIHRleHQ6IHN0cmluZztcbiAgcGhvbmU/OiBzdHJpbmc7XG4gIGVtYWlsPzogc3RyaW5nO1xuICBwdXRFdmVudHM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2ltdWxhdGVDb21tYW5kKG9wdGlvbnM6IFNpbXVsYXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKCfwn46tIFNpbXVsYXRpbmcgSW5ib3VuZCBNZXNzYWdlJykpO1xuICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGBUZW5hbnQ6ICR7b3B0aW9ucy50ZW5hbnRJZH1gKSk7XG4gIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFNvdXJjZTogJHtvcHRpb25zLnNvdXJjZX1gKSk7XG4gIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFRleHQ6ICR7b3B0aW9ucy50ZXh0fWApKTtcbiAgY29uc29sZS5sb2coJycpO1xuXG4gIHRyeSB7XG4gICAgLy8gVmFsaWRhdGUgb3B0aW9uc1xuICAgIGlmIChvcHRpb25zLnNvdXJjZSA9PT0gJ3NtcycgJiYgIW9wdGlvbnMucGhvbmUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUGhvbmUgbnVtYmVyIGlzIHJlcXVpcmVkIGZvciBTTVMgc291cmNlJyk7XG4gICAgfVxuICAgIFxuICAgIGlmICgob3B0aW9ucy5zb3VyY2UgPT09ICdlbWFpbCcgfHwgb3B0aW9ucy5zb3VyY2UgPT09ICdjaGF0JykgJiYgIW9wdGlvbnMuZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRW1haWwgYWRkcmVzcyBpcyByZXF1aXJlZCBmb3IgZW1haWwvY2hhdCBzb3VyY2UnKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgbW9jayBFdmVudEJyaWRnZSBldmVudFxuICAgIGNvbnN0IG1vY2tFdmVudCA9IGNyZWF0ZU1vY2tJbmJvdW5kRXZlbnQob3B0aW9ucyk7XG4gICAgXG4gICAgY29uc29sZS5sb2coY2hhbGsueWVsbG93KCfwn5OoIE1vY2sgRXZlbnQ6JykpO1xuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KG1vY2tFdmVudCwgbnVsbCwgMikpO1xuICAgIGNvbnNvbGUubG9nKCcnKTtcblxuICAgIGlmIChvcHRpb25zLnB1dEV2ZW50cykge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsueWVsbG93KCfimqDvuI8gIC0tcHV0LWV2ZW50cyBmbGFnIGRldGVjdGVkLCBidXQgcHVibGlzaGluZyB0byByZWFsIEV2ZW50QnJpZGdlIGlzIG5vdCBpbXBsZW1lbnRlZCBpbiB0aGlzIGRlbW8nKSk7XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KCdJbiBhIHJlYWwgaW1wbGVtZW50YXRpb24sIHRoaXMgd291bGQgcHVibGlzaCB0aGUgZXZlbnQgdG8geW91ciBjb25maWd1cmVkIEV2ZW50QnJpZGdlIGJ1cycpKTtcbiAgICAgIGNvbnNvbGUubG9nKCcnKTtcbiAgICB9XG5cbiAgICAvLyBTZXQgdXAgZW52aXJvbm1lbnQgZm9yIGxvY2FsIGV4ZWN1dGlvblxuICAgIHNldHVwTG9jYWxFbnZpcm9ubWVudCgpO1xuXG4gICAgLy8gSW52b2tlIHRoZSByb3V0ZXIgaGFuZGxlciBkaXJlY3RseVxuICAgIGNvbnN0IHNwaW5uZXIgPSBvcmEoJ/CflIQgUHJvY2Vzc2luZyBtZXNzYWdlIHRocm91Z2ggYWdlbnQgcm91dGVyLi4uJykuc3RhcnQoKTtcblxuICAgIHRyeSB7XG4gICAgICBhd2FpdCByb3V0ZXJIYW5kbGVyKG1vY2tFdmVudCBhcyBhbnksIGNyZWF0ZU1vY2tMYW1iZGFDb250ZXh0KCkpO1xuICAgICAgXG4gICAgICBzcGlubmVyLnN0b3AoKTtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCfinIUgTWVzc2FnZSBwcm9jZXNzZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JheSgnQ2hlY2sgeW91ciBEeW5hbW9EQiB0YWJsZXMgYW5kIEV2ZW50QnJpZGdlIGJ1cyBmb3IgcmVzdWx0cycpKTtcbiAgICAgIFxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBzcGlubmVyLnN0b3AoKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinYwgUHJvY2Vzc2luZyBmYWlsZWQ6JyksIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InKTtcbiAgICAgIFxuICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihjaGFsay5yZWQoJ1N0YWNrOicpLCBlcnJvci5zdGFjayk7XG4gICAgICB9XG4gICAgfVxuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihjaGFsay5yZWQoJ+KdjCBTaW11bGF0aW9uIGZhaWxlZDonKSwgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxufVxuXG4vKipcbiAqIENyZWF0ZSBhIG1vY2sgaW5ib3VuZCBtZXNzYWdlIGV2ZW50XG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tJbmJvdW5kRXZlbnQob3B0aW9uczogU2ltdWxhdGVPcHRpb25zKTogSW5ib3VuZE1lc3NhZ2VFdmVudCB7XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbiAgXG4gIHJldHVybiB7XG4gICAgc291cmNlOiAna3hnZW4ubWVzc2FnaW5nJyxcbiAgICAnZGV0YWlsLXR5cGUnOiAnbGVhZC5tZXNzYWdlLmNyZWF0ZWQnLFxuICAgIGRldGFpbDoge1xuICAgICAgdGVuYW50SWQ6IG9wdGlvbnMudGVuYW50SWQsXG4gICAgICBlbWFpbF9sYzogb3B0aW9ucy5lbWFpbD8udG9Mb3dlckNhc2UoKSxcbiAgICAgIHBob25lX2UxNjQ6IG9wdGlvbnMucGhvbmUsXG4gICAgICBzb3VyY2U6IG9wdGlvbnMuc291cmNlLFxuICAgICAgdGV4dDogb3B0aW9ucy50ZXh0LFxuICAgICAgdGltZXN0YW1wczoge1xuICAgICAgICByZWNlaXZlZDogbm93LFxuICAgICAgICBwcm9jZXNzZWQ6IG5vdyxcbiAgICAgIH0sXG4gICAgICBjaGFubmVsX2NvbnRleHQ6IGNyZWF0ZUNoYW5uZWxDb250ZXh0KG9wdGlvbnMpLFxuICAgICAgcHJvdmlkZXI6IHtcbiAgICAgICAgbW9jazogdHJ1ZSxcbiAgICAgICAgY2xpX2dlbmVyYXRlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgY2hhbm5lbCBjb250ZXh0IGJhc2VkIG9uIHNvdXJjZVxuICovXG5mdW5jdGlvbiBjcmVhdGVDaGFubmVsQ29udGV4dChvcHRpb25zOiBTaW11bGF0ZU9wdGlvbnMpIHtcbiAgc3dpdGNoIChvcHRpb25zLnNvdXJjZSkge1xuICAgIGNhc2UgJ3Ntcyc6XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzbXM6IHtcbiAgICAgICAgICBmcm9tOiBvcHRpb25zLnBob25lISxcbiAgICAgICAgICB0bzogJysxMjM0NTY3ODkwJywgLy8gTW9jayBkZXN0aW5hdGlvblxuICAgICAgICAgIG1lc3NhZ2VJZDogYG1vY2stc21zLSR7RGF0ZS5ub3coKX1gLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICBcbiAgICBjYXNlICdlbWFpbCc6XG4gICAgICByZXR1cm4ge1xuICAgICAgICBlbWFpbDoge1xuICAgICAgICAgIGZyb206IG9wdGlvbnMuZW1haWwhLFxuICAgICAgICAgIHRvOiAnYWdlbnRAa3hnZW4uY29tJywgLy8gTW9jayBkZXN0aW5hdGlvblxuICAgICAgICAgIG1zZ0lkOiBgbW9jay1lbWFpbC0ke0RhdGUubm93KCl9YCxcbiAgICAgICAgICB0aHJlYWRJZDogYHRocmVhZC0ke0RhdGUubm93KCl9YCxcbiAgICAgICAgfSxcbiAgICAgIH07XG4gICAgXG4gICAgY2FzZSAnY2hhdCc6XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjaGF0OiB7XG4gICAgICAgICAgc2Vzc2lvbklkOiBgbW9jay1zZXNzaW9uLSR7RGF0ZS5ub3coKX1gLFxuICAgICAgICAgIGNsaWVudElkOiAnY2xpLWNsaWVudCcsXG4gICAgICAgIH0sXG4gICAgICB9O1xuICAgIFxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4ge307XG4gIH1cbn1cblxuLyoqXG4gKiBTZXQgdXAgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciBsb2NhbCBleGVjdXRpb25cbiAqL1xuZnVuY3Rpb24gc2V0dXBMb2NhbEVudmlyb25tZW50KCk6IHZvaWQge1xuICBjb25zdCBjb25maWcgPSBjcmVhdGVUZXN0Q29uZmlnKCk7XG4gIFxuICAvLyBTZXQgZW52aXJvbm1lbnQgdmFyaWFibGVzIHRoYXQgdGhlIGhhbmRsZXJzIGV4cGVjdFxuICBwcm9jZXNzLmVudi5NRVNTQUdFU19UQUJMRSA9IHByb2Nlc3MuZW52Lk1FU1NBR0VTX1RBQkxFIHx8IGNvbmZpZy5tZXNzYWdlc1RhYmxlO1xuICBwcm9jZXNzLmVudi5MRUFEU19UQUJMRSA9IHByb2Nlc3MuZW52LkxFQURTX1RBQkxFIHx8IGNvbmZpZy5sZWFkc1RhYmxlO1xuICBwcm9jZXNzLmVudi5CRURST0NLX01PREVMX0lEID0gcHJvY2Vzcy5lbnYuQkVEUk9DS19NT0RFTF9JRCB8fCBjb25maWcuYmVkcm9ja01vZGVsSWQ7XG4gIHByb2Nlc3MuZW52LkFXU19SRUdJT04gPSBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8IGNvbmZpZy5hd3NSZWdpb247XG4gIHByb2Nlc3MuZW52Lk9VVEJPVU5EX0VWRU5UX0JVU19OQU1FID0gcHJvY2Vzcy5lbnYuT1VUQk9VTkRfRVZFTlRfQlVTX05BTUUgfHwgY29uZmlnLm91dGJvdW5kRXZlbnRCdXNOYW1lO1xuICBwcm9jZXNzLmVudi5ISVNUT1JZX0xJTUlUID0gcHJvY2Vzcy5lbnYuSElTVE9SWV9MSU1JVCB8fCBjb25maWcuaGlzdG9yeUxpbWl0LnRvU3RyaW5nKCk7XG4gIFxuICBpZiAoY29uZmlnLmR5bmFtb2RiRW5kcG9pbnQpIHtcbiAgICBwcm9jZXNzLmVudi5EWU5BTU9EQl9FTkRQT0lOVCA9IGNvbmZpZy5keW5hbW9kYkVuZHBvaW50O1xuICB9XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgbW9jayBMYW1iZGEgY29udGV4dFxuICovXG5mdW5jdGlvbiBjcmVhdGVNb2NrTGFtYmRhQ29udGV4dCgpOiBhbnkge1xuICByZXR1cm4ge1xuICAgIGNhbGxiYWNrV2FpdHNGb3JFbXB0eUV2ZW50TG9vcDogZmFsc2UsXG4gICAgZnVuY3Rpb25OYW1lOiAnbW9jay1mdW5jdGlvbicsXG4gICAgZnVuY3Rpb25WZXJzaW9uOiAnJExBVEVTVCcsXG4gICAgaW52b2tlZEZ1bmN0aW9uQXJuOiAnYXJuOmF3czpsYW1iZGE6dXMtZWFzdC0xOjEyMzQ1Njc4OTAxMjpmdW5jdGlvbjptb2NrLWZ1bmN0aW9uJyxcbiAgICBtZW1vcnlMaW1pdEluTUI6ICc1MTInLFxuICAgIGF3c1JlcXVlc3RJZDogYG1vY2stcmVxdWVzdC0ke0RhdGUubm93KCl9YCxcbiAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9tb2NrLWZ1bmN0aW9uJyxcbiAgICBsb2dTdHJlYW1OYW1lOiBgJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXX0vWyRMQVRFU1RdJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zdWJzdHJpbmcoNyl9YCxcbiAgICBnZXRSZW1haW5pbmdUaW1lSW5NaWxsaXM6ICgpID0+IDMwMDAwLFxuICAgIGRvbmU6ICgpID0+IHt9LFxuICAgIGZhaWw6ICgpID0+IHt9LFxuICAgIHN1Y2NlZWQ6ICgpID0+IHt9LFxuICB9O1xufVxuIl19