# 🔒 Three-Tier Information Sharing Permissions

## Overview

The agent now supports **three-tier information sharing control** with full backwards compatibility. This allows companies to precisely control what information the AI can share based on whether contact information has been collected.

---

## ✅ Supported Data Formats

The system handles **THREE formats** seamlessly:

### **Format 1: UI `informationCategories` Array** (Recommended)

This is the format your UI sends:

```json
{
  "responseGuidelines": {
    "informationCategories": [
      { "id": "pricing_0", "label": "Pricing", "column": "never" },
      { "id": "scheduling_1", "label": "Scheduling", "column": "require" },
      { "id": "promotions_2", "label": "Promotions", "column": "always" }
    ]
  }
}
```

**Columns:**
- `"always"` → Share freely without contact info
- `"require"` → Requires contact info before sharing
- `"never"` → Never share, redirect to direct contact

---

### **Format 2: Three-Tier Arrays** (Backend preferred)

```json
{
  "responseGuidelines": {
    "sharingPermissions": {
      "alwaysAllowed": ["Promotions", "Basic Info", "Location"],
      "requiresContact": ["Pricing", "Membership Info", "Scheduling"],
      "neverShare": ["Personal Training Rates", "Member Data"],
      "defaultPermission": "contact_required"
    }
  }
}
```

---

### **Format 3: Legacy Overrides** (Deprecated but supported)

```json
{
  "responseGuidelines": {
    "sharingPermissions": {
      "allowedValues": ["always_allowed", "contact_required", "never_share"],
      "default": "contact_required",
      "overrides": {
        "basicInfo": "always_allowed",
        "pricing": "never_share"
      }
    }
  }
}
```

---

## 🎯 How It Works

### **1. Normalization**

All formats are normalized into a unified structure:

```typescript
{
  alwaysAllowed: Set<string>,    // Fast lookup
  requiresContact: Set<string>,
  neverShare: Set<string>,
  defaultPermission: 'contact_required'
}
```

**Priority Order:**
1. `informationCategories[]` (highest)
2. `sharingPermissions` arrays
3. Legacy `overrides` (lowest)

---

### **2. Fuzzy Matching**

The agent uses **case-insensitive substring matching** for flexibility:

```typescript
// User asks: "How much does PERSONAL TRAINING cost?"
// System checks: "personal training rates" ✓ MATCH (neverShare)
// Agent responds: "For personal training pricing, please contact us directly."

// User asks: "What membership options do you have?"
// System checks: "membership info" ✓ MATCH (requiresContact)
// Agent responds: "I'd be happy to share membership details! What's your email?"
```

---

### **3. Decision Logic**

```typescript
1. Check neverShare first (highest priority)
   → Block and redirect to direct contact

2. Check alwaysAllowed
   → Share immediately

3. Check requiresContact
   → Share if contact info exists
   → Request contact info if not

4. Fall back to defaultPermission
```

---

## 📝 Your Company Info Structure

### **What You Sent:**

```json
{
  "tenantId": "tenant_1757418497028_g9o6mnb4m",
  "companyName": "KxGrynde Fitness",
  "responseGuidelines": {
    "contactPolicy": {
      "allowBasicInfoWithoutContact": true,
      "requireContactForDetails": true
    },
    "informationCategories": [
      { "id": "migrated_pricing_0", "label": "Pricing", "column": "never" },
      { "id": "migrated_scheduling_1", "label": "Scheduling", "column": "require" },
      { "id": "migrated_personaltrainingrates_5", "label": "Personal Training Rates", "column": "never" },
      { "id": "migrated_promotions_6", "label": "Promotions", "column": "always" },
      { "id": "migrated_specificprograms_7", "label": "Specific Programs", "column": "require" }
    ],
    "sharingPermissions": {
      "allowedValues": ["always_allowed", "contact_required", "never_share"],
      "default": "contact_required",
      "overrides": {
        "basicInfo": "always_allowed",
        "location": "always_allowed"
      }
    }
  }
}
```

---

### **✅ How The Agent Interprets This:**

**After normalization:**

```typescript
{
  alwaysAllowed: Set([
    "promotions",           // from informationCategories
    "basicinfo",            // from overrides
    "location",             // from overrides
  ]),
  
  requiresContact: Set([
    "scheduling",           // from informationCategories
    "specific programs",    // from informationCategories
  ]),
  
  neverShare: Set([
    "pricing",              // from informationCategories
    "personal training rates", // from informationCategories
  ]),
  
  defaultPermission: "contact_required"
}
```

---

## 🧪 Example Conversations

### **Scenario 1: Always Allowed (Promotions)**

```
User: "Do you have any promotions?"

Agent checks: "promotions" → alwaysAllowed ✓

Agent: "Absolutely! We're running a special offer this month: 
        New members get 50% off their first month plus a free 
        personal training session. Would you like to sign up?"
```

---

