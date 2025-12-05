# Goal Orchestration - Comprehensive Test Plan

## Overview
This test plan covers all goal orchestration features, including both implemented and upcoming functionality.

---

## ✅ PHASE 0: Already Implemented Features

### 0.1 Company-Level Goal Configuration Loading
**Feature:** Agent loads goalConfiguration from company_info table and prioritizes it over persona-level goals.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| 0.1.1 | Company goals loaded | Set goalConfiguration in company_info DynamoDB | Agent uses company goals | Check CloudWatch for "📊 Using company-level goal configuration" |
| 0.1.2 | Fallback to persona goals | Remove goalConfiguration from company_info | Agent uses persona goals | Check CloudWatch for "📊 Using persona-level goal configuration" |
| 0.1.3 | No goals defined | Remove goals from both sources | Agent operates without goals | No goal-related prompts appear |

**Test Data (DynamoDB - company_info):**
```json
{
  "tenantId": "tenant_test_001",
  "goalConfiguration": {
    "globalSettings": {
      "strictOrdering": true,
      "maxGoalsPerTurn": 1
    },
    "goals": [
      {
        "id": "collect_contact_info",
        "name": "Collect Contact Information",
        "description": "Get user's email, phone, name",
        "importance": 10,
        "order": 1,
        "adherence": 10,
        "dataToCapture": {
          "fields": ["email", "phone", "name"]
        },
        "actions": [
          {
            "type": "convert_anonymous_to_lead",
            "eventName": "lead.contact_captured",
            "payload": {
              "source": "chat_agent"
            }
          }
        ]
      }
    ]
  }
}
```

---

### 0.2 Event Publishing on Goal Completion
**Feature:** When goals complete, agent publishes events to EventBridge.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| 0.2.1 | Contact info captured | Complete collect_contact_info goal | `lead.contact_captured` event published | Check EventBridge logs for event |
| 0.2.2 | Appointment requested | Complete schedule_appointment goal | `appointment.requested` event published | Check EventBridge logs |
| 0.2.3 | Custom event | Define custom action trigger | Custom event published | Check EventBridge logs |
| 0.2.4 | Multiple actions | Goal has 2+ actions | All events published | Check EventBridge logs show all events |
| 0.2.5 | No actions defined | Goal completes with empty actions array | No events published | No errors in CloudWatch |

**How to Test:**
1. Enable EventBridge logging in AWS Console
2. Send messages that complete goals
3. Check CloudWatch for EventBridge delivery

**Expected Event Format:**
```json
{
  "source": "kxgen.agent.goals",
  "detail-type": "lead.contact_captured",
  "detail": {
    "tenantId": "tenant_test_001",
    "channelId": "channel_123",
    "goalId": "collect_contact_info",
    "completedAt": "2025-11-19T20:00:00Z",
    "collectedData": {
      "email": "test@example.com",
      "phone": "+1234567890",
      "name": "John Doe"
    },
    "source": "chat_agent"
  }
}
```

---

### 0.3 Basic Goal Awareness (Existing Logic)
**Feature:** Agent is aware of goals and mentions them in conversation.

**Test Cases:**

| Test ID | Scenario | User Input | Expected Behavior | How to Verify |
|---------|----------|------------|-------------------|---------------|
| 0.3.1 | Goal mention | "What do you need from me?" | Agent mentions goals (contact info, etc.) | Read agent response |
| 0.3.2 | Goal progression | Give partial info (just email) | Agent asks for remaining fields | Read agent response |
| 0.3.3 | Goal completion | Provide all required data | Agent confirms completion | Read agent response |

**Test Conversation:**
```
User: Hey, I want to get started
Agent: [Should naturally work towards first goal]

User: What do you need from me?
Agent: [Should mention contact info or current goal]

User: My email is test@example.com
Agent: [Should acknowledge and ask for phone/name]

User: My name is John and my number is 555-1234
Agent: [Should confirm all info collected]
```

---

## 🔴 PHASE A: Enhanced Goal Orchestration

### A.1 Goal Ordering
**Feature:** Goals are activated in sequence based on `order` field.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| A.1.1 | Sequential activation | 3 goals with order: 1, 2, 3 | Goals activate in sequence | Check goal prompt order |
| A.1.2 | Skip completed goal | Goal 1 already done | Start with Goal 2 | Agent skips to next |
| A.1.3 | Unordered goals (order=null) | Mix ordered and unordered | Unordered goals activate last | Check activation sequence |
| A.1.4 | Same order values | 2 goals with order: 1 | Both can activate (tied) | Both mentioned in prompt |

