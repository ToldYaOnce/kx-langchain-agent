# 🎯 Goal-Driven Question System

## Overview

The agent's **question enforcement system** is now **goal-aware**, meaning questions are intelligently directed toward achieving active conversation goals rather than being random engagement questions.

---

## 🧠 How It Works

### **Before (Generic Questions):**

```
Agent: "Great! Our gym has state-of-the-art equipment."
       "What brings you here today?" ← Generic, not goal-focused
```

### **After (Goal-Driven Questions):**

```
Agent: "Great! Our gym has state-of-the-art equipment."
       "What are your fitness goals?" ← Aligned with "Assess Needs" goal
```

---

## 🔧 Architecture

### **1. Goal Context Injection**

When `goalResult` contains active recommendations, the system prompt receives:

```
ACTIVE CONVERSATION GOALS (prioritized):
1. assess_needs (Priority: 5/5, Approach: natural)
   Message: What are your fitness goals?

2. collect_contact_info (Priority: 4/5, Approach: direct)
   Message: What's the best email to reach you at?

IMPORTANT: Your questions and conversation should naturally guide toward these goals.
Prioritize the highest-priority goal that hasn't been declined by the user.
```

---

### **2. Question Enforcement Enhancement**

The `questionRatio` personality trait (1-10 scale) now works **with** goals:

```typescript
if (questionRatio >= 9) {
  // ALWAYS ask a question
  
  if (topGoal with priority >= 4 exists) {
    // 🎯 Make question goal-directed:
    "Your question should naturally guide toward: 'collect_contact_info'"
    "Use the recommended approach: What's your email?"
  } else {
    // Generic engagement question
  }
}
```

---

## 📊 Goal Priority Thresholds

Questions are **goal-aligned** when:

- ✅ **Priority >= 4** (critical or high priority goals)
- ✅ **`shouldPursue` is true** (goal is eligible)
- ✅ **Goal hasn't been declined** (user hasn't rejected it)

**Example:**

```json
{
  "recommendations": [
    {
      "goalId": "collect_contact_info",
      "priority": 5,
      "shouldPursue": true,
      "approach": "direct",
      "message": "What's the best email to reach you at?"
    }
  ]
}
```

**Result:** Agent's question will align with this goal!

---

## 🎭 Interaction with `adherence`

The `adherence` setting (1-10 scale) in goal configuration affects **how** the question is asked:

| Adherence | Approach | Question Style |
|-----------|----------|----------------|
| 1-3 (Low) | `subtle` | "By the way, do you have an email?" |
| 4-7 (Medium) | `natural` | "What's your email address?" |
| 8-10 (High) | `direct` | "I'll need your email to continue." |

The agent combines:
- **Goal priority** (what to ask about)
- **Adherence** (how persistent to be)
- **Personality traits** (tone, verbosity, questionRatio)

---

## 🧪 Example Scenarios

### **Scenario 1: High Priority Goal (Collect Contact)**

**Configuration:**
```json
{
  "goalConfiguration": {
    "goals": [
      {
        "id": "collect_contact_info",
        "name": "Collect Contact Information",
        "priority": "critical",
        "adherence": 10,
        "triggers": { "messageCount": 3 },
        "messages": {
          "request": "What's the best email to reach you at?"
        }
      }
    ]
  }
}
```

**Conversation:**
```
User: "Tell me about your gym."

Agent: "We're a premium fitness center with 24/7 access, 
        personal training, and group classes."
       
       [Goal: collect_contact_info triggered (messageCount: 3)]
       [Priority: 5/5, Approach: direct]
       
       "What's the best email to reach you at?" ← Goal-driven question!
```

---

### **Scenario 2: Multiple Active Goals (Prioritization)**

**Active Goals:**
1. `assess_needs` (Priority: 5/5)
2. `collect_contact_info` (Priority: 4/5)
3. `schedule_consultation` (Priority: 3/5)

**Agent Behavior:**
```
System Prompt Injection:
ACTIVE CONVERSATION GOALS (prioritized):
1. assess_needs (Priority: 5/5)
   Message: What are your fitness goals?

2. collect_contact_info (Priority: 4/5)
   Message: What's your email?

[Question enforced with questionRatio]
Your question should guide toward: "assess_needs"
Use approach: What are your fitness goals?
```

**Result:** Agent asks about fitness goals (highest priority)

---

### **Scenario 3: No Active Goals (Fallback to Generic)**

**Active Goals:** None

**Agent Behavior:**
```
User: "What's your address?"

Agent: "We're located at 123 Fitness Boulevard."
       
       [No high-priority goals active]
       
       "Is there anything else you'd like to know?" ← Generic engagement
```

---

## 📝 Configuration in `companyInfo`

