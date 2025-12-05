# 🎨 UI Quick Reference: Goals Configuration

## TL;DR for Frontend Team

### Where to Save
**DynamoDB Table:** `DelayedReplies-company_info`  
**Field:** `goalConfiguration` (new field, add to existing company record)  
**Level:** Company-wide (applies to all personas in tenant)

---

## Minimal UI (MVP)

### 1. Add "Goals" Tab to Company Settings
```
Company Settings > [Overview] [Personas] [Goals ✨NEW] [Integrations]
```

### 2. Essential Fields Only

#### Global Settings
```typescript
{
  enabled: boolean;           // Toggle switch
  strictOrdering: number;     // Slider 0-10
  maxGoalsPerTurn: number;    // Dropdown 1-5
}
```

#### Per Goal (Simple Version)
```typescript
{
  id: string;                 // Auto-generate from name
  name: string;               // Text input
  description: string;        // Textarea
  type: 'data_collection';    // For MVP, hardcode this
  priority: 'critical';       // For MVP, hardcode this
  order: number;              // Auto-increment (1, 2, 3...)
  adherence: number;          // Slider 1-10
  
  dataToCapture: {
    fields: ['email', 'phone', 'name'];  // Checkboxes
  };
  
  actions: {
    onComplete: [{
      type: 'convert_anonymous_to_lead';  // Hardcode for MVP
      eventName: 'lead.contact_captured';
    }];
  };
}
```

---

## 3-Step MVP Implementation

### Step 1: Basic Form (30 min)
```jsx
<Form>
  <Toggle label="Enable Goals" value={config.enabled} />
  
  <Slider 
    label="Strict Ordering (0=flexible, 10=strict)"
    min={0} 
    max={10} 
    value={config.strictOrdering} 
  />
  
  <Select 
    label="Max Goals Per Turn"
    options={[1,2,3,4,5]}
    value={config.maxGoalsPerTurn}
  />
</Form>
```

### Step 2: Goal List (1 hour)
```jsx
<GoalList>
  {goals.map((goal, index) => (
    <GoalCard key={goal.id}>
      <Input label="Goal Name" value={goal.name} />
      <Slider label="How Persistent?" min={1} max={10} value={goal.adherence} />
      <Checkboxes label="Collect:">
        <Checkbox label="Email" checked={goal.dataToCapture.fields.includes('email')} />
        <Checkbox label="Phone" checked={goal.dataToCapture.fields.includes('phone')} />
        <Checkbox label="Name" checked={goal.dataToCapture.fields.includes('name')} />
      </Checkboxes>
      <Button onClick={() => moveUp(index)}>↑</Button>
      <Button onClick={() => moveDown(index)}>↓</Button>
      <Button onClick={() => deleteGoal(index)}>Delete</Button>
    </GoalCard>
  ))}
  <Button onClick={addGoal}>+ Add Goal</Button>
</GoalList>
```

### Step 3: Save to DynamoDB (30 min)
```typescript
// API call
PUT /api/company/${tenantId}/settings
Body: {
  ...existingCompanyData,
  goalConfiguration: {
    enabled: true,
    globalSettings: {
      maxActiveGoals: 3,
      respectDeclines: true,
      adaptToUrgency: true,
      interestThreshold: 5,
      strictOrdering: formData.strictOrdering,
      maxGoalsPerTurn: formData.maxGoalsPerTurn
    },
    goals: formData.goals.map((g, i) => ({
      id: g.id || `goal_${i+1}`,
      name: g.name,
      description: g.description || '',
      type: 'data_collection',
      priority: 'critical',
      order: i + 1,  // Auto-assign based on position
      adherence: g.adherence,
      dataToCapture: {
        fields: g.dataToCapture.fields,
        validationRules: {
          email: { 
            pattern: '^[^@]+@[^@]+\\.[^@]+$', 
            required: true 
          },
          phone: { 
            pattern: '^\\+?[0-9]{10,}$', 
            required: true 
          },
          name: { required: false }
        }
      },
      actions: {
        onComplete: [{
          type: 'convert_anonymous_to_lead',
          eventName: 'lead.contact_captured',
          payload: { source: 'chat_agent' }
        }]
      },
      behavior: {
        message: '',
        maxAttempts: 5,
        backoffStrategy: 'persistent'
      }
    })),
    completionTriggers: {
      allCriticalComplete: 'lead_fully_qualified'
    }
  }
}
```

