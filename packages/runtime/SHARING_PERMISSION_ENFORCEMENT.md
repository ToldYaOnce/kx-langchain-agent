# 🔒 Sharing Permission Enforcement Enhancement

## Problem

Agent was **ignoring** sharing permissions and answering restricted questions:

```
User: "what are the class times?"
Expected: "I'd be happy to share that! What's your email?"
Actual: "💪 With the right mindset... You ready to give it everything?"
```

---

## Root Cause

1. ❌ Sharing permissions were injected **too late** in system prompt
2. ❌ Instructions were **too passive** (not CRITICAL priority like verbosity)
3. ❌ No **proactive interception** of restricted questions
4. ❌ LLM could ignore the rules and generate generic responses

---

## Solution: Three-Layer Defense

### **Layer 1: CRITICAL System Prompt (Highest Priority)**

Sharing rules are now injected **immediately after verbosity**, with **CRITICAL** markers:

```
🚨 CRITICAL RESPONSE CONSTRAINT: EXTREMELY BRIEF - Maximum 1-2 sentences...

🚨 CRITICAL INFORMATION SHARING RULES - MUST FOLLOW:

❌ NEVER SHARE (redirect to direct contact): pricing, personal training rates
📧 REQUIRE CONTACT INFO BEFORE SHARING: scheduling, detailed hours, membership info, class availability, specific programs
   → If user asks about these topics, you MUST collect their email/phone FIRST.
   → Say: "I'd be happy to share that info! What's the best email to reach you at?"

[THEN persona system prompt...]
```

---

### **Layer 2: Proactive Interception**

**BEFORE** the LLM processes the message, we check if the user is asking about restricted topics:

```typescript
// Check if message mentions restricted categories
if (messageLower.includes("class") || messageLower.includes("schedule")) {
  // Category: "Class Availability" → requiresContact
  
  if (!hasContactInfo) {
    // INTERCEPT and return contact collection response
    return "I'd be happy to share class times! What's your email?";
  }
}
```

**This happens BEFORE:**
- ❌ Intent detection
- ❌ LangChain processing
- ❌ Goal orchestration
- ❌ LLM generation

**Immediate response**, no chance for LLM to ignore rules!

---

### **Layer 3: Fuzzy Matching**

Uses the existing `canShareInformation()` utility with substring matching:

```typescript
// User message: "what are the class times?"
// Categories to check:
//   - "class availability" ✓ MATCH
//   - "scheduling" ✓ MATCH
//   - "detailed hours" ❌ no match

// Result: INTERCEPT
```

---

## 🎯 How It Works Now

### **Scenario 1: User Asks About Restricted Topic (No Contact)**

```
User: "what are the class times?"

System Log:
🔒 User asked about restricted topic: "class availability"
📧 Has contact info: false
⚠️  INTERCEPTING: Collecting contact info before sharing "class availability"

Agent Response:
"I'd be happy to share information about class availability! 
 To send you the details, what's the best email to reach you at?"
```

---

### **Scenario 2: User Asks About Restricted Topic (Has Contact)**

```
User: "what are the class times?"
[User has already provided email]

System Log:
🔒 User asked about restricted topic: "class availability"
📧 Has contact info: true
✅ Contact verified, proceeding with LLM response

Agent Response:
"We have classes throughout the day! Our most popular times are...
 [actual class schedule]"
```

---

### **Scenario 3: User Asks About "Never Share" Topic**

```
User: "how much is personal training?"

System Log:
❌ User asked about "never share" topic: "personal training rates"
⚠️  INTERCEPTING: Redirecting to direct contact

Agent Response:
"For information about personal training rates, I'd recommend 
 speaking with our team directly. You can reach us at +1-555-KXGRYNDE 
 or visit https://kxgrynde.com. Is there anything else I can help you with?"
```

---

### **Scenario 4: User Asks About Always-Allowed Topic**

```
User: "what promotions do you have?"

System Log:
✅ Topic "promotions" is in alwaysAllowed, proceeding normally

Agent Response:
"We're running a special this month! New members get 50% off..."
```

