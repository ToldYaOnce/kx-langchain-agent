# 🚀 Deployment Checklist - Phase A & B

## ✅ Pre-Deployment Verification

### 1. Build Status
- [x] TypeScript compilation passes (`npm run build`)
- [x] No runtime errors
- [ ] Type definitions regenerated (will happen on publish)

### 2. Code Changes Review
- [x] `goal-orchestrator.ts` - Completely refactored with Phase A & B features
- [x] `agent.ts` - Updated to call new orchestrator signature
- [x] `dynamodb-schemas.ts` - Added `eventName` and `payload` to `ActionTrigger`

### 3. Documentation Complete
- [x] `GOAL_ORCHESTRATION_TEST_PLAN.md` - 120+ test cases
- [x] `IMPLEMENTATION_SUMMARY.md` - Technical implementation details
- [x] `GOAL_CONFIG_EXAMPLE.json` - Production-ready example configuration
- [x] `READY_TO_TEST.md` - Quick test guide for developers

---

## 📦 Deployment Steps

### Step 1: Publish Runtime Package
```bash
cd packages/runtime

# Verify build is clean
npm run build

# Bump version (patch = 1.1.107 -> 1.1.108)
npm version patch

# Publish to NPM registry
npm publish
```

**Expected Output:**
```
✓ @toldyaonce/kx-langchain-agent-runtime@1.1.108 published
```

---

### Step 2: Update IAC Package (if needed)
```bash
cd ../iac

# Update runtime dependency
npm install @toldyaonce/kx-langchain-agent-runtime@latest

# Build
npm run build

# Bump version
npm version patch

# Publish
npm publish
```

---

### Step 3: Update Infrastructure Package (if needed)
```bash
cd ../infra

# Update runtime dependency
npm install @toldyaonce/kx-langchain-agent-runtime@latest

# Build
npm run build

# Bump version
npm version patch

# Publish
npm publish
```

---

### Step 4: Deploy to AWS (kx-aws)
```bash
cd ../../../kx-aws  # or wherever your kx-aws project is

# Update dependencies
npm install @toldyaonce/kx-langchain-agent-runtime@latest
npm install @toldyaonce/kx-langchain-agent-iac@latest

# Clear CDK cache (important!)
rm -rf cdk.out
rm -rf node_modules/.cache

# Synthesize stack
npx cdk synth KxGenStack

# Deploy
npx cdk deploy KxGenStack --require-approval never
```

**Expected Output:**
```
✓ KxGenStack: deployment completed
  - LambdaFunction updated
  - Environment variables set
```

---

### Step 5: Configure Goals in DynamoDB

#### Option A: Via AWS Console
1. Open DynamoDB console
2. Navigate to `DelayedReplies-company_info` table
3. Find your tenant record
4. Edit item and add `goalConfiguration` attribute
5. Paste content from `GOAL_CONFIG_EXAMPLE.json`

#### Option B: Via AWS CLI
```bash
# Create a file: goal-config.json with your configuration

aws dynamodb update-item \
  --table-name DelayedReplies-company_info \
  --key '{"tenantId": {"S": "tenant_YOUR_ID_HERE"}}' \
  --update-expression "SET goalConfiguration = :config" \
  --expression-attribute-values file://goal-config.json
```

---

### Step 6: Verify Deployment

#### 6.1 Check Lambda Function
```bash
# Get Lambda function info
aws lambda get-function \
  --function-name LangchainAgent-agent-router \
  --query 'Configuration.Environment.Variables'
```

**Expected:** Should include all required env vars

#### 6.2 Test Agent Response
1. Open your chat UI
2. Send: "Hi, I want to get started"
3. Check CloudWatch logs for:
```
🎯 Goal Orchestration START
📊 State: 1 messages, 0 completed, 0 active
✅ N eligible goals
```

#### 6.3 Test Data Extraction
1. Chat: "My email is test@example.com"
2. Check logs for:
```
📥 Extracted email: test@example.com
```

#### 6.4 Test Goal Completion
1. Provide all required fields (email, phone, name)
2. Check logs for:
```
✅ Goal completed: collect_contact_info
🚀 Executing action: convert_anonymous_to_lead
✅ Published event: lead.contact_captured
```

#### 6.5 Check EventBridge
```bash
# List recent events
aws events list-rule-targets-by-rule \
  --rule your-rule-name
```

Or check EventBridge console for `lead.contact_captured` events

---

## 🐛 Troubleshooting

### Issue: Old code still running
**Symptoms:** Logs show old version, missing new features

**Solution:**
```bash
# Force clean rebuild
cd kx-aws
rm -rf cdk.out
rm -rf node_modules/@toldyaonce
npm install
npx cdk deploy --force
```

### Issue: Goals not activating
**Symptoms:** No goal logs, agent doesn't ask for info

**Check:**
1. Is `goalConfiguration.enabled: true`?
2. Does company have goals configured in DynamoDB?
3. Check logs for "Goal orchestration enabled"
4. Verify `effectiveGoalConfig` is loaded