**Test Data:**
```json
{
  "goals": [
    {"id": "establish_trust", "order": 1, "importance": 8},
    {"id": "collect_contact", "order": 2, "importance": 10},
    {"id": "schedule_appt", "order": 3, "importance": 9}
  ]
}
```

---

### A.2 Goal Adherence
**Feature:** `adherence` field (1-10) controls how strictly agent pursues the goal.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| A.2.1 | High adherence (10) | Contact collection with adherence=10 | Agent persistently asks for info | Count attempts in conversation |
| A.2.2 | Low adherence (2) | Contact collection with adherence=2 | Agent mentions once, then moves on | Check attempt count |
| A.2.3 | Medium adherence (5) | Contact collection with adherence=5 | Agent asks 2-3 times, then backs off | Check attempt count |
| A.2.4 | User deflection | User changes topic, adherence=8 | Agent redirects back to goal | Read agent response |

**Test Conversation (adherence=10):**
```
User: I want to lose weight
Agent: [mentions goal, asks for contact]

User: Tell me about your programs
Agent: [answers briefly, redirects to contact]

User: What's the price?
Agent: [answers, strongly redirects to contact]

User: I'll think about it
Agent: [persists, emphasizes importance of contact]
```

---

### A.3 Goal Triggers - `afterGoals`
**Feature:** Goals activate only after dependent goals complete.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| A.3.1 | Simple dependency | Goal B requires Goal A | Goal B only activates after A | Check goal prompt timing |
| A.3.2 | Multiple dependencies | Goal C requires A + B | Goal C activates after both | Check goal prompt timing |
| A.3.3 | Circular dependency | A requires B, B requires A | System detects, logs error | Check CloudWatch for warning |
| A.3.4 | Missing dependency | Goal requires non-existent goal | System logs warning, ignores | Check CloudWatch logs |

**Test Data:**
```json
{
  "goals": [
    {
      "id": "collect_contact",
      "order": 1
    },
    {
      "id": "schedule_appt",
      "order": 2,
      "triggers": {
        "afterGoals": ["collect_contact"]
      }
    }
  ]
}
```

---

### A.4 Goal Triggers - `userSignals`
**Feature:** Goals activate when user says specific keywords.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| A.4.1 | Exact keyword match | User says "schedule" | Schedule goal activates | Agent offers scheduling |
| A.4.2 | Case insensitive | User says "SCHEDULE" | Schedule goal activates | Agent offers scheduling |
| A.4.3 | Partial match | User says "scheduling" (signal: "schedule") | Goal activates | Agent offers scheduling |
| A.4.4 | Multiple signals | User says "price" or "cost" | Pricing goal activates | Agent discusses pricing |
| A.4.5 | No match | User says unrelated text | Goal stays inactive | Agent doesn't mention goal |

**Test Data:**
```json
{
  "goals": [
    {
      "id": "discuss_pricing",
      "triggers": {
        "userSignals": ["price", "cost", "how much", "payment"]
      }
    }
  ]
}
```

**Test Conversation:**
```
User: How much does it cost?
Agent: [pricing goal activates, discusses pricing]
```

---

### A.5 Goal Triggers - `messageCount`
**Feature:** Goals activate after N messages in conversation.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| A.5.1 | Threshold reached | messageCount: 5, at message 5 | Goal activates | Agent mentions goal |
| A.5.2 | Before threshold | messageCount: 5, at message 3 | Goal inactive | Agent doesn't mention goal |
| A.5.3 | Combining with order | Goal has order + messageCount | Both conditions respected | Check timing |

**Test Data:**
```json
{
  "goals": [
    {
      "id": "collect_contact",
      "triggers": {
        "messageCount": 5
      }
    }
  ]
}
```

---

### A.6 Strict Ordering
**Feature:** `strictOrdering: true` means only one goal active at a time, must complete before next.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| A.6.1 | Strict ordering ON | strictOrdering: true, 3 goals | Only Goal 1 mentioned | Agent focuses on one goal |
| A.6.2 | Strict ordering OFF | strictOrdering: false, 3 goals | Multiple goals can be active | Agent mentions multiple goals |
| A.6.3 | Goal incomplete | Strict ON, Goal 1 incomplete | Goal 2 never mentioned | Agent stays on Goal 1 |
| A.6.4 | Goal completed | Strict ON, Goal 1 done | Goal 2 activates immediately | Agent switches focus |

