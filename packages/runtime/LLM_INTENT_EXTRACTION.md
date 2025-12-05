# 🧠 LLM-Based Intent Extraction from Goal Configuration

## Overview

The agent now **automatically generates intents** from your `goalConfiguration` and uses the **LLM to detect and extract data** instead of regex!

---

## 🎯 **How It Works**

### **Step 1: Goal Configuration Defines Intents**

Your `goalConfiguration` tells the system what to monitor for:

```json
{
  "goals": [
    {
      "id": "collect_contact_info",
      "type": "data_collection",
      "dataToCapture": {
        "fields": ["email", "phone", "name"]
      }
    },
    {
      "id": "assess_needs",
      "type": "data_collection",
      "dataToCapture": {
        "fields": ["goals", "experienceLevel", "constraints", "timeline"]
      }
    }
  ]
}
```

---

### **Step 2: System Auto-Generates Intents**

From your goals, the system generates:

```typescript
[
  {
    intentId: "collect_contact_info_collect_email",
    goalId: "collect_contact_info",
    fieldName: "email",
    description: "User provides their email address",
    extractionSchema: z.string().email()
  },
  {
    intentId: "collect_contact_info_collect_phone",
    goalId: "collect_contact_info",
    fieldName: "phone",
    description: "User provides their phone number",
    extractionSchema: z.string().min(10)
  },
  {
    intentId: "assess_needs_collect_goals",
    goalId: "assess_needs",
    fieldName: "goals",
    description: "User describes their fitness goals",
    extractionSchema: z.string().min(3)
  }
]
```

**NO manual intent configuration needed!** ✨

---

### **Step 3: Intents Injected into System Prompt**

The LLM receives this in its system prompt:

```
🎯 ACTIVE DATA COLLECTION INTENTS:
You are monitoring the conversation for the following information:

- email: User provides their email address
- phone: User provides their phone number
- name: User provides their name
- goals: User describes their fitness or business goals
- experienceLevel: User indicates their experience level

When you detect the user providing any of this information, 
acknowledge it naturally in your response.
```

**The LLM now KNOWS what to listen for!**

---

### **Step 4: LLM Responds + Extraction Happens**

```
User: "(954) 682-3329"
       ↓
LLM Response: "Perfect! I've got your number."
       ↓
Extraction Call: "Did user provide any of these fields: [email, phone, name]?"
       ↓
LLM Extraction: { phone: "(954) 682-3329", email: null, name: null }
       ↓
Log Output:
╔══════════════════════════════════════════════════════════════╗
║  🎯 INTENT DETECTED & DATA EXTRACTED                         ║
╚══════════════════════════════════════════════════════════════╝
🎯 Intent ID:   collect_contact_info_collect_phone
📌 Goal ID:     collect_contact_info
📝 Field:       phone
✅ Extracted:   (954) 682-3329
══════════════════════════════════════════════════════════════
```

---

## 🔥 **Key Features**

### **1. No Regex Needed**

**Before (Regex Hell):**
```typescript
const phoneRegex = /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
// ... 50 more patterns
```

**After (LLM Magic):**
```typescript
// LLM just knows "(954) 682-3329" is a phone number!
// LLM knows "user@example.com" is an email!
// LLM knows "lose weight" is a fitness goal!
```

---

### **2. Handles ANY Field**

Works for:
- ✅ Structured data: email, phone, name
- ✅ Free-form data: goals, constraints, timeline
- ✅ Enums: experienceLevel (beginner, intermediate, advanced)
- ✅ Custom fields: ANYTHING you add to `dataToCapture.fields`

---

### **3. Context-Aware Extraction**

```
User: "I want to lose 20 pounds by summer"

LLM Extracts:
{
  goals: "lose 20 pounds",
  timeline: "by summer"
}
```

**The LLM understands CONTEXT, not just patterns!**

---

### **4. Beautiful Logging**

Every extraction is logged:

```
╔══════════════════════════════════════════════════════════════╗
║  🎯 INTENT DETECTED & DATA EXTRACTED                         ║
╚══════════════════════════════════════════════════════════════╝
🎯 Intent ID:   assess_needs_collect_goals
📌 Goal ID:     assess_needs
📝 Field:       goals
✅ Extracted:   I want to lose weight and build muscle
══════════════════════════════════════════════════════════════
```

**Easy to track in CloudWatch Logs!**

---

## 📊 **Real Conversation Example**

### **Your Goal Config:**

```json
{
  "goals": [
    {
      "id": "assess_needs",
      "order": 2,
      "dataToCapture": {
        "fields": ["goals", "experienceLevel"],
        "validationRules": {
          "goals": { "required": true }
        }
      }
    },
    {
      "id": "collect_contact_info",
      "order": 3,
      "dataToCapture": {
        "fields": ["email", "phone", "name"]
      }
    }
  ]
}
```

