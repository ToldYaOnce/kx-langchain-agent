import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import {
  DynamoDBService,
  EventBridgeService,
  AgentService,
  GreetingService,
  createTestConfig,
  type RuntimeConfig,
  type MessageSource,
} from '@toldyaonce/kx-langchain-agent-runtime';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { PersonaService } from '@toldyaonce/kx-langchain-agent-runtime';

export interface ChatOptions {
  tenantId: string;
  email: string;
  source: MessageSource;
  model?: string;
  persona?: string;
  conversationId?: string;  // Primary option
  session?: string;          // Deprecated alias
  company?: string;
  industry?: string;
  description?: string;
  products?: string;
  benefits?: string;
  target?: string;
  differentiators?: string;
  rag?: boolean;
  historyLimit: string;
  debug?: boolean;
}

export async function chatCommand(options: ChatOptions): Promise<void> {
  // Use conversationId or fall back to session (for backwards compat)
  const conversationId = options.conversationId || options.session || `cli-${Date.now()}`;
  
  console.log(chalk.blue('🤖 KxGen LangChain Agent - Interactive Chat'));
  console.log(chalk.gray(`Tenant: ${options.tenantId}`));
  console.log(chalk.gray(`Email: ${options.email}`));
  console.log(chalk.gray(`Source: ${options.source}`));
  console.log(chalk.gray(`Persona: ${options.persona || 'detected from DynamoDB'}`));
  console.log(chalk.gray(`Conversation ID: ${conversationId}`));
  console.log('');

  try {
    // Load configuration
    const config = createChatConfig(options);
    
    if (options.debug) {
      console.log(chalk.yellow('Debug mode enabled'));
      console.log('Config:', JSON.stringify(config, null, 2));
    }

    // Initialize DynamoDB service (SAME AS LAMBDA!)
    const dynamoService = new DynamoDBService(config);
    const eventBridgeService = new EventBridgeService(config);

    // Load company info and persona from DynamoDB (SAME AS LAMBDA!)
    let companyInfo: any = undefined;
    let personaConfig: any = undefined;
    
    if (options.tenantId) {
      try {
        console.log(chalk.gray(`🏢 Loading company info for tenant: ${options.tenantId}`));
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, GetCommand } = await import('@aws-sdk/lib-dynamodb');
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
          console.log(chalk.green(`✅ Loaded company info: ${companyInfo.name} (${companyInfo.industry})`));
          
          if (companyInfo.goalConfiguration?.enabled) {
            console.log(chalk.green(`🎯 Company-level goals enabled: ${companyInfo.goalConfiguration.goals?.length || 0} goals configured`));
          }
        } else {
          console.log(chalk.yellow(`⚠️  No company info found for tenant ${options.tenantId}`));
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
            console.log(chalk.green(`✅ Loaded persona from DynamoDB: ${personaConfig.name || options.persona}`));
          } else {
            console.log(chalk.yellow(`⚠️  No persona found for ${options.tenantId}/${options.persona}`));
          }
        }
      } catch (error) {
        console.error(chalk.red('❌ Error loading company info/persona:'), error);
      }
    }

    // Initialize agent service (SAME AS LAMBDA!)
    // Use DB-loaded companyInfo, or fall back to config.companyInfo (which has goalConfiguration)
    const agentService = new AgentService({
      ...config,
      dynamoService,
      eventBridgeService,
      companyInfo: companyInfo || config.companyInfo,
      personaId: options.persona,
      persona: personaConfig,
    });
    
    // Maintain chat history for CLI (will be passed to agent)
    const chatHistory: (HumanMessage | AIMessage)[] = [];

    // Normalize email
    const emailLc = options.email.toLowerCase();

    console.log(chalk.green('✅ Agent initialized successfully'));
    
    // Show persona greeting
    try {
      const personaService = new PersonaService(null);
      const persona = await personaService.getPersona('dev-test', options.persona || 'carlos', config.companyInfo);
      const greeting = GreetingService.generateGreeting((persona.greetings || persona.greetingConfig) as any, config.companyInfo);
      
      console.log(chalk.green('🤖 ' + persona.name + ':'), greeting);
    } catch (error) {
      console.log(chalk.green('🤖 Agent:'), 'Hello! How can I help you today?');
    }
    
    console.log(chalk.gray('\nType "exit" to quit, "clear" to clear history\n'));

    // Interactive chat loop
    while (true) {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.cyan('You:'),
          validate: (input: string) => input.trim().length > 0 || 'Please enter a message',
        },
      ]);

      const trimmedMessage = message.trim();

      // Handle special commands
      if (trimmedMessage.toLowerCase() === 'exit') {
        console.log(chalk.yellow('👋 Goodbye!'));
        break;
      }

      if (trimmedMessage.toLowerCase() === 'clear') {
        await clearChatHistory(dynamoService, options.tenantId, emailLc, conversationId);
        console.log(chalk.green('🧹 Chat history cleared\n'));
        continue;
      }

      // Process message with agent
      const spinner = ora('🤔 Agent is thinking...').start();

      try {
        // Process message with chat history (SAME AS LAMBDA!)
        const response = await agentService.processMessage({
          tenantId: options.tenantId,
          email_lc: emailLc,
          text: trimmedMessage,
          source: options.source,
          conversation_id: conversationId,  // ← This is the channel ID!
          channel_context: {
            chat: {
              sessionId: conversationId,
            },
          },
        }, chatHistory);
        
        // Add agent response to chat history
        const responseText = typeof response === 'string' ? response : response.response;
        chatHistory.push(new AIMessage(responseText));

        spinner.stop();

        // Display response
        console.log(chalk.green('🤖 Agent:'), response);
        console.log('');

      } catch (error) {
        spinner.stop();
        console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : 'Unknown error');
        
        if (options.debug && error instanceof Error) {
          console.error(chalk.red('Stack:'), error.stack);
        }
        console.log('');
      }
    }

  } catch (error) {
    console.error(chalk.red('❌ Failed to initialize agent:'), error instanceof Error ? error.message : 'Unknown error');
    
    if (options.debug && error instanceof Error) {
      console.error(chalk.red('Stack:'), error.stack);
    }
    
    process.exit(1);
  }
}

/**
 * Create configuration for chat command
 */
export function createChatConfig(options: ChatOptions): RuntimeConfig & { personaId?: string; companyInfo?: any } {
  const baseConfig = createTestConfig();
  
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
                physicalLimitations: { required: true }  // Must get an answer (even "none")
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
async function clearChatHistory(
  dynamoService: DynamoDBService,
  tenantId: string,
  emailLc: string,
  sessionId?: string
): Promise<void> {
  // In a real implementation, you might want to add a boundary marker
  // For now, we'll just log that history would be cleared
  console.log(chalk.gray(`Would clear history for ${tenantId}/${emailLc}${sessionId ? ` (session: ${sessionId})` : ''}`));
}
