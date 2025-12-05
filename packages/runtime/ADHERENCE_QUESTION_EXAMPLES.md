# 🎚️ Adherence Level → Question Tone Examples

## Overview

The `adherence` setting (1-10 scale) in your goal configuration **directly influences** how the agent asks questions. This document shows **real examples** of how the same goal produces different question styles based on adherence.

---

## 🎯 Goal: Collect Contact Information

### **Configuration:**

```json
{
  "id": "collect_contact_info",
  "name": "Collect Contact Information",
  "priority": "critical",
  "adherence": [VARIES],
  "dataToCapture": {
    "fields": ["email", "phone", "name"]
  },
  "messages": {
    "request": "What's the best email to reach you at?"
  }
}
```

---

## 📊 Adherence Scale Examples

### **Adherence: 1-3 (Subtle, Low Persistence)**

**Approach:** `subtle`  
**Tone Guidance:** "Be gentle and casual. Make it feel optional and natural."

**System Prompt Injection:**
```
Your question should guide toward: "collect_contact_info"
Recommended message: What's the best email to reach you at?
Approach style: subtle (adherence: 2/10)
Tone guidance: Be gentle and casual. Make it feel optional and natural.
```

**Example Questions:**
```
User: "Tell me about your gym."
Agent: "We're a premium fitness center with 24/7 access and expert trainers. 
        By the way, if you'd like me to send you more info, 
        what email should I use?" ✅

User: "What classes do you offer?"
Agent: "We have yoga, HIIT, spin, and strength training. 
        Feel free to share your email if you'd like our class schedule!" ✅

User: "Do you have personal training?"
Agent: "Yes! We have certified trainers available. 
        If you're interested, I could email you details—
        what's your email?" ✅
```

**Characteristics:**
- ✅ Uses "if you'd like" / "feel free" / "by the way"
- ✅ Frames as optional or beneficial to user
- ✅ Soft, non-pushy tone
- ✅ May take longer to convert

---

### **Adherence: 4-7 (Contextual, Balanced)**

**Approach:** `contextual`  
**Tone Guidance:** "Be natural and conversational. Make it feel like a normal part of the dialogue."

**System Prompt Injection:**
```
Your question should guide toward: "collect_contact_info"
Recommended message: What's the best email to reach you at?
Approach style: contextual (adherence: 5/10)
Tone guidance: Be natural and conversational. Make it feel like a normal part of the dialogue.
```

**Example Questions:**
```
User: "Tell me about your gym."
Agent: "We offer personalized training, group classes, and wellness programs. 
        What's the best email to reach you at?" ✅

User: "What classes do you offer?"
Agent: "We have yoga, HIIT, spin, and more—something for every fitness level. 
        What's your email so I can send you the full schedule?" ✅

User: "Do you have personal training?"
Agent: "Absolutely! Our trainers create custom programs based on your goals. 
        What email should I use to send you trainer profiles and pricing?" ✅
```

**Characteristics:**
- ✅ Direct but friendly
- ✅ Transitions naturally from content to question
- ✅ Frames as next logical step
- ✅ Balanced conversion speed

---

### **Adherence: 8-10 (Direct, High Persistence)**

**Approach:** `direct`  
**Tone Guidance:** "Be direct and clear. This is important information we need."

**System Prompt Injection:**
```
Your question should guide toward: "collect_contact_info"
Recommended message: What's the best email to reach you at?
Approach style: direct (adherence: 10/10)
Tone guidance: Be direct and clear. This is important information we need.
```

**Example Questions:**
```
User: "Tell me about your gym."
Agent: "We're a full-service fitness center. To help you better and send 
        you information, I'll need your email address. 
        What's the best email to reach you at?" ✅

User: "What classes do you offer?"
Agent: "We offer a variety of classes. Before I share details, 
        what's your email?" ✅

User: "Do you have personal training?"
Agent: "Yes, we do. To discuss personal training options, 
        I need your contact information. What's your email address?" ✅
```

**Characteristics:**
- ✅ Uses "I'll need" / "I need" / "before I share"
- ✅ Frames as requirement for service
- ✅ Clear, assertive tone
- ✅ Faster conversion, may feel pushy if overused

---

## 🔄 Real Conversation Flow Examples

### **Scenario: Low Adherence (2/10) - Subtle Approach**

```
Message 1:
User: "Hi, what do you offer?"
Agent: "Hey! We're a premium fitness center with personal training, 
        group classes, and nutrition coaching. 
        What are you most interested in?" ← Generic question (no goal yet)

Message 2:
User: "Personal training sounds good."
Agent: "Great choice! Our trainers are certified and experienced. 
        If you want, I can email you some trainer bios and success stories. 
        What email works best?" ← Subtle, optional tone ✅
        
[adherence: 2, approach: subtle]

Message 3 (if no response):
User: "How much does it cost?"
Agent: "Personal training rates vary based on package and trainer. 
        Feel free to share your email and I'll send you a detailed breakdown!" 
        ← Still gentle, not pushy ✅
```

---

### **Scenario: Medium Adherence (5/10) - Contextual Approach**