### Issue: Data not extracting
**Symptoms:** User provides email but nothing extracted

**Check:**
1. Logs for `📥 Extracted` messages
2. Regex patterns in `extractFieldValue()` method
3. Validation rules in goal configuration

### Issue: Events not publishing
**Symptoms:** Goals complete but no EventBridge events

**Check:**
1. Is `eventBridgeService` passed to `GoalOrchestrator`?
2. Do goals have `actions.onComplete` defined?
3. Check CloudWatch for EventBridge errors
4. Verify EventBridge permissions on Lambda role

### Issue: Agent too pushy/not pushy enough
**Solution:** Adjust `adherence` levels:
- Too pushy → Lower to 3-5
- Not pushy enough → Raise to 8-10

### Issue: Goals in wrong order
**Solution:** Check `order` field values (1, 2, 3...)

### Issue: TypeScript errors after deployment
**Symptom:** Linter shows "Expected 5-6 arguments, but got 7"

**Cause:** Type definitions (.d.ts) not regenerated

**Solution:**
```bash
cd packages/runtime
npm run build
npm publish  # This regenerates and publishes .d.ts files
```

---

## 📊 Post-Deployment Monitoring

### CloudWatch Logs to Watch
```bash
# Stream Lambda logs
aws logs tail /aws/lambda/LangchainAgent-agent-router --follow
```

**Key Patterns:**
- `🎯 Goal Orchestration START` - Orchestration running
- `✅ N eligible goals` - Goals being evaluated
- `📥 Extracted` - Data extraction working
- `✅ Goal completed` - Goal completion
- `🚀 Executing action` - Actions firing
- `✅ Published event` - Events publishing

### Metrics to Track
1. **Goal Completion Rate** - % of goals that complete
2. **Average Attempts Per Goal** - How many tries to complete
3. **Event Delivery Rate** - % of events successfully published
4. **Conversation Length** - Messages until goal completion

### EventBridge Events to Monitor
```bash
# Query events
aws events put-events --entries file://test-event.json
```

**Expected Events:**
- `lead.contact_captured` - Contact info collected
- `appointment.requested` - Consultation scheduled
- `notification.new_lead` - Notifications sent
- `crm.lead_qualified` - Lead qualified

---

## ✅ Success Criteria

### Functional Tests Pass
- [ ] Goals activate in correct order
- [ ] Data extraction works (email, phone, name)
- [ ] Goals complete when all fields collected
- [ ] Events publish to EventBridge
- [ ] Triggers work (afterGoals, userSignals, messageCount)
- [ ] Adherence levels affect agent behavior

### Performance Metrics
- [ ] Response time < 3s (including goal orchestration)
- [ ] No Lambda timeout errors
- [ ] Event delivery success rate > 95%

### User Experience
- [ ] Agent feels natural, not robotic
- [ ] Follows conversation flow
- [ ] Doesn't repeat questions
- [ ] Respects user preferences

---

## 🎯 Next Steps After Deployment

### Immediate (Day 1)
1. Monitor CloudWatch logs for errors
2. Test all 8 scenarios from `READY_TO_TEST.md`
3. Verify events in EventBridge console
4. Check DynamoDB for goal state (when Phase C is implemented)

### Short Term (Week 1)
1. Analyze goal completion rates
2. Adjust adherence levels based on user feedback
3. Refine trigger conditions (userSignals, messageCount)
4. Optimize goal ordering

### Medium Term (Month 1)
1. **Implement Phase C** - Channel state persistence
2. **Implement Phase D** - Inbound event handler (lead.created)
3. Add custom field extraction (LLM-based)
4. A/B test different goal configurations

---

## 📞 Support & Escalation

### If Deployment Fails
1. Check CloudWatch logs: `/aws/lambda/LangchainAgent-agent-router`
2. Check CDK deployment logs
3. Verify all environment variables set
4. Confirm DynamoDB tables accessible

### If Tests Fail
1. Review test logs in `READY_TO_TEST.md`
2. Check goal configuration JSON validity
3. Verify regex patterns in validation rules
4. Confirm EventBridge setup correct

### If Performance Issues
1. Check Lambda memory/timeout settings
2. Review goal configuration complexity
3. Optimize regex patterns
4. Consider implementing Phase C for state caching

---

## 📝 Deployment Log Template

```
Date: ___________
Deployed By: ___________
Version: 1.1.108

Pre-Deployment:
- [ ] Build passed
- [ ] Tests reviewed
- [ ] Documentation complete

Deployment:
- [ ] Runtime published: v______
- [ ] IAC published: v______ (if updated)
- [ ] Infra published: v______ (if updated)
- [ ] AWS deployed: Stack______
- [ ] Goals configured in DynamoDB

Verification:
- [ ] Lambda logs show new version
- [ ] Goals activating correctly
- [ ] Data extracting correctly
- [ ] Events publishing correctly

Issues Encountered:
___________________________________________

Rollback Plan (if needed):
___________________________________________

Sign-off: ___________
```

---

**Ready to deploy!** 🚀

Follow the steps above, check each box, and monitor the logs. You got this! 💪

