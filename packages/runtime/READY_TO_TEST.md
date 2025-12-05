# ✅ Phase A & B Implementation - READY TO TEST!

## 🎉 What's Been Implemented

### ✅ Phase A: Enhanced Goal Orchestration
- **Goal Ordering**: Goals activate in sequence based on `order` field
- **Adherence Levels (1-10)**: Control how persistently agent pursues each goal
- **Trigger Evaluation**:
  - `afterGoals` - Dependency chains
  - `userSignals` - Keyword detection
  - `messageCount` - Timing thresholds
- **Strict Ordering**: Force one goal at a time (`strictOrdering >= 7`)
- **Max Goals Per Turn**: Limit goals mentioned per response

### ✅ Phase B: Dynamic Data Collection
- **Custom Field Extraction**: Extract ANY field defined in `dataToCapture.fields`
- **Validation Rules**: Regex patterns, required/optional fields
- **Auto Goal Completion**: Goals complete when all required fields collected
- **Auto Action Execution**: Events publish to EventBridge on goal completion

---

## 📝 Quick Test Guide

### Test 1: Basic Goal Ordering
**Setup:** Create 3 goals with `order: 1, 2, 3`

**Expected:** Goals activate in sequence: Trust → Contact → Schedule

**How to Test:**
1. Deploy with the example config (`GOAL_CONFIG_EXAMPLE.json`)
2. Start a chat: "Hi"
3. Observe: Agent establishes trust first (order: 1)
4. Continue conversation
5. Observe: Agent asks for contact info (order: 2)
6. Provide contact: "john@example.com and 555-1234"
7. Observe: Agent moves to scheduling (order: 3)

---

### Test 2: Adherence Levels
**Setup:** Set `collect_contact_info` with `adherence: 10`

**Expected:** Agent persistently asks for contact info, uses direct approach

**How to Test:**
1. Chat: "I want to lose weight"
2. Agent asks for contact
3. Ignore and say: "Tell me about your programs"
4. Observe: Agent redirects back to contact request
5. Say: "Maybe later"
6. Observe: Agent persists (up to `maxAttempts`)

---

### Test 3: Trigger - `afterGoals`
**Setup:** `schedule_consultation` requires `collect_contact_info` first

**Expected:** Scheduling goal doesn't activate until contact is collected

**How to Test:**
1. Chat: "I want to schedule a visit"
2. Observe: Agent asks for contact first (dependency not met)
3. Provide: "john@example.com"
4. Say: "Now can I schedule?"
5. Observe: Agent now allows scheduling (dependency met)

---

### Test 4: Trigger - `userSignals`
**Setup:** `discuss_pricing` activates on keywords: "price", "cost", "how much"

**Expected:** Pricing goal activates when user mentions price

**How to Test:**
1. Chat normally without mentioning price
2. Observe: No pricing discussion
3. Say: "How much does it cost?"
4. Observe: Pricing goal activates immediately

---

### Test 5: Trigger - `messageCount`
**Setup:** `collect_contact` activates at message 3

**Expected:** Contact collection doesn't happen until message 3

**How to Test:**
1. Message 1: "Hi"
2. Message 2: "Tell me about your gym"
3. Observe: No contact request yet
4. Message 3: "Sounds good"
5. Observe: Agent now asks for contact

---

### Test 6: Data Extraction
**Setup:** Goal collects `email`, `phone`, `name`

**Expected:** Agent extracts all three fields from natural language

**How to Test:**
1. Say: "My email is john@example.com"
2. Check logs: `📥 Extracted email: john@example.com`
3. Say: "You can reach me at 555-1234"
4. Check logs: `📥 Extracted phone: 555-1234`
5. Say: "My name is John"
6. Check logs: `📥 Extracted name: John`
7. Check logs: `✅ Goal completed: collect_contact_info`
8. Check EventBridge: `lead.contact_captured` event published

---

### Test 7: Strict Ordering
**Setup:** `strictOrdering: 9`

**Expected:** Only ONE goal active at a time

**How to Test:**
1. Check logs after each message
2. Observe: `🔒 Strict ordering enabled (9/10) - limiting to 1 goal`
3. Observe: Only one goal mentioned in each response
4. Agent won't move to next goal until current one completes

---

### Test 8: Max Goals Per Turn
**Setup:** `maxGoalsPerTurn: 2`

**Expected:** Agent mentions max 2 goals per response

**How to Test:**
1. Have 5 eligible goals
2. Check logs: `📏 Max goals per turn: 2`
3. Observe: Agent only mentions 2 goals, not all 5

---

## 📊 Key Logs to Watch

### Goal Orchestration Logs:
```
🎯 Goal Orchestration START - Session: xxx
📊 State: 3 messages, 1 completed, 1 active
✅ 4 eligible goals (from 6 total)
🎯 3 goals to activate (after constraints)
📋 Generated 3 recommendations
```

