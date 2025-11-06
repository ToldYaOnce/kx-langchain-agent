# 🔧 Troubleshooting Guide

Common issues and solutions when integrating the KX LangChain Agent.

## 🚨 Common Issues

### 1. "Company table not found" / DynamoDB Access Errors

**Symptoms:**
- API endpoints return 500 errors
- Lambda logs show DynamoDB access denied
- "ResourceNotFoundException" for tables

**Solution:**
```typescript
// ✅ Ensure DelayedRepliesStack creates all required tables
const agentStack = new DelayedRepliesStack(this, 'MyAgentStack', {
  // This automatically creates:
  // - MyAgentStack-company-info
  // - MyAgentStack-personas
  // - kxgen-messages, kxgen-leads, kxgen-personas (defaults)
});

// ✅ Grant permissions to your Lambda functions
agentStack.companyInfoTable.grantReadWriteData(yourLambdaFunction);
agentStack.personasTable.grantReadWriteData(yourLambdaFunction);

// ✅ Set environment variables
const lambdaFunction = new lambda.Function(this, 'MyFunction', {
  environment: {
    COMPANY_INFO_TABLE: agentStack.companyInfoTable.tableName,
    PERSONAS_TABLE: agentStack.personasTable.tableName,
    // ... other required env vars
  }
});
```

### 2. API Gateway 404 Errors

**Symptoms:**
- API endpoints return 404 Not Found
- CORS preflight failures

**Solution:**
```typescript
// ✅ Use automatic API Gateway integration
const agentStack = new DelayedRepliesStack(this, 'MyAgentStack', {
  apiGatewayConfig: {
    existingApi: yourExistingApi,
    basePath: 'agent' // Optional prefix
  }
});

// ✅ Verify endpoints are created
// Should create: /agent/company-info/*, /agent/personas/*, /agent/company-persona/*
```

### 3. CORS Errors in Web Applications

**Symptoms:**
- Browser console shows CORS errors
- Preflight OPTIONS requests fail

**Solution:**
The automatic API Gateway integration handles CORS. If using manual setup:

```typescript
// ✅ Add CORS to your API Gateway methods
const corsOptions = {
  allowOrigins: apigateway.Cors.ALL_ORIGINS,
  allowMethods: apigateway.Cors.ALL_METHODS,
  allowHeaders: ['Content-Type', 'Authorization']
};

yourApiResource.addCorsPreflight(corsOptions);
```

### 4. Agent Not Finding Persona Data

**Symptoms:**
- Agent uses default/fallback responses
- Logs show "No persona found for tenant"

**Solution:**
```bash
# ✅ Create sample data first
curl -X POST https://your-api.com/agent/company-info/ \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "your-tenant-id",
    "name": "Your Company",
    "industry": "Your Industry",
    "description": "Company description"
  }'

curl -X POST https://your-api.com/agent/personas/ \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "your-tenant-id", 
    "personaId": "carlos",
    "name": "Carlos",
    "description": "Friendly assistant"
  }'

# ✅ Test combined endpoint
curl https://your-api.com/agent/company-persona/your-tenant-id/carlos
```

### 5. Lambda Function Timeout/Memory Issues

**Symptoms:**
- Lambda functions timeout
- Out of memory errors
- Slow API responses

**Solution:**
```typescript
// ✅ Increase timeout and memory for agent functions
const agentStack = new DelayedRepliesStack(this, 'MyAgentStack', {
  // Default settings are usually sufficient, but you can override:
});

// For custom Lambda functions:
const lambdaFunction = new lambda.Function(this, 'MyFunction', {
  timeout: Duration.seconds(30),  // Increase if needed
  memorySize: 512,               // Increase if needed
  // ...
});
```

### 6. EventBridge Integration Issues

**Symptoms:**
- Agent responses not received
- Delayed responses not working
- Missing typing indicators