---

### A.7 Max Goals Per Turn
**Feature:** `maxGoalsPerTurn` limits how many goals agent pursues per response.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| A.7.1 | Limit: 1 | maxGoalsPerTurn: 1, 5 active goals | Only 1 goal mentioned | Count goal mentions |
| A.7.2 | Limit: 2 | maxGoalsPerTurn: 2, 5 active goals | Max 2 goals mentioned | Count goal mentions |
| A.7.3 | No limit (null) | maxGoalsPerTurn: null | All goals can be mentioned | Count goal mentions |

---

## 🔴 PHASE B: Dynamic Data Collection

### B.1 Custom Field Collection
**Feature:** Collect ANY fields defined in `dataToCapture.fields`, not just email/phone/name.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| B.1.1 | Standard fields | fields: ["email", "phone"] | Agent collects email, phone | Check collected data |
| B.1.2 | Custom fields | fields: ["fitnessGoals", "budget"] | Agent collects custom fields | Check collected data |
| B.1.3 | Mixed fields | fields: ["email", "fitnessGoals"] | Agent collects both | Check collected data |
| B.1.4 | Empty fields array | fields: [] | No data collection | Agent skips collection |

**Test Data:**
```json
{
  "goals": [
    {
      "id": "assess_needs",
      "dataToCapture": {
        "fields": ["fitnessGoals", "experienceLevel", "injuries", "availability"]
      }
    }
  ]
}
```

**Test Conversation:**
```
User: I want to get fit
Agent: What are your specific fitness goals?

User: Lose 20 pounds and build muscle
Agent: [stores fitnessGoals] What's your experience level?

User: I'm a beginner
Agent: [stores experienceLevel] Any injuries I should know about?
```

---

### B.2 Field Validation
**Feature:** Validate collected data using `validationRules`.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| B.2.1 | Valid email | Email regex validation | Valid email accepted | Data stored |
| B.2.2 | Invalid email | Email regex validation | Agent asks again | Re-prompt in response |
| B.2.3 | Required field empty | required: true | Agent insists on answer | Persistent prompting |
| B.2.4 | Optional field skipped | required: false | Agent moves on | No re-prompting |
| B.2.5 | Custom regex | Custom pattern validation | Only valid patterns accepted | Data validation works |

**Test Data:**
```json
{
  "dataToCapture": {
    "fields": ["email", "phone", "age"],
    "validationRules": {
      "email": {
        "pattern": "^[^@]+@[^@]+\\.[^@]+$",
        "required": true,
        "errorMessage": "Please provide a valid email address"
      },
      "phone": {
        "pattern": "^\\+?[0-9]{10,}$",
        "required": true
      },
      "age": {
        "pattern": "^[0-9]{1,3}$",
        "required": false
      }
    }
  }
}
```

---

### B.3 Required vs Optional Fields
**Feature:** Required fields must be collected, optional fields can be skipped.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| B.3.1 | Skip optional field | User says "skip", field is optional | Agent moves on | Goal progresses |
| B.3.2 | Skip required field | User says "skip", field is required | Agent persists | Re-prompting occurs |
| B.3.3 | All required collected | All required fields provided | Goal completes | Actions triggered |
| B.3.4 | Missing required | Some required fields missing | Goal stays incomplete | No actions triggered |

---

## 🟡 PHASE C: Channel State Persistence

### C.1 Save Goal Progress
**Feature:** Write goal progress to `kx-channels` table.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| C.1.1 | Goal completed | Complete a goal | completedGoals updated in DynamoDB | Query kx-channels table |
| C.1.2 | Data collected | Provide email | collectedData.email saved | Query kx-channels table |
| C.1.3 | Attempt tracked | Agent asks for contact | attemptCounts incremented | Query kx-channels table |
| C.1.4 | Current goal set | Goal becomes active | currentGoal updated | Query kx-channels table |

**Expected DynamoDB Record:**
```json
{
  "channelId": "channel_123",
  "tenantId": "tenant_001",
  "goalState": {
    "completedGoals": ["establish_trust", "collect_contact"],
    "currentGoal": "schedule_appt",
    "collectedData": {
      "email": "test@example.com",
      "phone": "+1234567890",
      "name": "John Doe",
      "fitnessGoals": "Lose weight"
    },
    "attemptCounts": {
      "collect_contact": 2,
      "schedule_appt": 1
    },
    "lastUpdated": "2025-11-19T20:00:00Z"
  }
}
```