```
Message 1:
User: "Hi, what do you offer?"
Agent: "We offer personal training, group classes, and nutrition coaching. 
        What brings you here today?"

Message 2:
User: "I want to get in shape."
Agent: "Awesome! We can definitely help with that. 
        What's your email so I can send you program details?" 
        ← Natural transition ✅
        
[adherence: 5, approach: contextual]

Message 3 (if no response):
User: "Do you have a beginner program?"
Agent: "Yes! Our beginner program is perfect for getting started. 
        What email should I use to send you the full breakdown?" 
        ← Persistent but friendly ✅
```

---

### **Scenario: High Adherence (10/10) - Direct Approach**

```
Message 1:
User: "Hi, what do you offer?"
Agent: "We're a full-service fitness center with training and classes. 
        To help you effectively, I need your email address. 
        What's the best email to reach you at?" ← Early ask ✅
        
[adherence: 10, approach: direct]

Message 2 (if avoided):
User: "What are your hours?"
Agent: "We're open 5am-11pm weekdays, 6am-10pm weekends. 
        Before I share more details, what's your email?" 
        ← Persistent, clear ✅

Message 3 (if still avoided):
User: "Do you have free trials?"
Agent: "We do offer trials. To discuss that and set one up, 
        I'll need your contact information. What's your email address?" 
        ← Won't let it slide ✅
```

---

## 🎭 Combining with Other Settings

### **Adherence + Priority**

| Priority | Adherence | Result |
|----------|-----------|--------|
| Low | 2 | Very soft, may never convert |
| Low | 10 | Aggressive but low importance (avoid this combo) |
| Critical | 2 | Important but patient (good for trust-building) |
| Critical | 10 | **Ultra-persistent** (use sparingly!) |

---

### **Adherence + questionRatio**

| questionRatio | Adherence | Result |
|---------------|-----------|--------|
| 3/10 | 2 | Rarely asks, very soft when it does |
| 3/10 | 10 | Rarely asks, but **direct** when triggered |
| 10/10 | 2 | Always asks, but gently |
| 10/10 | 10 | **Always asks directly** (aggressive) |

---

### **Adherence + Backoff Strategy**

```json
{
  "adherence": 8,
  "behavior": {
    "maxAttempts": 3,
    "backoffStrategy": "gentle"
  }
}
```

**Conversation:**
```
Attempt 1 (adherence: 8, approach: direct):
"What's your email?" ← Direct

Attempt 2 (backed off to contextual):
"What email should I use to send you details?" ← Less direct

Attempt 3 (backed off to subtle):
"If you'd like more info, feel free to share your email!" ← Gentle
```

---

## 📝 Recommended Configurations

### **Use Case 1: High-Value Leads (Trust First)**

```json
{
  "adherence": 3,
  "priority": "high",
  "behavior": {
    "maxAttempts": 5,
    "backoffStrategy": "gentle"
  }
}
```

**Why:** Builds trust, doesn't rush, suitable for luxury/premium services.

---

### **Use Case 2: Volume Business (Qualify Fast)**

```json
{
  "adherence": 8,
  "priority": "critical",
  "behavior": {
    "maxAttempts": 3,
    "backoffStrategy": "persistent"
  }
}
```

**Why:** Quick qualification, move leads through funnel efficiently.

---

### **Use Case 3: Educational Content (Soft Sell)**

```json
{
  "adherence": 2,
  "priority": "medium",
  "behavior": {
    "maxAttempts": 2,
    "backoffStrategy": "gentle"
  }
}
```

**Why:** Focus on value first, contact collection is secondary.

---

## 🎯 System Prompt Injection Detail

### **What the LLM Receives:**

```
ACTIVE CONVERSATION GOALS (prioritized):
1. collect_contact_info (Priority: 5/5, Approach: direct)
   Message: What's the best email to reach you at?

IMPORTANT INSTRUCTION FOR THIS RESPONSE:
You MUST end your response with a natural, contextual question that keeps the conversation engaging.
Your question should naturally guide toward the goal: "collect_contact_info".
Recommended message: What's the best email to reach you at?
Approach style: direct (adherence: 10/10)
Tone guidance: Be direct and clear. This is important information we need.
Make the question fit naturally with your personality and the conversation flow.
Match the language the user is speaking.
```

**Result:** LLM knows:
- ✅ What to ask about (collect email)
- ✅ How to ask (direct, adherence 10)
- ✅ Why to ask (important information)
- ✅ What tone to use (clear and direct)

---

## ✅ Summary

**Adherence directly controls question tone:**

| Adherence | Approach | Question Style | Example |
|-----------|----------|----------------|---------|
| 1-3 | `subtle` | Optional, gentle, soft | "If you'd like, what's your email?" |
| 4-7 | `contextual` | Natural, balanced, friendly | "What's your email?" |
| 8-10 | `direct` | Clear, assertive, persistent | "I'll need your email address." |

**The system now:**
1. ✅ Maps `adherence` → `approach` in `GoalOrchestrator`
2. ✅ Passes `approach` + `adherenceLevel` in `goalResult`
3. ✅ Injects tone guidance into system prompt
4. ✅ LLM adjusts question style accordingly

**Every adherence setting = different conversation experience!** 🎚️

