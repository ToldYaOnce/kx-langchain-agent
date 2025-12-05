# 🎯 Intent Recognition & Goal-Driven Actions

## Overview

**YES, you have BOTH systems working together!**

1. **Intent Recognition** - Detects user intent (e.g., "I want to schedule")
2. **Goal Actions** - Triggers events when goals complete (e.g., appointment.requested)

---

## 🔄 How The Systems Work Together

### **Flow Diagram:**

```
User Message: "I'd like to schedule a tour"
       ↓
┌──────────────────────────────────────┐
│  Intent Recognition                  │
│  (IntentService.detectIntent)        │
│  Matches: "schedule_appointment"     │
│  Confidence: 95%                     │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│  Intent Actions Executed             │
│  - create_calendar_event             │
│  - send_confirmation_email           │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│  Goal Orchestration                  │
│  - Marks "schedule_consultation"     │
│    goal as COMPLETED                 │
└──────────────┬───────────────────────┘
               ↓
┌──────────────────────────────────────┐
│  Goal Actions Executed               │
│  - Publishes EventBridge event:      │
│    "appointment.requested"           │
└──────────────────────────────────────┘
```

---

## 🎯 System 1: Intent Recognition

### **What It Does:**

Detects user intent **in real-time** from their message using:
- ✅ **Trigger words** (e.g., "schedule", "book", "appointment")
- ✅ **Regex patterns** (e.g., `/schedule.*appointment/i`)
- ✅ **Confidence scoring** (must be > 70% to trigger)

### **Configuration (in Persona):**

```json
{
  "intentCapturing": {
    "enabled": true,
    "intents": [
      {
        "id": "schedule_appointment",
        "name": "Schedule Appointment",
        "description": "User wants to book a consultation or tour",
        "triggers": ["schedule", "book", "appointment", "tour", "visit"],
        "patterns": ["schedule.*appointment", "book.*tour", "come.*in"],
        "priority": "high",
        "response": {
          "type": "template",
          "template": "Great! I'd love to get you scheduled. When works best for you?",
          "followUp": ["What's your preferred time?", "Do you have any date preferences?"]
        },
        "actions": ["create_calendar_event", "send_booking_confirmation"]
      }
    ],
    "confidence": {
      "threshold": 0.7,
      "multipleIntentHandling": "highest_confidence"
    }
  }
}
```

### **When It Triggers:**

```
User: "I'd like to schedule a tour"

System Log:
🎯 INTENT DETECTED: schedule_appointment (confidence: 95.0%)
   Name: Schedule Appointment
   Priority: high
   Matched triggers: schedule, tour
   Actions: create_calendar_event, send_booking_confirmation
🚀 INTENT ACTIONS EXECUTED: 2 actions
   ✅ create_calendar_event: Success
   ✅ send_booking_confirmation: Success

Agent Response:
"Great! I'd love to get you scheduled. When works best for you?"
```

---

## 🎯 System 2: Goal Actions (on Completion)

### **What It Does:**

When a **goal is completed**, it executes configured actions (e.g., publishes EventBridge events).

### **Configuration (in companyInfo.goalConfiguration):**

```json
{
  "goals": [
    {
      "id": "schedule_consultation",
      "name": "Schedule Free Consultation",
      "order": 4,
      "priority": "critical",
      "adherence": 9,
      "triggers": {
        "afterGoals": ["collect_contact_info"],
        "userSignals": ["schedule", "book", "appointment", "visit"],
        "messageCount": 8
      },
      "actions": {
        "onComplete": [
          {
            "type": "trigger_scheduling_flow",
            "eventName": "appointment.requested",
            "payload": {
              "appointmentType": "free_consultation",
              "duration": 30,
              "priority": "high"
            }
          }
        ]
      }
    }
  ]
}
```

### **When It Triggers:**

