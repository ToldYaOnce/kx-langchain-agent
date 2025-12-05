# 📤 EventBridge Event Logging Guide

## Overview

All EventBridge events are now **highly visible** with detailed logging to help you track what's being published, even before you have subscribers set up.

---

## 🎨 Log Format

### **Goal Action Events:**

When a goal completes and triggers an action, you'll see:

```bash
╔══════════════════════════════════════════════════════════════╗
║  🎯 GOAL ACTION TRIGGERED                                    ║
╚══════════════════════════════════════════════════════════════╝
📌 Goal ID:     collect_contact_info
⚡ Action Type: convert_anonymous_to_lead
🏷️  Event Name:  lead.contact_captured
📦 Action Payload:
{
  "leadSource": "website_chat",
  "priority": "high",
  "source": "chat_agent"
}
👤 Collected Contact Info:
{
  "email": "user@example.com",
  "phone": "+1234567890",
  "name": "John Doe"
}
════════════════════════════════════════════════════════════════
📤 PUBLISHING EVENTBRIDGE EVENT
════════════════════════════════════════════════════════════════
🎯 Source:      kxgen.agent.goals
🏷️  Detail Type: lead.contact_captured
🚀 Event Bus:   arn:aws:events:us-east-1:123456789:event-bus/kxgen-events
📦 Payload:
{
  "tenantId": "tenant_1757418497028_g9o6mnb4m",
  "channelId": "chat",
  "userId": "user@example.com",
  "sessionId": "conv_12345",
  "goalId": "collect_contact_info",
  "timestamp": "2025-11-20T23:30:00.000Z",
  "leadSource": "website_chat",
  "priority": "high",
  "source": "chat_agent",
  "contactInfo": {
    "email": "user@example.com",
    "phone": "+1234567890",
    "name": "John Doe"
  }
}
════════════════════════════════════════════════════════════════
✅ Event published successfully: lead.contact_captured
✅ Goal action completed: lead.contact_captured
══════════════════════════════════════════════════════════════
```

---

### **If No Event Bus Configured:**

```bash
⚠️  No EventBridge bus configured, skipping event publication
   Event would have been: {
  source: 'kxgen.agent.goals',
  detailType: 'lead.contact_captured',
  detail: { ... }
}
```

**This is helpful for local development!** You can see what events **would** be published without needing AWS configured.

---

### **If Event Publishing Fails:**

```bash
════════════════════════════════════════════════════════════════
❌ EVENTBRIDGE PUBLISH FAILED
════════════════════════════════════════════════════════════════
Failed to publish custom event to EventBridge: Error: ...
════════════════════════════════════════════════════════════════
```

---

## 📋 Event Types You'll See

### **1. Goal Completion Events**

**Source:** `kxgen.agent.goals`

| Event Name | Triggered By | Payload Includes |
|------------|-------------|------------------|
| `lead.contact_captured` | `convert_anonymous_to_lead` | contactInfo, leadSource |
| `appointment.requested` | `trigger_scheduling_flow` | appointmentType, duration |
| `crm.lead_qualified` | `update_crm` | qualificationStatus, leadScore |
| `notification.send` | `send_notification` | notificationType, template |

---

### **2. Agent Response Events**

**Source:** `kxgen.agent`

| Event Name | Triggered By | Payload Includes |
|------------|-------------|------------------|
| `agent.message.processed` | Every agent response | response, processingTime |
| `agent.error` | Agent errors | error message, stack trace |
| `agent.trace` | Telemetry | performance metrics |

---

## 🔍 Real-World Example Flow

### **Scenario: User Schedules Appointment**

```bash
# Message 1: User expresses interest
User: "I want to schedule a tour"

# Message 2: Agent collects contact info
User: "john@email.com"

╔══════════════════════════════════════════════════════════════╗
║  🎯 GOAL ACTION TRIGGERED                                    ║
╚══════════════════════════════════════════════════════════════╝
📌 Goal ID:     collect_contact_info
⚡ Action Type: convert_anonymous_to_lead
🏷️  Event Name:  lead.contact_captured
📦 Action Payload:
{
  "leadSource": "website_chat",
  "priority": "high"
}
👤 Collected Contact Info:
{
  "email": "john@email.com",
  "name": "John"
}
════════════════════════════════════════════════════════════════
📤 PUBLISHING EVENTBRIDGE EVENT
════════════════════════════════════════════════════════════════
🎯 Source:      kxgen.agent.goals
🏷️  Detail Type: lead.contact_captured
🚀 Event Bus:   arn:aws:events:us-east-1:xxx:event-bus/kxgen-events
📦 Payload:
{
  "tenantId": "tenant_123",
  "userId": "john@email.com",
  "goalId": "collect_contact_info",
  "leadSource": "website_chat",
  "contactInfo": {
    "email": "john@email.com",
    "name": "John"
  }
}
════════════════════════════════════════════════════════════════
✅ Event published successfully: lead.contact_captured

# Message 3: User confirms scheduling intent
User: "Yes, I'd like to come in this week"

╔══════════════════════════════════════════════════════════════╗
║  🎯 GOAL ACTION TRIGGERED                                    ║
╚══════════════════════════════════════════════════════════════╝
📌 Goal ID:     schedule_consultation
⚡ Action Type: trigger_scheduling_flow
🏷️  Event Name:  appointment.requested
📦 Action Payload:
{
  "appointmentType": "free_consultation",
  "duration": 30,
  "priority": "high"
}
════════════════════════════════════════════════════════════════
📤 PUBLISHING EVENTBRIDGE EVENT
════════════════════════════════════════════════════════════════
🎯 Source:      kxgen.agent.goals
🏷️  Detail Type: appointment.requested
🚀 Event Bus:   arn:aws:events:us-east-1:xxx:event-bus/kxgen-events
📦 Payload:
{
  "tenantId": "tenant_123",
  "userId": "john@email.com",
  "goalId": "schedule_consultation",
  "appointmentType": "free_consultation",
  "duration": 30,
  "priority": "high",
  "timestamp": "2025-11-20T23:35:00.000Z"
}
════════════════════════════════════════════════════════════════
✅ Event published successfully: appointment.requested
```