---

### C.2 Load Goal Progress
**Feature:** Resume goal progress from previous conversation.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| C.2.1 | Resume conversation | Previous state in DynamoDB | Agent resumes from last goal | Agent doesn't repeat |
| C.2.2 | New conversation | No previous state | Agent starts from first goal | Normal flow |
| C.2.3 | Completed goals skipped | Goals already completed | Agent skips to next goal | No re-asking |
| C.2.4 | Use collected data | Data already captured | Agent uses existing data | No re-asking |

**Test Scenario:**
```
Conversation 1:
User: Hi
Agent: [establishes trust, asks for contact]
User: My email is test@example.com
[User leaves]

[30 minutes later - new Lambda instance]

Conversation 2:
User: Hi again
Agent: [should remember email, ask for phone/name]
```

---

### C.3 Handle Lambda Cold Starts
**Feature:** Goal state persists across Lambda restarts.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| C.3.1 | Cold start mid-conversation | Kill Lambda, user sends message | State restored from DynamoDB | Conversation continues |
| C.3.2 | Multiple cold starts | Multiple Lambda restarts | State always consistent | Check DynamoDB logs |

---

## 🟡 PHASE D: Inbound Event Handler

### D.1 Listen for lead.created Events
**Feature:** CRM service creates lead, publishes event, agent updates channel.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| D.1.1 | Lead created | CRM publishes lead.created | Agent Lambda triggered | Check CloudWatch invocations |
| D.1.2 | Channel updated | Event contains channelId | kx-channels updated with leadId | Query kx-channels table |
| D.1.3 | Status changed | Lead created | channelStatus = "converted" | Query kx-channels table |
| D.1.4 | Missing channelId | Event missing channelId | Event logged, no update | Check CloudWatch logs |
| D.1.5 | Duplicate event | Same event twice | Idempotent handling | No duplicate updates |

**Test Event:**
```json
{
  "version": "0",
  "detail-type": "lead.created",
  "source": "crm.service",
  "detail": {
    "leadId": "lead_12345",
    "channelId": "channel_123",
    "tenantId": "tenant_001",
    "createdAt": "2025-11-19T20:00:00Z",
    "contactInfo": {
      "email": "test@example.com",
      "phone": "+1234567890",
      "name": "John Doe"
    }
  }
}
```

**Expected kx-channels Update:**
```json
{
  "channelId": "channel_123",
  "leadId": "lead_12345",
  "channelStatus": "converted",
  "contactInfo": {
    "email": "test@example.com",
    "phone": "+1234567890",
    "name": "John Doe"
  },
  "updatedAt": "2025-11-19T20:00:00Z"
}
```

---

### D.2 Agent Awareness of Lead Status
**Feature:** Agent knows when user becomes a lead and adjusts behavior.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| D.2.1 | Stop collecting contact | Lead created mid-conversation | Agent stops asking for contact | Read agent response |
| D.2.2 | Acknowledge conversion | Lead status updated | Agent acknowledges ("I've got your info") | Read agent response |
| D.2.3 | Move to next goal | Contact goal done via lead | Agent moves to next goal | Check goal progression |

---

## 🟢 PHASE E: Goal Failure Handling

### E.1 Max Attempt Tracking
**Feature:** Track how many times agent attempts each goal.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| E.1.1 | Increment attempts | Agent asks for contact | attemptCounts.collect_contact++ | Check DynamoDB |
| E.1.2 | Max reached | Attempts >= maxAttempts | onMaxAttemptsReached action fires | Check event logs |
| E.1.3 | Reset on completion | Goal completed | Attempt count resets | Check DynamoDB |

**Test Data:**
```json
{
  "goals": [
    {
      "id": "collect_contact",
      "behavior": {
        "maxAttempts": 3,
        "backoffStrategy": "gentle",
        "onMaxAttemptsReached": {
          "action": "skip",
          "notifyStaff": true
        }
      }
    }
  ]
}
```

---

### E.2 Backoff Strategies
**Feature:** Adjust persistence based on backoff strategy.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| E.2.1 | Gentle backoff | backoffStrategy: "gentle" | Agent becomes less pushy | Read tone change |
| E.2.2 | Persistent backoff | backoffStrategy: "persistent" | Agent keeps asking | Count attempts |
| E.2.3 | Aggressive backoff | backoffStrategy: "aggressive" | Agent emphasizes urgency | Read tone |