**Solution:**
```typescript
// ✅ Ensure EventBridge rule is correctly configured
const agentResponseRule = new events.Rule(this, 'AgentResponseRule', {
  eventPattern: {
    source: ['kxgen.agent'],
    detailType: [
      'agent.reply.created',
      'agent.message.read', 
      'agent.typing.started',
      'agent.typing.stopped'
    ]
  }
});

// ✅ Grant EventBridge permissions
agentStack.releaseRouterFunction.addToRolePolicy(new iam.PolicyStatement({
  actions: ['events:PutEvents'],
  resources: ['*'] // Or specific EventBridge ARN
}));
```

## 🔍 Debug Commands

### Check DynamoDB Tables
```bash
# List tables
aws dynamodb list-tables

# Check table contents
aws dynamodb scan --table-name your-company-info-table --max-items 5
aws dynamodb scan --table-name your-personas-table --max-items 5
```

### Check API Gateway
```bash
# Test endpoints
curl -v https://your-api.com/agent/company-info/test-tenant
curl -v https://your-api.com/agent/personas/test-tenant
curl -v https://your-api.com/agent/company-persona/test-tenant
```

### Check Lambda Logs
```bash
# Tail Lambda logs
aws logs tail /aws/lambda/your-function-name --follow

# Check API Gateway logs
aws logs tail /aws/apigateway/your-api-id --follow
```

### Check EventBridge
```bash
# List rules
aws events list-rules --name-prefix your-rule-prefix

# Check rule targets
aws events list-targets-by-rule --rule your-rule-name
```

## 📋 Verification Checklist

Use this checklist to verify your setup:

### Infrastructure
- [ ] DelayedRepliesStack deployed successfully
- [ ] All 5 DynamoDB tables created (company-info, personas, messages, leads, personas)
- [ ] Lambda functions deployed and have correct permissions
- [ ] API Gateway endpoints responding (not 404)
- [ ] EventBridge rules configured for agent events

### Data Setup
- [ ] Sample company data created via API
- [ ] Sample persona data created via API
- [ ] Combined company-persona endpoint returns data
- [ ] Agent can load persona configuration

### Integration Testing
- [ ] API endpoints return 200 (not 500/404)
- [ ] CORS headers present in responses
- [ ] Agent processes test messages successfully
- [ ] EventBridge events are published
- [ ] Delayed responses work (if using that feature)

### Environment Variables
- [ ] `COMPANY_INFO_TABLE` set correctly
- [ ] `PERSONAS_TABLE` set correctly
- [ ] `MESSAGES_TABLE` set correctly
- [ ] `LEADS_TABLE` set correctly
- [ ] `RELEASE_QUEUE_URL` set (if using delayed responses)
- [ ] `EVENT_BUS_NAME` set correctly

## 🆘 Still Having Issues?

1. **Check the [Consumer Setup Guide](./CONSUMER_SETUP_GUIDE.md)** for complete setup instructions
2. **Review the [Management API Bootstrap Guide](./MANAGEMENT_API_BOOTSTRAP_GUIDE.md)** for detailed API integration
3. **Enable debug logging** in your Lambda functions
4. **Use AWS CloudWatch** to monitor API Gateway and Lambda metrics
5. **Test with minimal data** first, then add complexity

## 📞 Common Error Messages

| Error Message | Likely Cause | Solution |
|---------------|--------------|----------|
| `ResourceNotFoundException` | DynamoDB table doesn't exist | Deploy DelayedRepliesStack or create tables manually |
| `AccessDeniedException` | Lambda lacks DynamoDB permissions | Grant read/write permissions to tables |
| `404 Not Found` | API Gateway not configured | Use automatic API integration or configure manually |
| `CORS policy` | CORS headers missing | Enable CORS in API Gateway |
| `No persona found` | Missing persona data | Create sample company and persona data |
| `Task timed out` | Lambda timeout too low | Increase timeout and memory |

---

💡 **Pro Tip:** Start with the automatic API Gateway integration in DelayedRepliesStack - it handles most of the configuration automatically!