### Trigger Evaluation Logs:
```
🔗 afterGoals check: true (requires: collect_contact_info)
📊 messageCount check: true (3 >= 3)
🔍 userSignals check: true (looking for: price, cost)
```

### Data Extraction Logs:
```
📥 Extracted email: john@example.com
📥 Extracted phone: 555-1234
📥 Extracted name: John
✅ Goal completed: collect_contact_info
```

### Action Execution Logs:
```
🎯 Executing 2 actions for goal: collect_contact_info
🚀 Executing action: convert_anonymous_to_lead for goal: collect_contact_info
✅ Published event: lead.contact_captured
```

### Goal Completion Logs:
```
✅ Newly completed goals: collect_contact_info
🎉 Goal combo triggered: high_intent_lead
```

---

## 🐛 Debugging Tips

### Goal Not Activating?
1. Check logs for trigger evaluation
2. Verify dependencies are met (`afterGoals`)
3. Check `messageCount` threshold
4. Check `userSignals` keywords
5. Verify not in `declinedGoals` or `completedGoals`

### Data Not Extracting?
1. Check regex patterns (email, phone work well)
2. Custom fields need LLM enhancement (Phase B TODO)
3. Check validation rules
4. Look for `📥 Extracted` logs

### Events Not Publishing?
1. Verify `eventBridgeService` passed to `GoalOrchestrator`
2. Check `actions.onComplete` defined
3. Look for `🚀 Executing action` and `✅ Published event` logs
4. Check EventBridge console for events

### Agent Too Pushy?
1. Lower `adherence` (try 3-5)
2. Reduce `maxAttempts`
3. Use `backoffStrategy: "gentle"`

### Agent Not Pushy Enough?
1. Raise `adherence` (try 8-10)
2. Increase `maxAttempts`
3. Use `backoffStrategy: "persistent"` or `"aggressive"`
4. Set `priority: "critical"`

---

## 📁 Key Files

- **Implementation:** `packages/runtime/src/lib/goal-orchestrator.ts`
- **Types:** `packages/runtime/src/types/dynamodb-schemas.ts`
- **Integration:** `packages/runtime/src/lib/agent.ts`
- **Test Plan:** `packages/runtime/GOAL_ORCHESTRATION_TEST_PLAN.md`
- **Example Config:** `packages/runtime/GOAL_CONFIG_EXAMPLE.json`
- **Summary:** `packages/runtime/IMPLEMENTATION_SUMMARY.md`

---

## 🚀 Deployment Steps

### 1. Build & Publish Runtime Package
```bash
cd packages/runtime
npm run build
npm version patch
npm publish
```

### 2. Update Dependencies
```bash
# In kx-aws or wherever you use the agent
npm install @toldyaonce/kx-langchain-agent-runtime@latest
```

### 3. Deploy Infrastructure
```bash
cd kx-aws  # or your infrastructure repo
npx cdk deploy
```

### 4. Configure Goals
Add `goalConfiguration` to your `company_info` DynamoDB record:
```json
{
  "tenantId": "tenant_xxx",
  "name": "Your Company",
  "goalConfiguration": {
    // ... paste from GOAL_CONFIG_EXAMPLE.json
  }
}
```

### 5. Test in Chat
Open your chat UI and start a conversation!

---

## ✅ Build Status

**Last Build:** ✅ SUCCESS (TypeScript compilation passed)

**Version:** 1.4.0

**Features Complete:**
- ✅ Phase A: Enhanced Goal Orchestration
- ✅ Phase B: Dynamic Data Collection

**Remaining:**
- 🟡 Phase C: Channel State Persistence (goals reset on Lambda cold start)
- 🟡 Phase D: Inbound Event Handler (lead.created listener)

---

## 🎯 Next Steps

1. **Test Phase A & B** using the test guide above
2. **Iterate on goal configuration** based on user behavior
3. **Implement Phase C** (state persistence) for production use
4. **Implement Phase D** (event handler) for CRM integration

---

## 💡 Pro Tips

- Start with **low adherence (3-5)** and gradually increase
- Use **`strictOrdering: 7+`** for guided, linear flows
- Use **`strictOrdering: 0-5`** for flexible, opportunistic flows
- Set **`maxGoalsPerTurn: 1`** for focused conversations
- Set **`maxGoalsPerTurn: 2-3`** for multi-threaded conversations
- Always define **`actions.onComplete`** to capture goal completion events
- Use **`userSignals`** liberally to make goals reactive to user intent

---

**Ready to test!** 🚀

Start with Test 1 (Basic Goal Ordering) and work your way through. Check CloudWatch logs for detailed debugging.

Happy testing! 💪