---

### E.3 Max Attempts Actions
**Feature:** Execute action when max attempts reached.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| E.3.1 | Skip goal | action: "skip" | Goal marked skipped, move to next | Check goal state |
| E.3.2 | Notify staff | notifyStaff: true | Notification event published | Check EventBridge |
| E.3.3 | Offer alternative | action: "offerAlternative" | Agent offers different path | Read agent response |

---

## 🟢 PHASE F: Goal Combinations

### F.1 Combo Triggers
**Feature:** Fire actions when specific goal combinations complete.

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | How to Verify |
|---------|----------|-------|-----------------|---------------|
| F.1.1 | All goals combo | Complete goals A + B + C | Combo action fires | Check event logs |
| F.1.2 | Partial combo | Complete only A + B | Combo doesn't fire | No event |
| F.1.3 | Threshold combo | Complete any 2 of 5 goals | Combo fires | Check event logs |
| F.1.4 | Channel-specific combo | Different combos per channel (chat vs SMS) | Correct combo fires | Check event logs |

**Test Data:**
```json
{
  "goalCombos": [
    {
      "id": "high_intent_lead",
      "requiredGoals": ["collect_contact", "discuss_pricing", "show_interest"],
      "threshold": "all",
      "actions": [
        {
          "type": "send_notification",
          "eventName": "lead.high_intent",
          "payload": {
            "priority": "high",
            "notifyStaff": true
          }
        }
      ]
    }
  ]
}
```

---

## 🧪 Integration Test Scenarios

### I.1 Full Customer Journey
**End-to-end test of complete goal workflow.**

**Scenario:**
1. User starts chat (anonymous)
2. Agent establishes trust (Goal 1)
3. Agent collects contact info (Goal 2)
4. `lead.contact_captured` event published
5. CRM creates lead
6. `lead.created` event published
7. Agent receives event, updates channel
8. Agent moves to scheduling goal (Goal 3)
9. User schedules appointment
10. `appointment.requested` event published

**Test Steps:**
```
1. POST /chat - "Hey, I want to get fit"
   → Agent: [friendly greeting, builds trust]

2. POST /chat - "Tell me more"
   → Agent: [explains programs, asks for contact]

3. POST /chat - "My email is john@example.com"
   → Agent: [confirms, asks for phone]
   → EventBridge: lead.contact_captured event

4. CRM Service: Creates lead, publishes lead.created

5. POST /chat - "My number is 555-1234"
   → Agent: [acknowledges lead status, offers scheduling]

6. POST /chat - "Can I book Monday at 2pm?"
   → Agent: [confirms appointment]
   → EventBridge: appointment.requested event
```

**Verification:**
- Check all events in EventBridge
- Check kx-channels table for complete state
- Check conversation flow is smooth
- No duplicate questions asked

---

### I.2 Conversation Interruption & Resume
**Test Lambda cold start and state recovery.**

**Scenario:**
1. User provides email
2. [Lambda terminates / 1 hour passes]
3. User returns, continues conversation
4. Agent remembers email, asks for remaining info

**Test Steps:**
```
Session 1:
User: "I want to join"
Agent: "Great! What's your email?"
User: "john@example.com"
[Force Lambda cold start - wait or redeploy]

Session 2:
User: "I'm back"
Agent: "Welcome back! I have your email. What's your phone number?"
```

**Verification:**
- No re-asking for email
- Goal state persisted
- Conversation continues naturally

---

### I.3 Multi-Trigger Goal Activation
**Test complex trigger combinations.**

**Scenario:**
1. Goal requires: afterGoals + messageCount + userSignal
2. User says trigger word BEFORE dependencies met
3. Goal stays inactive
4. Dependencies complete + message count reached
5. Goal activates

**Test Data:**
```json
{
  "id": "premium_offer",
  "triggers": {
    "afterGoals": ["collect_contact"],
    "messageCount": 8,
    "userSignals": ["premium", "upgrade", "best"]
  }
}
```

**Test Steps:**
```
1. User: "I want the premium plan" [messageCount=1, no contact yet]
   → Goal stays inactive (afterGoals not met)

2. [User provides contact info]
   → collect_contact goal completes

3. [Continue conversation to message 8]
   → messageCount threshold met

4. User: "Tell me about premium"
   → All conditions met, premium_offer goal activates
```