### **Scenario 2: Requires Contact (Scheduling)**

```
User: "Can I schedule a tour?"

Agent checks: "scheduling" → requiresContact
Agent checks: hasContactInfo? → NO

Agent: "I'd love to help you schedule a tour! To get that set up, 
        I'll need your contact information. What's the best email 
        to reach you at?"
```

---

### **Scenario 3: Never Share (Pricing)**

```
User: "How much does a membership cost?"

Agent checks: "membership" + "cost" → "pricing" → neverShare ✓

Agent: "For detailed pricing information, I'd recommend speaking 
        with our team directly. You can call us at +1-555-KXGRYNDE 
        or visit https://kxgrynde.com/pricing. Would you like me 
        to help schedule a call with someone?"
```

---

## 🔧 API Usage

### **Creating Company Info with Sharing Permissions**

```bash
PATCH /agent/company/tenant_YOUR_TENANT_ID
Content-Type: application/json

{
  "companyName": "KxGrynde Fitness",
  "responseGuidelines": {
    "informationCategories": [
      { "id": "pricing_0", "label": "Pricing", "column": "never" },
      { "id": "promotions_1", "label": "Promotions", "column": "always" },
      { "id": "scheduling_2", "label": "Scheduling", "column": "require" }
    ]
  }
}
```

---

### **Updating Just Sharing Permissions**

⚠️ **IMPORTANT:** The API uses `PutCommand`, so you must send the **full object** to avoid data loss!

**Correct approach:**

```javascript
// 1. GET existing data
const response = await fetch('/agent/company/tenant_123');
const existing = await response.json();

// 2. Merge your changes
const updated = {
  ...existing.data,
  responseGuidelines: {
    ...existing.data.responseGuidelines,
    informationCategories: [
      { id: "new_pricing", label: "Pricing", column: "never" },
      // ... rest of categories
    ]
  }
};

// 3. PATCH with merged data
await fetch('/agent/company/tenant_123', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(updated)
});
```

---

## 📊 UI Integration

Your UI can send **either format** and it will work:

### **Option 1: Send `informationCategories` (Recommended)**

```typescript
// Your UI form generates this
const categories = formData.map(item => ({
  id: item.id,
  label: item.name,
  column: item.tier  // "always", "require", or "never"
}));

await updateCompanyInfo({
  responseGuidelines: {
    informationCategories: categories
  }
});
```

---

### **Option 2: Send Three Arrays**

```typescript
const permissions = {
  alwaysAllowed: formData.filter(i => i.tier === 'always').map(i => i.name),
  requiresContact: formData.filter(i => i.tier === 'require').map(i => i.name),
  neverShare: formData.filter(i => i.tier === 'never').map(i => i.name),
  defaultPermission: 'contact_required'
};

await updateCompanyInfo({
  responseGuidelines: {
    sharingPermissions: permissions
  }
});
```

---

## 🎨 Agent System Prompt Injection

When company info includes sharing permissions, the agent's system prompt automatically includes:

```
INFORMATION SHARING POLICY:
**Always share freely:** promotions, basic info, location
**Require contact info before sharing:** scheduling, specific programs, membership info
**Never share (direct user to contact team):** pricing, personal training rates
**Default policy:** contact required

IMPORTANT: Before sharing information, check if it falls into any of 
these categories. If contact info is required and you don't have it, 
politely request it before proceeding. If information is marked as 
"never share", redirect the user to contact the team directly.
```

This makes the AI **aware** of the policy on every turn.

---

## ✅ **YES, We Can Handle Your Structure!**

Your `companyInfo` structure is **fully supported** with:

✅ `informationCategories[]` array (UI format)  
✅ `sharingPermissions` with legacy overrides  
✅ `contactPolicy` configuration  
✅ `goalConfiguration` (Phase A & B implemented)  
✅ All existing fields (business hours, address, etc.)

**The agent will:**
1. Parse your `informationCategories`
2. Normalize them into fast lookup Sets
3. Inject sharing policy into system prompt
4. Check permissions on every response
5. Request contact info when needed
6. Redirect to direct contact for "never share" items

---

## 🚀 Next Steps

1. ✅ **Phase A & B Complete** (Goal Orchestration + Dynamic Data Collection)
2. ✅ **Sharing Permissions Complete** (Three-tier system)
3. ⏳ **Phase C: Channel State Persistence** (save/load progress across channels)
4. ⏳ **Phase D: Inbound Event Handler** (lead.created listener)

---

## 📚 Files Changed

- `packages/runtime/src/types/dynamodb-schemas.ts` - Added interfaces
- `packages/runtime/src/lib/persona-service.ts` - Extended CompanyInfo
- `packages/runtime/src/lib/sharing-permissions-utils.ts` - NEW: Normalization logic
- `packages/runtime/src/lib/agent.ts` - Injected sharing guidelines into system prompt

**Build Status:** ✅ Passes TypeScript compilation