### **Goal Definition with Question Guidance:**

```json
{
  "goalConfiguration": {
    "enabled": true,
    "globalSettings": {
      "strictOrdering": 7,
      "maxGoalsPerTurn": 2
    },
    "goals": [
      {
        "id": "assess_needs",
        "name": "Assess Person's Goals",
        "order": 1,
        "priority": "high",
        "adherence": 5,
        "triggers": {
          "userSignals": ["goal", "need", "looking for"]
        },
        "messages": {
          "request": "What are your specific fitness goals?",
          "followUp": "And what's your current experience level?"
        }
      },
      {
        "id": "collect_contact_info",
        "name": "Collect Contact Information",
        "order": 2,
        "priority": "critical",
        "adherence": 10,
        "triggers": {
          "afterGoals": ["assess_needs"],
          "messageCount": 5
        },
        "messages": {
          "request": "What's the best email to reach you at?",
          "followUp": "And your phone number?"
        }
      }
    ]
  }
}
```

---

## 🎯 Integration with Personality Traits

### **`questionRatio` (1-10 scale):**

- **1-3:** Rarely ask questions (10-30% chance)
- **4-6:** Sometimes ask questions (40-60% chance)
- **7-8:** Frequently ask questions (70-80% chance)
- **9-10:** ALWAYS ask questions (90-100% chance)

**When combined with goals:**

```javascript
if (questionRatio >= 9) {
  // Always ask
  if (topGoal with priority >= 4) {
    ask_goal_driven_question(); // 🎯
  } else {
    ask_generic_question();
  }
} else {
  // Probabilistic
  if (Math.random() < questionRatio / 10) {
    if (topGoal) {
      ask_goal_driven_question(); // 🎯
    } else {
      ask_generic_question();
    }
  }
}
```

---

## 🔄 Flow Diagram

```
┌─────────────────────────────────────┐
│  Goal Orchestration Runs            │
│  (identifies active goals)           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  goalResult with recommendations     │
│  - assess_needs (priority: 5)       │
│  - collect_contact (priority: 4)    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  System Prompt Injection             │
│  "ACTIVE CONVERSATION GOALS:"        │
│  + Goal details and approaches       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Question Enforcement Check          │
│  if (questionRatio requires it)      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Goal-Aware Question Instruction     │
│  "Guide toward: assess_needs"        │
│  "Message: What are your goals?"     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  LLM Generates Response              │
│  + Goal-aligned question             │
└─────────────────────────────────────┘
```

---

## ✅ Benefits

### **1. Natural Goal Progression**

Questions automatically guide users through the funnel:
- **Trust building** → "What brings you here today?"
- **Needs assessment** → "What are your fitness goals?"
- **Contact collection** → "What's your email?"
- **Scheduling** → "When can you come in for a tour?"

---

### **2. Higher Conversion Rates**

Every question moves the conversation toward a conversion event:
- ✅ More contact info collected
- ✅ More appointments scheduled
- ✅ Better lead qualification

---

### **3. Configurable Persistence**

Combine `adherence` + `questionRatio` for fine control:

| Use Case | adherence | questionRatio |
|----------|-----------|---------------|
| Soft sell | 2 | 6 |
| Balanced | 5 | 8 |
| Aggressive | 10 | 10 |

---

## 🚀 Testing

### **Manual Test:**

```javascript
const companyInfo = {
  goalConfiguration: {
    enabled: true,
    goals: [
      {
        id: "collect_contact",
        priority: "critical",
        adherence: 8,
        triggers: { messageCount: 2 },
        messages: {
          request: "What's your email?"
        }
      }
    ]
  }
};

// Send 2 messages, then check if agent asks for email
```

---

### **Expected Behavior:**

```
Message 1:
User: "Hi, tell me about your gym."
Agent: "We offer personalized training and group classes. 
        What are you looking for in a fitness center?"

Message 2:
User: "I want to lose weight."
Agent: "Great! We have excellent programs for weight loss.
        
        [Goal triggered: collect_contact]
        [Priority: 5/5, Question enforced]
        
        What's the best email to reach you at?" ✅
```

---

## 📚 Related Docs

- `GOAL_ORCHESTRATION_TEST_PLAN.md` - Full testing suite
- `IMPLEMENTATION_SUMMARY.md` - Phase A & B details
- `UI_SPECIFICATION_GOALS.md` - UI configuration guide

---

## 🎉 Summary

**Questions are now smart!**

- ✅ Aligned with active goals
- ✅ Prioritized by goal priority
- ✅ Adjusted by adherence level
- ✅ Enhanced by personality traits
- ✅ Fallback to generic when no goals active

**Result:** Every question moves the conversation toward your business objectives! 🚀