---

## 📊 Performance Tests

### P.1 Goal Orchestration Performance
**Ensure goal system doesn't slow down responses.**

**Test Cases:**

| Test ID | Scenario | Setup | Expected Result | Threshold |
|---------|----------|-------|-----------------|-----------|
| P.1.1 | 10 goals | 10 active goals | Response time < 500ms overhead | < 500ms |
| P.1.2 | 50 goals | 50 active goals | Response time < 1s overhead | < 1s |
| P.1.3 | Complex triggers | 20 goals with dependencies | Response time < 1s overhead | < 1s |
| P.1.4 | DynamoDB read | Load channel state | < 100ms | < 100ms |
| P.1.5 | DynamoDB write | Save channel state | < 200ms | < 200ms |

---

## 🔒 Security Tests

### S.1 Data Validation & Sanitization
**Ensure collected data is safe.**

**Test Cases:**

| Test ID | Scenario | User Input | Expected Result |
|---------|----------|------------|-----------------|
| S.1.1 | SQL injection attempt | `'; DROP TABLE users; --` | Input sanitized, stored safely |
| S.1.2 | XSS attempt | `<script>alert('xss')</script>` | Input escaped, stored safely |
| S.1.3 | Oversized input | 10,000 character string | Input truncated or rejected |
| S.1.4 | Special characters | Unicode, emojis, etc. | Input handled correctly |

---

## 🎯 Test Execution Checklist

### Pre-Deployment
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Performance benchmarks met
- [ ] Security tests pass

### Post-Deployment (Staging)
- [ ] Deploy to staging environment
- [ ] Run full test suite
- [ ] Manual exploratory testing
- [ ] Check CloudWatch logs for errors
- [ ] Verify EventBridge events

### Post-Deployment (Production)
- [ ] Monitor CloudWatch for 24 hours
- [ ] Check error rates
- [ ] Verify event delivery rates
- [ ] User acceptance testing

---

## 📝 Test Data Setup Scripts

### Create Test Tenant
```bash
# Add to DynamoDB - company_info table
aws dynamodb put-item \
  --table-name DelayedReplies-company_info \
  --item file://test-company.json

# Add to DynamoDB - personas table
aws dynamodb put-item \
  --table-name DelayedReplies-personas \
  --item file://test-persona.json
```

### Simulate CRM Events
```bash
# Publish test lead.created event
aws events put-events \
  --entries file://test-lead-created-event.json
```

---

## 🐛 Known Issues & Edge Cases

### Edge Cases to Test
1. **Circular Dependencies:** Goal A requires B, B requires A
2. **Orphaned Goals:** Goal references non-existent dependency
3. **Invalid Regex:** Bad validation pattern
4. **Empty Goal List:** No goals defined
5. **Concurrent Updates:** Two Lambda instances update same channel
6. **Event Delivery Failure:** EventBridge down
7. **DynamoDB Throttling:** High traffic
8. **Malformed Goal Config:** Invalid JSON structure

---

## 📈 Success Metrics

### Goal System Health Metrics
- **Goal Completion Rate:** % of started goals that complete
- **Average Attempts Per Goal:** How many tries to complete
- **Event Delivery Success Rate:** % of events successfully published
- **State Persistence Success:** % of channel state saves that succeed
- **Response Time Impact:** Overhead added by goal system

### Target Metrics (Post-Implementation)
- Goal completion rate: > 70%
- Event delivery success: > 99%
- State persistence success: > 99.9%
- Response time overhead: < 500ms
- User dropout rate: < 30% (improved from baseline)

---

## 🔄 Continuous Testing Strategy

### Automated Testing
- Run full test suite on every PR
- Daily integration tests in staging
- Weekly production smoke tests

### Manual Testing
- Weekly exploratory testing
- Monthly full regression test
- Quarterly UX review

### Monitoring
- CloudWatch alarms for errors
- EventBridge delivery monitoring
- DynamoDB performance metrics
- User satisfaction surveys

---

## 📞 Test Contact Information

**Test Owner:** Development Team
**Escalation:** Product Manager
**Issue Tracking:** GitHub Issues
**Test Status Dashboard:** [Link to dashboard]

---

*Last Updated: 2025-11-19*
*Version: 1.0*
*Status: DRAFT - Ready for Review*

