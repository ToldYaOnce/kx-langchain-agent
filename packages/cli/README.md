# @kxgen/langchain-agent-cli

Local development and testing CLI for the KxGen LangChain agent.

## Overview

The `kxagent` CLI provides comprehensive local development and testing capabilities:

- **Interactive Chat**: Test agent responses in real-time
- **Message Simulation**: Simulate inbound messages from different channels
- **Intent Management**: Configure and manage agent intents
- **Model Testing**: Test different Bedrock models with custom prompts
- **Offline Development**: Works with DynamoDB Local and FakeLLM

## Installation

### Global Installation

```bash
npm install -g @kxgen/langchain-agent-cli
# or
yarn global add @kxgen/langchain-agent-cli
```

### Local Development

```bash
# In the monorepo
yarn install
yarn build

# Run CLI in development mode
yarn dev:cli --help
```

## Quick Start

### 1. Environment Setup

Create `.env.local` in your project root:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=your-profile

# DynamoDB Tables
MESSAGES_TABLE=test-messages
LEADS_TABLE=test-leads

# Bedrock Configuration  
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# Local Development
DYNAMODB_ENDPOINT=http://localhost:8000
OUTBOUND_EVENT_BUS_NAME=test-event-bus
HISTORY_LIMIT=50
```

### 2. Start DynamoDB Local

```bash
# Using Docker
docker run -p 8000:8000 amazon/dynamodb-local

# Or using the workspace script
yarn local:ddb
```

### 3. Interactive Chat

```bash
kxagent chat --tenantId tenant1 --email user@example.com
```

## Commands

### `kxagent chat`

Start an interactive chat session with the agent.

```bash
kxagent chat --tenantId <id> --email <addr> [options]
```

**Required Options:**
- `--tenantId <id>`: Tenant identifier
- `--email <addr>`: Email address for the conversation

**Optional Options:**
- `--source <source>`: Message source (chat|sms|email) [default: chat]
- `--model <id>`: Override Bedrock model ID
- `--rag`: Enable RAG retrieval (if configured)
- `--history-limit <num>`: Conversation history limit [default: 50]
- `--session <id>`: Session ID for grouping messages
- `--debug`: Enable debug logging

**Example:**
```bash
# Basic chat
kxagent chat --tenantId acme-corp --email john@example.com

# Chat with custom model and debug
kxagent chat \
  --tenantId acme-corp \
  --email john@example.com \
  --model anthropic.claude-3-haiku-20240307-v1:0 \
  --debug

# SMS-style conversation
kxagent chat \
  --tenantId acme-corp \
  --email john@example.com \
  --source sms \
  --session mobile-session-1
```

**Interactive Commands:**
- Type messages normally to chat with the agent
- `exit`: Quit the chat session
- `clear`: Clear conversation history

### `kxagent simulate inbound`

Simulate inbound message processing without deploying to AWS.

```bash
kxagent simulate inbound --tenantId <id> --source <source> --text <text> [options]
```

**Required Options:**
- `--tenantId <id>`: Tenant identifier
- `--source <source>`: Message source (sms|email|chat|api)
- `--text <text>`: Message content

**Optional Options:**
- `--phone <phone>`: Phone number (required for SMS)
- `--email <addr>`: Email address (required for email/chat)
- `--put-events`: Publish to actual EventBridge bus (not implemented in demo)

**Examples:**
```bash
# Simulate SMS message
kxagent simulate inbound \
  --tenantId acme-corp \
  --source sms \
  --text "Hello, I need help with my order" \
  --phone "+1234567890"

# Simulate email
kxagent simulate inbound \
  --tenantId acme-corp \
  --source email \
  --text "Can you help me reset my password?" \
  --email "customer@example.com"

# Simulate chat message
kxagent simulate inbound \
  --tenantId acme-corp \
  --source chat \
  --text "What are your business hours?" \
  --email "visitor@example.com"
```

### `kxagent intents`

Manage agent intents and prompts.

#### `kxagent intents add`

Add or update an intent configuration.

```bash
kxagent intents add --tenantId <id> --name <name> --prompt <prompt> [options]
```

**Required Options:**
- `--tenantId <id>`: Tenant identifier
- `--name <name>`: Intent name
- `--prompt <prompt>`: Prompt text or file path

**Optional Options:**
- `--route <channel>`: Preferred response channel (chat|sms|email)

**Examples:**
```bash
# Add intent with inline prompt
kxagent intents add \
  --tenantId acme-corp \
  --name greeting \
  --prompt "You are a friendly customer service agent. Always greet customers warmly."

