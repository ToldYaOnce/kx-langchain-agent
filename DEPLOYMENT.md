# KxGen LangChain Agent - Deployment Guide

This guide walks you through deploying the KxGen LangChain Agent to your AWS environment.

## Prerequisites

### AWS Account Setup

1. **AWS CLI** configured with appropriate permissions
2. **CDK v2** installed: `npm install -g aws-cdk`
3. **Node.js 20+** for Lambda runtime compatibility
4. **Yarn** for workspace management

### Required AWS Resources

Before deploying the agent, ensure you have:

1. **EventBridge Custom Bus** for event routing
2. **DynamoDB Tables** for messages and leads storage
3. **Bedrock Model Access** in your target region

### IAM Permissions

Your deployment role needs:
- CloudFormation: Full access
- IAM: Create/update roles and policies  
- Lambda: Create/update functions
- EventBridge: Create/update rules
- DynamoDB: Read/write access to tables
- Bedrock: InvokeModel permissions

## Step 1: Environment Setup

### Clone and Install

```bash
git clone <repository-url>
cd kx-langchain-agent
yarn install
yarn build
```

### Environment Configuration

Copy and customize the environment template:

```bash
cp env.example .env.local
```

Edit `.env.local`:
```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_PROFILE=your-profile

# Required Resources
EVENT_BUS_ARN=arn:aws:events:us-east-1:123456789012:event-bus/kxgen-events
MESSAGES_TABLE=kxgen-messages
LEADS_TABLE=kxgen-leads
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0

# Optional
OPENSEARCH_COLLECTION_ARN=arn:aws:aoss:us-east-1:123456789012:collection/kxgen-rag
PUT_EVENTS_ROLE_ARN=arn:aws:iam::123456789012:role/CrossAccountEventBridge
```

## Step 2: Create Required AWS Resources

### EventBridge Custom Bus

```bash
aws events create-event-bus --name kxgen-events
```

### DynamoDB Tables

#### Messages Table
```bash
aws dynamodb create-table \
  --table-name kxgen-messages \
  --attribute-definitions \
    AttributeName=contact_pk,AttributeType=S \
    AttributeName=ts,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
  --key-schema \
    AttributeName=contact_pk,KeyType=HASH \
    AttributeName=ts,KeyType=RANGE \
  --global-secondary-indexes \
    IndexName=GSI1,KeySchema='[{AttributeName=GSI1PK,KeyType=HASH},{AttributeName=GSI1SK,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

#### Leads Table (if not existing)
```bash
aws dynamodb create-table \
  --table-name kxgen-leads \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=phone_e164,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    IndexName=PhoneIndex,KeySchema='[{AttributeName=PK,KeyType=HASH},{AttributeName=phone_e164,KeyType=RANGE}]',Projection='{ProjectionType=ALL}',ProvisionedThroughput='{ReadCapacityUnits=5,WriteCapacityUnits=5}' \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

### Bedrock Model Access

Enable model access in the Bedrock console or via CLI:

```bash
# List available models
aws bedrock list-foundation-models --region us-east-1

# Request access to Claude models (if needed)
# This typically requires console access for first-time setup
```

## Step 3: Deploy the Agent

### Bootstrap CDK (First Time Only)

```bash
cd packages/iac
cdk bootstrap aws://YOUR-ACCOUNT/us-east-1
```

### Deploy Stack

```bash
# Synthesize CloudFormation templates
cdk synth

# Review changes
cdk diff

# Deploy
cdk deploy
```

### Verify Deployment

```bash
# Check Lambda functions
aws lambda list-functions --query 'Functions[?contains(FunctionName, `agent`)].FunctionName'

# Check EventBridge rules
aws events list-rules --event-bus-name kxgen-events

# Test function permissions
aws lambda get-policy --function-name YOUR-AGENT-FUNCTION-NAME
```

## Step 4: Test the Deployment

### Local CLI Testing

```bash
# Test with local DynamoDB
yarn local:ddb

# Interactive chat
yarn dev:cli chat --tenantId test --email test@example.com

# Simulate inbound message
yarn dev:cli simulate inbound \
  --tenantId test \
  --source sms \
  --text "Hello!" \
  --phone "+1234567890"
```

### Production Testing

```bash
# Test against deployed infrastructure
export DYNAMODB_ENDPOINT=""  # Use real DynamoDB
yarn dev:cli chat --tenantId prod-test --email test@example.com
```

### EventBridge Integration Test

Publish a test event to your EventBridge bus:

```bash
aws events put-events \
  --entries '[{
    "Source": "kxgen.messaging",
    "DetailType": "lead.message.created",
    "Detail": "{\"tenantId\":\"test\",\"email_lc\":\"test@example.com\",\"source\":\"chat\",\"text\":\"Hello from EventBridge!\",\"timestamps\":{\"received\":\"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'\"}}",
    "EventBusName": "kxgen-events"
  }]'
```

