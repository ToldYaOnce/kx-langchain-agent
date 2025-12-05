# 🎨 UI Specification: Goal Configuration

## 📍 Configuration Location

**Goals are configured at the COMPANY level** in the `company_info` DynamoDB table.

**Hierarchy:**
1. **Company-level goals** (in `company_info.goalConfiguration`) - **RECOMMENDED** ✅
   - Applies to ALL personas in the tenant
   - Consistent experience across all agents
   - Easier to manage centrally

2. **Persona-level goals** (in `personas.goalConfiguration`) - Fallback
   - Per-persona customization
   - Only used if company-level goals are disabled or missing

**Priority:** Company-level > Persona-level

---

## 🗄️ Database Schema

### Table: `DelayedReplies-company_info`

```typescript
{
  tenantId: string;              // Partition key
  name: string;                  // Company name
  industry: string;              // e.g., "Fitness & Wellness"
  // ... other company fields ...
  
  // NEW: Goal Configuration (add this)
  goalConfiguration?: {
    enabled: boolean;
    globalSettings: {
      maxActiveGoals: number;           // e.g., 3
      respectDeclines: boolean;         // e.g., true
      adaptToUrgency: boolean;          // e.g., true
      interestThreshold: number;        // 1-10 scale
      strictOrdering?: number;          // 1-10 scale (7+ = strict)
      maxGoalsPerTurn?: number;         // e.g., 2
    };
    goals: GoalDefinition[];            // Array of goals
    completionTriggers: {
      allCriticalComplete: string;      // Intent ID
      customCombinations?: Array<{
        goalIds: string[];
        triggerIntent: string;
        description: string;
        channels?: string[];
      }>;
      channelSpecific?: Record<string, any>;
    };
  };
}
```

---

## 🎯 Goal Definition Schema

```typescript
interface GoalDefinition {
  // Basic Info
  id: string;                           // e.g., "collect_contact_info"
  name: string;                         // e.g., "Collect Contact Information"
  description: string;                  // Brief description
  type: 'conversation' | 'data_collection' | 'action_trigger' | 'collect_info' | 'schedule_action' | 'qualify_lead' | 'custom';
  
  // Priority & Ordering
  priority: 'critical' | 'high' | 'medium' | 'low';
  order?: number;                       // 1, 2, 3... (sequence in conversation)
  adherence?: number;                   // 1-10 (how persistent agent is)
  
  // Triggers (OPTIONAL - goal activates when conditions met)
  triggers?: {
    afterGoals?: string[];              // e.g., ["establish_trust"]
    userSignals?: string[];             // e.g., ["price", "cost", "how much"]
    messageCount?: number;              // e.g., 5 (activate after N messages)
  };
  
  // Data Collection (for data_collection goals)
  dataToCapture?: {
    fields: string[];                   // e.g., ["email", "phone", "name"]
    validationRules?: Record<string, {
      pattern?: string;                 // Regex pattern
      required?: boolean;               // Default: true
      errorMessage?: string;
    }>;
  };
  
  // Actions (execute when goal completes)
  actions?: {
    onComplete?: Array<{
      type: 'convert_anonymous_to_lead' | 'trigger_scheduling_flow' | 'send_notification' | 'update_crm' | 'custom';
      eventName?: string;               // EventBridge event name
      payload?: Record<string, any>;    // Additional data
    }>;
  };
  
  // Behavior (how agent pursues goal)
  behavior?: {
    message: string;                    // What to say
    maxAttempts: number;                // Max times to ask
    backoffStrategy: 'gentle' | 'persistent' | 'aggressive';
  };
  
  // Custom Messages (OPTIONAL)
  messages?: {
    request: string;                    // First request
    followUp: string;                   // Follow-up if ignored
    acknowledgment: string;             // When completed
  };
  
  // Channel Rules (OPTIONAL)
  channelRules?: Record<string, {
    required: boolean;
    skip?: boolean;
  }>;
}
```

---

## 🎨 UI Design Recommendations

### Page 1: Company Settings > Goals Tab