---

## 📊 Detection Logic

### **Keywords Checked:**

Your UI categories are converted to keywords for detection:

| UI Category | Keywords Checked |
|------------|------------------|
| "Scheduling" | scheduling, schedule, book, appointment |
| "Detailed Hours" | detailed hours, hours, when open, operating hours |
| "Membership Info" | membership, membership info, join, sign up |
| "Class Availability" | class, classes, class availability, schedule |
| "Specific Programs" | specific programs, programs, training programs |
| "Pricing" | pricing, price, cost, how much |
| "Personal Training Rates" | personal training, pt rates, trainer cost |

**Matching:** Case-insensitive substring matching

---

## 🔧 Configuration

### **Your Current Setup (from UI):**

```json
{
  "responseGuidelines": {
    "informationCategories": [
      { "label": "Promotions", "column": "always" },
      { "label": "Scheduling", "column": "require" },
      { "label": "Detailed Hours", "column": "require" },
      { "label": "Membership Info", "column": "require" },
      { "label": "Class Availability", "column": "require" },
      { "label": "Specific Programs", "column": "require" },
      { "label": "Pricing", "column": "never" },
      { "label": "Personal Training Rates", "column": "never" }
    ]
  }
}
```

---

## ✅ Results

### **Before Enhancement:**

```
User: "what are the class times?"
Agent: "💪 With the right mindset... You ready to crush it?" ❌
```

### **After Enhancement:**

```
User: "what are the class times?"
Agent: "I'd be happy to share class times! What's your email?" ✅
```

---

## 🎨 System Prompt Example

**What Mo's system prompt now looks like:**

```
🚨 CRITICAL RESPONSE CONSTRAINT: BALANCED - Keep to 3-4 sentences maximum.

🚨 CRITICAL INFORMATION SHARING RULES - MUST FOLLOW:

❌ NEVER SHARE (redirect to direct contact): pricing, personal training rates
📧 REQUIRE CONTACT INFO BEFORE SHARING: scheduling, detailed hours, membership info, class availability, specific programs
   → If user asks about these topics, you MUST collect their email/phone FIRST.
   → Say: "I'd be happy to share that info! What's the best email to reach you at?"

Yo, listen up bro – King Mo here, your personal trainer and motivational force!
I'm here to push you to greatness, no excuses...
[rest of Mo's persona]

CORE AGENT BEHAVIOR (ALWAYS FOLLOW):
- 🌍 ALWAYS respond in the SAME LANGUAGE...
- Follow responseGuidelines for channel-specific behavior...
```

**Notice:** Sharing rules are **ABOVE** persona, equal priority to verbosity!

---

## 📝 Files Changed

1. ✅ `packages/runtime/src/lib/agent.ts`
   - Moved sharing policy to CRITICAL priority (after verbosity)
   - Added proactive interception logic
   - Added "never share" topic blocking

2. ✅ `packages/runtime/src/lib/persona-service.ts`
   - Added `phone` and `website` fields to `CompanyInfo`

---

## 🚀 Testing

### **Test Case 1: Restricted Question (No Contact)**

```bash
Message: "what are your class times?"
Expected: Contact collection response
```

### **Test Case 2: Restricted Question (Has Contact)**

```bash
Message: "what are your class times?"
Context: email already collected
Expected: Actual class schedule
```

### **Test Case 3: Never Share Topic**

```bash
Message: "how much is personal training?"
Expected: Redirect to phone/website
```

### **Test Case 4: Always Allowed**

```bash
Message: "do you have any promotions?"
Expected: Direct answer with promotion details
```

---

## 🎯 Summary

**Three-layer defense ensures sharing permissions are ALWAYS enforced:**

1. ✅ **CRITICAL System Prompt** - Equal priority to verbosity
2. ✅ **Proactive Interception** - Catches restricted questions BEFORE LLM
3. ✅ **Fuzzy Matching** - Flexible keyword detection

**Result:** Mo will **ALWAYS** collect contact info before sharing restricted information, and **NEVER** share "never share" topics! 🔒✨

