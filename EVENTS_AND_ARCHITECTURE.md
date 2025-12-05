# Agent Events & Architecture - Complete Guide

> **📌 This is the ONLY documentation file you need for agent events and architecture.**

**Last Updated:** 2025-11-25 | **Version:** 1.0.0

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Event Payloads (Complete Reference)](#event-payloads-complete-reference)
4. [Integration Guide](#integration-guide-for-kx-notifications-messaging)
5. [Update Process](#how-to-update-event-payloads)
6. [TypeScript Types](#typescript-types)

---

## Quick Start

### For kx-notifications-messaging Team

**You need to handle 4 critical events:**

| Event | When | Your Action |
|-------|------|-------------|
| `lead.created` | Contact info complete | Update `KxGen-channels-v2`, create lead record |
| `appointment.requested` | Scheduling done | Book appointment, send invite |
| `agent.workflow.state_updated` | Every message | Update channel metadata, push to UI |
| `agent.goal.completed` | Goal finished | Track analytics, show progress |

**EventBridge Rules Needed:**
```typescript
// Rule 1: Lead Creation
{
  source: ['kx-langchain-agent'],
  detailType: ['lead.created']
}

// Rule 2: State Updates
{
  source: ['kx-langchain-agent'],
  detailType: ['agent.workflow.state_updated']
}

// Rule 3: Appointments
{
  source: ['kx-langchain-agent'],
  detailType: ['appointment.requested']
}
```

**Import TypeScript Types:**
```typescript
import type {
  LeadCreatedEvent,
  AppointmentRequestedEvent,
  WorkflowStateUpdatedEvent,
} from '@toldyaonce/kx-langchain-agent-runtime/types/agent-events';
```

---

## Architecture Overview

### Problem We Solved

The agent was directly writing to `KxGen-channels-v2` (owned by kx-notifications-messaging), creating a cross-package dependency.

### Solution: Bounded Context + Events

```
┌─────────────────────────────────────┐
│  kx-langchain-agent                 │
│  ┌─────────────────────────────┐   │
│  │ KxGen-agent-workflow-state  │   │ ← Agent owns this table
│  │ (workflow state storage)    │   │
│  └─────────────┬───────────────┘   │
│                │ EMITS EVENTS       │
│                ▼                    │
│  ┌─────────────────────────────┐   │
│  │ EventBridge                 │   │
│  └─────────────────────────────┘   │
└──────────────┬──────────────────────┘
               │
               │ LISTENS TO EVENTS
               ▼
┌─────────────────────────────────────┐
│  kx-notifications-messaging         │
│  ┌─────────────────────────────┐   │
│  │ KxGen-channels-v2           │   │ ← Messaging owns this table
│  │ (channel metadata)          │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Key Principles:**
- ✅ Each service owns its data
- ✅ Read across packages OK, write only to own tables
- ✅ Services communicate via events
- ✅ Loose coupling, independent deployment

### Tables

| Table | Owner | Purpose |
|-------|-------|---------|
| `KxGen-agent-workflow-state` | **agent** | Conversation state, goals, captured data |
| `KxGen-channels-v2` | **messaging** | Channel metadata, participants, routing |
| `kxgen-messages` | **agent** | Message history |
| `kxgen-personas` | **agent** | Agent configurations |

**Environment Variables:**
- `WORKFLOW_STATE_TABLE` - Agent's workflow state (read/write)
- `CHANNELS_TABLE` - Messaging's channels (read-only for botEmployeeIds)

---

## Event Payloads (Complete Reference)

### 1. `lead.created` 🔥 CRITICAL

**When Emitted:** Contact info complete (name + email + phone)

**Full Payload:**
```json
{
  "version": "0",
  "detail-type": "lead.created",
  "source": "kx-langchain-agent",
  "detail": {
    "channelId": "f3958a0e-ea7e-40d8-8ef8-b6ad42aeef64",
    "leadId": "f3958a0e-ea7e-40d8-8ef8-b6ad42aeef64",
    "tenantId": "tenant_1757418497028_g9o6mnb4m",
    "timestamp": "2025-11-25T12:05:00.000Z",
    "version": "1.0",
    "source": "chat_agent",
    "leadType": "inbound_fitness",
    "contactInfo": {
      "firstName": "John",
      "lastName": "Smith",
      "email": "john@example.com",
      "phone": "+1-555-0123"
    },
    "capturedData": {
      "firstName": "John",
      "lastName": "Smith",
      "email": "john@example.com",
      "phone": "+1-555-0123",
      "fitnessGoals": "Get shredded",
      "height": "6'0\"",
      "weight": "243 lbs"
    },
    "completedGoals": [
      "collect_identity_1764033358437",
      "collect_contact_info_1764033369641"
    ],
    "conversationMetadata": {
      "messageCount": 8,
      "durationMinutes": 12,
      "firstMessageTimestamp": "2025-11-25T11:53:00.000Z"
    }
  }
}
```

**Key Fields:**
- `channelId` = `leadId` (same value for easy cross-referencing)
- `contactInfo` - Structured contact data
- `capturedData` - All data from workflow
- `completedGoals` - Goals finished when lead created

**Your Actions:**
1. Update `KxGen-channels-v2`: set `leadStatus = "qualified"`
2. Create lead record in CRM
3. Send welcome email
4. Notify sales team

---

### 2. `appointment.requested` 🔥 CRITICAL

**When Emitted:** Scheduling goal completes

**Full Payload:**
```json
{
  "version": "0",
  "detail-type": "appointment.requested",
  "source": "kx-langchain-agent",
  "detail": {
    "channelId": "f3958a0e-ea7e-40d8-8ef8-b6ad42aeef64",
    "leadId": "f3958a0e-ea7e-40d8-8ef8-b6ad42aeef64",
    "tenantId": "tenant_1757418497028_g9o6mnb4m",
    "timestamp": "2025-11-25T12:08:00.000Z",
    "version": "1.0",
    "appointmentType": "fitness_consultation",
    "requestedDate": "2025-11-27",
    "requestedTime": "14:00",
    "duration": 60,
    "details": {
      "preferredTrainer": "King Mo"
    },
    "goalId": "schedule_consultation_1764033414075"
  }
}
```

**Key Fields:**
- `appointmentType` - Type of appointment
- `requestedDate` - YYYY-MM-DD format
- `requestedTime` - HH:MM (24-hour format)
- `duration` - Minutes

**Your Actions:**
1. Create appointment record
2. Send calendar invite
3. Notify staff
4. Update channel with appointment status

---

### 3. `agent.workflow.state_updated`

**When Emitted:** After every message (every turn)

**Full Payload:**
```json
{
  "version": "0",
  "detail-type": "agent.workflow.state_updated",
  "source": "kx-langchain-agent",
  "detail": {
    "channelId": "f3958a0e-ea7e-40d8-8ef8-b6ad42aeef64",
    "tenantId": "tenant_1757418497028_g9o6mnb4m",
    "timestamp": "2025-11-25T12:01:00.000Z",
    "version": "1.0",
    "activeGoals": ["assess_fitness_goals_1764033375877"],
    "completedGoals": ["collect_identity_1764033358437"],
    "messageCount": 5,
    "capturedData": {
      "firstName": "John",
      "lastName": "Smith"
    },
    "contactStatus": {
      "isEmailCaptured": false,
      "isPhoneCaptured": false,
      "isFirstNameCaptured": true,
      "isLastNameCaptured": true
    },
    "changes": {
      "goalsActivated": ["assess_fitness_goals_1764033375877"],
      "goalsCompleted": ["collect_identity_1764033358437"],
      "dataCaptured": ["firstName", "lastName"]
    }
  }
}
```

**Key Fields:**
- `activeGoals` - Currently active goals
- `completedGoals` - All completed goals
- `contactStatus` - Contact capture progress
- `changes` - What changed this turn

**Your Actions:**
1. Update channel metadata
2. Push to WebSocket for real-time UI
3. Update progress indicators

---

### 4. `agent.goal.completed`

**When Emitted:** Goal requirements met

**Full Payload:**
```json
{
  "version": "0",
  "detail-type": "agent.goal.completed",
  "source": "kx-langchain-agent",
  "detail": {
    "channelId": "f3958a0e-ea7e-40d8-8ef8-b6ad42aeef64",
    "tenantId": "tenant_1757418497028_g9o6mnb4m",
    "timestamp": "2025-11-25T12:01:15.000Z",
    "version": "1.0",
    "goalId": "collect_identity_1764033358437",
    "goalName": "Get Name",
    "goalType": "data_collection",
    "capturedData": {
      "firstName": "John",
      "lastName": "Smith"
    },
    "attemptCount": 2,
    "messagesSinceActivation": 3
  }
}
```

**Your Actions:**
1. Show completion checkmark in UI
2. Track analytics

---

### 5. `agent.goal.activated`

**When Emitted:** Goal becomes active

**Payload:**
```json
{
  "detail": {
    "channelId": "...",
    "tenantId": "...",
    "goalId": "collect_identity_1764033358437",
    "goalName": "Get Name",
    "goalType": "data_collection",
    "priority": "high",
    "order": 1,
    "fieldsToCapture": ["firstName", "lastName"],
    "activationReason": {
      "trigger": "messageCount",
      "details": "Activated after 2 messages"
    }
  }
}
```

---

### 6. `agent.data.captured`

**When Emitted:** Individual field extracted

**Payload:**
```json
{
  "detail": {
    "channelId": "...",
    "tenantId": "...",
    "fieldName": "email",
    "fieldValue": "john@example.com",
    "goalId": "collect_contact_info_...",
    "dataType": "string",
    "validated": true
  }
}
```

---

### 7. `agent.workflow.error`

**When Emitted:** Error during processing

**Payload:**
```json
{
  "detail": {
    "channelId": "...",
    "tenantId": "...",
    "errorType": "data_extraction",
    "errorMessage": "Failed to extract email",
    "activeGoalId": "...",
    "recoverable": true
  }
}
```

---

### 8-9. Future Events

- `agent.interest.detected` - User shows interest (future)
- `agent.objection.detected` - User shows hesitation (future)

---

## Integration Guide (for kx-notifications-messaging)

### Step 1: Create EventBridge Rules

```typescript
// packages/iac/src/constructs/messaging.ts

// Rule 1: Handle Lead Creation
new events.Rule(this, 'AgentLeadCreatedRule', {
  eventBus: eventBus,
  description: 'Process lead.created from agent',
  eventPattern: {
    source: ['kx-langchain-agent'],
    detailType: ['lead.created'],
  },
  targets: [new targets.LambdaFunction(processLeadCreatedFunction)],
});

// Rule 2: Handle State Updates
new events.Rule(this, 'AgentStateUpdatedRule', {
  eventBus: eventBus,
  description: 'Process workflow state updates',
  eventPattern: {
    source: ['kx-langchain-agent'],
    detailType: ['agent.workflow.state_updated'],
  },
  targets: [new targets.LambdaFunction(updateChannelStateFunction)],
});

// Rule 3: Handle Appointments
new events.Rule(this, 'AgentAppointmentRequestedRule', {
  eventBus: eventBus,
  description: 'Process appointment requests',
  eventPattern: {
    source: ['kx-langchain-agent'],
    detailType: ['appointment.requested'],
  },
  targets: [new targets.LambdaFunction(processAppointmentFunction)],
});
```

### Step 2: Create Lambda Handler (Example)

```typescript
// process-lead-created.ts

import type { LeadCreatedEvent } from '@toldyaonce/kx-langchain-agent-runtime/types/agent-events';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export async function handler(
  event: EventBridgeEvent<'lead.created', LeadCreatedEvent>
) {
  const { channelId, tenantId, contactInfo, capturedData } = event.detail;
  
  console.log(`📧 Processing lead.created for channel ${channelId}`);
  
  // 1. Update KxGen-channels-v2 with lead status
  await dynamoDB.send(new UpdateCommand({
    TableName: 'KxGen-channels-v2',
    Key: { 
      channelId, 
      createdAt: 'CHANNEL_RECORD' // or whatever your SK is
    },
    UpdateExpression: 'SET leadStatus = :status, leadCreatedAt = :ts, contactInfo = :contact',
    ExpressionAttributeValues: {
      ':status': 'qualified',
      ':ts': event.detail.timestamp,
      ':contact': contactInfo
    }
  }));
  
  // 2. Create lead record in your CRM table
  await createLeadRecord({
    leadId: channelId,
    tenantId,
    ...contactInfo,
    capturedData,
    source: 'chat_agent'
  });
  
  // 3. Send notifications
  await notifySalesTeam(tenantId, channelId, contactInfo);
  
  // 4. Trigger welcome email
  await sendWelcomeEmail(contactInfo.email, contactInfo.firstName);
  
  console.log(`✅ Lead ${channelId} processed successfully`);
}
```

### Step 3: Update Channel Schema

Add these fields to `KxGen-channels-v2`:

```typescript
interface Channel {
  channelId: string;
  createdAt: string;
  // ... existing fields ...
  
  // NEW FIELDS:
  leadStatus?: 'anonymous' | 'identified' | 'qualified' | 'converted';
  leadCreatedAt?: string;
  contactInfo?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  workflowProgress?: number; // 0-100
  lastAgentActivity?: string;
}
```

---

## How to Update Event Payloads

### Process (Follow in Order)

1. **Update this file FIRST** with new payload schema
2. **Increment version** in `detail.version` (e.g., `1.0` → `1.1`)
3. **Add to Change Log** (below)
4. **Update TypeScript types** in `packages/runtime/src/types/agent-events.ts`
5. **Update code** to emit new payload
6. **Run tests**
7. **Notify consumers** (kx-notifications-messaging team)

### Breaking Changes

If removing/changing existing fields:
- Keep old fields for 4 weeks
- Increment MAJOR version (1.0 → 2.0)
- Notify consumers 2 weeks in advance
- Document migration path

---

## TypeScript Types

All types are defined in:
```
packages/runtime/src/types/agent-events.ts
```

**Available Types:**
- `LeadCreatedEvent`
- `AppointmentRequestedEvent`
- `WorkflowStateUpdatedEvent`
- `GoalCompletedEvent`
- `GoalActivatedEvent`
- `DataCapturedEvent`
- `WorkflowErrorEvent`
- `InterestDetectedEvent` (future)
- `ObjectionDetectedEvent` (future)

**Import Example:**
```typescript
import type {
  AgentEvent,
  LeadCreatedEvent,
  AppointmentRequestedEvent,
} from '@toldyaonce/kx-langchain-agent-runtime/types/agent-events';
```

---

## Change Log

### Version 1.0.0 (2025-11-25)
- Initial event system documentation
- Defined 9 event types
- Complete payloads for all events
- Integration guide for kx-notifications-messaging

---

## Implementation Status

| Event | Defined | Code Ready | Deployed |
|-------|---------|------------|----------|
| `lead.created` | ✅ | 🔄 Pending | ❌ |
| `appointment.requested` | ✅ | 🔄 Pending | ❌ |
| `agent.workflow.state_updated` | ✅ | 🔄 Pending | ❌ |
| `agent.goal.completed` | ✅ | 🔄 Pending | ❌ |
| `agent.goal.activated` | ✅ | 🔄 Pending | ❌ |
| `agent.data.captured` | ✅ | 🔄 Pending | ❌ |
| `agent.workflow.error` | ✅ | 🔄 Pending | ❌ |
| `agent.interest.detected` | ✅ | ❌ Future | ❌ |
| `agent.objection.detected` | ✅ | ❌ Future | ❌ |

---

## Next Steps

### For Agent Team
1. ✅ Create `KxGen-agent-workflow-state` table
2. ✅ Update `ChannelStateService` to use new table
3. ✅ Define event schemas
4. 🔄 Implement event emission in code
5. 🔄 Deploy and test

### For Messaging Team
1. Read this document
2. Create 3 EventBridge rules
3. Create 3 Lambda handlers
4. Update channel schema
5. Deploy and test

### Testing Together
1. Deploy agent with new table
2. Deploy messaging with event listeners
3. Test end-to-end conversation
4. Verify events in EventBridge console
5. Verify channel updates in DynamoDB

---

## Quick Reference

### Event Priority

**Critical (Implement First):**
- `lead.created`
- `appointment.requested`
- `agent.workflow.state_updated`

**Important:**
- `agent.goal.completed`

**Nice to Have:**
- `agent.goal.activated`
- `agent.data.captured`
- `agent.workflow.error`

**Future:**
- `agent.interest.detected`
- `agent.objection.detected`

---

**Questions?** Contact: David Glass  
**Package:** `@toldyaonce/kx-langchain-agent`  
**Last Updated:** 2025-11-25