---

## 🛠️ Using Logs for Development

### **Without EventBridge Setup:**

You can develop and test **without** AWS EventBridge configured:

1. **Local Development:** Logs show what events **would** be published
2. **Debug Goals:** See when goals complete and what data is collected
3. **Test Workflows:** Verify the conversation flow triggers the right events
4. **Copy Payloads:** Use logged payloads to design your event subscribers

---

### **With EventBridge Setup:**

Once you configure EventBridge:

```typescript
// In your Lambda config
const config = {
  outboundEventBusName: 'kxgen-events',
  // ... other config
};
```

Logs will show:
- ✅ Events being published
- ✅ Event bus ARN
- ✅ Full payload sent
- ❌ Any publishing errors

---

## 📊 Monitoring Event Flow

### **CloudWatch Logs:**

All these logs appear in **CloudWatch Logs** for your Lambda:

```
/aws/lambda/kx-langchain-agent
```

**Search for:**
- `"GOAL ACTION TRIGGERED"` - Goal completions
- `"PUBLISHING EVENTBRIDGE EVENT"` - All events
- `"Event published successfully"` - Successful publications
- `"EVENTBRIDGE PUBLISH FAILED"` - Failures

---

### **EventBridge Metrics:**

Once you have subscribers, monitor:

1. **CloudWatch Metrics** → EventBridge → Rules
   - `Invocations` - How many events matched rules
   - `FailedInvocations` - Subscriber errors
   - `TriggeredRules` - Which rules fired

2. **EventBridge Console** → Event buses → Monitoring
   - See event flow in real-time
   - Debug rule matching

---

## 🎯 Setting Up Event Subscribers (Later)

### **Step 1: Create EventBridge Rule**

```json
{
  "source": ["kxgen.agent.goals"],
  "detail-type": ["appointment.requested"]
}
```

---

### **Step 2: Add Target Lambda**

```typescript
// appointment-handler.ts
export async function handler(event: any) {
  const { tenantId, userId, appointmentType, contactInfo } = event.detail;
  
  // Create appointment in your system
  await createAppointment({
    tenantId,
    userId,
    type: appointmentType,
    email: contactInfo.email
  });
  
  // Send confirmation
  await sendConfirmationEmail(contactInfo.email);
}
```

---

### **Step 3: Test with Logs**

The agent logs will show:
```
✅ Event published successfully: appointment.requested
```

Your handler logs will show:
```
Appointment created for user@email.com
Confirmation email sent
```

---

## 🚀 Quick Reference

### **Goal Action Event Format:**

```typescript
{
  source: "kxgen.agent.goals",
  detailType: "[eventName from goal action]",
  detail: {
    tenantId: string,
    channelId?: string,
    userId: string,
    sessionId: string,
    goalId: string,
    timestamp: string,
    ...actionPayload,
    contactInfo?: { ... }  // For convert_anonymous_to_lead
  }
}
```

---

### **Agent Message Event Format:**

```typescript
{
  source: "kxgen.agent",
  detailType: "agent.message.processed",
  detail: {
    tenantId: string,
    contactPk: string,
    response: string,
    processingTime: number,
    ...metadata
  }
}
```

---

## ✅ Summary

**Enhanced Logging Provides:**

✅ **Visual Event Tracking** - See every event with colored output  
✅ **Full Payload Visibility** - JSON payloads logged for debugging  
✅ **Goal Action Context** - Know which goal triggered which event  
✅ **Success/Failure Indication** - Clear status for each publication  
✅ **Local Development Support** - Works without AWS configured  
✅ **CloudWatch Integration** - All logs available for monitoring  

**You can now:**
- 🔍 Track event flow without subscribers
- 🛠️ Debug goal workflows locally
- 📋 Copy payloads for subscriber development
- 📊 Monitor production event publishing
- ❌ Quickly identify publishing failures

**Every event is now highly visible!** 📤✨