```
┌─────────────────────────────────────────────────────────┐
│ Company Settings                                         │
├─────────────────────────────────────────────────────────┤
│ [Overview] [Personas] [Goals] [Integrations]            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Goal Configuration                                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ ○ Enable Goal Orchestration                             │
│   └─ When enabled, AI agents will work towards          │
│      completing specific goals in conversations          │
│                                                          │
│ ┌─ Global Settings ──────────────────────────────────┐  │
│ │                                                     │  │
│ │ Max Active Goals:        [3 ▼]                     │  │
│ │ Max Goals Per Turn:      [2 ▼]                     │  │
│ │ Strict Ordering:         [7 ◄─────────────► 10]   │  │
│ │                          └─ 7+ forces sequential   │  │
│ │ Interest Threshold:      [5 ◄─────────────► 10]   │  │
│ │                                                     │  │
│ │ □ Respect User Declines                            │  │
│ │ □ Adapt to Urgency                                 │  │
│ │                                                     │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ Conversation Goals ────────────────────────────────┐  │
│ │                                                     │  │
│ │ [+ Add Goal]                                        │  │
│ │                                                     │  │
│ │ ┌─ Goal 1: Establish Trust ─────────────────────┐  │  │
│ │ │ Order: [1 ▼]  Priority: [High ▼]  Type: [...]│  │  │
│ │ │ Adherence: [7 ◄────────────► 10]             │  │  │
│ │ │ [Edit] [Delete] [↑] [↓]                       │  │  │
│ │ └───────────────────────────────────────────────┘  │  │
│ │                                                     │  │
│ │ ┌─ Goal 2: Collect Contact Info ────────────────┐  │  │
│ │ │ Order: [2 ▼]  Priority: [Critical ▼]          │  │  │
│ │ │ Adherence: [10 ◄────────────► 10]            │  │  │
│ │ │ 📧 Collects: email, phone, name               │  │  │
│ │ │ [Edit] [Delete] [↑] [↓]                       │  │  │
│ │ └───────────────────────────────────────────────┘  │  │
│ │                                                     │  │
│ │ ┌─ Goal 3: Schedule Consultation ───────────────┐  │  │
│ │ │ Order: [3 ▼]  Priority: [Critical ▼]          │  │  │
│ │ │ Adherence: [9 ◄────────────► 10]             │  │  │
│ │ │ 🎯 Publishes: appointment.requested           │  │  │
│ │ │ [Edit] [Delete] [↑] [↓]                       │  │  │
│ │ └───────────────────────────────────────────────┘  │  │
│ │                                                     │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                          │
│                          [Save Changes]                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

### Page 2: Goal Editor Modal

```
┌───────────────────────────────────────────────────────────┐
│ Edit Goal: Collect Contact Information                    │
├───────────────────────────────────────────────────────────┤
│                                                            │
│ ┌─ Basic Information ─────────────────────────────────┐   │
│ │                                                      │   │
│ │ Goal ID*:          [collect_contact_info        ]   │   │
│ │ Display Name*:     [Collect Contact Information ]   │   │
│ │ Description:       [Get user's email, phone, and ]   │   │
│ │                    [name for follow-up          ]   │   │
│ │                                                      │   │
│ │ Type*:             [Data Collection ▼]              │   │
│ │ Priority*:         [Critical ▼]                     │   │
│ │                                                      │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                            │
│ ┌─ Ordering & Persistence ────────────────────────────┐   │
│ │                                                      │   │
│ │ Order in Flow:     [2 ▼]                            │   │
│ │ Adherence Level:   [10 ◄────────────────► 10]      │   │
│ │                    Low ←→ Medium ←→ High            │   │
│ │                                                      │   │
│ │ Max Attempts:      [5 ▼]                            │   │
│ │ Backoff Strategy:  [Persistent ▼]                   │   │
│ │   Options: Gentle | Persistent | Aggressive         │   │
│ │                                                      │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                            │
│ ┌─ Activation Triggers (Optional) ────────────────────┐   │
│ │                                                      │   │
│ │ Activate after these goals complete:                │   │
│ │ [x] Establish Trust                                 │   │
│ │ [ ] Assess Fitness Goals                            │   │
│ │                                                      │   │
│ │ Activate when user mentions:                        │   │
│ │ [contact] [info] [email] [phone] [+ Add keyword]    │   │
│ │                                                      │   │
│ │ Activate after message count:                       │   │
│ │ [ ] Enable  [3 ▼] messages                          │   │
│ │                                                      │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                            │
│ ┌─ Data to Collect ────────────────────────────────────┐   │
│ │                                                      │   │
│ │ Fields to collect:                                  │   │
│ │                                                      │   │
│ │ ┌─ email ────────────────────────────────────────┐  │   │
│ │ │ Required: ☑  Pattern: [email regex]            │  │   │
│ │ │ Error: "Please provide a valid email"          │  │   │
│ │ │ [Remove]                                        │  │   │
│ │ └─────────────────────────────────────────────────┘  │   │
│ │                                                      │   │
│ │ ┌─ phone ────────────────────────────────────────┐  │   │
│ │ │ Required: ☑  Pattern: [phone regex]            │  │   │
│ │ │ Error: "Please provide a valid phone number"   │  │   │
│ │ │ [Remove]                                        │  │   │
│ │ └─────────────────────────────────────────────────┘  │   │
│ │                                                      │   │
│ │ ┌─ name ─────────────────────────────────────────┐  │   │
│ │ │ Required: ☐  Pattern: [optional]               │  │   │
│ │ │ [Remove]                                        │  │   │
│ │ └─────────────────────────────────────────────────┘  │   │
│ │                                                      │   │
│ │ [+ Add Field]                                        │   │
│ │                                                      │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                            │
│ ┌─ Actions on Completion ──────────────────────────────┐   │
│ │                                                      │   │
│ │ When this goal completes, trigger:                  │   │
│ │                                                      │   │
│ │ ┌─ Action 1: Convert to Lead ────────────────────┐  │   │
│ │ │ Type: [Convert Anonymous to Lead ▼]            │  │   │
│ │ │ Event Name: [lead.contact_captured         ]   │  │   │
│ │ │ Payload (JSON):                                │  │   │
│ │ │ {                                              │  │   │
│ │ │   "source": "chat_agent",                      │  │   │
│ │ │   "priority": "high"                           │  │   │
│ │ │ }                                              │  │   │
│ │ │ [Remove]                                        │  │   │
│ │ └─────────────────────────────────────────────────┘  │   │
│ │                                                      │   │
│ │ [+ Add Action]                                       │   │
│ │                                                      │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                            │
│ ┌─ Custom Messages (Optional) ─────────────────────────┐   │
│ │                                                      │   │
│ │ Initial Request:                                    │   │
│ │ [What's the best email to reach you at?         ]   │   │
│ │                                                      │   │
│ │ Follow-up (if ignored):                             │   │
│ │ [I still need your email to send you that info  ]   │   │
│ │                                                      │   │
│ │ Acknowledgment (when complete):                     │   │
│ │ [Perfect! I've got your contact info            ]   │   │
│ │                                                      │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                            │
│                  [Cancel]  [Save Goal]                     │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

---

## 🔧 UI Implementation Guide

### 1. Fields to Expose

#### **Global Settings (All Required)**
- `enabled` - Toggle switch
- `maxActiveGoals` - Number input (1-10)
- `maxGoalsPerTurn` - Number input (1-5)
- `strictOrdering` - Slider (0-10, show "Flexible" to "Strict")
- `interestThreshold` - Slider (1-10)
- `respectDeclines` - Checkbox
- `adaptToUrgency` - Checkbox

#### **Per-Goal Fields (Basic)**
- `id` - Text input (auto-generate from name, snake_case)
- `name` - Text input
- `description` - Textarea
- `type` - Dropdown (conversation, data_collection, action_trigger, etc.)
- `priority` - Dropdown (critical, high, medium, low)
- `order` - Number input (1-100)
- `adherence` - Slider (1-10)

#### **Per-Goal Fields (Advanced)**
- `behavior.maxAttempts` - Number input (1-10)
- `behavior.backoffStrategy` - Dropdown (gentle, persistent, aggressive)

#### **Triggers (Optional, Show in Accordion)**
- `triggers.afterGoals` - Multi-select from available goals
- `triggers.userSignals` - Tag input (keywords)
- `triggers.messageCount` - Number input with enable checkbox

#### **Data Collection (Show if type = data_collection)**
- `dataToCapture.fields` - Array of field configs
  - Field name - Text input
  - Required - Checkbox
  - Validation pattern - Text input (regex)
  - Error message - Text input

#### **Actions (Optional)**
- `actions.onComplete` - Array of action configs
  - Type - Dropdown
  - Event name - Text input
  - Payload - JSON editor or key-value inputs

#### **Custom Messages (Optional)**
- `messages.request` - Text input
- `messages.followUp` - Text input
- `messages.acknowledgment` - Text input

---

### 2. Validation Rules

#### **Required Fields**
- `id` - Must be unique, lowercase, snake_case
- `name` - Must be non-empty
- `type` - Must select one
- `priority` - Must select one
- `order` - Must be positive integer

#### **Business Rules**
- If `triggers.afterGoals` contains goal IDs, those goals must exist
- If `dataToCapture.fields` is set, `type` should be `data_collection`
- If `actions` contains `convert_anonymous_to_lead`, recommend `dataToCapture` includes email
- `order` values don't need to be sequential (can be 1, 5, 10, etc.)
- `adherence` and `strictOrdering` use 1-10 scale

#### **Recommended Validation**
```typescript
// Goal ID validation
const goalIdRegex = /^[a-z][a-z0-9_]*$/;

// Email pattern (for dataToCapture)
const emailPattern = '^[^@]+@[^@]+\\.[^@]+$';

// Phone pattern (for dataToCapture)
const phonePattern = '^\\+?[0-9]{10,}$';
```

---

### 3. Default Values

#### **Global Settings Defaults**
```json
{
  "enabled": true,
  "maxActiveGoals": 3,
  "maxGoalsPerTurn": 2,
  "strictOrdering": 5,
  "interestThreshold": 5,
  "respectDeclines": true,
  "adaptToUrgency": true
}
```

#### **New Goal Defaults**
```json
{
  "id": "new_goal_1",
  "name": "New Goal",
  "description": "",
  "type": "conversation",
  "priority": "medium",
  "order": 10,
  "adherence": 5,
  "behavior": {
    "message": "",
    "maxAttempts": 3,
    "backoffStrategy": "gentle"
  }
}
```

---

### 4. UI/UX Best Practices

#### **Visual Hierarchy**
1. **Traffic light colors** for priority:
   - Critical: Red badge
   - High: Orange badge
   - Medium: Yellow badge
   - Low: Green badge

2. **Adherence slider visual**:
   ```
   1    3    5    7    10
   |----|----|----|----|
   Subtle  Contextual  Direct
   ```

3. **Goal cards** should show:
   - Goal name (bold)
   - Order number (badge)
   - Priority (colored badge)
   - Adherence (visual bar)
   - Type icon
   - Quick stats (e.g., "Collects 3 fields", "Triggers 2 actions")

#### **Tooltips / Help Text**
- **Order**: "Goals activate in this sequence. Lower numbers first."
- **Adherence**: "How persistent the agent is. 10 = very pushy, 1 = backs off quickly."
- **Strict Ordering**: "7+ forces one goal at a time. Lower allows multiple."
- **afterGoals**: "This goal won't activate until the selected goals complete."
- **userSignals**: "Keywords that trigger this goal (e.g., 'price', 'cost')."
- **messageCount**: "Activate after N messages in the conversation."
- **Max Attempts**: "How many times to ask before giving up."
- **Backoff Strategy**:
  - Gentle: Gets softer with each attempt
  - Persistent: Keeps asking consistently
  - Aggressive: Gets more direct with each attempt

#### **Warnings & Validation Messages**
- ⚠️ "No goals defined. Agent won't have any objectives."
- ⚠️ "Goal X references non-existent goal Y in afterGoals."
- ⚠️ "Consider adding actions to capture goal completion events."
- ⚠️ "Adherence 10 with maxAttempts 5 = very pushy. Are you sure?"
- ⚠️ "Strict ordering is off but goals have order numbers. Order will still be used."

#### **Drag & Drop**
- Allow reordering goals by dragging (updates `order` field)
- Visual feedback when dragging

#### **Templates**
Provide pre-built goal templates:
- 🎯 "Lead Capture Flow" - Trust → Contact → Qualify
- 🎯 "Sales Flow" - Contact → Demo → Schedule → Close
- 🎯 "Support Flow" - Identify Issue → Collect Details → Resolve

---

### 5. API Endpoints Needed

#### **Get Company Goals**
```
GET /api/company/{tenantId}/goals
Response: GoalConfiguration
```

#### **Update Company Goals**
```
PUT /api/company/{tenantId}/goals
Body: GoalConfiguration
```

#### **Validate Goal Config**
```
POST /api/company/{tenantId}/goals/validate
Body: GoalConfiguration
Response: { valid: boolean, errors: string[] }
```

---

### 6. Sample JSON for UI Testing

See `GOAL_CONFIG_EXAMPLE.json` for a complete, production-ready example with:
- 6 goals (trust, contact, fitness assessment, pricing, consultation, premium)
- Proper ordering and dependencies
- Data collection with validation
- Actions for EventBridge integration
- Custom messages
- Completion triggers

---

## 🎯 Recommended UI Flow

### **For New Users (Onboarding)**
1. Show "Goals" tab with empty state
2. Offer templates: "Quick Setup with Pre-built Goals"
3. Select template (e.g., "Lead Capture Flow")
4. Review and customize
5. Enable and save

### **For Power Users**
1. Create goals from scratch
2. Set up complex triggers (afterGoals, userSignals)
3. Configure validation rules
4. Set up EventBridge actions
5. Test with simulator

### **Testing / Preview**
Add a "Test Goals" feature:
- Simulated conversation UI
- Shows which goals are active at each step
- Shows what data was extracted
- Shows what events would be published
- Allows tweaking without deploying

---

## 📊 Analytics Dashboard (Future)

Show goal performance:
- **Completion Rate**: % of goals that complete
- **Avg Attempts**: How many tries per goal
- **Drop-off Points**: Where users abandon
- **Time to Complete**: How long each goal takes
- **Event Delivery**: % of actions successfully triggered

---

## 🚀 Deployment

Once UI saves goals:
1. Write to `DelayedReplies-company_info.goalConfiguration`
2. Agent automatically picks them up (no redeploy needed)
3. Test in chat immediately

---

**This is the complete UI specification!** Everything the frontend needs to build the goals configuration interface. 🎨

Want me to create a simpler "Quick Start" guide for the UI team?