---

### **Conversation Flow:**

```
Message 1:
User: "I want to get in shape for summer"

System:
🎯 Monitoring for 2 data collection intents
   - goals
   - experienceLevel

LLM Response: "That's awesome! What specific goals do you have?"

Extraction:
╔══════════════════════════════════════════════════════════════╗
║  🎯 INTENT DETECTED & DATA EXTRACTED                         ║
╚══════════════════════════════════════════════════════════════╝
🎯 Intent ID:   assess_needs_collect_goals
📌 Goal ID:     assess_needs
📝 Field:       goals
✅ Extracted:   get in shape for summer

---

Message 2:
User: "I'm a beginner, never really worked out before"

Extraction:
╔══════════════════════════════════════════════════════════════╗
║  🎯 INTENT DETECTED & DATA EXTRACTED                         ║
╚══════════════════════════════════════════════════════════════╝
🎯 Intent ID:   assess_needs_collect_experienceLevel
📌 Goal ID:     assess_needs
📝 Field:       experienceLevel
✅ Extracted:   beginner

✅ Goal completed: assess_needs (all required fields collected)
📤 PUBLISHING EVENTBRIDGE EVENT
🏷️  Detail Type: crm.lead_qualified

---

Message 3:
User: "david@email.com"

System:
🎯 Monitoring for 3 data collection intents
   - email
   - phone  
   - name

Extraction:
╔══════════════════════════════════════════════════════════════╗
║  🎯 INTENT DETECTED & DATA EXTRACTED                         ║
╚══════════════════════════════════════════════════════════════╝
🎯 Intent ID:   collect_contact_info_collect_email
📌 Goal ID:     collect_contact_info
📝 Field:       email
✅ Extracted:   david@email.com

---

Message 4:
User: "(954) 682-3329"

Extraction:
╔══════════════════════════════════════════════════════════════╗
║  🎯 INTENT DETECTED & DATA EXTRACTED                         ║
╚══════════════════════════════════════════════════════════════╝
🎯 Intent ID:   collect_contact_info_collect_phone
📌 Goal ID:     collect_contact_info
📝 Field:       phone
✅ Extracted:   (954) 682-3329

✅ Goal completed: collect_contact_info (all required fields collected)
📤 PUBLISHING EVENTBRIDGE EVENT
🏷️  Detail Type: lead.contact_captured
```

---

## 🔍 **CloudWatch Log Queries**

### **Query 1: See All Extracted Data**

```cloudwatch
fields @timestamp, @message
| filter @message like /INTENT DETECTED & DATA EXTRACTED/
| sort @timestamp desc
| limit 50
```

---

### **Query 2: Track Specific Goal Progress**

```cloudwatch
fields @timestamp, @message
| filter @message like /Goal ID:     collect_contact_info/
| parse @message /Field:       (?<field>\w+)/
| parse @message /Extracted:   (?<value>.*)/
| stats count() by field
```

---

### **Query 3: See Goal Completions**

```cloudwatch
fields @timestamp, @message
| filter @message like /Goal completed:|PUBLISHING EVENTBRIDGE EVENT/
| sort @timestamp asc
```

---

## 🎯 **What Gets Auto-Generated**

From your `goalConfiguration.goals[]`, the system automatically:

1. ✅ **Generates intents** for each `dataToCapture.fields`
2. ✅ **Creates extraction schemas** (Zod validators)
3. ✅ **Injects into system prompt** (tells LLM what to listen for)
4. ✅ **Runs extraction after each response** (LLM extracts data)
5. ✅ **Logs detected intents** (beautiful colored output)
6. ✅ **Updates goal state** (marks progress/completion)
7. ✅ **Triggers events** (publishes to EventBridge)

---

## 🚀 **Configuration is Code**

Your goal configuration **IS** your intent configuration!

**Add a new field?** Auto-generated intent.
**Change field name?** Intent updates automatically.
**Remove a goal?** Intents removed automatically.

**ZERO manual intent management!** ✨

---

## 📝 **Files**

1. ✅ `packages/runtime/src/lib/goal-intent-generator.ts` - Intent generation engine
2. ✅ `packages/runtime/src/lib/agent.ts` - Integration + extraction logic
3. ✅ `packages/runtime/LLM_INTENT_EXTRACTION.md` - This documentation

---

## 💡 **Summary**

**Your `goalConfiguration` now drives EVERYTHING:**

```
Goals → Intents → System Prompt → LLM Monitoring → Extraction → Logging → Events
```

**The LLM understands your business process from the goal configuration!** 🧠🔥

No more regex. No more manual intent coding. Just configure your goals and let the AI do the rest! 🎯✨