---

## Copy-Paste Starter Template

```json
{
  "enabled": true,
  "globalSettings": {
    "maxActiveGoals": 3,
    "respectDeclines": true,
    "adaptToUrgency": true,
    "interestThreshold": 5,
    "strictOrdering": 7,
    "maxGoalsPerTurn": 2
  },
  "goals": [
    {
      "id": "establish_trust",
      "name": "Establish Trust",
      "description": "Build rapport with the user",
      "type": "conversation",
      "priority": "high",
      "order": 1,
      "adherence": 5,
      "behavior": {
        "message": "Be friendly and welcoming",
        "maxAttempts": 1,
        "backoffStrategy": "gentle"
      }
    },
    {
      "id": "collect_contact",
      "name": "Collect Contact Info",
      "description": "Get email, phone, and name",
      "type": "data_collection",
      "priority": "critical",
      "order": 2,
      "adherence": 10,
      "triggers": {
        "afterGoals": ["establish_trust"],
        "messageCount": 3
      },
      "dataToCapture": {
        "fields": ["email", "phone", "name"],
        "validationRules": {
          "email": {
            "pattern": "^[^@]+@[^@]+\\.[^@]+$",
            "required": true
          },
          "phone": {
            "pattern": "^\\+?[0-9]{10,}$",
            "required": true
          },
          "name": {
            "required": false
          }
        }
      },
      "actions": {
        "onComplete": [
          {
            "type": "convert_anonymous_to_lead",
            "eventName": "lead.contact_captured",
            "payload": {
              "source": "chat_agent"
            }
          }
        ]
      },
      "behavior": {
        "message": "I need your contact info to help you",
        "maxAttempts": 5,
        "backoffStrategy": "persistent"
      }
    }
  ],
  "completionTriggers": {
    "allCriticalComplete": "lead_fully_qualified"
  }
}
```

---

## Visual Design Tips

### Adherence Slider
```
Low (1-3)         Medium (4-7)        High (8-10)
  Subtle            Balanced            Pushy
  |----------|----------|----------|----------|
  1    3     5     7     9    10
```

### Priority Badges
- 🔴 Critical (red)
- 🟠 High (orange)
- 🟡 Medium (yellow)
- 🟢 Low (green)

### Goal Type Icons
- 💬 Conversation
- 📝 Data Collection
- ⚡ Action Trigger
- 📅 Schedule Action

---

## Testing Your Implementation

### 1. Enable Goals
Save this to DynamoDB and verify agent starts asking for contact info

### 2. Check CloudWatch Logs
Look for:
```
🎯 Goal Orchestration START
📊 State: 1 messages, 0 completed, 0 active
✅ 2 eligible goals
```

### 3. Test Data Collection
Send: "My email is test@example.com"
Check logs for: `📥 Extracted email: test@example.com`

### 4. Verify Event Publishing
Complete all fields, check EventBridge for `lead.contact_captured` event

---

## Common Mistakes to Avoid

❌ **Don't** put goals in `personas` table (use `company_info` instead)  
❌ **Don't** forget to set `enabled: true`  
❌ **Don't** use duplicate goal IDs  
❌ **Don't** skip `order` field (goals won't know sequence)  
❌ **Don't** set adherence to 0 (use 1-10 scale)  

✅ **Do** start with 2-3 simple goals  
✅ **Do** set `strictOrdering: 7+` for linear flows  
✅ **Do** use `afterGoals` for dependencies  
✅ **Do** test in chat after each change  

---

## Need Help?

📚 **Full Spec:** `UI_SPECIFICATION_GOALS.md`  
🧪 **Test Plan:** `GOAL_ORCHESTRATION_TEST_PLAN.md`  
💡 **Example:** `GOAL_CONFIG_EXAMPLE.json`  
🚀 **Deploy Guide:** `DEPLOYMENT_CHECKLIST.md`

---

**Estimated Time:** 2-3 hours for MVP UI  
**Complexity:** Medium (standard CRUD with sliders)  
**Impact:** High (enables powerful conversation management) 🎯

