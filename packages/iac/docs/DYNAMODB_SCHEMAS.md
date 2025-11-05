# DynamoDB Table Schemas

This document provides comprehensive documentation for all DynamoDB tables used in the KxGen LangChain Agent system. This is essential for UX development and understanding the complete data model.

## Table of Contents

- [Overview](#overview)
- [Messages Table](#messages-table)
- [Leads Table](#leads-table)
- [Personas Table](#personas-table)
- [Access Patterns](#access-patterns)
- [Data Examples](#data-examples)
- [Best Practices](#best-practices)

## Overview

The KxGen LangChain Agent uses three main DynamoDB tables:

1. **Messages Table**: Stores conversation history and agent responses
2. **Leads Table**: Manages contact information and lead qualification
3. **Personas Table**: Contains dynamic AI personality configurations

All tables use single-table design principles with Global Secondary Indexes (GSIs) for efficient querying.

## Messages Table

### Purpose
Store all inbound and outbound messages in conversations, providing complete conversation history and analytics.

### Schema

| Attribute | Type | Description |
|-----------|------|-------------|
| `contact_pk` | String (PK) | Contact identifier: `${tenantId}#${email_lc}` |
| `ts` | String (SK) | Timestamp (ULID for time-ordered uniqueness) |
| `tenantId` | String | Tenant identifier for data isolation |
| `email_lc` | String | Lowercase email address |
| `source` | String | Message channel: `sms`, `email`, `chat`, `api`, `voice`, `social` |
| `direction` | String | Message direction: `inbound`, `outbound` |
| `text` | String | Message content/text |
| `conversation_id` | String | Optional conversation grouping identifier |
| `lead_id` | String | Optional lead identifier (if associated) |
| `channel_context` | Object | Channel-specific metadata (see below) |
| `meta` | Object | Message metadata (processing time, intent, sentiment) |
| `GSI1PK` | String | Tenant ID (for GSI1) |
| `GSI1SK` | String | Timestamp (for GSI1) |
| `GSI2PK` | String | Lead ID (for GSI2) |
| `GSI2SK` | String | Timestamp (for GSI2) |
| `created_at` | String | ISO 8601 timestamp |
| `updated_at` | String | ISO 8601 timestamp |

### Global Secondary Indexes

#### GSI1: Recent Messages per Tenant
- **PK**: `GSI1PK` (tenantId)
- **SK**: `GSI1SK` (timestamp)
- **Purpose**: Query recent messages across all contacts for a tenant
- **Use Case**: Admin dashboards, analytics, recent activity feeds

#### GSI2: Messages by Lead
- **PK**: `GSI2PK` (lead_id)
- **SK**: `GSI2SK` (timestamp)
- **Purpose**: Query all messages for a specific lead
- **Use Case**: Lead management, conversation tracking

### Channel Context Examples

```typescript
// SMS Context
{
  sms: {
    phoneNumber: "+1234567890",
    provider: "twilio",
    segments: 1
  }
}

// Email Context
{
  email: {
    subject: "Question about membership",
    emailAddress: "user@example.com",
    provider: "gmail",
    threadId: "thread_123"
  }
}

// Chat Context
{
  chat: {
    sessionId: "sess_abc123",
    clientId: "web_client",
    userAgent: "Mozilla/5.0...",
    ipAddress: "192.168.1.1"
  }
}
```

### Message Metadata Examples

```typescript
{
  model: "anthropic.claude-3-sonnet-20240229-v1:0",
  processingTimeMs: 1250,
  detectedIntent: {
    id: "pricing_request",
    confidence: 0.92,
    category: "business_inquiry"
  },
  sentiment: {
    score: 0.7,
    label: "positive",
    confidence: 0.85
  },
  triggeredByMessage: "01HKQR5J9X8M2N3P4Q5R6S7T8U",
  processedAt: "2024-01-15T10:30:00.000Z"
}
```

## Leads Table

### Purpose
Manage contact information, lead qualification, and phone number resolution.

### Schema

| Attribute | Type | Description |
|-----------|------|-------------|
| `contact_pk` | String (PK) | Contact identifier: `${tenantId}#${email_lc}` |
| `sk` | String (SK) | Sort key: `PROFILE` for main contact record |
| `tenantId` | String | Tenant identifier |
| `email_lc` | String | Lowercase email address |
| `contactInfo` | Object | Contact details (name, phone, company, etc.) |
| `qualification` | Object | Lead scoring and status information |
| `preferences` | Object | Communication and behavioral preferences |
| `GSI1PK` | String | `${tenantId}#${phone}` (for phone lookup) |
| `GSI1SK` | String | `PHONE_LOOKUP` |
| `GSI2PK` | String | `${tenantId}#${status}` (for status queries) |
| `GSI2SK` | String | `created_at` timestamp |
| `created_at` | String | ISO 8601 timestamp |
| `updated_at` | String | ISO 8601 timestamp |
| `created_by` | String | Who created the lead |
| `updated_by` | String | Who last updated the lead |

### Global Secondary Indexes

#### GSI1: Phone Number Lookup
- **PK**: `GSI1PK` (`${tenantId}#${phone}`)
- **SK**: `GSI1SK` (`PHONE_LOOKUP`)
- **Purpose**: Resolve phone numbers to email addresses
- **Use Case**: SMS routing, contact resolution

#### GSI2: Lead Status Queries
- **PK**: `GSI2PK` (`${tenantId}#${status}`)
- **SK**: `GSI2SK` (created_at)
- **Purpose**: Query leads by status and creation date
- **Use Case**: Lead management, pipeline reports

### Contact Info Structure

```typescript
{
  firstName: "John",
  lastName: "Doe",
  fullName: "John Doe",
  email: "john.doe@example.com",
  phone: "+1234567890",
  company: "Acme Corp",
  title: "Marketing Director",
  preferredChannel: "email",
  timezone: "America/New_York",
  language: "en"
}
```

### Qualification Structure

```typescript
{
  score: 85,
  status: "qualified",
  source: "website_form",
  campaign: "summer_2024",
  interestLevel: 0.8,
  urgencyLevel: 0.6,
  budget: {
    range: "$1000-5000",
    qualified: true
  },
  decisionMaker: true,
  timeline: "next_quarter",
  notes: ["Interested in premium package", "Needs approval from CFO"]
}
```

## Personas Table

### Purpose
Store dynamic AI personality configurations, company information, and behavioral rules.

### Schema

| Attribute | Type | Description |
|-----------|------|-------------|
| `persona_pk` | String (PK) | Persona identifier: `${tenantId}#${persona_id}` |
| `sk` | String (SK) | Sort key: `CONFIG` for main persona record |
| `tenantId` | String | Tenant identifier |
| `persona_id` | String | Persona identifier within tenant |
| `status` | String | Persona status: `active`, `draft`, `archived`, `template` |
| `config` | Object | Complete persona configuration (see below) |
| `GSI1PK` | String | Tenant ID (for active personas per tenant) |
| `GSI1SK` | String | `${status}#${updated_at}` |
| `GSI2PK` | String | `TEMPLATE#${category}` (for persona templates) |
| `GSI2SK` | String | Popularity score (for template ranking) |
| `isTemplate` | Boolean | Whether this persona is a template |
| `templateCategory` | String | Template category |
| `popularityScore` | Number | Template popularity score |
| `templateDescription` | String | Template description |
| `created_at` | String | ISO 8601 timestamp |
| `updated_at` | String | ISO 8601 timestamp |
| `created_by` | String | Who created the persona |
| `updated_by` | String | Who last updated the persona |

### Global Secondary Indexes

#### GSI1: Active Personas per Tenant
- **PK**: `GSI1PK` (tenantId)
- **SK**: `GSI1SK` (`${status}#${updated_at}`)
- **Purpose**: Query active personas for a tenant
- **Use Case**: Persona management, configuration UI

#### GSI2: Persona Templates
- **PK**: `GSI2PK` (`TEMPLATE#${category}`)
- **SK**: `GSI2SK` (popularity_score)
- **Purpose**: Browse and rank persona templates
- **Use Case**: Template marketplace, persona creation

### Persona Configuration Structure

```typescript
{
  name: "Carlos - Boxing Gym Assistant",
  description: "Energetic boxing gym assistant who calls people 'champ'",
  systemPrompt: "You are Carlos, a friendly boxing gym assistant...",
  personality: {
    tone: "warm, energetic, encouraging",
    style: "casual but professional",
    languageQuirks: ["calls people 'champ'", "uses boxing terminology"],
    specialBehaviors: ["shows enthusiasm with boxing glove emojis"]
  },
  responseGuidelines: [
    "Keep responses short and punchy",
    "Always ask for contact info before providing details",
    "Use boxing terminology naturally"
  ],
  greetings: {
    gist: "Energetic greeting with boxing terminology",
    variations: [
      "Hey there, champ! Ready to get in the ring with fitness? [boxing_glove]",
      "What's up, future champion! How can I help you today? [boxing_glove]"
    ]
  },
  intentCapturing: {
    enabled: true,
    intents: [
      {
        id: "pricing_request",
        name: "Pricing Information Request",
        triggers: ["price", "cost", "membership", "how much"],
        response: {
          type: "persona_handled",
          template: ""
        }
      }
    ]
  },
  goalConfiguration: {
    enabled: true,
    goals: [
      {
        id: "collect_name_first",
        name: "Collect First Name",
        type: "collect_info",
        priority: "critical",
        target: {
          field: "firstName",
          extractionPatterns: ["my name is (\\w+)", "i'm (\\w+)", "call me (\\w+)"]
        },
        channelRules: {
          email: { required: true },
          sms: { required: true },
          chat: { required: true }
        }
      }
    ]
  },
  companyInfo: {
    name: "RockBox Fitness Coral Springs",
    industry: "Fitness & Boxing",
    description: "High-intensity boxing and fitness training",
    address: "3360 NW 62nd Ave, Margate FL 33062",
    phone: "+19545550123",
    hours: {
      monday: { open: "05:00", close: "22:00" },
      tuesday: { open: "05:00", close: "22:00" }
    }
  }
}
```

## Access Patterns

### Common Query Patterns

#### 1. Get Conversation History
```typescript
// Query messages for a specific contact
const params = {
  TableName: 'messages',
  KeyConditionExpression: 'contact_pk = :pk',
  ExpressionAttributeValues: {
    ':pk': 'tenant123#john.doe@example.com'
  },
  ScanIndexForward: false, // Most recent first
  Limit: 50
};
```

#### 2. Resolve Phone to Email
```typescript
// Query leads GSI1 to resolve phone number
const params = {
  TableName: 'leads',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
  ExpressionAttributeValues: {
    ':pk': 'tenant123#+1234567890',
    ':sk': 'PHONE_LOOKUP'
  }
};
```

#### 3. Get Active Personas
```typescript
// Query personas GSI1 for active personas
const params = {
  TableName: 'personas',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
  ExpressionAttributeValues: {
    ':pk': 'tenant123',
    ':sk': 'active#'
  }
};
```

#### 4. Recent Messages Across All Contacts
```typescript
// Query messages GSI1 for recent tenant activity
const params = {
  TableName: 'messages',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :pk',
  ExpressionAttributeValues: {
    ':pk': 'tenant123'
  },
  ScanIndexForward: false,
  Limit: 100
};
```

## Data Examples

### Complete Message Item
```json
{
  "contact_pk": "tenant123#john.doe@example.com",
  "ts": "01HKQR5J9X8M2N3P4Q5R6S7T8U",
  "tenantId": "tenant123",
  "email_lc": "john.doe@example.com",
  "source": "chat",
  "direction": "inbound",
  "text": "Hi, I'm interested in learning more about your boxing classes",
  "conversation_id": "conv_abc123",
  "lead_id": "lead_xyz789",
  "channel_context": {
    "chat": {
      "sessionId": "sess_abc123",
      "clientId": "web_client",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "ipAddress": "192.168.1.100"
    }
  },
  "meta": {
    "detectedIntent": {
      "id": "general_inquiry",
      "confidence": 0.75,
      "category": "information_request"
    },
    "sentiment": {
      "score": 0.6,
      "label": "positive",
      "confidence": 0.8
    },
    "processingTimeMs": 850
  },
  "GSI1PK": "tenant123",
  "GSI1SK": "01HKQR5J9X8M2N3P4Q5R6S7T8U",
  "GSI2PK": "lead_xyz789",
  "GSI2SK": "01HKQR5J9X8M2N3P4Q5R6S7T8U",
  "created_at": "2024-01-15T10:30:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z"
}
```

### Complete Lead Item
```json
{
  "contact_pk": "tenant123#john.doe@example.com",
  "sk": "PROFILE",
  "tenantId": "tenant123",
  "email_lc": "john.doe@example.com",
  "contactInfo": {
    "firstName": "John",
    "lastName": "Doe",
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "phone": "+1234567890",
    "company": "Tech Startup Inc",
    "title": "Founder",
    "preferredChannel": "email",
    "timezone": "America/New_York",
    "language": "en"
  },
  "qualification": {
    "score": 75,
    "status": "qualified",
    "source": "website_chat",
    "campaign": "boxing_promo_2024",
    "interestLevel": 0.8,
    "urgencyLevel": 0.6,
    "budget": {
      "range": "$100-200/month",
      "qualified": true
    },
    "decisionMaker": true,
    "timeline": "this_month",
    "notes": [
      "Interested in evening classes",
      "Has previous boxing experience"
    ]
  },
  "preferences": {
    "communication": {
      "preferredTimes": ["18:00-20:00"],
      "frequency": "medium",
      "optOuts": []
    },
    "interests": ["boxing", "fitness", "weight_loss"],
    "interactionHistory": {
      "totalInteractions": 5,
      "lastInteraction": "2024-01-15T10:30:00.000Z",
      "primaryChannel": "chat",
      "engagementScore": 0.85
    }
  },
  "GSI1PK": "tenant123#+1234567890",
  "GSI1SK": "PHONE_LOOKUP",
  "GSI2PK": "tenant123#qualified",
  "GSI2SK": "2024-01-15T09:00:00.000Z",
  "created_at": "2024-01-15T09:00:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z",
  "created_by": "system",
  "updated_by": "agent_carlos"
}
```

## Best Practices

### 1. Data Consistency
- Always use lowercase emails for `email_lc` fields
- Use E.164 format for phone numbers (`+1234567890`)
- Use ISO 8601 format for timestamps
- Use ULIDs for time-ordered unique identifiers

### 2. Query Optimization
- Use GSIs for access patterns that don't match the primary key
- Limit query results to avoid consuming too many RCUs
- Use `ScanIndexForward: false` for most recent items first
- Consider using `ExclusiveStartKey` for pagination

### 3. Data Modeling
- Keep item sizes under 400KB (DynamoDB limit)
- Use sparse GSIs (only items with the GSI attributes will be indexed)
- Consider data access patterns when designing keys
- Use single-table design principles for related data

### 4. Security & Privacy
- Encrypt sensitive data at rest and in transit
- Use IAM policies for fine-grained access control
- Consider data retention policies for compliance
- Implement proper tenant isolation

### 5. Monitoring & Alerting
- Monitor consumed capacity and throttling
- Set up CloudWatch alarms for high error rates
- Track item sizes and growth patterns
- Monitor GSI utilization

This documentation provides the complete foundation for building UX interfaces that interact with the DynamoDB tables. All data structures are fully typed and validated for consistency and reliability.