# Add intent from file
kxagent intents add \
  --tenantId acme-corp \
  --name product-support \
  --prompt ./prompts/product-support.txt \
  --route email

# Update existing intent
kxagent intents add \
  --tenantId acme-corp \
  --name greeting \
  --prompt "You are a helpful AI assistant for Acme Corp. Be professional but friendly."
```

#### `kxagent intents list`

List configured intents for a tenant.

```bash
kxagent intents list --tenantId <id> [options]
```

**Required Options:**
- `--tenantId <id>`: Tenant identifier

**Optional Options:**
- `--describe <name>`: Show detailed information for a specific intent

**Examples:**
```bash
# List all intents
kxagent intents list --tenantId acme-corp

# Describe specific intent
kxagent intents list --tenantId acme-corp --describe greeting
```

### `kxagent models`

Manage and test Bedrock models.

#### `kxagent models list`

List available Bedrock models.

```bash
kxagent models list
```

**Example Output:**
```
🤖 Available Bedrock Models

Supported Models:

● Claude 3 Sonnet (Anthropic)
  ID: anthropic.claude-3-sonnet-20240229-v1:0
  Description: Balanced performance and speed

● Claude 3 Haiku (Anthropic)  
  ID: anthropic.claude-3-haiku-20240307-v1:0
  Description: Fast and efficient

● Titan Text Express (Amazon)
  ID: amazon.titan-text-express-v1
  Description: Fast text generation
```

#### `kxagent models test`

Test a specific model with a custom prompt.

```bash
kxagent models test --model <id> --prompt <text>
```

**Required Options:**
- `--model <id>`: Bedrock model identifier
- `--prompt <text>`: Test prompt

**Examples:**
```bash
# Test Claude Sonnet
kxagent models test \
  --model anthropic.claude-3-sonnet-20240229-v1:0 \
  --prompt "Explain quantum computing in simple terms"

# Test Haiku for speed
kxagent models test \
  --model anthropic.claude-3-haiku-20240307-v1:0 \
  --prompt "What is 2+2?"

# Test with longer prompt
kxagent models test \
  --model amazon.titan-text-express-v1 \
  --prompt "Write a professional email declining a meeting request"
```

## Configuration

### Environment Variables

The CLI loads configuration from `.env.local` and environment variables:

**Required:**
- `AWS_REGION`: AWS region for Bedrock and DynamoDB
- `MESSAGES_TABLE`: DynamoDB table name for message storage
- `LEADS_TABLE`: DynamoDB table name for lead lookup
- `BEDROCK_MODEL_ID`: Default Bedrock model identifier

**Optional:**
- `AWS_PROFILE`: AWS CLI profile to use
- `DYNAMODB_ENDPOINT`: DynamoDB Local endpoint (e.g., http://localhost:8000)
- `OUTBOUND_EVENT_BUS_NAME`: EventBridge bus name for events
- `HISTORY_LIMIT`: Default conversation history limit
- `LOG_LEVEL`: Logging level (debug, info, warn, error)

### Local Development Setup

1. **DynamoDB Local**
```bash
# Start DynamoDB Local
docker run -p 8000:8000 amazon/dynamodb-local

# Create required tables
aws dynamodb create-table \
  --endpoint-url http://localhost:8000 \
  --table-name test-messages \
  --attribute-definitions \
    AttributeName=contact_pk,AttributeType=S \
    AttributeName=ts,AttributeType=S \
  --key-schema \
    AttributeName=contact_pk,KeyType=HASH \
    AttributeName=ts,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
```

2. **AWS Credentials**
```bash
# Configure AWS CLI
aws configure --profile your-profile

# Or use environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=us-east-1
```

3. **Bedrock Access**
```bash
# Ensure you have access to Bedrock models
aws bedrock list-foundation-models --region us-east-1
```

## Local Testing Workflow

### 1. Basic Agent Testing

```bash
# Start with a simple chat
kxagent chat --tenantId test --email test@example.com --debug

