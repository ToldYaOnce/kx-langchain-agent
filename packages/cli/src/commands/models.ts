import chalk from 'chalk';
import ora from 'ora';
import { ChatBedrockConverse } from '@langchain/aws';
import { createTestConfig } from '@toldyaonce/kx-langchain-agent-runtime';

interface TestModelOptions {
  model: string;
  prompt: string;
}

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

export const modelsCommand = {
  async list(): Promise<void> {
    console.log(chalk.blue('🤖 Available Bedrock Models'));
    console.log('');

    console.log(chalk.cyan('Supported Models:'));
    console.log('');

    for (const model of BEDROCK_MODELS) {
      console.log(`${chalk.green('●')} ${chalk.bold(model.name)} (${model.provider})`);
      console.log(`  ID: ${chalk.gray(model.id)}`);
      console.log(`  Description: ${model.description}`);
      console.log('');
    }

    console.log(chalk.yellow('Note: Model availability depends on your AWS region and account access.'));
    console.log(chalk.gray('Use "kxagent models test --model <id> --prompt <text>" to test a specific model.'));
  },

  async test(options: TestModelOptions): Promise<void> {
    console.log(chalk.blue('🧪 Testing Bedrock Model'));
    console.log(chalk.gray(`Model: ${options.model}`));
    console.log(chalk.gray(`Prompt: ${options.prompt}`));
    console.log('');

    try {
      // Load configuration
      const config = createTestConfig();
      
      // Create model instance
      const model = new ChatBedrockConverse({
        model: options.model,
        region: config.awsRegion,
        temperature: 0.7,
        maxTokens: 500,
      });

      // Test the model
      const spinner = ora('🤔 Generating response...').start();

      try {
        const response = await model.invoke(options.prompt);
        
        spinner.stop();
        console.log(chalk.green('✅ Model Response:'));
        console.log('');
        console.log(response.content);
        console.log('');
        
        // Show model info if available
        if (response.response_metadata) {
          console.log(chalk.gray('Response Metadata:'));
          console.log(chalk.gray(JSON.stringify(response.response_metadata, null, 2)));
        }

      } catch (error) {
        spinner.stop();
        
        if (error instanceof Error) {
          if (error.message.includes('AccessDeniedException')) {
            console.error(chalk.red('❌ Access Denied: You may not have access to this model in your AWS account/region'));
            console.log(chalk.yellow('💡 Try requesting access in the AWS Bedrock console'));
          } else if (error.message.includes('ValidationException')) {
            console.error(chalk.red('❌ Invalid Model: The specified model ID may not exist or be available'));
            console.log(chalk.yellow('💡 Use "kxagent models list" to see supported models'));
          } else {
            console.error(chalk.red('❌ Model Error:'), error.message);
          }
        } else {
          console.error(chalk.red('❌ Unknown error occurred'));
        }
        
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize model:'), error instanceof Error ? error.message : 'Unknown error');
      
      if (error instanceof Error && error.message.includes('region')) {
        console.log(chalk.yellow('💡 Make sure AWS_REGION is set correctly in your environment'));
      }
      
      process.exit(1);
    }
  },
};
