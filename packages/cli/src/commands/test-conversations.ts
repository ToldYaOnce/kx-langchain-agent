/**
 * Automated conversation testing for intent detection and contact collection
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { AgentService } from '@toldyaonce/langchain-agent-runtime';
import { createChatConfig } from './chat.js';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

interface TestScenario {
  name: string;
  description: string;
  messages: string[];
  expectedIntents: string[];
  expectedBehavior: string[];
  channel?: string; // Optional channel specification for testing
}

const TEST_SCENARIOS: TestScenario[] = [
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

interface TestResult {
  scenario: string;
  messageIndex: number;
  message: string;
  actualIntent: string;
  expectedIntent: string;
  intentMatch: boolean;
  response: string;
  behaviorCheck: string;
  passed: boolean;
}

export function createTestConversationsCommand(): Command {
  const cmd = new Command('test-conversations');
  
  cmd
    .description('Run automated conversation tests for intent detection and contact collection')
    .option('--scenario <name>', 'Run specific scenario only')
    .option('--verbose', 'Show detailed output')
    .action(async (options) => {
      console.log(chalk.blue('🧪 Starting Automated Conversation Tests\n'));
      
      const results: TestResult[] = [];
      const scenariosToRun = options.scenario 
        ? TEST_SCENARIOS.filter(s => s.name.toLowerCase().includes(options.scenario.toLowerCase()))
        : TEST_SCENARIOS;
      
      if (scenariosToRun.length === 0) {
        console.log(chalk.red(`❌ No scenarios found matching: ${options.scenario}`));
        return;
      }
      
      for (const scenario of scenariosToRun) {
        console.log(chalk.yellow(`\n📋 Testing: ${scenario.name}`));
        console.log(chalk.gray(`   ${scenario.description}`));
        
        // Initialize agent for this scenario
        const config = createChatConfig({
          tenantId: 'test',
          email: 'test@example.com',
          persona: 'carlos',
          source: (scenario.channel as any) || 'chat', // Use scenario channel or default to chat
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
        
        const agentService = new AgentService(config);
        const chatHistory: (HumanMessage | AIMessage)[] = [];
        
        // Run through each message in the scenario
        for (let i = 0; i < scenario.messages.length; i++) {
          const message = scenario.messages[i];
          const expectedIntent = scenario.expectedIntents[i];
          const expectedBehavior = scenario.expectedBehavior[i];
          
          console.log(chalk.cyan(`\n   👤 User: ${message}`));
          
          // Add user message to history
          chatHistory.push(new HumanMessage(message));
          
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
            response = await agentService.processMessage({
              tenantId: 'test',
              email_lc: 'test@example.com',
              text: message,
              source: (scenario.channel as any) || 'chat', // Use scenario channel
              conversation_id: `test-${Date.now()}`,
              channel_context: { 
                [scenario.channel || 'chat']: { sessionId: 'test' } 
              }
            }, chatHistory);
            
            // Restore console.log
            console.log = originalLog;
            
            // Add agent response to history
            if (response) {
              chatHistory.push(new AIMessage(response));
            }
            
            // Check results
            const intentMatch = detectedIntent === expectedIntent;
            const behaviorCheck = checkBehavior(response, expectedBehavior, chatHistory.length);
            
            const result: TestResult = {
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
            
            console.log(chalk.gray(`   🎯 Intent: ${detectedIntent} ${intentStatus} (expected: ${expectedIntent})`));
            console.log(chalk.gray(`   🤖 Carlos: ${response || '(empty response)'}`));
            console.log(chalk.gray(`   📝 Behavior: ${behaviorCheck} ${behaviorStatus}`));
            
            if (options.verbose && intentOutput) {
              console.log(chalk.gray(`   🔍 Debug: ${intentOutput.trim()}`));
            }
            
          } catch (error) {
            console.log(chalk.red(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`));
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
      console.log(chalk.blue('\n📊 Test Results Summary'));
      console.log(chalk.blue('========================'));
      
      const totalTests = results.length;
      const passedTests = results.filter(r => r.passed).length;
      const failedTests = totalTests - passedTests;
      
      console.log(`Total Tests: ${totalTests}`);
      console.log(chalk.green(`Passed: ${passedTests}`));
      console.log(chalk.red(`Failed: ${failedTests}`));
      console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
      
      // Failed tests details
      if (failedTests > 0) {
        console.log(chalk.red('\n❌ Failed Tests:'));
        results.filter(r => !r.passed).forEach(result => {
          console.log(chalk.red(`   ${result.scenario} - Message ${result.messageIndex + 1}: "${result.message}"`));
          if (!result.intentMatch) {
            console.log(chalk.red(`      Intent: got "${result.actualIntent}", expected "${result.expectedIntent}"`));
          }
          if (!result.behaviorCheck.includes('✅')) {
            console.log(chalk.red(`      Behavior: ${result.behaviorCheck}`));
          }
        });
      }
      
      process.exit(failedTests > 0 ? 1 : 0);
    });
  
  return cmd;
}

function checkBehavior(response: string, expectedBehavior: string, historyLength: number): string {
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
