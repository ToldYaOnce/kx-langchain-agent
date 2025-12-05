"use strict";
/**
 * Automated conversation testing for intent detection and contact collection
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestConversationsCommand = createTestConversationsCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const kx_langchain_agent_runtime_1 = require("@toldyaonce/kx-langchain-agent-runtime");
const chat_js_1 = require("./chat.js");
const messages_1 = require("@langchain/core/messages");
const TEST_SCENARIOS = [
    {
        name: "Generic Gym Inquiry",
        description: "User asks generic questions about the gym",
        messages: [
            "Hi Carlos",
            "Tell me more about the gym",
            "I want to know about your facilities"
        ],
        expectedIntents: ["general_inquiry", "general_inquiry", "general_inquiry"],
        expectedBehavior: [
            "Should greet naturally",
            "Should ask for contact info (name, email, phone)",
            "Should still ask for contact info"
        ]
    },
    {
        name: "Specific Pricing Inquiry",
        description: "User asks specifically about prices",
        messages: [
            "Hi Carlos",
            "What are your prices?",
            "How much does membership cost?"
        ],
        expectedIntents: ["general_inquiry", "pricing_request", "pricing_request"],
        expectedBehavior: [
            "Should greet naturally",
            "Should ask for contact info before providing prices",
            "Should ask for contact info before providing prices"
        ]
    },
    {
        name: "Hours Inquiry",
        description: "User asks about gym hours",
        messages: [
            "Hi Carlos",
            "What are your hours?",
            "Are you open right now?"
        ],
        expectedIntents: ["general_inquiry", "business_hours_request", "business_hours_request"],
        expectedBehavior: [
            "Should greet naturally",
            "Should provide hours information",
            "Should provide current status"
        ]
    },
    {
        name: "Contact Collection Flow",
        description: "User provides contact info step by step",
        messages: [
            "Hi Carlos",
            "Tell me about the gym",
            "My name is David",
            "david@email.com",
            "(954) 123-4567"
        ],
        expectedIntents: ["general_inquiry", "general_inquiry", "general_inquiry", "general_inquiry", "general_inquiry"],
        expectedBehavior: [
            "Should greet naturally",
            "Should ask for contact info (name, email, phone)",
            "Should ask for email and phone",
            "Should ask for phone",
            "Should provide gym information"
        ]
    },
    {
        name: "Natural Conversation Flow",
        description: "Carlos should not re-introduce himself or be overly verbose",
        messages: [
            "yo yo yo",
            "Hey, Carlos!",
            "sure... tell me more"
        ],
        expectedIntents: ["general_inquiry", "general_inquiry", "general_inquiry"],
        expectedBehavior: [
            "Should greet naturally without introduction",
            "Should not re-introduce himself",
            "Should ask for contact info briefly without providing gym details"
        ]
    },
    {
        name: "Boxing Personality Test",
        description: "Carlos should use 'champ' and boxing terminology naturally",
        messages: [
            "Hey Carlos!",
            "Tell me about your gym",
            "Sounds great!"
        ],
        expectedIntents: ["general_inquiry", "general_inquiry", "general_inquiry"],
        expectedBehavior: [
            "Should call user 'champ'",
            "Should use boxing terminology and ask for contact info",
            "Should show boxing enthusiasm"
        ]
    },
    {
        name: "Email Channel Test",
        description: "Carlos should only ask for name in email channel",
        messages: [
            "Hi Carlos, I'm interested in your gym",
            "My name is Sarah"
        ],
        expectedIntents: ["general_inquiry", "general_inquiry"],
        expectedBehavior: [
            "Should ask for name only (email channel)",
            "Should provide gym info after getting name"
        ],
        channel: "email"
    },
    {
        name: "SMS Channel Test",
        description: "Carlos should ask for name + email in SMS channel",
        messages: [
            "Hey Carlos, tell me about your gym",
            "I'm Mike, mike@email.com"
        ],
        expectedIntents: ["general_inquiry", "general_inquiry"],
        expectedBehavior: [
            "Should ask for name and email (SMS channel)",
            "Should provide gym info after getting name and email"
        ],
        channel: "sms"
    },
    {
        name: "False Positive Prevention",
        description: "Messages that shouldn't trigger specific intents",
        messages: [
            "Hi Carlos",
            "I sometimes have issues with my schedule",
            "I need time to think about this",
            "My friend told me about your place"
        ],
        expectedIntents: ["general_inquiry", "general_inquiry", "general_inquiry", "general_inquiry"],
        expectedBehavior: [
            "Should greet naturally",
            "Should NOT detect schedule/hours intent",
            "Should NOT detect hours intent",
            "Should respond naturally"
        ]
    }
];
function createTestConversationsCommand() {
    const cmd = new commander_1.Command('test-conversations');
    cmd
        .description('Run automated conversation tests for intent detection and contact collection')
        .option('--scenario <name>', 'Run specific scenario only')
        .option('--verbose', 'Show detailed output')
        .action(async (options) => {
        console.log(chalk_1.default.blue('🧪 Starting Automated Conversation Tests\n'));
        const results = [];
        const scenariosToRun = options.scenario
            ? TEST_SCENARIOS.filter(s => s.name.toLowerCase().includes(options.scenario.toLowerCase()))
            : TEST_SCENARIOS;
        if (scenariosToRun.length === 0) {
            console.log(chalk_1.default.red(`❌ No scenarios found matching: ${options.scenario}`));
            return;
        }
        for (const scenario of scenariosToRun) {
            console.log(chalk_1.default.yellow(`\n📋 Testing: ${scenario.name}`));
            console.log(chalk_1.default.gray(`   ${scenario.description}`));
            // Initialize agent for this scenario
            const config = (0, chat_js_1.createChatConfig)({
                tenantId: 'test',
                email: 'test@example.com',
                persona: 'carlos',
                source: scenario.channel || 'chat', // Use scenario channel or default to chat
                session: `test-${Date.now()}`,
                debug: false,
                historyLimit: '50',
                company: 'RockBox Fitness Coral Springs',
                industry: 'Boxing & HIIT Fitness',
                description: 'High-energy boxing and HIIT fitness studio',
                products: 'Boxing classes, strength training, personal training',
                benefits: 'High-intensity workouts, expert coaching',
                target: 'Fitness enthusiasts seeking challenging workouts',
                differentiators: 'Boxing-focused HIIT, expert trainers'
            });
            const agentService = new kx_langchain_agent_runtime_1.AgentService(config);
            const chatHistory = [];
            // Run through each message in the scenario
            for (let i = 0; i < scenario.messages.length; i++) {
                const message = scenario.messages[i];
                const expectedIntent = scenario.expectedIntents[i];
                const expectedBehavior = scenario.expectedBehavior[i];
                console.log(chalk_1.default.cyan(`\n   👤 User: ${message}`));
                // Add user message to history
                chatHistory.push(new messages_1.HumanMessage(message));
                try {
                    // Process message and capture intent
                    let detectedIntent = 'general_inquiry'; // Default
                    let response = '';
                    // Capture console output to detect intent
                    const originalLog = console.log;
                    let intentOutput = '';
                    console.log = (...args) => {
                        const output = args.join(' ');
                        if (output.includes('🎯 INTENT DETECTED:')) {
                            const match = output.match(/🎯 INTENT DETECTED: (\w+)/);
                            if (match) {
                                detectedIntent = match[1];
                            }
                        }
                        if (output.includes('Intent tracked:')) {
                            const match = output.match(/"intent":\s*"(\w+)"/);
                            if (match) {
                                detectedIntent = match[1];
                            }
                        }
                        intentOutput += output + '\n';
                    };
                    // Process the message
                    const processResult = await agentService.processMessage({
                        tenantId: 'test',
                        email_lc: 'test@example.com',
                        text: message,
                        source: scenario.channel || 'chat', // Use scenario channel
                        conversation_id: `test-${Date.now()}`,
                        channel_context: {
                            [scenario.channel || 'chat']: { sessionId: 'test' }
                        }
                    }, chatHistory);
                    // Restore console.log
                    console.log = originalLog;
                    // Extract response text
                    response = typeof processResult === 'string' ? processResult : processResult.response;
                    // Add agent response to history
                    if (response) {
                        chatHistory.push(new messages_1.AIMessage(response));
                    }
                    // Check results
                    const intentMatch = detectedIntent === expectedIntent;
                    const behaviorCheck = checkBehavior(response, expectedBehavior, chatHistory.length);
                    const result = {
                        scenario: scenario.name,
                        messageIndex: i,
                        message,
                        actualIntent: detectedIntent,
                        expectedIntent,
                        intentMatch,
                        response: response || '(empty response)',
                        behaviorCheck,
                        passed: intentMatch && behaviorCheck.includes('✅')
                    };
                    results.push(result);
                    // Display results
                    const intentStatus = intentMatch ? '✅' : '❌';
                    const behaviorStatus = behaviorCheck.includes('✅') ? '✅' : '❌';
                    console.log(chalk_1.default.gray(`   🎯 Intent: ${detectedIntent} ${intentStatus} (expected: ${expectedIntent})`));
                    console.log(chalk_1.default.gray(`   🤖 Carlos: ${response || '(empty response)'}`));
                    console.log(chalk_1.default.gray(`   📝 Behavior: ${behaviorCheck} ${behaviorStatus}`));
                    if (options.verbose && intentOutput) {
                        console.log(chalk_1.default.gray(`   🔍 Debug: ${intentOutput.trim()}`));
                    }
                }
                catch (error) {
                    console.log(chalk_1.default.red(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`));
                    results.push({
                        scenario: scenario.name,
                        messageIndex: i,
                        message,
                        actualIntent: 'error',
                        expectedIntent,
                        intentMatch: false,
                        response: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        behaviorCheck: '❌ Error occurred',
                        passed: false
                    });
                }
            }
        }
        // Summary
        console.log(chalk_1.default.blue('\n📊 Test Results Summary'));
        console.log(chalk_1.default.blue('========================'));
        const totalTests = results.length;
        const passedTests = results.filter(r => r.passed).length;
        const failedTests = totalTests - passedTests;
        console.log(`Total Tests: ${totalTests}`);
        console.log(chalk_1.default.green(`Passed: ${passedTests}`));
        console.log(chalk_1.default.red(`Failed: ${failedTests}`));
        console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        // Failed tests details
        if (failedTests > 0) {
            console.log(chalk_1.default.red('\n❌ Failed Tests:'));
            results.filter(r => !r.passed).forEach(result => {
                console.log(chalk_1.default.red(`   ${result.scenario} - Message ${result.messageIndex + 1}: "${result.message}"`));
                if (!result.intentMatch) {
                    console.log(chalk_1.default.red(`      Intent: got "${result.actualIntent}", expected "${result.expectedIntent}"`));
                }
                if (!result.behaviorCheck.includes('✅')) {
                    console.log(chalk_1.default.red(`      Behavior: ${result.behaviorCheck}`));
                }
            });
        }
        process.exit(failedTests > 0 ? 1 : 0);
    });
    return cmd;
}
function checkBehavior(response, expectedBehavior, historyLength) {
    const responseLower = response.toLowerCase();
    if (expectedBehavior.includes('Should greet naturally')) {
        if (responseLower.includes('hi') || responseLower.includes('hello') || responseLower.includes('hey')) {
            return '✅ Greeting detected';
        }
        return '❌ No greeting detected';
    }
    if (expectedBehavior.includes('Should ask for contact info')) {
        if (responseLower.includes('name') && (responseLower.includes('email') || responseLower.includes('phone'))) {
            return '✅ Asks for contact info';
        }
        return '❌ Does not ask for contact info';
    }
    if (expectedBehavior.includes('Should provide hours information')) {
        if (responseLower.includes('hours') || responseLower.includes('open') || responseLower.includes('am') || responseLower.includes('pm')) {
            return '✅ Provides hours information';
        }
        return '❌ Does not provide hours information';
    }
    if (expectedBehavior.includes('Should provide gym information')) {
        if (responseLower.includes('membership') || responseLower.includes('$') || responseLower.includes('planet fitness')) {
            return '✅ Provides gym information';
        }
        return '❌ Does not provide gym information';
    }
    if (expectedBehavior.includes('Should NOT detect')) {
        return '✅ Correct intent (general_inquiry)';
    }
    if (expectedBehavior.includes('Should respond naturally')) {
        if (response && response.length > 10) {
            return '✅ Natural response';
        }
        return '❌ No natural response';
    }
    if (expectedBehavior.includes('Should ask for email and phone')) {
        if (responseLower.includes('email') && responseLower.includes('phone')) {
            return '✅ Asks for remaining contact info';
        }
        return '❌ Does not ask for remaining contact info';
    }
    if (expectedBehavior.includes('Should ask for phone')) {
        if (responseLower.includes('phone')) {
            return '✅ Asks for phone number';
        }
        return '❌ Does not ask for phone number';
    }
    if (expectedBehavior.includes('Should still ask for contact info')) {
        if (responseLower.includes('name') || responseLower.includes('email') || responseLower.includes('phone')) {
            return '✅ Still asks for contact info';
        }
        return '❌ Does not ask for contact info';
    }
    if (expectedBehavior.includes('Should greet naturally without introduction')) {
        if (!responseLower.includes('carlos') && !responseLower.includes('my name is') && response.length < 100) {
            return '✅ Natural greeting without introduction';
        }
        return '❌ Re-introduces himself or too verbose';
    }
    if (expectedBehavior.includes('Should not re-introduce himself')) {
        if (!responseLower.includes('carlos') && !responseLower.includes('my name is') && !responseLower.includes("i'm carlos")) {
            return '✅ Does not re-introduce';
        }
        return '❌ Re-introduces himself';
    }
    if (expectedBehavior.includes('Should ask for contact info briefly without providing gym details')) {
        const hasContactRequest = responseLower.includes('name') || responseLower.includes('email') || responseLower.includes('phone');
        const hasGymInfo = responseLower.includes('rockbox fitness') || responseLower.includes('$89') || responseLower.includes('membership') || responseLower.includes('boxing');
        const isBrief = response.length < 200;
        if (hasContactRequest && !hasGymInfo && isBrief) {
            return '✅ Brief contact request without gym details';
        }
        if (hasGymInfo) {
            return '❌ Provides gym info before getting contact details';
        }
        if (!isBrief) {
            return '❌ Response too verbose';
        }
        return '❌ Does not ask for contact info';
    }
    if (expectedBehavior.includes('Should call user \'champ\'')) {
        if (responseLower.includes('champ')) {
            return '✅ Calls user "champ"';
        }
        return '❌ Does not call user "champ"';
    }
    if (expectedBehavior.includes('Should use boxing terminology and ask for contact info')) {
        const hasBoxingTerms = responseLower.includes('champ') || responseLower.includes('knockout') || responseLower.includes('champion') || responseLower.includes('boxing');
        const hasContactRequest = responseLower.includes('name') || responseLower.includes('email') || responseLower.includes('phone');
        if (hasBoxingTerms && hasContactRequest) {
            return '✅ Uses boxing terminology and asks for contact info';
        }
        if (!hasBoxingTerms) {
            return '❌ Missing boxing terminology';
        }
        return '❌ Does not ask for contact info';
    }
    if (expectedBehavior.includes('Should show boxing enthusiasm')) {
        const hasEnthusiasm = responseLower.includes('🥊') || responseLower.includes('champ') || responseLower.includes('knockout') || responseLower.includes('champion');
        if (hasEnthusiasm) {
            return '✅ Shows boxing enthusiasm';
        }
        return '❌ Missing boxing enthusiasm';
    }
    if (expectedBehavior.includes('Should ask for name only (email channel)')) {
        const asksForName = responseLower.includes('name');
        const asksForEmail = responseLower.includes('email');
        const asksForPhone = responseLower.includes('phone');
        if (asksForName && !asksForEmail && !asksForPhone) {
            return '✅ Asks for name only (email channel)';
        }
        if (asksForEmail || asksForPhone) {
            return '❌ Asks for more than name in email channel';
        }
        return '❌ Does not ask for name';
    }
    if (expectedBehavior.includes('Should ask for name and email (SMS channel)')) {
        const asksForName = responseLower.includes('name');
        const asksForEmail = responseLower.includes('email');
        const asksForPhone = responseLower.includes('phone');
        if (asksForName && asksForEmail && !asksForPhone) {
            return '✅ Asks for name and email (SMS channel)';
        }
        if (asksForPhone) {
            return '❌ Asks for phone in SMS channel';
        }
        if (!asksForName || !asksForEmail) {
            return '❌ Missing name or email request';
        }
        return '❌ Incorrect contact request for SMS';
    }
    if (expectedBehavior.includes('Should provide gym info after getting name')) {
        const hasGymInfo = responseLower.includes('rockbox') || responseLower.includes('$89') || responseLower.includes('boxing') || responseLower.includes('membership');
        if (hasGymInfo) {
            return '✅ Provides gym info after getting name';
        }
        return '❌ Does not provide gym info';
    }
    if (expectedBehavior.includes('Should provide gym info after getting name and email')) {
        const hasGymInfo = responseLower.includes('rockbox') || responseLower.includes('$89') || responseLower.includes('boxing') || responseLower.includes('membership');
        if (hasGymInfo) {
            return '✅ Provides gym info after getting name and email';
        }
        return '❌ Does not provide gym info';
    }
    return '❓ Behavior check not implemented';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdC1jb252ZXJzYXRpb25zLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2NvbW1hbmRzL3Rlc3QtY29udmVyc2F0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7Ozs7O0FBMktILHdFQXNMQztBQS9WRCx5Q0FBb0M7QUFDcEMsa0RBQTBCO0FBQzFCLHVGQUFzRTtBQUN0RSx1Q0FBNkM7QUFDN0MsdURBQW1FO0FBV25FLE1BQU0sY0FBYyxHQUFtQjtJQUNyQztRQUNFLElBQUksRUFBRSxxQkFBcUI7UUFDM0IsV0FBVyxFQUFFLDJDQUEyQztRQUN4RCxRQUFRLEVBQUU7WUFDUixXQUFXO1lBQ1gsNEJBQTRCO1lBQzVCLHNDQUFzQztTQUN2QztRQUNELGVBQWUsRUFBRSxDQUFDLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDO1FBQzFFLGdCQUFnQixFQUFFO1lBQ2hCLHdCQUF3QjtZQUN4QixrREFBa0Q7WUFDbEQsbUNBQW1DO1NBQ3BDO0tBQ0Y7SUFDRDtRQUNFLElBQUksRUFBRSwwQkFBMEI7UUFDaEMsV0FBVyxFQUFFLHFDQUFxQztRQUNsRCxRQUFRLEVBQUU7WUFDUixXQUFXO1lBQ1gsdUJBQXVCO1lBQ3ZCLGdDQUFnQztTQUNqQztRQUNELGVBQWUsRUFBRSxDQUFDLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDO1FBQzFFLGdCQUFnQixFQUFFO1lBQ2hCLHdCQUF3QjtZQUN4QixxREFBcUQ7WUFDckQscURBQXFEO1NBQ3REO0tBQ0Y7SUFDRDtRQUNFLElBQUksRUFBRSxlQUFlO1FBQ3JCLFdBQVcsRUFBRSwyQkFBMkI7UUFDeEMsUUFBUSxFQUFFO1lBQ1IsV0FBVztZQUNYLHNCQUFzQjtZQUN0Qix5QkFBeUI7U0FDMUI7UUFDRCxlQUFlLEVBQUUsQ0FBQyxpQkFBaUIsRUFBRSx3QkFBd0IsRUFBRSx3QkFBd0IsQ0FBQztRQUN4RixnQkFBZ0IsRUFBRTtZQUNo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LENBQUM7QUFDNUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQXV0b21hdGVkIGNvbnZlcnNhdGlvbiB0ZXN0aW5nIGZvciBpbnRlbnQgZGV0ZWN0aW9uIGFuZCBjb250YWN0IGNvbGxlY3Rpb25cbiAqL1xuXG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnY29tbWFuZGVyJztcbmltcG9ydCBjaGFsayBmcm9tICdjaGFsayc7XG5pbXBvcnQgeyBBZ2VudFNlcnZpY2UgfSBmcm9tICdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZSc7XG5pbXBvcnQgeyBjcmVhdGVDaGF0Q29uZmlnIH0gZnJvbSAnLi9jaGF0LmpzJztcbmltcG9ydCB7IEh1bWFuTWVzc2FnZSwgQUlNZXNzYWdlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL21lc3NhZ2VzJztcblxuaW50ZXJmYWNlIFRlc3RTY2VuYXJpbyB7XG4gIG5hbWU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgbWVzc2FnZXM6IHN0cmluZ1tdO1xuICBleHBlY3RlZEludGVudHM6IHN0cmluZ1tdO1xuICBleHBlY3RlZEJlaGF2aW9yOiBzdHJpbmdbXTtcbiAgY2hhbm5lbD86IHN0cmluZzsgLy8gT3B0aW9uYWwgY2hhbm5lbCBzcGVjaWZpY2F0aW9uIGZvciB0ZXN0aW5nXG59XG5cbmNvbnN0IFRFU1RfU0NFTkFSSU9TOiBUZXN0U2NlbmFyaW9bXSA9IFtcbiAge1xuICAgIG5hbWU6IFwiR2VuZXJpYyBHeW0gSW5xdWlyeVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlVzZXIgYXNrcyBnZW5lcmljIHF1ZXN0aW9ucyBhYm91dCB0aGUgZ3ltXCIsXG4gICAgbWVzc2FnZXM6IFtcbiAgICAgIFwiSGkgQ2FybG9zXCIsXG4gICAgICBcIlRlbGwgbWUgbW9yZSBhYm91dCB0aGUgZ3ltXCIsXG4gICAgICBcIkkgd2FudCB0byBrbm93IGFib3V0IHlvdXIgZmFjaWxpdGllc1wiXG4gICAgXSxcbiAgICBleHBlY3RlZEludGVudHM6IFtcImdlbmVyYWxfaW5xdWlyeVwiLCBcImdlbmVyYWxfaW5xdWlyeVwiLCBcImdlbmVyYWxfaW5xdWlyeVwiXSxcbiAgICBleHBlY3RlZEJlaGF2aW9yOiBbXG4gICAgICBcIlNob3VsZCBncmVldCBuYXR1cmFsbHlcIiwgXG4gICAgICBcIlNob3VsZCBhc2sgZm9yIGNvbnRhY3QgaW5mbyAobmFtZSwgZW1haWwsIHBob25lKVwiLFxuICAgICAgXCJTaG91bGQgc3RpbGwgYXNrIGZvciBjb250YWN0IGluZm9cIlxuICAgIF1cbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiU3BlY2lmaWMgUHJpY2luZyBJbnF1aXJ5XCIsXG4gICAgZGVzY3JpcHRpb246IFwiVXNlciBhc2tzIHNwZWNpZmljYWxseSBhYm91dCBwcmljZXNcIixcbiAgICBtZXNzYWdlczogW1xuICAgICAgXCJIaSBDYXJsb3NcIixcbiAgICAgIFwiV2hhdCBhcmUgeW91ciBwcmljZXM/XCIsXG4gICAgICBcIkhvdyBtdWNoIGRvZXMgbWVtYmVyc2hpcCBjb3N0P1wiXG4gICAgXSxcbiAgICBleHBlY3RlZEludGVudHM6IFtcImdlbmVyYWxfaW5xdWlyeVwiLCBcInByaWNpbmdfcmVxdWVzdFwiLCBcInByaWNpbmdfcmVxdWVzdFwiXSxcbiAgICBleHBlY3RlZEJlaGF2aW9yOiBbXG4gICAgICBcIlNob3VsZCBncmVldCBuYXR1cmFsbHlcIixcbiAgICAgIFwiU2hvdWxkIGFzayBmb3IgY29udGFjdCBpbmZvIGJlZm9yZSBwcm92aWRpbmcgcHJpY2VzXCIsIFxuICAgICAgXCJTaG91bGQgYXNrIGZvciBjb250YWN0IGluZm8gYmVmb3JlIHByb3ZpZGluZyBwcmljZXNcIlxuICAgIF1cbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiSG91cnMgSW5xdWlyeVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlVzZXIgYXNrcyBhYm91dCBneW0gaG91cnNcIixcbiAgICBtZXNzYWdlczogW1xuICAgICAgXCJIaSBDYXJsb3NcIixcbiAgICAgIFwiV2hhdCBhcmUgeW91ciBob3Vycz9cIixcbiAgICAgIFwiQXJlIHlvdSBvcGVuIHJpZ2h0IG5vdz9cIlxuICAgIF0sXG4gICAgZXhwZWN0ZWRJbnRlbnRzOiBbXCJnZW5lcmFsX2lucXVpcnlcIiwgXCJidXNpbmVzc19ob3Vyc19yZXF1ZXN0XCIsIFwiYnVzaW5lc3NfaG91cnNfcmVxdWVzdFwiXSxcbiAgICBleHBlY3RlZEJlaGF2aW9yOiBbXG4gICAgICBcIlNob3VsZCBncmVldCBuYXR1cmFsbHlcIixcbiAgICAgIFwiU2hvdWxkIHByb3ZpZGUgaG91cnMgaW5mb3JtYXRpb25cIixcbiAgICAgIFwiU2hvdWxkIHByb3ZpZGUgY3VycmVudCBzdGF0dXNcIlxuICAgIF1cbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiQ29udGFjdCBDb2xsZWN0aW9uIEZsb3dcIixcbiAgICBkZXNjcmlwdGlvbjogXCJVc2VyIHByb3ZpZGVzIGNvbnRhY3QgaW5mbyBzdGVwIGJ5IHN0ZXBcIixcbiAgICBtZXNzYWdlczogW1xuICAgICAgXCJIaSBDYXJsb3NcIixcbiAgICAgIFwiVGVsbCBtZSBhYm91dCB0aGUgZ3ltXCIsXG4gICAgICBcIk15IG5hbWUgaXMgRGF2aWRcIixcbiAgICAgIFwiZGF2aWRAZW1haWwuY29tXCIsXG4gICAgICBcIig5NTQpIDEyMy00NTY3XCJcbiAgICBdLFxuICAgIGV4cGVjdGVkSW50ZW50czogW1wiZ2VuZXJhbF9pbnF1aXJ5XCIsIFwiZ2VuZXJhbF9pbnF1aXJ5XCIsIFwiZ2VuZXJhbF9pbnF1aXJ5XCIsIFwiZ2VuZXJhbF9pbnF1aXJ5XCIsIFwiZ2VuZXJhbF9pbnF1aXJ5XCJdLFxuICAgIGV4cGVjdGVkQmVoYXZpb3I6IFtcbiAgICAgIFwiU2hvdWxkIGdyZWV0IG5hdHVyYWxseVwiLFxuICAgICAgXCJTaG91bGQgYXNrIGZvciBjb250YWN0IGluZm8gKG5hbWUsIGVtYWlsLCBwaG9uZSlcIixcbiAgICAgIFwiU2hvdWxkIGFzayBmb3IgZW1haWwgYW5kIHBob25lXCIsIFxuICAgICAgXCJTaG91bGQgYXNrIGZvciBwaG9uZVwiLFxuICAgICAgXCJTaG91bGQgcHJvdmlkZSBneW0gaW5mb3JtYXRpb25cIlxuICAgIF1cbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiTmF0dXJhbCBDb252ZXJzYXRpb24gRmxvd1wiLFxuICAgIGRlc2NyaXB0aW9uOiBcIkNhcmxvcyBzaG91bGQgbm90IHJlLWludHJvZHVjZSBoaW1zZWxmIG9yIGJlIG92ZXJseSB2ZXJib3NlXCIsXG4gICAgbWVzc2FnZXM6IFtcbiAgICAgIFwieW8geW8geW9cIixcbiAgICAgIFwiSGV5LCBDYXJsb3MhXCIsXG4gICAgICBcInN1cmUuLi4gdGVsbCBtZSBtb3JlXCJcbiAgICBdLFxuICAgIGV4cGVjdGVkSW50ZW50czogW1wiZ2VuZXJhbF9pbnF1aXJ5XCIsIFwiZ2VuZXJhbF9pbnF1aXJ5XCIsIFwiZ2VuZXJhbF9pbnF1aXJ5XCJdLFxuICAgIGV4cGVjdGVkQmVoYXZpb3I6IFtcbiAgICAgIFwiU2hvdWxkIGdyZWV0IG5hdHVyYWxseSB3aXRob3V0IGludHJvZHVjdGlvblwiLFxuICAgICAgXCJTaG91bGQgbm90IHJlLWludHJvZHVjZSBoaW1zZWxmXCIsXG4gICAgICBcIlNob3VsZCBhc2sgZm9yIGNvbnRhY3QgaW5mbyBicmllZmx5IHdpdGhvdXQgcHJvdmlkaW5nIGd5bSBkZXRhaWxzXCJcbiAgICBdXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBcIkJveGluZyBQZXJzb25hbGl0eSBUZXN0XCIsXG4gICAgZGVzY3JpcHRpb246IFwiQ2FybG9zIHNob3VsZCB1c2UgJ2NoYW1wJyBhbmQgYm94aW5nIHRlcm1pbm9sb2d5IG5hdHVyYWxseVwiLFxuICAgIG1lc3NhZ2VzOiBbXG4gICAgICBcIkhleSBDYXJsb3MhXCIsXG4gICAgICBcIlRlbGwgbWUgYWJvdXQgeW91ciBneW1cIixcbiAgICAgIFwiU291bmRzIGdyZWF0IVwiXG4gICAgXSxcbiAgICBleHBlY3RlZEludGVudHM6IFtcImdlbmVyYWxfaW5xdWlyeVwiLCBcImdlbmVyYWxfaW5xdWlyeVwiLCBcImdlbmVyYWxfaW5xdWlyeVwiXSxcbiAgICBleHBlY3RlZEJlaGF2aW9yOiBbXG4gICAgICBcIlNob3VsZCBjYWxsIHVzZXIgJ2NoYW1wJ1wiLFxuICAgICAgXCJTaG91bGQgdXNlIGJveGluZyB0ZXJtaW5vbG9neSBhbmQgYXNrIGZvciBjb250YWN0IGluZm9cIixcbiAgICAgIFwiU2hvdWxkIHNob3cgYm94aW5nIGVudGh1c2lhc21cIlxuICAgIF1cbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiRW1haWwgQ2hhbm5lbCBUZXN0XCIsXG4gICAgZGVzY3JpcHRpb246IFwiQ2FybG9zIHNob3VsZCBvbmx5IGFzayBmb3IgbmFtZSBpbiBlbWFpbCBjaGFubmVsXCIsXG4gICAgbWVzc2FnZXM6IFtcbiAgICAgIFwiSGkgQ2FybG9zLCBJJ20gaW50ZXJlc3RlZCBpbiB5b3VyIGd5bVwiLFxuICAgICAgXCJNeSBuYW1lIGlzIFNhcmFoXCJcbiAgICBdLFxuICAgIGV4cGVjdGVkSW50ZW50czogW1wiZ2VuZXJhbF9pbnF1aXJ5XCIsIFwiZ2VuZXJhbF9pbnF1aXJ5XCJdLFxuICAgIGV4cGVjdGVkQmVoYXZpb3I6IFtcbiAgICAgIFwiU2hvdWxkIGFzayBmb3IgbmFtZSBvbmx5IChlbWFpbCBjaGFubmVsKVwiLFxuICAgICAgXCJTaG91bGQgcHJvdmlkZSBneW0gaW5mbyBhZnRlciBnZXR0aW5nIG5hbWVcIlxuICAgIF0sXG4gICAgY2hhbm5lbDogXCJlbWFpbFwiXG4gIH0sXG4gIHtcbiAgICBuYW1lOiBcIlNNUyBDaGFubmVsIFRlc3RcIiwgXG4gICAgZGVzY3JpcHRpb246IFwiQ2FybG9zIHNob3VsZCBhc2sgZm9yIG5hbWUgKyBlbWFpbCBpbiBTTVMgY2hhbm5lbFwiLFxuICAgIG1lc3NhZ2VzOiBbXG4gICAgICBcIkhleSBDYXJsb3MsIHRlbGwgbWUgYWJvdXQgeW91ciBneW1cIixcbiAgICAgIFwiSSdtIE1pa2UsIG1pa2VAZW1haWwuY29tXCJcbiAgICBdLFxuICAgIGV4cGVjdGVkSW50ZW50czogW1wiZ2VuZXJhbF9pbnF1aXJ5XCIsIFwiZ2VuZXJhbF9pbnF1aXJ5XCJdLFxuICAgIGV4cGVjdGVkQmVoYXZpb3I6IFtcbiAgICAgIFwiU2hvdWxkIGFzayBmb3IgbmFtZSBhbmQgZW1haWwgKFNNUyBjaGFubmVsKVwiLFxuICAgICAgXCJTaG91bGQgcHJvdmlkZSBneW0gaW5mbyBhZnRlciBnZXR0aW5nIG5hbWUgYW5kIGVtYWlsXCJcbiAgICBdLFxuICAgIGNoYW5uZWw6IFwic21zXCJcbiAgfSxcbiAge1xuICAgIG5hbWU6IFwiRmFsc2UgUG9zaXRpdmUgUHJldmVudGlvblwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIk1lc3NhZ2VzIHRoYXQgc2hvdWxkbid0IHRyaWdnZXIgc3BlY2lmaWMgaW50ZW50c1wiLFxuICAgIG1lc3NhZ2VzOiBbXG4gICAgICBcIkhpIENhcmxvc1wiLFxuICAgICAgXCJJIHNvbWV0aW1lcyBoYXZlIGlzc3VlcyB3aXRoIG15IHNjaGVkdWxlXCIsXG4gICAgICBcIkkgbmVlZCB0aW1lIHRvIHRoaW5rIGFib3V0IHRoaXNcIixcbiAgICAgIFwiTXkgZnJpZW5kIHRvbGQgbWUgYWJvdXQgeW91ciBwbGFjZVwiXG4gICAgXSxcbiAgICBleHBlY3RlZEludGVudHM6IFtcImdlbmVyYWxfaW5xdWlyeVwiLCBcImdlbmVyYWxfaW5xdWlyeVwiLCBcImdlbmVyYWxfaW5xdWlyeVwiLCBcImdlbmVyYWxfaW5xdWlyeVwiXSxcbiAgICBleHBlY3RlZEJlaGF2aW9yOiBbXG4gICAgICBcIlNob3VsZCBncmVldCBuYXR1cmFsbHlcIixcbiAgICAgIFwiU2hvdWxkIE5PVCBkZXRlY3Qgc2NoZWR1bGUvaG91cnMgaW50ZW50XCIsXG4gICAgICBcIlNob3VsZCBOT1QgZGV0ZWN0IGhvdXJzIGludGVudFwiLFxuICAgICAgXCJTaG91bGQgcmVzcG9uZCBuYXR1cmFsbHlcIlxuICAgIF1cbiAgfVxuXTtcblxuaW50ZXJmYWNlIFRlc3RSZXN1bHQge1xuICBzY2VuYXJpbzogc3RyaW5nO1xuICBtZXNzYWdlSW5kZXg6IG51bWJlcjtcbiAgbWVzc2FnZTogc3RyaW5nO1xuICBhY3R1YWxJbnRlbnQ6IHN0cmluZztcbiAgZXhwZWN0ZWRJbnRlbnQ6IHN0cmluZztcbiAgaW50ZW50TWF0Y2g6IGJvb2xlYW47XG4gIHJlc3BvbnNlOiBzdHJpbmc7XG4gIGJlaGF2aW9yQ2hlY2s6IHN0cmluZztcbiAgcGFzc2VkOiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGVzdENvbnZlcnNhdGlvbnNDb21tYW5kKCk6IENvbW1hbmQge1xuICBjb25zdCBjbWQgPSBuZXcgQ29tbWFuZCgndGVzdC1jb252ZXJzYXRpb25zJyk7XG4gIFxuICBjbWRcbiAgICAuZGVzY3JpcHRpb24oJ1J1biBhdXRvbWF0ZWQgY29udmVyc2F0aW9uIHRlc3RzIGZvciBpbnRlbnQgZGV0ZWN0aW9uIGFuZCBjb250YWN0IGNvbGxlY3Rpb24nKVxuICAgIC5vcHRpb24oJy0tc2NlbmFyaW8gPG5hbWU+JywgJ1J1biBzcGVjaWZpYyBzY2VuYXJpbyBvbmx5JylcbiAgICAub3B0aW9uKCctLXZlcmJvc2UnLCAnU2hvdyBkZXRhaWxlZCBvdXRwdXQnKVxuICAgIC5hY3Rpb24oYXN5bmMgKG9wdGlvbnMpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmJsdWUoJ/Cfp6ogU3RhcnRpbmcgQXV0b21hdGVkIENvbnZlcnNhdGlvbiBUZXN0c1xcbicpKTtcbiAgICAgIFxuICAgICAgY29uc3QgcmVzdWx0czogVGVzdFJlc3VsdFtdID0gW107XG4gICAgICBjb25zdCBzY2VuYXJpb3NUb1J1biA9IG9wdGlvbnMuc2NlbmFyaW8gXG4gICAgICAgID8gVEVTVF9TQ0VOQVJJT1MuZmlsdGVyKHMgPT4gcy5uYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMob3B0aW9ucy5zY2VuYXJpby50b0xvd2VyQ2FzZSgpKSlcbiAgICAgICAgOiBURVNUX1NDRU5BUklPUztcbiAgICAgIFxuICAgICAgaWYgKHNjZW5hcmlvc1RvUnVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhjaGFsay5yZWQoYOKdjCBObyBzY2VuYXJpb3MgZm91bmQgbWF0Y2hpbmc6ICR7b3B0aW9ucy5zY2VuYXJpb31gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgZm9yIChjb25zdCBzY2VuYXJpbyBvZiBzY2VuYXJpb3NUb1J1bikge1xuICAgICAgICBjb25zb2xlLmxvZyhjaGFsay55ZWxsb3coYFxcbvCfk4sgVGVzdGluZzogJHtzY2VuYXJpby5uYW1lfWApKTtcbiAgICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgICAgJHtzY2VuYXJpby5kZXNjcmlwdGlvbn1gKSk7XG4gICAgICAgIFxuICAgICAgICAvLyBJbml0aWFsaXplIGFnZW50IGZvciB0aGlzIHNjZW5hcmlvXG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IGNyZWF0ZUNoYXRDb25maWcoe1xuICAgICAgICAgIHRlbmFudElkOiAndGVzdCcsXG4gICAgICAgICAgZW1haWw6ICd0ZXN0QGV4YW1wbGUuY29tJyxcbiAgICAgICAgICBwZXJzb25hOiAnY2FybG9zJyxcbiAgICAgICAgICBzb3VyY2U6IChzY2VuYXJpby5jaGFubmVsIGFzIGFueSkgfHwgJ2NoYXQnLCAvLyBVc2Ugc2NlbmFyaW8gY2hhbm5lbCBvciBkZWZhdWx0IHRvIGNoYXRcbiAgICAgICAgICBzZXNzaW9uOiBgdGVzdC0ke0RhdGUubm93KCl9YCxcbiAgICAgICAgICBkZWJ1ZzogZmFsc2UsXG4gICAgICAgICAgaGlzdG9yeUxpbWl0OiAnNTAnLFxuICAgICAgICAgIGNvbXBhbnk6ICdSb2NrQm94IEZpdG5lc3MgQ29yYWwgU3ByaW5ncycsXG4gICAgICAgICAgaW5kdXN0cnk6ICdCb3hpbmcgJiBISUlUIEZpdG5lc3MnLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnSGlnaC1lbmVyZ3kgYm94aW5nIGFuZCBISUlUIGZpdG5lc3Mgc3R1ZGlvJyxcbiAgICAgICAgICBwcm9kdWN0czogJ0JveGluZyBjbGFzc2VzLCBzdHJlbmd0aCB0cmFpbmluZywgcGVyc29uYWwgdHJhaW5pbmcnLFxuICAgICAgICAgIGJlbmVmaXRzOiAnSGlnaC1pbnRlbnNpdHkgd29ya291dHMsIGV4cGVydCBjb2FjaGluZycsXG4gICAgICAgICAgdGFyZ2V0OiAnRml0bmVzcyBlbnRodXNpYXN0cyBzZWVraW5nIGNoYWxsZW5naW5nIHdvcmtvdXRzJyxcbiAgICAgICAgICBkaWZmZXJlbnRpYXRvcnM6ICdCb3hpbmctZm9jdXNlZCBISUlULCBleHBlcnQgdHJhaW5lcnMnXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgYWdlbnRTZXJ2aWNlID0gbmV3IEFnZW50U2VydmljZShjb25maWcpO1xuICAgICAgICBjb25zdCBjaGF0SGlzdG9yeTogKEh1bWFuTWVzc2FnZSB8IEFJTWVzc2FnZSlbXSA9IFtdO1xuICAgICAgICBcbiAgICAgICAgLy8gUnVuIHRocm91Z2ggZWFjaCBtZXNzYWdlIGluIHRoZSBzY2VuYXJpb1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjZW5hcmlvLm1lc3NhZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgY29uc3QgbWVzc2FnZSA9IHNjZW5hcmlvLm1lc3NhZ2VzW2ldO1xuICAgICAgICAgIGNvbnN0IGV4cGVjdGVkSW50ZW50ID0gc2NlbmFyaW8uZXhwZWN0ZWRJbnRlbnRzW2ldO1xuICAgICAgICAgIGNvbnN0IGV4cGVjdGVkQmVoYXZpb3IgPSBzY2VuYXJpby5leHBlY3RlZEJlaGF2aW9yW2ldO1xuICAgICAgICAgIFxuICAgICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmN5YW4oYFxcbiAgIPCfkaQgVXNlcjogJHttZXNzYWdlfWApKTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBBZGQgdXNlciBtZXNzYWdlIHRvIGhpc3RvcnlcbiAgICAgICAgICBjaGF0SGlzdG9yeS5wdXNoKG5ldyBIdW1hbk1lc3NhZ2UobWVzc2FnZSkpO1xuICAgICAgICAgIFxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBQcm9jZXNzIG1lc3NhZ2UgYW5kIGNhcHR1cmUgaW50ZW50XG4gICAgICAgICAgICBsZXQgZGV0ZWN0ZWRJbnRlbnQgPSAnZ2VuZXJhbF9pbnF1aXJ5JzsgLy8gRGVmYXVsdFxuICAgICAgICAgICAgbGV0IHJlc3BvbnNlID0gJyc7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIENhcHR1cmUgY29uc29sZSBvdXRwdXQgdG8gZGV0ZWN0IGludGVudFxuICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxMb2cgPSBjb25zb2xlLmxvZztcbiAgICAgICAgICAgIGxldCBpbnRlbnRPdXRwdXQgPSAnJztcbiAgICAgICAgICAgIGNvbnNvbGUubG9nID0gKC4uLmFyZ3MpID0+IHtcbiAgICAgICAgICAgICAgY29uc3Qgb3V0cHV0ID0gYXJncy5qb2luKCcgJyk7XG4gICAgICAgICAgICAgIGlmIChvdXRwdXQuaW5jbHVkZXMoJ/Cfjq8gSU5URU5UIERFVEVDVEVEOicpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBvdXRwdXQubWF0Y2goL/Cfjq8gSU5URU5UIERFVEVDVEVEOiAoXFx3KykvKTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgIGRldGVjdGVkSW50ZW50ID0gbWF0Y2hbMV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChvdXRwdXQuaW5jbHVkZXMoJ0ludGVudCB0cmFja2VkOicpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBvdXRwdXQubWF0Y2goL1wiaW50ZW50XCI6XFxzKlwiKFxcdyspXCIvKTtcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgIGRldGVjdGVkSW50ZW50ID0gbWF0Y2hbMV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGludGVudE91dHB1dCArPSBvdXRwdXQgKyAnXFxuJztcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFByb2Nlc3MgdGhlIG1lc3NhZ2VcbiAgICAgICAgICAgIGNvbnN0IHByb2Nlc3NSZXN1bHQgPSBhd2FpdCBhZ2VudFNlcnZpY2UucHJvY2Vzc01lc3NhZ2Uoe1xuICAgICAgICAgICAgICB0ZW5hbnRJZDogJ3Rlc3QnLFxuICAgICAgICAgICAgICBlbWFpbF9sYzogJ3Rlc3RAZXhhbXBsZS5jb20nLFxuICAgICAgICAgICAgICB0ZXh0OiBtZXNzYWdlLFxuICAgICAgICAgICAgICBzb3VyY2U6IChzY2VuYXJpby5jaGFubmVsIGFzIGFueSkgfHwgJ2NoYXQnLCAvLyBVc2Ugc2NlbmFyaW8gY2hhbm5lbFxuICAgICAgICAgICAgICBjb252ZXJzYXRpb25faWQ6IGB0ZXN0LSR7RGF0ZS5ub3coKX1gLFxuICAgICAgICAgICAgICBjaGFubmVsX2NvbnRleHQ6IHsgXG4gICAgICAgICAgICAgICAgW3NjZW5hcmlvLmNoYW5uZWwgfHwgJ2NoYXQnXTogeyBzZXNzaW9uSWQ6ICd0ZXN0JyB9IFxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBjaGF0SGlzdG9yeSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFJlc3RvcmUgY29uc29sZS5sb2dcbiAgICAgICAgICAgIGNvbnNvbGUubG9nID0gb3JpZ2luYWxMb2c7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIEV4dHJhY3QgcmVzcG9uc2UgdGV4dFxuICAgICAgICAgICAgcmVzcG9uc2UgPSB0eXBlb2YgcHJvY2Vzc1Jlc3VsdCA9PT0gJ3N0cmluZycgPyBwcm9jZXNzUmVzdWx0IDogcHJvY2Vzc1Jlc3VsdC5yZXNwb25zZTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQWRkIGFnZW50IHJlc3BvbnNlIHRvIGhpc3RvcnlcbiAgICAgICAgICAgIGlmIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICBjaGF0SGlzdG9yeS5wdXNoKG5ldyBBSU1lc3NhZ2UocmVzcG9uc2UpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQ2hlY2sgcmVzdWx0c1xuICAgICAgICAgICAgY29uc3QgaW50ZW50TWF0Y2ggPSBkZXRlY3RlZEludGVudCA9PT0gZXhwZWN0ZWRJbnRlbnQ7XG4gICAgICAgICAgICBjb25zdCBiZWhhdmlvckNoZWNrID0gY2hlY2tCZWhhdmlvcihyZXNwb25zZSwgZXhwZWN0ZWRCZWhhdmlvciwgY2hhdEhpc3RvcnkubGVuZ3RoKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3QgcmVzdWx0OiBUZXN0UmVzdWx0ID0ge1xuICAgICAgICAgICAgICBzY2VuYXJpbzogc2NlbmFyaW8ubmFtZSxcbiAgICAgICAgICAgICAgbWVzc2FnZUluZGV4OiBpLFxuICAgICAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgICAgICBhY3R1YWxJbnRlbnQ6IGRldGVjdGVkSW50ZW50LFxuICAgICAgICAgICAgICBleHBlY3RlZEludGVudCxcbiAgICAgICAgICAgICAgaW50ZW50TWF0Y2gsXG4gICAgICAgICAgICAgIHJlc3BvbnNlOiByZXNwb25zZSB8fCAnKGVtcHR5IHJlc3BvbnNlKScsXG4gICAgICAgICAgICAgIGJlaGF2aW9yQ2hlY2ssXG4gICAgICAgICAgICAgIHBhc3NlZDogaW50ZW50TWF0Y2ggJiYgYmVoYXZpb3JDaGVjay5pbmNsdWRlcygn4pyFJylcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJlc3VsdHMucHVzaChyZXN1bHQpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBEaXNwbGF5IHJlc3VsdHNcbiAgICAgICAgICAgIGNvbnN0IGludGVudFN0YXR1cyA9IGludGVudE1hdGNoID8gJ+KchScgOiAn4p2MJztcbiAgICAgICAgICAgIGNvbnN0IGJlaGF2aW9yU3RhdHVzID0gYmVoYXZpb3JDaGVjay5pbmNsdWRlcygn4pyFJykgPyAn4pyFJyA6ICfinYwnO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGAgICDwn46vIEludGVudDogJHtkZXRlY3RlZEludGVudH0gJHtpbnRlbnRTdGF0dXN9IChleHBlY3RlZDogJHtleHBlY3RlZEludGVudH0pYCkpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgICAg8J+kliBDYXJsb3M6ICR7cmVzcG9uc2UgfHwgJyhlbXB0eSByZXNwb25zZSknfWApKTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYCAgIPCfk50gQmVoYXZpb3I6ICR7YmVoYXZpb3JDaGVja30gJHtiZWhhdmlvclN0YXR1c31gKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChvcHRpb25zLnZlcmJvc2UgJiYgaW50ZW50T3V0cHV0KSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYCAgIPCflI0gRGVidWc6ICR7aW50ZW50T3V0cHV0LnRyaW0oKX1gKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5sb2coY2hhbGsucmVkKGAgICDinYwgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApKTtcbiAgICAgICAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgICAgICAgIHNjZW5hcmlvOiBzY2VuYXJpby5uYW1lLFxuICAgICAgICAgICAgICBtZXNzYWdlSW5kZXg6IGksXG4gICAgICAgICAgICAgIG1lc3NhZ2UsXG4gICAgICAgICAgICAgIGFjdHVhbEludGVudDogJ2Vycm9yJyxcbiAgICAgICAgICAgICAgZXhwZWN0ZWRJbnRlbnQsXG4gICAgICAgICAgICAgIGludGVudE1hdGNoOiBmYWxzZSxcbiAgICAgICAgICAgICAgcmVzcG9uc2U6IGBFcnJvcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCxcbiAgICAgICAgICAgICAgYmVoYXZpb3JDaGVjazogJ+KdjCBFcnJvciBvY2N1cnJlZCcsXG4gICAgICAgICAgICAgIHBhc3NlZDogZmFsc2VcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgXG4gICAgICAvLyBTdW1tYXJ5XG4gICAgICBjb25zb2xlLmxvZyhjaGFsay5ibHVlKCdcXG7wn5OKIFRlc3QgUmVzdWx0cyBTdW1tYXJ5JykpO1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuYmx1ZSgnPT09PT09PT09PT09PT09PT09PT09PT09JykpO1xuICAgICAgXG4gICAgICBjb25zdCB0b3RhbFRlc3RzID0gcmVzdWx0cy5sZW5ndGg7XG4gICAgICBjb25zdCBwYXNzZWRUZXN0cyA9IHJlc3VsdHMuZmlsdGVyKHIgPT4gci5wYXNzZWQpLmxlbmd0aDtcbiAgICAgIGNvbnN0IGZhaWxlZFRlc3RzID0gdG90YWxUZXN0cyAtIHBhc3NlZFRlc3RzO1xuICAgICAgXG4gICAgICBjb25zb2xlLmxvZyhgVG90YWwgVGVzdHM6ICR7dG90YWxUZXN0c31gKTtcbiAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKGBQYXNzZWQ6ICR7cGFzc2VkVGVzdHN9YCkpO1xuICAgICAgY29uc29sZS5sb2coY2hhbGsucmVkKGBGYWlsZWQ6ICR7ZmFpbGVkVGVzdHN9YCkpO1xuICAgICAgY29uc29sZS5sb2coYFN1Y2Nlc3MgUmF0ZTogJHsoKHBhc3NlZFRlc3RzIC8gdG90YWxUZXN0cykgKiAxMDApLnRvRml4ZWQoMSl9JWApO1xuICAgICAgXG4gICAgICAvLyBGYWlsZWQgdGVzdHMgZGV0YWlsc1xuICAgICAgaWYgKGZhaWxlZFRlc3RzID4gMCkge1xuICAgICAgICBjb25zb2xlLmxvZyhjaGFsay5yZWQoJ1xcbuKdjCBGYWlsZWQgVGVzdHM6JykpO1xuICAgICAgICByZXN1bHRzLmZpbHRlcihyID0+ICFyLnBhc3NlZCkuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnJlZChgICAgJHtyZXN1bHQuc2NlbmFyaW99IC0gTWVzc2FnZSAke3Jlc3VsdC5tZXNzYWdlSW5kZXggKyAxfTogXCIke3Jlc3VsdC5tZXNzYWdlfVwiYCkpO1xuICAgICAgICAgIGlmICghcmVzdWx0LmludGVudE1hdGNoKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhjaGFsay5yZWQoYCAgICAgIEludGVudDogZ290IFwiJHtyZXN1bHQuYWN0dWFsSW50ZW50fVwiLCBleHBlY3RlZCBcIiR7cmVzdWx0LmV4cGVjdGVkSW50ZW50fVwiYCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXJlc3VsdC5iZWhhdmlvckNoZWNrLmluY2x1ZGVzKCfinIUnKSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coY2hhbGsucmVkKGAgICAgICBCZWhhdmlvcjogJHtyZXN1bHQuYmVoYXZpb3JDaGVja31gKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgcHJvY2Vzcy5leGl0KGZhaWxlZFRlc3RzID4gMCA/IDEgOiAwKTtcbiAgICB9KTtcbiAgXG4gIHJldHVybiBjbWQ7XG59XG5cbmZ1bmN0aW9uIGNoZWNrQmVoYXZpb3IocmVzcG9uc2U6IHN0cmluZywgZXhwZWN0ZWRCZWhhdmlvcjogc3RyaW5nLCBoaXN0b3J5TGVuZ3RoOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCByZXNwb25zZUxvd2VyID0gcmVzcG9uc2UudG9Mb3dlckNhc2UoKTtcbiAgXG4gIGlmIChleHBlY3RlZEJlaGF2aW9yLmluY2x1ZGVzKCdTaG91bGQgZ3JlZXQgbmF0dXJhbGx5JykpIHtcbiAgICBpZiAocmVzcG9uc2VMb3dlci5pbmNsdWRlcygnaGknKSB8fCByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdoZWxsbycpIHx8IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ2hleScpKSB7XG4gICAgICByZXR1cm4gJ+KchSBHcmVldGluZyBkZXRlY3RlZCc7XG4gICAgfVxuICAgIHJldHVybiAn4p2MIE5vIGdyZWV0aW5nIGRldGVjdGVkJztcbiAgfVxuICBcbiAgaWYgKGV4cGVjdGVkQmVoYXZpb3IuaW5jbHVkZXMoJ1Nob3VsZCBhc2sgZm9yIGNvbnRhY3QgaW5mbycpKSB7XG4gICAgaWYgKHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ25hbWUnKSAmJiAocmVzcG9uc2VMb3dlci5pbmNsdWRlcygnZW1haWwnKSB8fCByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdwaG9uZScpKSkge1xuICAgICAgcmV0dXJuICfinIUgQXNrcyBmb3IgY29udGFjdCBpbmZvJztcbiAgICB9XG4gICAgcmV0dXJuICfinYwgRG9lcyBub3QgYXNrIGZvciBjb250YWN0IGluZm8nO1xuICB9XG4gIFxuICBpZiAoZXhwZWN0ZWRCZWhhdmlvci5pbmNsdWRlcygnU2hvdWxkIHByb3ZpZGUgaG91cnMgaW5mb3JtYXRpb24nKSkge1xuICAgIGlmIChyZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdob3VycycpIHx8IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ29wZW4nKSB8fCByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdhbScpIHx8IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ3BtJykpIHtcbiAgICAgIHJldHVybiAn4pyFIFByb3ZpZGVzIGhvdXJzIGluZm9ybWF0aW9uJztcbiAgICB9XG4gICAgcmV0dXJuICfinYwgRG9lcyBub3QgcHJvdmlkZSBob3VycyBpbmZvcm1hdGlvbic7XG4gIH1cbiAgXG4gIGlmIChleHBlY3RlZEJlaGF2aW9yLmluY2x1ZGVzKCdTaG91bGQgcHJvdmlkZSBneW0gaW5mb3JtYXRpb24nKSkge1xuICAgIGlmIChyZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdtZW1iZXJzaGlwJykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnJCcpIHx8IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ3BsYW5ldCBmaXRuZXNzJykpIHtcbiAgICAgIHJldHVybiAn4pyFIFByb3ZpZGVzIGd5bSBpbmZvcm1hdGlvbic7XG4gICAgfVxuICAgIHJldHVybiAn4p2MIERvZXMgbm90IHByb3ZpZGUgZ3ltIGluZm9ybWF0aW9uJztcbiAgfVxuICBcbiAgaWYgKGV4cGVjdGVkQmVoYXZpb3IuaW5jbHVkZXMoJ1Nob3VsZCBOT1QgZGV0ZWN0JykpIHtcbiAgICByZXR1cm4gJ+KchSBDb3JyZWN0IGludGVudCAoZ2VuZXJhbF9pbnF1aXJ5KSc7XG4gIH1cbiAgXG4gIGlmIChleHBlY3RlZEJlaGF2aW9yLmluY2x1ZGVzKCdTaG91bGQgcmVzcG9uZCBuYXR1cmFsbHknKSkge1xuICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5sZW5ndGggPiAxMCkge1xuICAgICAgcmV0dXJuICfinIUgTmF0dXJhbCByZXNwb25zZSc7XG4gICAgfVxuICAgIHJldHVybiAn4p2MIE5vIG5hdHVyYWwgcmVzcG9uc2UnO1xuICB9XG4gIFxuICBpZiAoZXhwZWN0ZWRCZWhhdmlvci5pbmNsdWRlcygnU2hvdWxkIGFzayBmb3IgZW1haWwgYW5kIHBob25lJykpIHtcbiAgICBpZiAocmVzcG9uc2VMb3dlci5pbmNsdWRlcygnZW1haWwnKSAmJiByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdwaG9uZScpKSB7XG4gICAgICByZXR1cm4gJ+KchSBBc2tzIGZvciByZW1haW5pbmcgY29udGFjdCBpbmZvJztcbiAgICB9XG4gICAgcmV0dXJuICfinYwgRG9lcyBub3QgYXNrIGZvciByZW1haW5pbmcgY29udGFjdCBpbmZvJztcbiAgfVxuICBcbiAgaWYgKGV4cGVjdGVkQmVoYXZpb3IuaW5jbHVkZXMoJ1Nob3VsZCBhc2sgZm9yIHBob25lJykpIHtcbiAgICBpZiAocmVzcG9uc2VMb3dlci5pbmNsdWRlcygncGhvbmUnKSkge1xuICAgICAgcmV0dXJuICfinIUgQXNrcyBmb3IgcGhvbmUgbnVtYmVyJztcbiAgICB9XG4gICAgcmV0dXJuICfinYwgRG9lcyBub3QgYXNrIGZvciBwaG9uZSBudW1iZXInO1xuICB9XG4gIFxuICBpZiAoZXhwZWN0ZWRCZWhhdmlvci5pbmNsdWRlcygnU2hvdWxkIHN0aWxsIGFzayBmb3IgY29udGFjdCBpbmZvJykpIHtcbiAgICBpZiAocmVzcG9uc2VMb3dlci5pbmNsdWRlcygnbmFtZScpIHx8IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ2VtYWlsJykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygncGhvbmUnKSkge1xuICAgICAgcmV0dXJuICfinIUgU3RpbGwgYXNrcyBmb3IgY29udGFjdCBpbmZvJztcbiAgICB9XG4gICAgcmV0dXJuICfinYwgRG9lcyBub3QgYXNrIGZvciBjb250YWN0IGluZm8nO1xuICB9XG4gIFxuICBpZiAoZXhwZWN0ZWRCZWhhdmlvci5pbmNsdWRlcygnU2hvdWxkIGdyZWV0IG5hdHVyYWxseSB3aXRob3V0IGludHJvZHVjdGlvbicpKSB7XG4gICAgaWYgKCFyZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdjYXJsb3MnKSAmJiAhcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnbXkgbmFtZSBpcycpICYmIHJlc3BvbnNlLmxlbmd0aCA8IDEwMCkge1xuICAgICAgcmV0dXJuICfinIUgTmF0dXJhbCBncmVldGluZyB3aXRob3V0IGludHJvZHVjdGlvbic7XG4gICAgfVxuICAgIHJldHVybiAn4p2MIFJlLWludHJvZHVjZXMgaGltc2VsZiBvciB0b28gdmVyYm9zZSc7XG4gIH1cbiAgXG4gIGlmIChleHBlY3RlZEJlaGF2aW9yLmluY2x1ZGVzKCdTaG91bGQgbm90IHJlLWludHJvZHVjZSBoaW1zZWxmJykpIHtcbiAgICBpZiAoIXJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ2NhcmxvcycpICYmICFyZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdteSBuYW1lIGlzJykgJiYgIXJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoXCJpJ20gY2FybG9zXCIpKSB7XG4gICAgICByZXR1cm4gJ+KchSBEb2VzIG5vdCByZS1pbnRyb2R1Y2UnO1xuICAgIH1cbiAgICByZXR1cm4gJ+KdjCBSZS1pbnRyb2R1Y2VzIGhpbXNlbGYnO1xuICB9XG4gIFxuICBpZiAoZXhwZWN0ZWRCZWhhdmlvci5pbmNsdWRlcygnU2hvdWxkIGFzayBmb3IgY29udGFjdCBpbmZvIGJyaWVmbHkgd2l0aG91dCBwcm92aWRpbmcgZ3ltIGRldGFpbHMnKSkge1xuICAgIGNvbnN0IGhhc0NvbnRhY3RSZXF1ZXN0ID0gcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnbmFtZScpIHx8IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ2VtYWlsJykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygncGhvbmUnKTtcbiAgICBjb25zdCBoYXNHeW1JbmZvID0gcmVzcG9uc2VMb3dlci5pbmNsdWRlcygncm9ja2JveCBmaXRuZXNzJykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnJDg5JykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnbWVtYmVyc2hpcCcpIHx8IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ2JveGluZycpO1xuICAgIGNvbnN0IGlzQnJpZWYgPSByZXNwb25zZS5sZW5ndGggPCAyMDA7XG4gICAgXG4gICAgaWYgKGhhc0NvbnRhY3RSZXF1ZXN0ICYmICFoYXNHeW1JbmZvICYmIGlzQnJpZWYpIHtcbiAgICAgIHJldHVybiAn4pyFIEJyaWVmIGNvbnRhY3QgcmVxdWVzdCB3aXRob3V0IGd5bSBkZXRhaWxzJztcbiAgICB9XG4gICAgaWYgKGhhc0d5bUluZm8pIHtcbiAgICAgIHJldHVybiAn4p2MIFByb3ZpZGVzIGd5bSBpbmZvIGJlZm9yZSBnZXR0aW5nIGNvbnRhY3QgZGV0YWlscyc7XG4gICAgfVxuICAgIGlmICghaXNCcmllZikge1xuICAgICAgcmV0dXJuICfinYwgUmVzcG9uc2UgdG9vIHZlcmJvc2UnO1xuICAgIH1cbiAgICByZXR1cm4gJ+KdjCBEb2VzIG5vdCBhc2sgZm9yIGNvbnRhY3QgaW5mbyc7XG4gIH1cbiAgXG4gIGlmIChleHBlY3RlZEJlaGF2aW9yLmluY2x1ZGVzKCdTaG91bGQgY2FsbCB1c2VyIFxcJ2NoYW1wXFwnJykpIHtcbiAgICBpZiAocmVzcG9uc2VMb3dlci5pbmNsdWRlcygnY2hhbXAnKSkge1xuICAgICAgcmV0dXJuICfinIUgQ2FsbHMgdXNlciBcImNoYW1wXCInO1xuICAgIH1cbiAgICByZXR1cm4gJ+KdjCBEb2VzIG5vdCBjYWxsIHVzZXIgXCJjaGFtcFwiJztcbiAgfVxuICBcbiAgaWYgKGV4cGVjdGVkQmVoYXZpb3IuaW5jbHVkZXMoJ1Nob3VsZCB1c2UgYm94aW5nIHRlcm1pbm9sb2d5IGFuZCBhc2sgZm9yIGNvbnRhY3QgaW5mbycpKSB7XG4gICAgY29uc3QgaGFzQm94aW5nVGVybXMgPSByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdjaGFtcCcpIHx8IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ2tub2Nrb3V0JykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnY2hhbXBpb24nKSB8fCByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdib3hpbmcnKTtcbiAgICBjb25zdCBoYXNDb250YWN0UmVxdWVzdCA9IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ25hbWUnKSB8fCByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdlbWFpbCcpIHx8IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ3Bob25lJyk7XG4gICAgXG4gICAgaWYgKGhhc0JveGluZ1Rlcm1zICYmIGhhc0NvbnRhY3RSZXF1ZXN0KSB7XG4gICAgICByZXR1cm4gJ+KchSBVc2VzIGJveGluZyB0ZXJtaW5vbG9neSBhbmQgYXNrcyBmb3IgY29udGFjdCBpbmZvJztcbiAgICB9XG4gICAgaWYgKCFoYXNCb3hpbmdUZXJtcykge1xuICAgICAgcmV0dXJuICfinYwgTWlzc2luZyBib3hpbmcgdGVybWlub2xvZ3knO1xuICAgIH1cbiAgICByZXR1cm4gJ+KdjCBEb2VzIG5vdCBhc2sgZm9yIGNvbnRhY3QgaW5mbyc7XG4gIH1cbiAgXG4gIGlmIChleHBlY3RlZEJlaGF2aW9yLmluY2x1ZGVzKCdTaG91bGQgc2hvdyBib3hpbmcgZW50aHVzaWFzbScpKSB7XG4gICAgY29uc3QgaGFzRW50aHVzaWFzbSA9IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ/CfpYonKSB8fCByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdjaGFtcCcpIHx8IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ2tub2Nrb3V0JykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnY2hhbXBpb24nKTtcbiAgICBcbiAgICBpZiAoaGFzRW50aHVzaWFzbSkge1xuICAgICAgcmV0dXJuICfinIUgU2hvd3MgYm94aW5nIGVudGh1c2lhc20nO1xuICAgIH1cbiAgICByZXR1cm4gJ+KdjCBNaXNzaW5nIGJveGluZyBlbnRodXNpYXNtJztcbiAgfVxuICBcbiAgaWYgKGV4cGVjdGVkQmVoYXZpb3IuaW5jbHVkZXMoJ1Nob3VsZCBhc2sgZm9yIG5hbWUgb25seSAoZW1haWwgY2hhbm5lbCknKSkge1xuICAgIGNvbnN0IGFza3NGb3JOYW1lID0gcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnbmFtZScpO1xuICAgIGNvbnN0IGFza3NGb3JFbWFpbCA9IHJlc3BvbnNlTG93ZXIuaW5jbHVkZXMoJ2VtYWlsJyk7XG4gICAgY29uc3QgYXNrc0ZvclBob25lID0gcmVzcG9uc2VMb3dlci5pbmNsdWRlcygncGhvbmUnKTtcbiAgICBcbiAgICBpZiAoYXNrc0Zvck5hbWUgJiYgIWFza3NGb3JFbWFpbCAmJiAhYXNrc0ZvclBob25lKSB7XG4gICAgICByZXR1cm4gJ+KchSBBc2tzIGZvciBuYW1lIG9ubHkgKGVtYWlsIGNoYW5uZWwpJztcbiAgICB9XG4gICAgaWYgKGFza3NGb3JFbWFpbCB8fCBhc2tzRm9yUGhvbmUpIHtcbiAgICAgIHJldHVybiAn4p2MIEFza3MgZm9yIG1vcmUgdGhhbiBuYW1lIGluIGVtYWlsIGNoYW5uZWwnO1xuICAgIH1cbiAgICByZXR1cm4gJ+KdjCBEb2VzIG5vdCBhc2sgZm9yIG5hbWUnO1xuICB9XG4gIFxuICBpZiAoZXhwZWN0ZWRCZWhhdmlvci5pbmNsdWRlcygnU2hvdWxkIGFzayBmb3IgbmFtZSBhbmQgZW1haWwgKFNNUyBjaGFubmVsKScpKSB7XG4gICAgY29uc3QgYXNrc0Zvck5hbWUgPSByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCduYW1lJyk7XG4gICAgY29uc3QgYXNrc0ZvckVtYWlsID0gcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnZW1haWwnKTtcbiAgICBjb25zdCBhc2tzRm9yUGhvbmUgPSByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdwaG9uZScpO1xuICAgIFxuICAgIGlmIChhc2tzRm9yTmFtZSAmJiBhc2tzRm9yRW1haWwgJiYgIWFza3NGb3JQaG9uZSkge1xuICAgICAgcmV0dXJuICfinIUgQXNrcyBmb3IgbmFtZSBhbmQgZW1haWwgKFNNUyBjaGFubmVsKSc7XG4gICAgfVxuICAgIGlmIChhc2tzRm9yUGhvbmUpIHtcbiAgICAgIHJldHVybiAn4p2MIEFza3MgZm9yIHBob25lIGluIFNNUyBjaGFubmVsJztcbiAgICB9XG4gICAgaWYgKCFhc2tzRm9yTmFtZSB8fCAhYXNrc0ZvckVtYWlsKSB7XG4gICAgICByZXR1cm4gJ+KdjCBNaXNzaW5nIG5hbWUgb3IgZW1haWwgcmVxdWVzdCc7XG4gICAgfVxuICAgIHJldHVybiAn4p2MIEluY29ycmVjdCBjb250YWN0IHJlcXVlc3QgZm9yIFNNUyc7XG4gIH1cbiAgXG4gIGlmIChleHBlY3RlZEJlaGF2aW9yLmluY2x1ZGVzKCdTaG91bGQgcHJvdmlkZSBneW0gaW5mbyBhZnRlciBnZXR0aW5nIG5hbWUnKSkge1xuICAgIGNvbnN0IGhhc0d5bUluZm8gPSByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdyb2NrYm94JykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnJDg5JykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnYm94aW5nJykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnbWVtYmVyc2hpcCcpO1xuICAgIFxuICAgIGlmIChoYXNHeW1JbmZvKSB7XG4gICAgICByZXR1cm4gJ+KchSBQcm92aWRlcyBneW0gaW5mbyBhZnRlciBnZXR0aW5nIG5hbWUnO1xuICAgIH1cbiAgICByZXR1cm4gJ+KdjCBEb2VzIG5vdCBwcm92aWRlIGd5bSBpbmZvJztcbiAgfVxuICBcbiAgaWYgKGV4cGVjdGVkQmVoYXZpb3IuaW5jbHVkZXMoJ1Nob3VsZCBwcm92aWRlIGd5bSBpbmZvIGFmdGVyIGdldHRpbmcgbmFtZSBhbmQgZW1haWwnKSkge1xuICAgIGNvbnN0IGhhc0d5bUluZm8gPSByZXNwb25zZUxvd2VyLmluY2x1ZGVzKCdyb2NrYm94JykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnJDg5JykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnYm94aW5nJykgfHwgcmVzcG9uc2VMb3dlci5pbmNsdWRlcygnbWVtYmVyc2hpcCcpO1xuICAgIFxuICAgIGlmIChoYXNHeW1JbmZvKSB7XG4gICAgICByZXR1cm4gJ+KchSBQcm92aWRlcyBneW0gaW5mbyBhZnRlciBnZXR0aW5nIG5hbWUgYW5kIGVtYWlsJztcbiAgICB9XG4gICAgcmV0dXJuICfinYwgRG9lcyBub3QgcHJvdmlkZSBneW0gaW5mbyc7XG4gIH1cbiAgXG4gIHJldHVybiAn4p2TIEJlaGF2aW9yIGNoZWNrIG5vdCBpbXBsZW1lbnRlZCc7XG59XG4iXX0=