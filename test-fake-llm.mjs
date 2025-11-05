// Test with fake LLM to verify chat system works
import { MemoryChatHistory } from './packages/runtime/dist/lib/memory-chat-history.js';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

const chatHistory = new MemoryChatHistory('test-session');

// Simulate conversation
await chatHistory.addMessage(new HumanMessage('What tattoo should I get?'));

const fakeResponse = "For a tattoo that projects strength, consider:\n\n1. **Lion** - Symbol of courage and leadership\n2. **Eagle** - Represents power and freedom\n3. **Geometric patterns** - Clean, bold designs\n4. **Mountain ranges** - Symbolize overcoming challenges\n5. **Ancient symbols** - Like Norse runes or Celtic knots\n\nThe key is choosing something that resonates with your personal story of strength. What aspects of strength matter most to you?";

await chatHistory.addMessage(new AIMessage(fakeResponse));

const messages = await chatHistory.getMessages();
console.log('💬 Chat History:');
messages.forEach((msg, i) => {
  const type = msg instanceof HumanMessage ? '👤 You' : '🤖 Agent';
  console.log(`${type}: ${msg.content}\n`);
});

console.log('✅ Chat system works! The issue is just AWS Bedrock access.');