# Test different models
kxagent models test --model anthropic.claude-3-haiku-20240307-v1:0 --prompt "Hello"
```

### 2. Multi-Channel Testing

```bash
# Simulate SMS conversation
kxagent simulate inbound \
  --tenantId test \
  --source sms \
  --text "Hi there!" \
  --phone "+1234567890"

# Continue via chat
kxagent chat \
  --tenantId test \
  --email resolved-from-phone@example.com \
  --source chat
```

### 3. Intent Configuration

```bash
# Create customer service intent
kxagent intents add \
  --tenantId test \
  --name customer-service \
  --prompt "You are a helpful customer service agent for a SaaS company."

# Test the intent
kxagent chat --tenantId test --email test@example.com
```

### 4. Performance Testing

```bash
# Test with history limit
kxagent chat \
  --tenantId test \
  --email test@example.com \
  --history-limit 10 \
  --debug

# Test different models for speed
kxagent models test --model anthropic.claude-3-haiku-20240307-v1:0 --prompt "Quick test"
```

## Offline Development

### FakeLLM Mode

For completely offline development, you can use LangChain's FakeLLM:

```bash
# Set environment variable
export FAKE_LLM=true

# CLI will use mock responses instead of Bedrock
kxagent chat --tenantId test --email test@example.com
```

### Mock EventBridge

The CLI simulates EventBridge events locally without requiring actual AWS EventBridge:

```bash
# Simulate without publishing to real EventBridge
kxagent simulate inbound \
  --tenantId test \
  --source sms \
  --text "Test message" \
  --phone "+1234567890"
```

## Troubleshooting

### Common Issues

1. **AWS Credentials**
```bash
# Check credentials
aws sts get-caller-identity

# Set profile
export AWS_PROFILE=your-profile
```

2. **DynamoDB Connection**
```bash
# Test DynamoDB Local
aws dynamodb list-tables --endpoint-url http://localhost:8000

# Check table exists
aws dynamodb describe-table --table-name test-messages --endpoint-url http://localhost:8000
```

3. **Bedrock Access**
```bash
# Check model access
aws bedrock get-foundation-model --model-identifier anthropic.claude-3-sonnet-20240229-v1:0

# List available models
aws bedrock list-foundation-models
```

### Debug Mode

Enable debug logging for detailed output:

```bash
kxagent chat --tenantId test --email test@example.com --debug
```

Debug output includes:
- Configuration values
- DynamoDB operations
- Bedrock API calls
- Event publishing
- Error stack traces

### Verbose Logging

Set log level in environment:

```bash
export LOG_LEVEL=debug
kxagent chat --tenantId test --email test@example.com
```

## Integration with Runtime

The CLI directly imports and uses the runtime package:

```typescript
import {
  DynamoDBService,
  AgentService,
  createTestConfig,
} from '@kxgen/langchain-agent-runtime';

// CLI uses the same services as deployed Lambda functions
const agentService = new AgentService(config);
const response = await agentService.processMessage(context);
```

This ensures:
- **Consistency**: Same code paths as production
- **Reliability**: Test exactly what will be deployed
- **Speed**: No network calls to Lambda functions

## Examples

### Customer Service Bot

```bash
# Configure customer service intent
kxagent intents add \
  --tenantId customer-service \
  --name support \
  --prompt "You are a customer service agent. Be helpful, professional, and empathetic. Always ask clarifying questions when needed."

# Test customer interactions
kxagent chat --tenantId customer-service --email customer@example.com
```

### Multi-Language Support

```bash
# Spanish support intent
kxagent intents add \
  --tenantId global-corp \
  --name spanish-support \
  --prompt "Eres un agente de servicio al cliente. Responde en español de manera profesional y útil."

# Test in Spanish
kxagent chat --tenantId global-corp --email cliente@example.com
```

### Sales Assistant

```bash
# Sales intent with specific routing
kxagent intents add \
  --tenantId sales-team \
  --name lead-qualification \
  --prompt "You are a sales assistant. Qualify leads by asking about their needs, budget, and timeline. Be consultative, not pushy." \
  --route email

# Simulate lead interaction
kxagent simulate inbound \
  --tenantId sales-team \
  --source email \
  --text "I'm interested in your enterprise plan" \
  --email "prospect@bigcorp.com"
```
