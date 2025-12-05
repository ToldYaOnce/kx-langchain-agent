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
exports.chatCommand = chatCommand;
exports.createChatConfig = createChatConfig;
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const kx_langchain_agent_runtime_1 = require("@toldyaonce/kx-langchain-agent-runtime");
const messages_1 = require("@langchain/core/messages");
const kx_langchain_agent_runtime_2 = require("@toldyaonce/kx-langchain-agent-runtime");
async function chatCommand(options) {
    // Use conversationId or fall back to session (for backwards compat)
    const conversationId = options.conversationId || options.session || `cli-${Date.now()}`;
    console.log(chalk_1.default.blue('🤖 KxGen LangChain Agent - Interactive Chat'));
    console.log(chalk_1.default.gray(`Tenant: ${options.tenantId}`));
    console.log(chalk_1.default.gray(`Email: ${options.email}`));
    console.log(chalk_1.default.gray(`Source: ${options.source}`));
    console.log(chalk_1.default.gray(`Persona: ${options.persona || 'detected from DynamoDB'}`));
    console.log(chalk_1.default.gray(`Conversation ID: ${conversationId}`));
    console.log('');
    try {
        // Load configuration
        const config = createChatConfig(options);
        if (options.debug) {
            console.log(chalk_1.default.yellow('Debug mode enabled'));
            console.log('Config:', JSON.stringify(config, null, 2));
        }
        // Initialize DynamoDB service (SAME AS LAMBDA!)
        const dynamoService = new kx_langchain_agent_runtime_1.DynamoDBService(config);
        const eventBridgeService = new kx_langchain_agent_runtime_1.EventBridgeService(config);
        // Load company info and persona from DynamoDB (SAME AS LAMBDA!)
        let companyInfo = undefined;
        let personaConfig = undefined;
        if (options.tenantId) {
            try {
                console.log(chalk_1.default.gray(`🏢 Loading company info for tenant: ${options.tenantId}`));
                const { DynamoDBClient } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-dynamodb')));
                const { DynamoDBDocumentClient, GetCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/lib-dynamodb')));
                const client = new DynamoDBClient({});
                const docClient = DynamoDBDocumentClient.from(client);
                // Load company info from DelayedReplies-company_info table (SAME AS LAMBDA!)
                const companyResult = await docClient.send(new GetCommand({
                    TableName: process.env.COMPANY_INFO_TABLE || 'DelayedReplies-company-info',
                    Key: {
                        tenantId: options.tenantId
                    }
                }));
                if (companyResult.Item) {
                    companyInfo = {
                        name: companyResult.Item.name,
                        industry: companyResult.Item.industry,
                        description: companyResult.Item.description,
                        products: companyResult.Item.products,
                        benefits: companyResult.Item.benefits,
                        targetCustomers: companyResult.Item.targetCustomers,
                        differentiators: companyResult.Item.differentiators,
                        phone: companyResult.Item.phone,
                        website: companyResult.Item.website,
                        goalConfiguration: companyResult.Item.goalConfiguration,
                        responseGuidelines: companyResult.Item.responseGuidelines,
                    };
                    console.log(chalk_1.default.green(`✅ Loaded company info: ${companyInfo.name} (${companyInfo.industry})`));
                    if (companyInfo.goalConfiguration?.enabled) {
                        console.log(chalk_1.default.green(`🎯 Company-level goals enabled: ${companyInfo.goalConfiguration.goals?.length || 0} goals configured`));
                    }
                }
                else {
                    console.log(chalk_1.default.yellow(`⚠️  No company info found for tenant ${options.tenantId}`));
                }
                // Load persona from DelayedReplies-personas table (SAME AS LAMBDA!)
                if (options.persona) {
                    const personaResult = await docClient.send(new GetCommand({
                        TableName: process.env.PERSONAS_TABLE || 'DelayedReplies-personas',
                        Key: {
                            tenantId: options.tenantId,
                            personaId: options.persona
                        }
                    }));
                    if (personaResult.Item) {
                        personaConfig = personaResult.Item;
                        console.log(chalk_1.default.green(`✅ Loaded persona from DynamoDB: ${personaConfig.name || options.persona}`));
                    }
                    else {
                        console.log(chalk_1.default.yellow(`⚠️  No persona found for ${options.tenantId}/${options.persona}`));
                    }
                }
            }
            catch (error) {
                console.error(chalk_1.default.red('❌ Error loading company info/persona:'), error);
            }
        }
        // Initialize agent service (SAME AS LAMBDA!)
        // Use DB-loaded companyInfo, or fall back to config.companyInfo (which has goalConfiguration)
        const agentService = new kx_langchain_agent_runtime_1.AgentService({
            ...config,
            dynamoService,
            eventBridgeService,
            companyInfo: companyInfo || config.companyInfo,
            personaId: options.persona,
            persona: personaConfig,
        });
        // Maintain chat history for CLI (will be passed to agent)
        const chatHistory = [];
        // Normalize email
        const emailLc = options.email.toLowerCase();
        console.log(chalk_1.default.green('✅ Agent initialized successfully'));
        // Show persona greeting
        try {
            const personaService = new kx_langchain_agent_runtime_2.PersonaService(null);
            const persona = await personaService.getPersona('dev-test', options.persona || 'carlos', config.companyInfo);
            const greeting = kx_langchain_agent_runtime_1.GreetingService.generateGreeting((persona.greetings || persona.greetingConfig), config.companyInfo);
            console.log(chalk_1.default.green('🤖 ' + persona.name + ':'), greeting);
        }
        catch (error) {
            console.log(chalk_1.default.green('🤖 Agent:'), 'Hello! How can I help you today?');
        }
        console.log(chalk_1.default.gray('\nType "exit" to quit, "clear" to clear history\n'));
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
                await clearChatHistory(dynamoService, options.tenantId, emailLc, conversationId);
                console.log(chalk_1.default.green('🧹 Chat history cleared\n'));
                continue;
            }
            // Process message with agent
            const spinner = (0, ora_1.default)('🤔 Agent is thinking...').start();
            try {
                // Process message with chat history (SAME AS LAMBDA!)
                const response = await agentService.processMessage({
                    tenantId: options.tenantId,
                    email_lc: emailLc,
                    text: trimmedMessage,
                    source: options.source,
                    conversation_id: conversationId, // ← This is the channel ID!
                    channel_context: {
                        chat: {
                            sessionId: conversationId,
                        },
                    },
                }, chatHistory);
                // Add agent response to chat history
                const responseText = typeof response === 'string' ? response : response.response;
                chatHistory.push(new messages_1.AIMessage(responseText));
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
            name: options.company || 'KxGrynde Fitness',
            industry: options.industry || 'Fitness & Wellness',
            description: options.description || 'Premium fitness center offering personalized training, group classes, and wellness programs',
            services: [
                'Personal Training (One-on-One)',
                'Group Fitness Classes',
                'Nutrition Coaching',
                'Body Composition Analysis',
                'Custom Meal Planning',
                'Functional Training',
                'HIIT (High-Intensity Interval Training)',
                'Strength & Conditioning',
                'Cardio Equipment Access',
                'Free Weights & Machines'
            ],
            phone: '+1-555-KXGRYNDE',
            email: 'info@kxgrynde.com',
            website: 'https://kxgrynde.com',
            address: {
                street: '123 Fitness Boulevard',
                city: 'Your City',
                state: 'Your State',
                zipCode: '12345',
                country: 'USA'
            },
            businessHours: {
                monday: [{ from: '05:00', to: '11:00' }, { from: '16:00', to: '23:00' }],
                tuesday: [{ from: '05:00', to: '23:00' }],
                wednesday: [{ from: '05:00', to: '12:00' }, { from: '14:00', to: '23:00' }],
                thursday: [{ from: '05:00', to: '23:00' }],
                friday: [{ from: '05:00', to: '22:00' }],
                saturday: [{ from: '06:00', to: '21:00' }],
                sunday: [{ from: '07:00', to: '20:00' }]
            },
            pricing: {
                plans: [
                    {
                        id: 'basic',
                        name: 'Basic Membership',
                        price: '$39/month',
                        description: 'Perfect for getting started on your fitness journey',
                        features: [
                            '24/7 gym access',
                            'Locker room access',
                            'Free fitness assessment',
                            'Access to cardio & strength equipment'
                        ],
                        cta: 'Start Your Journey'
                    },
                    {
                        id: 'premium',
                        name: 'Premium Membership',
                        price: '$79/month',
                        description: 'Everything you need to crush your goals',
                        features: [
                            'Everything in Basic',
                            '2 personal training sessions/month',
                            'Unlimited group fitness classes',
                            'Nutrition consultation',
                            'Guest privileges (2/month)'
                        ],
                        popular: true,
                        cta: 'Go Premium'
                    },
                    {
                        id: 'elite',
                        name: 'Elite Training',
                        price: '$149/month',
                        description: 'For serious athletes who demand results',
                        features: [
                            'Everything in Premium',
                            '8 personal training sessions/month',
                            'Custom meal planning',
                            'Body composition analysis',
                            'Priority class booking',
                            'Unlimited guest privileges'
                        ],
                        cta: 'Train Like a Pro'
                    }
                ],
                customPricingAvailable: true,
                contactForPricing: false // Agent can share pricing without requiring contact info first
            },
            promotions: [
                {
                    id: 'new_year_special',
                    title: 'New Year, New You Special',
                    description: 'Start your fitness journey with massive savings',
                    urgencyMessage: 'Sign up now and get 50% off your first 3 months!',
                    discount: '50% off first 3 months',
                    validUntil: '2025-12-31T23:59:59Z',
                    conditions: [
                        'First-time members only',
                        'Must sign up by December 31, 2025',
                        'Applies to Basic and Premium plans only'
                    ],
                    applicablePlans: ['basic', 'premium']
                },
                {
                    id: 'bring_a_friend',
                    title: 'Bring a Friend, Get Rewards',
                    description: 'Refer a friend and both of you save big',
                    urgencyMessage: 'Refer a friend this month and you both get $50 off!',
                    discount: '$50 credit per referral',
                    validUntil: '2025-12-31T23:59:59Z',
                    conditions: [
                        'Both members must be active',
                        'Friend must sign up for at least 3 months',
                        'Unlimited referrals'
                    ],
                    applicablePlans: ['basic', 'premium', 'elite']
                }
            ],
            goalConfiguration: {
                enabled: true,
                globalSettings: {
                    adaptToUrgency: true,
                    interestThreshold: 5,
                    maxActiveGoals: 3,
                    maxGoalsPerTurn: 2,
                    respectDeclines: true,
                    strictOrdering: 0
                },
                goals: [
                    {
                        id: 'collect_identity',
                        name: 'Get Name',
                        description: "Get the user's name for personalization",
                        type: 'data_collection',
                        priority: 'high',
                        order: 1,
                        adherence: 6,
                        triggers: { messageCount: 0 },
                        dataToCapture: {
                            fields: ['firstName', 'lastName', 'gender'],
                            validationRules: {
                                firstName: { required: true },
                                lastName: { required: false },
                                gender: { required: false } // Auto-detected from name
                            }
                        },
                        behavior: { backoffStrategy: 'gentle', maxAttempts: 3 }
                    },
                    {
                        id: 'assess_fitness_goals',
                        name: 'Assess Goals',
                        description: "Understand what the user wants to achieve",
                        type: 'data_collection',
                        priority: 'critical',
                        order: 2,
                        adherence: 7,
                        triggers: { prerequisiteGoals: ['collect_identity'], messageCount: 0 },
                        dataToCapture: {
                            fields: ['primaryGoal', 'motivationReason', 'motivationCategories', 'timeline'],
                            validationRules: {
                                primaryGoal: { required: true },
                                motivationReason: { required: true },
                                motivationCategories: { required: false },
                                timeline: { required: true }
                            }
                        },
                        behavior: { backoffStrategy: 'persistent', maxAttempts: 5 }
                    },
                    {
                        id: 'schedule_consultation',
                        name: 'Schedule Session',
                        description: 'Book initial consultation or training session',
                        type: 'scheduling',
                        priority: 'high',
                        isPrimary: true, // This is the main conversion goal
                        order: 3,
                        adherence: 7,
                        triggers: { prerequisiteGoals: ['assess_fitness_goals'], messageCount: 0 },
                        dataToCapture: {
                            fields: ['preferredDate', 'preferredTime'],
                            validationRules: {
                                preferredDate: { required: true },
                                preferredTime: { required: true }
                            }
                        },
                        behavior: { backoffStrategy: 'gentle', maxAttempts: 5 },
                        actions: {
                            onComplete: [{
                                    type: 'trigger_scheduling_flow',
                                    eventName: 'appointment.consultation_requested',
                                    payload: { appointmentType: 'fitness_consultation', duration: 60 }
                                }]
                        }
                    },
                    {
                        id: 'collect_contact_info',
                        name: 'Contact Info',
                        description: 'Get contact information to confirm booking',
                        type: 'data_collection',
                        priority: 'critical',
                        order: 4,
                        adherence: 8,
                        triggers: { prerequisiteGoals: ['schedule_consultation'], messageCount: 0 },
                        dataToCapture: {
                            fields: ['email', 'phone'],
                            validationRules: {
                                email: { required: true, pattern: '^[^@]+@[^@]+\\.[^@]+$' },
                                phone: { required: true }
                            },
                            completionStrategy: 'all'
                        },
                        behavior: { backoffStrategy: 'persistent', maxAttempts: 5 },
                        actions: {
                            onComplete: [{
                                    type: 'convert_anonymous_to_lead',
                                    eventName: 'lead.contact_captured',
                                    payload: { leadType: 'inbound_fitness', source: 'chat_agent' }
                                }]
                        }
                    },
                    {
                        id: 'collect_body_metrics',
                        name: 'Body Metrics',
                        description: 'Assess current fitness level and body composition',
                        type: 'data_collection',
                        priority: 'medium',
                        order: 5,
                        adherence: 6,
                        triggers: { prerequisiteGoals: ['collect_contact_info'], messageCount: 0 },
                        dataToCapture: {
                            // Height OR weight is required - user typically gives both together
                            // The LLM extracts them as separate fields
                            fields: ['height', 'weight', 'bodyFatPercentage'],
                            validationRules: {
                                height: { required: true },
                                weight: { required: true },
                                bodyFatPercentage: { required: false }
                            }
                        },
                        behavior: { backoffStrategy: 'gentle', maxAttempts: 3 }
                    },
                    {
                        id: 'collect_injuries',
                        name: 'Injuries & Limitations',
                        description: 'Check for any injuries or physical limitations',
                        type: 'data_collection',
                        priority: 'medium',
                        order: 6,
                        adherence: 7,
                        triggers: { prerequisiteGoals: ['collect_body_metrics'], messageCount: 0 },
                        dataToCapture: {
                            // At least one field must be required for the goal to be pursued
                            fields: ['physicalLimitations'],
                            validationRules: {
                                physicalLimitations: { required: true } // Must get an answer (even "none")
                            }
                        },
                        behavior: {
                            backoffStrategy: 'gentle',
                            maxAttempts: 3,
                            message: 'For your safety, I need to know about any injuries or health conditions'
                        }
                    }
                ]
            }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jb21tYW5kcy9jaGF0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBbUNBLGtDQW1NQztBQUtELDRDQW9SQztBQS9mRCx3REFBZ0M7QUFDaEMsa0RBQTBCO0FBQzFCLDhDQUFzQjtBQUN0Qix1RkFRZ0Q7QUFDaEQsdURBQW1FO0FBQ25FLHVGQUF3RTtBQXNCakUsS0FBSyxVQUFVLFdBQVcsQ0FBQyxPQUFvQjtJQUNwRCxvRUFBb0U7SUFDcEUsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLGNBQWMsSUFBSSxPQUFPLENBQUMsT0FBTyxJQUFJLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUM7SUFFeEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLDZDQUE2QyxDQUFDLENBQUMsQ0FBQztJQUN2RSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3ZELE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyxVQUFVLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNyRCxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQUssQ0FBQyxJQUFJLENBQUMsWUFBWSxPQUFPLENBQUMsT0FBTyxJQUFJLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ25GLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBSyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzlE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RSxVQUFVLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksVUFBVSxDQUFDLFVBQVU7UUFDNUQsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFVBQVUsQ0FBQyxTQUFTO1FBQ3pELGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLElBQUksVUFBVSxDQUFDLGdCQUFnQjtRQUM5RSxvQkFBb0IsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixJQUFJLFVBQVUsQ0FBQyxvQkFBb0I7S0FDN0YsQ0FBQztBQUNKLENBQUM7QUFFRDs7R0FFRztBQUNILEtBQUssVUFBVSxnQkFBZ0IsQ0FDN0IsYUFBOEIsRUFDOUIsUUFBZ0IsRUFDaEIsT0FBZSxFQUNmLFNBQWtCO0lBRWxCLG9FQUFvRTtJQUNwRSx3REFBd0Q7SUFDeEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFLLENBQUMsSUFBSSxDQUFDLDJCQUEyQixRQUFRLElBQUksT0FBTyxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsY0FBYyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQzFILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgaW5xdWlyZXIgZnJvbSAnaW5xdWlyZXInO1xuaW1wb3J0IGNoYWxrIGZyb20gJ2NoYWxrJztcbmltcG9ydCBvcmEgZnJvbSAnb3JhJztcbmltcG9ydCB7XG4gIER5bmFtb0RCU2VydmljZSxcbiAgRXZlbnRCcmlkZ2VTZXJ2aWNlLFxuICBBZ2VudFNlcnZpY2UsXG4gIEdyZWV0aW5nU2VydmljZSxcbiAgY3JlYXRlVGVzdENvbmZpZyxcbiAgdHlwZSBSdW50aW1lQ29uZmlnLFxuICB0eXBlIE1lc3NhZ2VTb3VyY2UsXG59IGZyb20gJ0B0b2xkeWFvbmNlL2t4LWxhbmdjaGFpbi1hZ2VudC1ydW50aW1lJztcbmltcG9ydCB7IEh1bWFuTWVzc2FnZSwgQUlNZXNzYWdlIH0gZnJvbSAnQGxhbmdjaGFpbi9jb3JlL21lc3NhZ2VzJztcbmltcG9ydCB7IFBlcnNvbmFTZXJ2aWNlIH0gZnJvbSAnQHRvbGR5YW9uY2Uva3gtbGFuZ2NoYWluLWFnZW50LXJ1bnRpbWUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIENoYXRPcHRpb25zIHtcbiAgdGVuYW50SWQ6IHN0cmluZztcbiAgZW1haWw6IHN0cmluZztcbiAgc291cmNlOiBNZXNzYWdlU291cmNlO1xuICBtb2RlbD86IHN0cmluZztcbiAgcGVyc29uYT86IHN0cmluZztcbiAgY29udmVyc2F0aW9uSWQ/OiBzdHJpbmc7ICAvLyBQcmltYXJ5IG9wdGlvblxuICBzZXNzaW9uPzogc3RyaW5nOyAgICAgICAgICAvLyBEZXByZWNhdGVkIGFsaWFzXG4gIGNvbXBhbnk/OiBzdHJpbmc7XG4gIGluZHVzdHJ5Pzogc3RyaW5nO1xuICBkZXNjcmlwdGlvbj86IHN0cmluZztcbiAgcHJvZHVjdHM/OiBzdHJpbmc7XG4gIGJlbmVmaXRzPzogc3RyaW5nO1xuICB0YXJnZXQ/OiBzdHJpbmc7XG4gIGRpZmZlcmVudGlhdG9ycz86IHN0cmluZztcbiAgcmFnPzogYm9vbGVhbjtcbiAgaGlzdG9yeUxpbWl0OiBzdHJpbmc7XG4gIGRlYnVnPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNoYXRDb21tYW5kKG9wdGlvbnM6IENoYXRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG4gIC8vIFVzZSBjb252ZXJzYXRpb25JZCBvciBmYWxsIGJhY2sgdG8gc2Vzc2lvbiAoZm9yIGJhY2t3YXJkcyBjb21wYXQpXG4gIGNvbnN0IGNvbnZlcnNhdGlvbklkID0gb3B0aW9ucy5jb252ZXJzYXRpb25JZCB8fCBvcHRpb25zLnNlc3Npb24gfHwgYGNsaS0ke0RhdGUubm93KCl9YDtcbiAgXG4gIGNvbnNvbGUubG9nKGNoYWxrLmJsdWUoJ/CfpJYgS3hHZW4gTGFuZ0NoYWluIEFnZW50IC0gSW50ZXJhY3RpdmUgQ2hhdCcpKTtcbiAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgVGVuYW50OiAke29wdGlvbnMudGVuYW50SWR9YCkpO1xuICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KGBFbWFpbDogJHtvcHRpb25zLmVtYWlsfWApKTtcbiAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgU291cmNlOiAke29wdGlvbnMuc291cmNlfWApKTtcbiAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgUGVyc29uYTogJHtvcHRpb25zLnBlcnNvbmEgfHwgJ2RldGVjdGVkIGZyb20gRHluYW1vREInfWApKTtcbiAgY29uc29sZS5sb2coY2hhbGsuZ3JheShgQ29udmVyc2F0aW9uIElEOiAke2NvbnZlcnNhdGlvbklkfWApKTtcbiAgY29uc29sZS5sb2coJycpO1xuXG4gIHRyeSB7XG4gICAgLy8gTG9hZCBjb25maWd1cmF0aW9uXG4gICAgY29uc3QgY29uZmlnID0gY3JlYXRlQ2hhdENvbmZpZyhvcHRpb25zKTtcbiAgICBcbiAgICBpZiAob3B0aW9ucy5kZWJ1Zykge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsueWVsbG93KCdEZWJ1ZyBtb2RlIGVuYWJsZWQnKSk7XG4gICAgICBjb25zb2xlLmxvZygnQ29uZmlnOicsIEpTT04uc3RyaW5naWZ5KGNvbmZpZywgbnVsbCwgMikpO1xuICAgIH1cblxuICAgIC8vIEluaXRpYWxpemUgRHluYW1vREIgc2VydmljZSAoU0FNRSBBUyBMQU1CREEhKVxuICAgIGNvbnN0IGR5bmFtb1NlcnZpY2UgPSBuZXcgRHluYW1vREJTZXJ2aWNlKGNvbmZpZyk7XG4gICAgY29uc3QgZXZlbnRCcmlkZ2VTZXJ2aWNlID0gbmV3IEV2ZW50QnJpZGdlU2VydmljZShjb25maWcpO1xuXG4gICAgLy8gTG9hZCBjb21wYW55IGluZm8gYW5kIHBlcnNvbmEgZnJvbSBEeW5hbW9EQiAoU0FNRSBBUyBMQU1CREEhKVxuICAgIGxldCBjb21wYW55SW5mbzogYW55ID0gdW5kZWZpbmVkO1xuICAgIGxldCBwZXJzb25hQ29uZmlnOiBhbnkgPSB1bmRlZmluZWQ7XG4gICAgXG4gICAgaWYgKG9wdGlvbnMudGVuYW50SWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYPCfj6IgTG9hZGluZyBjb21wYW55IGluZm8gZm9yIHRlbmFudDogJHtvcHRpb25zLnRlbmFudElkfWApKTtcbiAgICAgICAgY29uc3QgeyBEeW5hbW9EQkNsaWVudCB9ID0gYXdhaXQgaW1wb3J0KCdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInKTtcbiAgICAgICAgY29uc3QgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kIH0gPSBhd2FpdCBpbXBvcnQoJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicpO1xuICAgICAgICBjb25zdCBjbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuICAgICAgICBjb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oY2xpZW50KTtcblxuICAgICAgICAvLyBMb2FkIGNvbXBhbnkgaW5mbyBmcm9tIERlbGF5ZWRSZXBsaWVzLWNvbXBhbnlfaW5mbyB0YWJsZSAoU0FNRSBBUyBMQU1CREEhKVxuICAgICAgICBjb25zdCBjb21wYW55UmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xuICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuQ09NUEFOWV9JTkZPX1RBQkxFIHx8ICdEZWxheWVkUmVwbGllcy1jb21wYW55LWluZm8nLFxuICAgICAgICAgIEtleToge1xuICAgICAgICAgICAgdGVuYW50SWQ6IG9wdGlvbnMudGVuYW50SWRcbiAgICAgICAgICB9XG4gICAgICAgIH0pKTtcblxuICAgICAgICBpZiAoY29tcGFueVJlc3VsdC5JdGVtKSB7XG4gICAgICAgICAgY29tcGFueUluZm8gPSB7XG4gICAgICAgICAgICBuYW1lOiBjb21wYW55UmVzdWx0Lkl0ZW0ubmFtZSxcbiAgICAgICAgICAgIGluZHVzdHJ5OiBjb21wYW55UmVzdWx0Lkl0ZW0uaW5kdXN0cnksXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogY29tcGFueVJlc3VsdC5JdGVtLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgcHJvZHVjdHM6IGNvbXBhbnlSZXN1bHQuSXRlbS5wcm9kdWN0cyxcbiAgICAgICAgICAgIGJlbmVmaXRzOiBjb21wYW55UmVzdWx0Lkl0ZW0uYmVuZWZpdHMsXG4gICAgICAgICAgICB0YXJnZXRDdXN0b21lcnM6IGNvbXBhbnlSZXN1bHQuSXRlbS50YXJnZXRDdXN0b21lcnMsXG4gICAgICAgICAgICBkaWZmZXJlbnRpYXRvcnM6IGNvbXBhbnlSZXN1bHQuSXRlbS5kaWZmZXJlbnRpYXRvcnMsXG4gICAgICAgICAgICBwaG9uZTogY29tcGFueVJlc3VsdC5JdGVtLnBob25lLFxuICAgICAgICAgICAgd2Vic2l0ZTogY29tcGFueVJlc3VsdC5JdGVtLndlYnNpdGUsXG4gICAgICAgICAgICBnb2FsQ29uZmlndXJhdGlvbjogY29tcGFueVJlc3VsdC5JdGVtLmdvYWxDb25maWd1cmF0aW9uLFxuICAgICAgICAgICAgcmVzcG9uc2VHdWlkZWxpbmVzOiBjb21wYW55UmVzdWx0Lkl0ZW0ucmVzcG9uc2VHdWlkZWxpbmVzLFxuICAgICAgICAgIH07XG4gICAgICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oYOKchSBMb2FkZWQgY29tcGFueSBpbmZvOiAke2NvbXBhbnlJbmZvLm5hbWV9ICgke2NvbXBhbnlJbmZvLmluZHVzdHJ5fSlgKSk7XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKGNvbXBhbnlJbmZvLmdvYWxDb25maWd1cmF0aW9uPy5lbmFibGVkKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmVlbihg8J+OryBDb21wYW55LWxldmVsIGdvYWxzIGVuYWJsZWQ6ICR7Y29tcGFueUluZm8uZ29hbENvbmZpZ3VyYXRpb24uZ29hbHM/Lmxlbmd0aCB8fCAwfSBnb2FscyBjb25maWd1cmVkYCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhjaGFsay55ZWxsb3coYOKaoO+4jyAgTm8gY29tcGFueSBpbmZvIGZvdW5kIGZvciB0ZW5hbnQgJHtvcHRpb25zLnRlbmFudElkfWApKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIExvYWQgcGVyc29uYSBmcm9tIERlbGF5ZWRSZXBsaWVzLXBlcnNvbmFzIHRhYmxlIChTQU1FIEFTIExBTUJEQSEpXG4gICAgICAgIGlmIChvcHRpb25zLnBlcnNvbmEpIHtcbiAgICAgICAgICBjb25zdCBwZXJzb25hUmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQobmV3IEdldENvbW1hbmQoe1xuICAgICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5QRVJTT05BU19UQUJMRSB8fCAnRGVsYXllZFJlcGxpZXMtcGVyc29uYXMnLFxuICAgICAgICAgICAgS2V5OiB7XG4gICAgICAgICAgICAgIHRlbmFudElkOiBvcHRpb25zLnRlbmFudElkLFxuICAgICAgICAgICAgICBwZXJzb25hSWQ6IG9wdGlvbnMucGVyc29uYVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pKTtcblxuICAgICAgICAgIGlmIChwZXJzb25hUmVzdWx0Lkl0ZW0pIHtcbiAgICAgICAgICAgIHBlcnNvbmFDb25maWcgPSBwZXJzb25hUmVzdWx0Lkl0ZW07XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhjaGFsay5ncmVlbihg4pyFIExvYWRlZCBwZXJzb25hIGZyb20gRHluYW1vREI6ICR7cGVyc29uYUNvbmZpZy5uYW1lIHx8IG9wdGlvbnMucGVyc29uYX1gKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLnllbGxvdyhg4pqg77iPICBObyBwZXJzb25hIGZvdW5kIGZvciAke29wdGlvbnMudGVuYW50SWR9LyR7b3B0aW9ucy5wZXJzb25hfWApKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinYwgRXJyb3IgbG9hZGluZyBjb21wYW55IGluZm8vcGVyc29uYTonKSwgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEluaXRpYWxpemUgYWdlbnQgc2VydmljZSAoU0FNRSBBUyBMQU1CREEhKVxuICAgIC8vIFVzZSBEQi1sb2FkZWQgY29tcGFueUluZm8sIG9yIGZhbGwgYmFjayB0byBjb25maWcuY29tcGFueUluZm8gKHdoaWNoIGhhcyBnb2FsQ29uZmlndXJhdGlvbilcbiAgICBjb25zdCBhZ2VudFNlcnZpY2UgPSBuZXcgQWdlbnRTZXJ2aWNlKHtcbiAgICAgIC4uLmNvbmZpZyxcbiAgICAgIGR5bmFtb1NlcnZpY2UsXG4gICAgICBldmVudEJyaWRnZVNlcnZpY2UsXG4gICAgICBjb21wYW55SW5mbzogY29tcGFueUluZm8gfHwgY29uZmlnLmNvbXBhbnlJbmZvLFxuICAgICAgcGVyc29uYUlkOiBvcHRpb25zLnBlcnNvbmEsXG4gICAgICBwZXJzb25hOiBwZXJzb25hQ29uZmlnLFxuICAgIH0pO1xuICAgIFxuICAgIC8vIE1haW50YWluIGNoYXQgaGlzdG9yeSBmb3IgQ0xJICh3aWxsIGJlIHBhc3NlZCB0byBhZ2VudClcbiAgICBjb25zdCBjaGF0SGlzdG9yeTogKEh1bWFuTWVzc2FnZSB8IEFJTWVzc2FnZSlbXSA9IFtdO1xuXG4gICAgLy8gTm9ybWFsaXplIGVtYWlsXG4gICAgY29uc3QgZW1haWxMYyA9IG9wdGlvbnMuZW1haWwudG9Mb3dlckNhc2UoKTtcblxuICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCfinIUgQWdlbnQgaW5pdGlhbGl6ZWQgc3VjY2Vzc2Z1bGx5JykpO1xuICAgIFxuICAgIC8vIFNob3cgcGVyc29uYSBncmVldGluZ1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwZXJzb25hU2VydmljZSA9IG5ldyBQZXJzb25hU2VydmljZShudWxsKTtcbiAgICAgIGNvbnN0IHBlcnNvbmEgPSBhd2FpdCBwZXJzb25hU2VydmljZS5nZXRQZXJzb25hKCdkZXYtdGVzdCcsIG9wdGlvbnMucGVyc29uYSB8fCAnY2FybG9zJywgY29uZmlnLmNvbXBhbnlJbmZvKTtcbiAgICAgIGNvbnN0IGdyZWV0aW5nID0gR3JlZXRpbmdTZXJ2aWNlLmdlbmVyYXRlR3JlZXRpbmcoKHBlcnNvbmEuZ3JlZXRpbmdzIHx8IHBlcnNvbmEuZ3JlZXRpbmdDb25maWcpIGFzIGFueSwgY29uZmlnLmNvbXBhbnlJbmZvKTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oJ/CfpJYgJyArIHBlcnNvbmEubmFtZSArICc6JyksIGdyZWV0aW5nKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oJ/CfpJYgQWdlbnQ6JyksICdIZWxsbyEgSG93IGNhbiBJIGhlbHAgeW91IHRvZGF5PycpO1xuICAgIH1cbiAgICBcbiAgICBjb25zb2xlLmxvZyhjaGFsay5ncmF5KCdcXG5UeXBlIFwiZXhpdFwiIHRvIHF1aXQsIFwiY2xlYXJcIiB0byBjbGVhciBoaXN0b3J5XFxuJykpO1xuXG4gICAgLy8gSW50ZXJhY3RpdmUgY2hhdCBsb29wXG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGNvbnN0IHsgbWVzc2FnZSB9ID0gYXdhaXQgaW5xdWlyZXIucHJvbXB0KFtcbiAgICAgICAge1xuICAgICAgICAgIHR5cGU6ICdpbnB1dCcsXG4gICAgICAgICAgbmFtZTogJ21lc3NhZ2UnLFxuICAgICAgICAgIG1lc3NhZ2U6IGNoYWxrLmN5YW4oJ1lvdTonKSxcbiAgICAgICAgICB2YWxpZGF0ZTogKGlucHV0OiBzdHJpbmcpID0+IGlucHV0LnRyaW0oKS5sZW5ndGggPiAwIHx8ICdQbGVhc2UgZW50ZXIgYSBtZXNzYWdlJyxcbiAgICAgICAgfSxcbiAgICAgIF0pO1xuXG4gICAgICBjb25zdCB0cmltbWVkTWVzc2FnZSA9IG1lc3NhZ2UudHJpbSgpO1xuXG4gICAgICAvLyBIYW5kbGUgc3BlY2lhbCBjb21tYW5kc1xuICAgICAgaWYgKHRyaW1tZWRNZXNzYWdlLnRvTG93ZXJDYXNlKCkgPT09ICdleGl0Jykge1xuICAgICAgICBjb25zb2xlLmxvZyhjaGFsay55ZWxsb3coJ/CfkYsgR29vZGJ5ZSEnKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICBpZiAodHJpbW1lZE1lc3NhZ2UudG9Mb3dlckNhc2UoKSA9PT0gJ2NsZWFyJykge1xuICAgICAgICBhd2FpdCBjbGVhckNoYXRIaXN0b3J5KGR5bmFtb1NlcnZpY2UsIG9wdGlvbnMudGVuYW50SWQsIGVtYWlsTGMsIGNvbnZlcnNhdGlvbklkKTtcbiAgICAgICAgY29uc29sZS5sb2coY2hhbGsuZ3JlZW4oJ/Cfp7kgQ2hhdCBoaXN0b3J5IGNsZWFyZWRcXG4nKSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBQcm9jZXNzIG1lc3NhZ2Ugd2l0aCBhZ2VudFxuICAgICAgY29uc3Qgc3Bpbm5lciA9IG9yYSgn8J+klCBBZ2VudCBpcyB0aGlua2luZy4uLicpLnN0YXJ0KCk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIFByb2Nlc3MgbWVzc2FnZSB3aXRoIGNoYXQgaGlzdG9yeSAoU0FNRSBBUyBMQU1CREEhKVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGFnZW50U2VydmljZS5wcm9jZXNzTWVzc2FnZSh7XG4gICAgICAgICAgdGVuYW50SWQ6IG9wdGlvbnMudGVuYW50SWQsXG4gICAgICAgICAgZW1haWxfbGM6IGVtYWlsTGMsXG4gICAgICAgICAgdGV4dDogdHJpbW1lZE1lc3NhZ2UsXG4gICAgICAgICAgc291cmNlOiBvcHRpb25zLnNvdXJjZSxcbiAgICAgICAgICBjb252ZXJzYXRpb25faWQ6IGNvbnZlcnNhdGlvbklkLCAgLy8g4oaQIFRoaXMgaXMgdGhlIGNoYW5uZWwgSUQhXG4gICAgICAgICAgY2hhbm5lbF9jb250ZXh0OiB7XG4gICAgICAgICAgICBjaGF0OiB7XG4gICAgICAgICAgICAgIHNlc3Npb25JZDogY29udmVyc2F0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sIGNoYXRIaXN0b3J5KTtcbiAgICAgICAgXG4gICAgICAgIC8vIEFkZCBhZ2VudCByZXNwb25zZSB0byBjaGF0IGhpc3RvcnlcbiAgICAgICAgY29uc3QgcmVzcG9uc2VUZXh0ID0gdHlwZW9mIHJlc3BvbnNlID09PSAnc3RyaW5nJyA/IHJlc3BvbnNlIDogcmVzcG9uc2UucmVzcG9uc2U7XG4gICAgICAgIGNoYXRIaXN0b3J5LnB1c2gobmV3IEFJTWVzc2FnZShyZXNwb25zZVRleHQpKTtcblxuICAgICAgICBzcGlubmVyLnN0b3AoKTtcblxuICAgICAgICAvLyBEaXNwbGF5IHJlc3BvbnNlXG4gICAgICAgIGNvbnNvbGUubG9nKGNoYWxrLmdyZWVuKCfwn6SWIEFnZW50OicpLCByZXNwb25zZSk7XG4gICAgICAgIGNvbnNvbGUubG9nKCcnKTtcblxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgc3Bpbm5lci5zdG9wKCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCfinYwgRXJyb3I6JyksIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChvcHRpb25zLmRlYnVnICYmIGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGNoYWxrLnJlZCgnU3RhY2s6JyksIGVycm9yLnN0YWNrKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLmxvZygnJyk7XG4gICAgICB9XG4gICAgfVxuXG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihjaGFsay5yZWQoJ+KdjCBGYWlsZWQgdG8gaW5pdGlhbGl6ZSBhZ2VudDonKSwgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicpO1xuICAgIFxuICAgIGlmIChvcHRpb25zLmRlYnVnICYmIGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoY2hhbGsucmVkKCdTdGFjazonKSwgZXJyb3Iuc3RhY2spO1xuICAgIH1cbiAgICBcbiAgICBwcm9jZXNzLmV4aXQoMSk7XG4gIH1cbn1cblxuLyoqXG4gKiBDcmVhdGUgY29uZmlndXJhdGlvbiBmb3IgY2hhdCBjb21tYW5kXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDaGF0Q29uZmlnKG9wdGlvbnM6IENoYXRPcHRpb25zKTogUnVudGltZUNvbmZpZyAmIHsgcGVyc29uYUlkPzogc3RyaW5nOyBjb21wYW55SW5mbz86IGFueSB9IHtcbiAgY29uc3QgYmFzZUNvbmZpZyA9IGNyZWF0ZVRlc3RDb25maWcoKTtcbiAgXG4gIHJldHVybiB7XG4gICAgLi4uYmFzZUNvbmZpZyxcbiAgICBiZWRyb2NrTW9kZWxJZDogb3B0aW9ucy5tb2RlbCB8fCBwcm9jZXNzLmVudi5CRURST0NLX01PREVMX0lEIHx8IGJhc2VDb25maWcuYmVkcm9ja01vZGVsSWQsXG4gICAgcGVyc29uYUlkOiBvcHRpb25zLnBlcnNvbmEgfHwgJ2NhcmxvcycsXG4gICAgY29tcGFueUluZm86IHtcbiAgICAgIG5hbWU6IG9wdGlvbnMuY29tcGFueSB8fCAnS3hHcnluZGUgRml0bmVzcycsXG4gICAgICBpbmR1c3RyeTogb3B0aW9ucy5pbmR1c3RyeSB8fCAnRml0bmVzcyAmIFdlbGxuZXNzJyxcbiAgICAgIGRlc2NyaXB0aW9uOiBvcHRpb25zLmRlc2NyaXB0aW9uIHx8ICdQcmVtaXVtIGZpdG5lc3MgY2VudGVyIG9mZmVyaW5nIHBlcnNvbmFsaXplZCB0cmFpbmluZywgZ3JvdXAgY2xhc3NlcywgYW5kIHdlbGxuZXNzIHByb2dyYW1zJyxcbiAgICAgIHNlcnZpY2VzOiBbXG4gICAgICAgICdQZXJzb25hbCBUcmFpbmluZyAoT25lLW9uLU9uZSknLFxuICAgICAgICAnR3JvdXAgRml0bmVzcyBDbGFzc2VzJyxcbiAgICAgICAgJ051dHJpdGlvbiBDb2FjaGluZycsXG4gICAgICAgICdCb2R5IENvbXBvc2l0aW9uIEFuYWx5c2lzJyxcbiAgICAgICAgJ0N1c3RvbSBNZWFsIFBsYW5uaW5nJyxcbiAgICAgICAgJ0Z1bmN0aW9uYWwgVHJhaW5pbmcnLFxuICAgICAgICAnSElJVCAoSGlnaC1JbnRlbnNpdHkgSW50ZXJ2YWwgVHJhaW5pbmcpJyxcbiAgICAgICAgJ1N0cmVuZ3RoICYgQ29uZGl0aW9uaW5nJyxcbiAgICAgICAgJ0NhcmRpbyBFcXVpcG1lbnQgQWNjZXNzJyxcbiAgICAgICAgJ0ZyZWUgV2VpZ2h0cyAmIE1hY2hpbmVzJ1xuICAgICAgXSxcbiAgICAgIHBob25lOiAnKzEtNTU1LUtYR1JZTkRFJyxcbiAgICAgIGVtYWlsOiAnaW5mb0BreGdyeW5kZS5jb20nLFxuICAgICAgd2Vic2l0ZTogJ2h0dHBzOi8va3hncnluZGUuY29tJyxcbiAgICAgIGFkZHJlc3M6IHtcbiAgICAgICAgc3RyZWV0OiAnMTIzIEZpdG5lc3MgQm91bGV2YXJkJyxcbiAgICAgICAgY2l0eTogJ1lvdXIgQ2l0eScsXG4gICAgICAgIHN0YXRlOiAnWW91ciBTdGF0ZScsXG4gICAgICAgIHppcENvZGU6ICcxMjM0NScsXG4gICAgICAgIGNvdW50cnk6ICdVU0EnXG4gICAgICB9LFxuICAgICAgYnVzaW5lc3NIb3Vyczoge1xuICAgICAgICBtb25kYXk6IFt7IGZyb206ICcwNTowMCcsIHRvOiAnMTE6MDAnIH0sIHsgZnJvbTogJzE2OjAwJywgdG86ICcyMzowMCcgfV0sXG4gICAgICAgIHR1ZXNkYXk6IFt7IGZyb206ICcwNTowMCcsIHRvOiAnMjM6MDAnIH1dLFxuICAgICAgICB3ZWRuZXNkYXk6IFt7IGZyb206ICcwNTowMCcsIHRvOiAnMTI6MDAnIH0sIHsgZnJvbTogJzE0OjAwJywgdG86ICcyMzowMCcgfV0sXG4gICAgICAgIHRodXJzZGF5OiBbeyBmcm9tOiAnMDU6MDAnLCB0bzogJzIzOjAwJyB9XSxcbiAgICAgICAgZnJpZGF5OiBbeyBmcm9tOiAnMDU6MDAnLCB0bzogJzIyOjAwJyB9XSxcbiAgICAgICAgc2F0dXJkYXk6IFt7IGZyb206ICcwNjowMCcsIHRvOiAnMjE6MDAnIH1dLFxuICAgICAgICBzdW5kYXk6IFt7IGZyb206ICcwNzowMCcsIHRvOiAnMjA6MDAnIH1dXG4gICAgICB9LFxuICAgICAgcHJpY2luZzoge1xuICAgICAgICBwbGFuczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGlkOiAnYmFzaWMnLFxuICAgICAgICAgICAgbmFtZTogJ0Jhc2ljIE1lbWJlcnNoaXAnLFxuICAgICAgICAgICAgcHJpY2U6ICckMzkvbW9udGgnLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdQZXJmZWN0IGZvciBnZXR0aW5nIHN0YXJ0ZWQgb24geW91ciBmaXRuZXNzIGpvdXJuZXknLFxuICAgICAgICAgICAgZmVhdHVyZXM6IFtcbiAgICAgICAgICAgICAgJzI0LzcgZ3ltIGFjY2VzcycsXG4gICAgICAgICAgICAgICdMb2NrZXIgcm9vbSBhY2Nlc3MnLFxuICAgICAgICAgICAgICAnRnJlZSBmaXRuZXNzIGFzc2Vzc21lbnQnLFxuICAgICAgICAgICAgICAnQWNjZXNzIHRvIGNhcmRpbyAmIHN0cmVuZ3RoIGVxdWlwbWVudCdcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBjdGE6ICdTdGFydCBZb3VyIEpvdXJuZXknXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogJ3ByZW1pdW0nLFxuICAgICAgICAgICAgbmFtZTogJ1ByZW1pdW0gTWVtYmVyc2hpcCcsXG4gICAgICAgICAgICBwcmljZTogJyQ3OS9tb250aCcsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0V2ZXJ5dGhpbmcgeW91IG5lZWQgdG8gY3J1c2ggeW91ciBnb2FscycsXG4gICAgICAgICAgICBmZWF0dXJlczogW1xuICAgICAgICAgICAgICAnRXZlcnl0aGluZyBpbiBCYXNpYycsXG4gICAgICAgICAgICAgICcyIHBlcnNvbmFsIHRyYWluaW5nIHNlc3Npb25zL21vbnRoJyxcbiAgICAgICAgICAgICAgJ1VubGltaXRlZCBncm91cCBmaXRuZXNzIGNsYXNzZXMnLFxuICAgICAgICAgICAgICAnTnV0cml0aW9uIGNvbnN1bHRhdGlvbicsXG4gICAgICAgICAgICAgICdHdWVzdCBwcml2aWxlZ2VzICgyL21vbnRoKSdcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBwb3B1bGFyOiB0cnVlLFxuICAgICAgICAgICAgY3RhOiAnR28gUHJlbWl1bSdcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGlkOiAnZWxpdGUnLFxuICAgICAgICAgICAgbmFtZTogJ0VsaXRlIFRyYWluaW5nJyxcbiAgICAgICAgICAgIHByaWNlOiAnJDE0OS9tb250aCcsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0ZvciBzZXJpb3VzIGF0aGxldGVzIHdobyBkZW1hbmQgcmVzdWx0cycsXG4gICAgICAgICAgICBmZWF0dXJlczogW1xuICAgICAgICAgICAgICAnRXZlcnl0aGluZyBpbiBQcmVtaXVtJyxcbiAgICAgICAgICAgICAgJzggcGVyc29uYWwgdHJhaW5pbmcgc2Vzc2lvbnMvbW9udGgnLFxuICAgICAgICAgICAgICAnQ3VzdG9tIG1lYWwgcGxhbm5pbmcnLFxuICAgICAgICAgICAgICAnQm9keSBjb21wb3NpdGlvbiBhbmFseXNpcycsXG4gICAgICAgICAgICAgICdQcmlvcml0eSBjbGFzcyBib29raW5nJyxcbiAgICAgICAgICAgICAgJ1VubGltaXRlZCBndWVzdCBwcml2aWxlZ2VzJ1xuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIGN0YTogJ1RyYWluIExpa2UgYSBQcm8nXG4gICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBjdXN0b21QcmljaW5nQXZhaWxhYmxlOiB0cnVlLFxuICAgICAgICBjb250YWN0Rm9yUHJpY2luZzogZmFsc2UgLy8gQWdlbnQgY2FuIHNoYXJlIHByaWNpbmcgd2l0aG91dCByZXF1aXJpbmcgY29udGFjdCBpbmZvIGZpcnN0XG4gICAgICB9LFxuICAgICAgcHJvbW90aW9uczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICduZXdfeWVhcl9zcGVjaWFsJyxcbiAgICAgICAgICB0aXRsZTogJ05ldyBZZWFyLCBOZXcgWW91IFNwZWNpYWwnLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnU3RhcnQgeW91ciBmaXRuZXNzIGpvdXJuZXkgd2l0aCBtYXNzaXZlIHNhdmluZ3MnLFxuICAgICAgICAgIHVyZ2VuY3lNZXNzYWdlOiAnU2lnbiB1cCBub3cgYW5kIGdldCA1MCUgb2ZmIHlvdXIgZmlyc3QgMyBtb250aHMhJyxcbiAgICAgICAgICBkaXNjb3VudDogJzUwJSBvZmYgZmlyc3QgMyBtb250aHMnLFxuICAgICAgICAgIHZhbGlkVW50aWw6ICcyMDI1LTEyLTMxVDIzOjU5OjU5WicsXG4gICAgICAgICAgY29uZGl0aW9uczogW1xuICAgICAgICAgICAgJ0ZpcnN0LXRpbWUgbWVtYmVycyBvbmx5JyxcbiAgICAgICAgICAgICdNdXN0IHNpZ24gdXAgYnkgRGVjZW1iZXIgMzEsIDIwMjUnLFxuICAgICAgICAgICAgJ0FwcGxpZXMgdG8gQmFzaWMgYW5kIFByZW1pdW0gcGxhbnMgb25seSdcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFwcGxpY2FibGVQbGFuczogWydiYXNpYycsICdwcmVtaXVtJ11cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnYnJpbmdfYV9mcmllbmQnLFxuICAgICAgICAgIHRpdGxlOiAnQnJpbmcgYSBGcmllbmQsIEdldCBSZXdhcmRzJyxcbiAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlZmVyIGEgZnJpZW5kIGFuZCBib3RoIG9mIHlvdSBzYXZlIGJpZycsXG4gICAgICAgICAgdXJnZW5jeU1lc3NhZ2U6ICdSZWZlciBhIGZyaWVuZCB0aGlzIG1vbnRoIGFuZCB5b3UgYm90aCBnZXQgJDUwIG9mZiEnLFxuICAgICAgICAgIGRpc2NvdW50OiAnJDUwIGNyZWRpdCBwZXIgcmVmZXJyYWwnLFxuICAgICAgICAgIHZhbGlkVW50aWw6ICcyMDI1LTEyLTMxVDIzOjU5OjU5WicsXG4gICAgICAgICAgY29uZGl0aW9uczogW1xuICAgICAgICAgICAgJ0JvdGggbWVtYmVycyBtdXN0IGJlIGFjdGl2ZScsXG4gICAgICAgICAgICAnRnJpZW5kIG11c3Qgc2lnbiB1cCBmb3IgYXQgbGVhc3QgMyBtb250aHMnLFxuICAgICAgICAgICAgJ1VubGltaXRlZCByZWZlcnJhbHMnXG4gICAgICAgICAgXSxcbiAgICAgICAgICBhcHBsaWNhYmxlUGxhbnM6IFsnYmFzaWMnLCAncHJlbWl1bScsICdlbGl0ZSddXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBnb2FsQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICBnbG9iYWxTZXR0aW5nczoge1xuICAgICAgICAgIGFkYXB0VG9VcmdlbmN5OiB0cnVlLFxuICAgICAgICAgIGludGVyZXN0VGhyZXNob2xkOiA1LFxuICAgICAgICAgIG1heEFjdGl2ZUdvYWxzOiAzLFxuICAgICAgICAgIG1heEdvYWxzUGVyVHVybjogMixcbiAgICAgICAgICByZXNwZWN0RGVjbGluZXM6IHRydWUsXG4gICAgICAgICAgc3RyaWN0T3JkZXJpbmc6IDBcbiAgICAgICAgfSxcbiAgICAgICAgZ29hbHM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogJ2NvbGxlY3RfaWRlbnRpdHknLFxuICAgICAgICAgICAgbmFtZTogJ0dldCBOYW1lJyxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIkdldCB0aGUgdXNlcidzIG5hbWUgZm9yIHBlcnNvbmFsaXphdGlvblwiLFxuICAgICAgICAgICAgdHlwZTogJ2RhdGFfY29sbGVjdGlvbicsXG4gICAgICAgICAgICBwcmlvcml0eTogJ2hpZ2gnLFxuICAgICAgICAgICAgb3JkZXI6IDEsXG4gICAgICAgICAgICBhZGhlcmVuY2U6IDYsXG4gICAgICAgICAgICB0cmlnZ2VyczogeyBtZXNzYWdlQ291bnQ6IDAgfSxcbiAgICAgICAgICAgIGRhdGFUb0NhcHR1cmU6IHtcbiAgICAgICAgICAgICAgZmllbGRzOiBbJ2ZpcnN0TmFtZScsICdsYXN0TmFtZScsICdnZW5kZXInXSxcbiAgICAgICAgICAgICAgdmFsaWRhdGlvblJ1bGVzOiB7XG4gICAgICAgICAgICAgICAgZmlyc3ROYW1lOiB7IHJlcXVpcmVkOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgbGFzdE5hbWU6IHsgcmVxdWlyZWQ6IGZhbHNlIH0sXG4gICAgICAgICAgICAgICAgZ2VuZGVyOiB7IHJlcXVpcmVkOiBmYWxzZSB9IC8vIEF1dG8tZGV0ZWN0ZWQgZnJvbSBuYW1lXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBiZWhhdmlvcjogeyBiYWNrb2ZmU3RyYXRlZ3k6ICdnZW50bGUnLCBtYXhBdHRlbXB0czogMyB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogJ2Fzc2Vzc19maXRuZXNzX2dvYWxzJyxcbiAgICAgICAgICAgIG5hbWU6ICdBc3Nlc3MgR29hbHMnLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246IFwiVW5kZXJzdGFuZCB3aGF0IHRoZSB1c2VyIHdhbnRzIHRvIGFjaGlldmVcIixcbiAgICAgICAgICAgIHR5cGU6ICdkYXRhX2NvbGxlY3Rpb24nLFxuICAgICAgICAgICAgcHJpb3JpdHk6ICdjcml0aWNhbCcsXG4gICAgICAgICAgICBvcmRlcjogMixcbiAgICAgICAgICAgIGFkaGVyZW5jZTogNyxcbiAgICAgICAgICAgIHRyaWdnZXJzOiB7IHByZXJlcXVpc2l0ZUdvYWxzOiBbJ2NvbGxlY3RfaWRlbnRpdHknXSwgbWVzc2FnZUNvdW50OiAwIH0sXG4gICAgICAgICAgICBkYXRhVG9DYXB0dXJlOiB7XG4gICAgICAgICAgICAgIGZpZWxkczogWydwcmltYXJ5R29hbCcsICdtb3RpdmF0aW9uUmVhc29uJywgJ21vdGl2YXRpb25DYXRlZ29yaWVzJywgJ3RpbWVsaW5lJ10sXG4gICAgICAgICAgICAgIHZhbGlkYXRpb25SdWxlczoge1xuICAgICAgICAgICAgICAgIHByaW1hcnlHb2FsOiB7IHJlcXVpcmVkOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgbW90aXZhdGlvblJlYXNvbjogeyByZXF1aXJlZDogdHJ1ZSB9LFxuICAgICAgICAgICAgICAgIG1vdGl2YXRpb25DYXRlZ29yaWVzOiB7IHJlcXVpcmVkOiBmYWxzZSB9LFxuICAgICAgICAgICAgICAgIHRpbWVsaW5lOiB7IHJlcXVpcmVkOiB0cnVlIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJlaGF2aW9yOiB7IGJhY2tvZmZTdHJhdGVneTogJ3BlcnNpc3RlbnQnLCBtYXhBdHRlbXB0czogNSB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogJ3NjaGVkdWxlX2NvbnN1bHRhdGlvbicsXG4gICAgICAgICAgICBuYW1lOiAnU2NoZWR1bGUgU2Vzc2lvbicsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0Jvb2sgaW5pdGlhbCBjb25zdWx0YXRpb24gb3IgdHJhaW5pbmcgc2Vzc2lvbicsXG4gICAgICAgICAgICB0eXBlOiAnc2NoZWR1bGluZycsXG4gICAgICAgICAgICBwcmlvcml0eTogJ2hpZ2gnLFxuICAgICAgICAgICAgaXNQcmltYXJ5OiB0cnVlLCAvLyBUaGlzIGlzIHRoZSBtYWluIGNvbnZlcnNpb24gZ29hbFxuICAgICAgICAgICAgb3JkZXI6IDMsXG4gICAgICAgICAgICBhZGhlcmVuY2U6IDcsXG4gICAgICAgICAgICB0cmlnZ2VyczogeyBwcmVyZXF1aXNpdGVHb2FsczogWydhc3Nlc3NfZml0bmVzc19nb2FscyddLCBtZXNzYWdlQ291bnQ6IDAgfSxcbiAgICAgICAgICAgIGRhdGFUb0NhcHR1cmU6IHtcbiAgICAgICAgICAgICAgZmllbGRzOiBbJ3ByZWZlcnJlZERhdGUnLCAncHJlZmVycmVkVGltZSddLFxuICAgICAgICAgICAgICB2YWxpZGF0aW9uUnVsZXM6IHtcbiAgICAgICAgICAgICAgICBwcmVmZXJyZWREYXRlOiB7IHJlcXVpcmVkOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgcHJlZmVycmVkVGltZTogeyByZXF1aXJlZDogdHJ1ZSB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBiZWhhdmlvcjogeyBiYWNrb2ZmU3RyYXRlZ3k6ICdnZW50bGUnLCBtYXhBdHRlbXB0czogNSB9LFxuICAgICAgICAgICAgYWN0aW9uczoge1xuICAgICAgICAgICAgICBvbkNvbXBsZXRlOiBbe1xuICAgICAgICAgICAgICAgIHR5cGU6ICd0cmlnZ2VyX3NjaGVkdWxpbmdfZmxvdycsXG4gICAgICAgICAgICAgICAgZXZlbnROYW1lOiAnYXBwb2ludG1lbnQuY29uc3VsdGF0aW9uX3JlcXVlc3RlZCcsXG4gICAgICAgICAgICAgICAgcGF5bG9hZDogeyBhcHBvaW50bWVudFR5cGU6ICdmaXRuZXNzX2NvbnN1bHRhdGlvbicsIGR1cmF0aW9uOiA2MCB9XG4gICAgICAgICAgICAgIH1dXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogJ2NvbGxlY3RfY29udGFjdF9pbmZvJyxcbiAgICAgICAgICAgIG5hbWU6ICdDb250YWN0IEluZm8nLFxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdHZXQgY29udGFjdCBpbmZvcm1hdGlvbiB0byBjb25maXJtIGJvb2tpbmcnLFxuICAgICAgICAgICAgdHlwZTogJ2RhdGFfY29sbGVjdGlvbicsXG4gICAgICAgICAgICBwcmlvcml0eTogJ2NyaXRpY2FsJyxcbiAgICAgICAgICAgIG9yZGVyOiA0LFxuICAgICAgICAgICAgYWRoZXJlbmNlOiA4LFxuICAgICAgICAgICAgdHJpZ2dlcnM6IHsgcHJlcmVxdWlzaXRlR29hbHM6IFsnc2NoZWR1bGVfY29uc3VsdGF0aW9uJ10sIG1lc3NhZ2VDb3VudDogMCB9LFxuICAgICAgICAgICAgZGF0YVRvQ2FwdHVyZToge1xuICAgICAgICAgICAgICBmaWVsZHM6IFsnZW1haWwnLCAncGhvbmUnXSxcbiAgICAgICAgICAgICAgdmFsaWRhdGlvblJ1bGVzOiB7XG4gICAgICAgICAgICAgICAgZW1haWw6IHsgcmVxdWlyZWQ6IHRydWUsIHBhdHRlcm46ICdeW15AXStAW15AXStcXFxcLlteQF0rJCcgfSxcbiAgICAgICAgICAgICAgICBwaG9uZTogeyByZXF1aXJlZDogdHJ1ZSB9XG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGNvbXBsZXRpb25TdHJhdGVneTogJ2FsbCdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBiZWhhdmlvcjogeyBiYWNrb2ZmU3RyYXRlZ3k6ICdwZXJzaXN0ZW50JywgbWF4QXR0ZW1wdHM6IDUgfSxcbiAgICAgICAgICAgIGFjdGlvbnM6IHtcbiAgICAgICAgICAgICAgb25Db21wbGV0ZTogW3tcbiAgICAgICAgICAgICAgICB0eXBlOiAnY29udmVydF9hbm9ueW1vdXNfdG9fbGVhZCcsXG4gICAgICAgICAgICAgICAgZXZlbnROYW1lOiAnbGVhZC5jb250YWN0X2NhcHR1cmVkJyxcbiAgICAgICAgICAgICAgICBwYXlsb2FkOiB7IGxlYWRUeXBlOiAnaW5ib3VuZF9maXRuZXNzJywgc291cmNlOiAnY2hhdF9hZ2VudCcgfVxuICAgICAgICAgICAgICB9XVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgaWQ6ICdjb2xsZWN0X2JvZHlfbWV0cmljcycsXG4gICAgICAgICAgICBuYW1lOiAnQm9keSBNZXRyaWNzJyxcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnQXNzZXNzIGN1cnJlbnQgZml0bmVzcyBsZXZlbCBhbmQgYm9keSBjb21wb3NpdGlvbicsXG4gICAgICAgICAgICB0eXBlOiAnZGF0YV9jb2xsZWN0aW9uJyxcbiAgICAgICAgICAgIHByaW9yaXR5OiAnbWVkaXVtJyxcbiAgICAgICAgICAgIG9yZGVyOiA1LFxuICAgICAgICAgICAgYWRoZXJlbmNlOiA2LFxuICAgICAgICAgICAgdHJpZ2dlcnM6IHsgcHJlcmVxdWlzaXRlR29hbHM6IFsnY29sbGVjdF9jb250YWN0X2luZm8nXSwgbWVzc2FnZUNvdW50OiAwIH0sXG4gICAgICAgICAgICBkYXRhVG9DYXB0dXJlOiB7XG4gICAgICAgICAgICAgIC8vIEhlaWdodCBPUiB3ZWlnaHQgaXMgcmVxdWlyZWQgLSB1c2VyIHR5cGljYWxseSBnaXZlcyBib3RoIHRvZ2V0aGVyXG4gICAgICAgICAgICAgIC8vIFRoZSBMTE0gZXh0cmFjdHMgdGhlbSBhcyBzZXBhcmF0ZSBmaWVsZHNcbiAgICAgICAgICAgICAgZmllbGRzOiBbJ2hlaWdodCcsICd3ZWlnaHQnLCAnYm9keUZhdFBlcmNlbnRhZ2UnXSxcbiAgICAgICAgICAgICAgdmFsaWRhdGlvblJ1bGVzOiB7XG4gICAgICAgICAgICAgICAgaGVpZ2h0OiB7IHJlcXVpcmVkOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgd2VpZ2h0OiB7IHJlcXVpcmVkOiB0cnVlIH0sXG4gICAgICAgICAgICAgICAgYm9keUZhdFBlcmNlbnRhZ2U6IHsgcmVxdWlyZWQ6IGZhbHNlIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJlaGF2aW9yOiB7IGJhY2tvZmZTdHJhdGVneTogJ2dlbnRsZScsIG1heEF0dGVtcHRzOiAzIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGlkOiAnY29sbGVjdF9pbmp1cmllcycsXG4gICAgICAgICAgICBuYW1lOiAnSW5qdXJpZXMgJiBMaW1pdGF0aW9ucycsXG4gICAgICAgICAgICBkZXNjcmlwdGlvbjogJ0NoZWNrIGZvciBhbnkgaW5qdXJpZXMgb3IgcGh5c2ljYWwgbGltaXRhdGlvbnMnLFxuICAgICAgICAgICAgdHlwZTogJ2RhdGFfY29sbGVjdGlvbicsXG4gICAgICAgICAgICBwcmlvcml0eTogJ21lZGl1bScsXG4gICAgICAgICAgICBvcmRlcjogNixcbiAgICAgICAgICAgIGFkaGVyZW5jZTogNyxcbiAgICAgICAgICAgIHRyaWdnZXJzOiB7IHByZXJlcXVpc2l0ZUdvYWxzOiBbJ2NvbGxlY3RfYm9keV9tZXRyaWNzJ10sIG1lc3NhZ2VDb3VudDogMCB9LFxuICAgICAgICAgICAgZGF0YVRvQ2FwdHVyZToge1xuICAgICAgICAgICAgICAvLyBBdCBsZWFzdCBvbmUgZmllbGQgbXVzdCBiZSByZXF1aXJlZCBmb3IgdGhlIGdvYWwgdG8gYmUgcHVyc3VlZFxuICAgICAgICAgICAgICBmaWVsZHM6IFsncGh5c2ljYWxMaW1pdGF0aW9ucyddLFxuICAgICAgICAgICAgICB2YWxpZGF0aW9uUnVsZXM6IHtcbiAgICAgICAgICAgICAgICBwaHlzaWNhbExpbWl0YXRpb25zOiB7IHJlcXVpcmVkOiB0cnVlIH0gIC8vIE11c3QgZ2V0IGFuIGFuc3dlciAoZXZlbiBcIm5vbmVcIilcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJlaGF2aW9yOiB7IFxuICAgICAgICAgICAgICBiYWNrb2ZmU3RyYXRlZ3k6ICdnZW50bGUnLCBcbiAgICAgICAgICAgICAgbWF4QXR0ZW1wdHM6IDMsXG4gICAgICAgICAgICAgIG1lc3NhZ2U6ICdGb3IgeW91ciBzYWZldHksIEkgbmVlZCB0byBrbm93IGFib3V0IGFueSBpbmp1cmllcyBvciBoZWFsdGggY29uZGl0aW9ucydcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH1cbiAgICB9LFxuICAgIGhpc3RvcnlMaW1pdDogcGFyc2VJbnQob3B0aW9ucy5oaXN0b3J5TGltaXQsIDEwKSxcbiAgICBtZXNzYWdlc1RhYmxlOiBwcm9jZXNzLmVudi5NRVNTQUdFU19UQUJMRSB8fCBiYXNlQ29uZmlnLm1lc3NhZ2VzVGFibGUsXG4gICAgbGVhZHNUYWJsZTogcHJvY2Vzcy5lbnYuTEVBRFNfVEFCTEUgfHwgYmFzZUNvbmZpZy5sZWFkc1RhYmxlLFxuICAgIGF3c1JlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCBiYXNlQ29uZmlnLmF3c1JlZ2lvbixcbiAgICBkeW5hbW9kYkVuZHBvaW50OiBwcm9jZXNzLmVudi5EWU5BTU9EQl9FTkRQT0lOVCB8fCBiYXNlQ29uZmlnLmR5bmFtb2RiRW5kcG9pbnQsXG4gICAgb3V0Ym91bmRFdmVudEJ1c05hbWU6IHByb2Nlc3MuZW52Lk9VVEJPVU5EX0VWRU5UX0JVU19OQU1FIHx8IGJhc2VDb25maWcub3V0Ym91bmRFdmVudEJ1c05hbWUsXG4gIH07XG59XG5cbi8qKlxuICogQ2xlYXIgY2hhdCBoaXN0b3J5IGZvciBhIGNvbnRhY3RcbiAqL1xuYXN5bmMgZnVuY3Rpb24gY2xlYXJDaGF0SGlzdG9yeShcbiAgZHluYW1vU2VydmljZTogRHluYW1vREJTZXJ2aWNlLFxuICB0ZW5hbnRJZDogc3RyaW5nLFxuICBlbWFpbExjOiBzdHJpbmcsXG4gIHNlc3Npb25JZD86IHN0cmluZ1xuKTogUHJvbWlzZTx2b2lkPiB7XG4gIC8vIEluIGEgcmVhbCBpbXBsZW1lbnRhdGlvbiwgeW91IG1pZ2h0IHdhbnQgdG8gYWRkIGEgYm91bmRhcnkgbWFya2VyXG4gIC8vIEZvciBub3csIHdlJ2xsIGp1c3QgbG9nIHRoYXQgaGlzdG9yeSB3b3VsZCBiZSBjbGVhcmVkXG4gIGNvbnNvbGUubG9nKGNoYWxrLmdyYXkoYFdvdWxkIGNsZWFyIGhpc3RvcnkgZm9yICR7dGVuYW50SWR9LyR7ZW1haWxMY30ke3Nlc3Npb25JZCA/IGAgKHNlc3Npb246ICR7c2Vzc2lvbklkfSlgIDogJyd9YCkpO1xufVxuIl19