```
Goal Completion Check:
✅ User said "schedule" → userSignal matched
✅ Contact info collected → dependency met
✅ 8+ messages exchanged → messageCount met

System Log:
✅ Newly completed goals: schedule_consultation
🎯 Executing 1 actions for goal: schedule_consultation
🚀 Executing action: trigger_scheduling_flow for goal: schedule_consultation
📤 Publishing EventBridge event: appointment.requested
   Payload: {
     "appointmentType": "free_consultation",
     "duration": 30,
     "priority": "high",
     "tenantId": "tenant_123",
     "userId": "user@email.com",
     "collectedData": { ... }
   }
```

---

## 🔗 Integration: Goals Trigger Intents

Goals can also **trigger intents** when they complete:

### **Configuration:**

```json
{
  "goals": [
    {
      "id": "collect_contact_info",
      "actions": {
        "onComplete": [
          {
            "type": "convert_anonymous_to_lead",
            "eventName": "lead.contact_captured",
            "payload": {
              "leadSource": "website_chat",
              "priority": "high",
              "source": "chat_agent"
            }
          },
          {
            "type": "trigger_intent",
            "intentId": "lead_generated"  ← Triggers persona intent!
          }
        ]
      }
    }
  ]
}
```

### **Result:**

```
Goal "collect_contact_info" completes
       ↓
Event published: "lead.contact_captured"
       ↓
Intent "lead_generated" triggered
       ↓
Agent responds with lead confirmation template
```

---

## 📊 Real-World Example: Appointment Scheduling

### **Your Setup:**

```json
{
  "goalConfiguration": {
    "goals": [
      {
        "id": "schedule_consultation_1763679424892",
        "name": "Schedule Free Consultation",
        "order": 4,
        "priority": "critical",
        "adherence": 9,
        "triggers": {
          "afterGoals": ["collect_contact_info", "assess_needs"],
          "userSignals": ["schedule", "book", "appointment", "visit", "tour"],
          "messageCount": 8
        },
        "actions": {
          "onComplete": [
            {
              "type": "trigger_scheduling_flow",
              "eventName": "appointment.requested",
              "payload": {
                "appointmentType": "free_consultation",
                "duration": 30,
                "priority": "high"
              }
            }
          ]
        },
        "messages": {
          "request": "When would be a good time for you to come in for a free consultation?",
          "acknowledgment": "Awesome! I'll get that consultation scheduled for you",
          "followUp": "We have openings this week if you'd like to meet"
        }
      }
    ]
  }
}
```

### **Conversation Flow:**

```
Message 1:
User: "Hi, what do you offer?"
Agent: "We offer personal training, group classes, and wellness programs. 
        What brings you here today?"
[No goals triggered yet]

Message 2:
User: "I want to get in shape."
Agent: "Great! What are your specific fitness goals?"
[Goal: assess_needs triggered]

Message 3:
User: "I want to lose weight and build muscle."
Agent: "Perfect! To help you with a customized plan, 
        what's the best email to reach you at?"
[Goal: collect_contact_info triggered]

Message 4:
User: "john@email.com"
Agent: "Got it! I've saved your email. 
        When would be a good time for you to come in for a free consultation?"
[Goal: collect_contact_info COMPLETED → Event published: lead.contact_captured]
[Goal: schedule_consultation triggered (dependencies met)]

Message 5:
User: "I'd like to schedule a tour this week"
[Intent: schedule_appointment detected (confidence: 92%)]
[Goal: schedule_consultation marked as IN PROGRESS]

Agent: "Awesome! I'll get that consultation scheduled for you. 
        What day works best—Tuesday or Thursday?"
        
[Goal: schedule_consultation COMPLETED]
[Action executed: trigger_scheduling_flow]
[Event published: appointment.requested]
```

---

## 🎛️ Available Action Types

### **1. `convert_anonymous_to_lead`**

```json
{
  "type": "convert_anonymous_to_lead",
  "eventName": "lead.contact_captured",
  "payload": {
    "leadSource": "website_chat",
    "priority": "high",
    "source": "chat_agent"
  }
}
```