## Step 5: Monitor and Observe

### CloudWatch Logs

Monitor Lambda function logs:

```bash
# Agent Router logs
aws logs tail /aws/lambda/YOUR-STACK-agent-router --follow

# Agent logs  
aws logs tail /aws/lambda/YOUR-STACK-agent --follow
```

### CloudWatch Metrics

Key metrics to monitor:
- Lambda Duration, Errors, Invocations
- DynamoDB ConsumedReadCapacityUnits, ConsumedWriteCapacityUnits
- EventBridge SuccessfulInvocations, FailedInvocations

### Custom Dashboards

Create CloudWatch dashboards for:
- Agent response times
- Message processing volume
- Error rates by tenant
- Bedrock API usage

## Troubleshooting

### Common Issues

1. **Permission Errors**
   ```bash
   # Check IAM role permissions
   aws iam get-role-policy --role-name YOUR-LAMBDA-ROLE --policy-name YOUR-POLICY
   
   # Test Bedrock access
   aws bedrock invoke-model --model-id anthropic.claude-3-sonnet-20240229-v1:0 --body '{"prompt":"Test","max_tokens":10}' /tmp/response.json
   ```

2. **EventBridge Issues**
   ```bash
   # Check rule targets
   aws events list-targets-by-rule --rule YOUR-RULE-NAME --event-bus-name kxgen-events
   
   # Test event pattern
   aws events test-event-pattern --event-pattern file://pattern.json --event file://test-event.json
   ```

3. **DynamoDB Issues**
   ```bash
   # Check table status
   aws dynamodb describe-table --table-name kxgen-messages
   
   # Monitor throttling
   aws cloudwatch get-metric-statistics --namespace AWS/DynamoDB --metric-name ThrottledRequests --dimensions Name=TableName,Value=kxgen-messages --start-time 2024-01-01T00:00:00Z --end-time 2024-01-01T01:00:00Z --period 300 --statistics Sum
   ```

### Debug Mode

Enable debug logging:

```bash
# Update Lambda environment variables
aws lambda update-function-configuration \
  --function-name YOUR-FUNCTION-NAME \
  --environment Variables='{LOG_LEVEL=debug}'
```

### Performance Tuning

1. **Lambda Memory**: Increase for faster LLM processing
2. **DynamoDB Capacity**: Scale based on message volume
3. **Connection Pooling**: Monitor concurrent executions
4. **Token Management**: Adjust history limits for performance

## Multi-Environment Deployment

### Development Environment

```bash
cdk deploy --context environment=dev
```

### Staging Environment

```bash
cdk deploy --context environment=staging
```

### Production Environment

```bash
cdk deploy --context environment=prod --require-approval never
```

### Environment-Specific Configuration

Use CDK context or environment variables:

```typescript
const environment = this.node.tryGetContext('environment') || 'dev';
const config = {
  dev: {
    bedrockModel: 'anthropic.claude-3-haiku-20240307-v1:0',
    historyLimit: 20,
  },
  prod: {
    bedrockModel: 'anthropic.claude-3-sonnet-20240229-v1:0', 
    historyLimit: 50,
  },
}[environment];
```

## Security Considerations

### IAM Best Practices

1. **Least Privilege**: Grant minimal required permissions
2. **Resource-Specific**: Use ARNs instead of wildcards
3. **Condition Keys**: Add IP/time-based restrictions where appropriate

### Data Protection

1. **Encryption**: Enable DynamoDB encryption at rest
2. **VPC**: Deploy Lambda functions in private subnets
3. **Secrets**: Use AWS Secrets Manager for sensitive configuration

### Monitoring

1. **CloudTrail**: Enable API call logging
2. **GuardDuty**: Monitor for suspicious activity
3. **Config**: Track configuration changes

## Cost Optimization

### Lambda Optimization

- Use ARM64 architecture for better price/performance
- Right-size memory allocation based on actual usage
- Enable Provisioned Concurrency for consistent performance

### DynamoDB Optimization

- Use On-Demand billing for unpredictable workloads
- Implement TTL for automatic message cleanup
- Monitor and adjust GSI usage

### Bedrock Optimization

- Choose appropriate models for use case (Haiku for speed, Sonnet for balance)
- Implement request batching where possible
- Monitor token usage and optimize prompts

## Maintenance

### Regular Tasks

1. **Update Dependencies**: Keep CDK and runtime dependencies current
2. **Monitor Costs**: Review AWS Cost Explorer monthly
3. **Performance Review**: Analyze CloudWatch metrics weekly
4. **Security Patches**: Apply security updates promptly

### Backup and Recovery

1. **DynamoDB Backups**: Enable point-in-time recovery
2. **Configuration Backup**: Store CDK code in version control
3. **Disaster Recovery**: Document cross-region deployment procedures

This completes the deployment guide. The agent should now be fully operational and ready to process multi-channel conversations with LangChain and Bedrock integration.