**Publishes:** `lead.contact_captured` event to EventBridge

---

### **2. `update_crm`**

```json
{
  "type": "update_crm",
  "eventName": "crm.lead_qualified",
  "payload": {
    "qualificationStatus": "qualified",
    "qualificationReason": "needs_assessed",
    "leadScore": 75
  }
}
```

**Publishes:** `crm.lead_qualified` event to EventBridge

---

### **3. `trigger_scheduling_flow`**

```json
{
  "type": "trigger_scheduling_flow",
  "eventName": "appointment.requested",
  "payload": {
    "appointmentType": "free_consultation",
    "duration": 30,
    "priority": "high"
  }
}
```

**Publishes:** `appointment.requested` event to EventBridge

---

### **4. `send_notification`**

```json
{
  "type": "send_notification",
  "eventName": "notification.send",
  "payload": {
    "notificationType": "email",
    "template": "welcome_email",
    "recipientEmail": "{{user.email}}"
  }
}
```

**Publishes:** `notification.send` event to EventBridge

---

### **5. `trigger_intent`**

```json
{
  "type": "trigger_intent",
  "intentId": "lead_generated"
}
```

**Triggers:** Persona intent by ID (from `intentCapturing.intents`)

---

## 📤 EventBridge Integration

All goal actions publish events to **AWS EventBridge**:

### **Event Structure:**

```json
{
  "source": "kx-langchain-agent",
  "detail-type": "appointment.requested",
  "detail": {
    "tenantId": "tenant_1757418497028_g9o6mnb4m",
    "userId": "user@email.com",
    "sessionId": "conv_12345",
    "channelId": "chat",
    "goalId": "schedule_consultation",
    "timestamp": "2025-11-20T23:15:00.000Z",
    
    // Custom payload from goal action
    "appointmentType": "free_consultation",
    "duration": 30,
    "priority": "high",
    
    // Collected data from conversation
    "collectedData": {
      "email": "user@email.com",
      "phone": "+1234567890",
      "name": "John Doe",
      "goals": "lose weight and build muscle"
    }
  }
}
```

---

## 🔍 How to Use in Your Workflow

### **Step 1: Define Goals with Actions**

```json
{
  "goals": [
    {
      "id": "collect_contact",
      "actions": {
        "onComplete": [
          {
            "type": "convert_anonymous_to_lead",
            "eventName": "lead.contact_captured"
          }
        ]
      }
    }
  ]
}
```

---

### **Step 2: Listen for Events**

Your backend/CRM listens for EventBridge events:

```typescript
// Lambda function triggered by EventBridge
export async function handleAppointmentRequest(event) {
  const { tenantId, userId, appointmentType, collectedData } = event.detail;
  
  // Create appointment in your system
  await createAppointment({
    userId,
    type: appointmentType,
    email: collectedData.email,
    phone: collectedData.phone
  });
  
  // Send confirmation email
  await sendConfirmationEmail(collectedData.email);
}
```

---

### **Step 3: Agent Responds Naturally**

Agent automatically acknowledges the action:

```
User: "I'd like to schedule a tour."
Agent: "Awesome! I'll get that consultation scheduled for you. 
        What day works best—Tuesday or Thursday?"
```

---

## ✅ Summary

**You have BOTH systems:**

| System | Trigger | Action | Use Case |
|--------|---------|--------|----------|
| **Intent Recognition** | User says trigger word | Execute intent actions immediately | Quick responses (hours, pricing) |
| **Goal Actions** | Goal completes | Publish EventBridge events | Business workflows (CRM updates, scheduling) |

**Together they enable:**
- ✅ Real-time intent detection ("schedule" → appointment flow)
- ✅ Goal-driven conversations (collect info first, then schedule)
- ✅ Event-driven integrations (publish to EventBridge)
- ✅ Natural agent responses (uses messages.acknowledgment)

**Your appointment scheduling workflow is fully automated!** 🚀

