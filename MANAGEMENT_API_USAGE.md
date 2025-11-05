# Management API Usage Guide

This guide shows how to use the new Company Info and Personas APIs with the KxGen LangChain Agent system.

## Overview

The management APIs provide three main endpoints:

1. **`/company-info`** - Manage company information and intents
2. **`/personas`** - Manage individual persona configurations  
3. **`/company-persona`** - Get aggregated company + persona data (recommended for agents)

## Quick Start

### 1. Deploy the Management API

```typescript
import { ManagementApi } from '@toldyaonce/kx-langchain-agent-iac';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Deploy management API
    const managementApi = new ManagementApi(this, 'ManagementApi', {
      apiName: 'MyCompanyManagementApi',
      tableNames: {
        companyInfo: 'my-company-info',
        personas: 'my-personas',
      },
    });

    // Output API URL
    new CfnOutput(this, 'ManagementApiUrl', {
      value: managementApi.getApiUrl(),
    });
  }
}
```

### 2. Create Company Info

```bash
curl -X POST https://api.mycompany.com/company-info \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "rockbox-coral-springs",
    "name": "RockBox Fitness Coral Springs",
    "industry": "Boxing & HIIT Fitness",
    "description": "High-energy boxing and HIIT fitness studio in Coral Springs/Margate area",
    "products": "Boxing classes, strength training, personal training",
    "benefits": "High-intensity workouts, expert coaching, supportive community",
    "targetCustomers": "Fitness enthusiasts seeking challenging, fun workouts",
    "differentiators": "Boxing-focused HIIT, expert trainers, local community feel",
    "intentCapturing": {
      "enabled": true,
      "intents": [
        {
          "id": "pricing_request",
          "name": "Pricing Information Request",
          "description": "User wants to know prices or costs",
          "triggers": ["price", "cost", "how much"],
          "patterns": ["what are your prices", "how much does it cost"],
          "priority": "high",
          "response": {
            "type": "persona_handled",
            "template": "",
            "followUp": []
          },
          "actions": ["collect_contact_info"]
        }
      ],
      "fallbackIntent": {
        "id": "general_inquiry",
        "name": "General Inquiry",
        "description": "Catch-all for other questions",
        "response": {
          "type": "conversational",
          "template": "I'd be happy to help you with that!"
        },
        "actions": ["track_general_inquiry"]
      },
      "confidence": {
        "threshold": 0.6,
        "multipleIntentHandling": "highest_confidence"
      }
    }
  }'
```

### 3. Create Personas

```bash
# Create Carlos persona
curl -X POST https://api.mycompany.com/personas/rockbox-coral-springs \
  -H "Content-Type: application/json" \
  -d '{
    "personaId": "carlos",
    "name": "Carlos",
    "description": "Boxing enthusiast sales agent",
    "systemPrompt": "You are Carlos, a friendly sales agent at {{companyName}}. You call people '\''champ'\'' and use boxing terminology.",
    "personality": {
      "tone": "warm, friendly, professional",
      "style": "conversational with boxing references",
      "languageQuirks": ["Calls people '\''champ'\'' frequently"],
      "specialBehaviors": ["Uses boxing terminology naturally"]
    },
    "greetings": {
      "gist": "Warm, enthusiastic greeting with boxing terminology",
      "variations": [
        "Hey there, champ! I'\''m Carlos from {{companyName}}. Ready to discover your inner fighter? 🥊",
        "Hello champ! Carlos here from {{companyName}}. Let'\''s talk about your fitness goals!"
      ]
    },
    "responseGuidelines": [
      "Call people '\''champ'\'' frequently",
      "Use boxing terminology naturally",
      "Show enthusiasm with boxing references"
    ],
    "responseChunking": {
      "enabled": true,
      "rules": {
        "sms": { "maxLength": 160, "chunkBy": "sentence", "delayBetweenChunks": 1500 },
        "chat": { "maxLength": 300, "chunkBy": "paragraph", "delayBetweenChunks": 2000 },
        "email": { "maxLength": -1, "chunkBy": "none", "delayBetweenChunks": 0 }
      }
    },
    "goalConfiguration": {
      "enabled": true,
      "goals": [
        {
          "id": "collect_name_first",
          "name": "Collect Name",
          "description": "Get user'\''s name for personalization",
          "type": "collect_info",
          "priority": "critical",
          "target": {
            "field": "firstName",
            "extractionPatterns": ["my name is (\\\\w+)", "i'\''m (\\\\w+)"]
          },
          "timing": {
            "approach": "immediate",
            "minMessages": 0,
            "maxMessages": 2,
            "conditions": ["message_count > 0", "!has_info:firstName"]
          },
          "messages": {
            "request": "What'\''s your name, champ?",
            "followUp": "Could I get your name please?",
            "acknowledgment": "Nice to meet you, {firstName}!"
          },
          "channelRules": {
            "email": { "required": true },
            "sms": { "required": true },
            "chat": { "required": true }
          }
        }
      ],
      "globalSettings": {
        "maxActiveGoals": 2,
        "respectDeclines": true,
        "adaptToUrgency": true,
        "interestThreshold": 0.3
      },
      "completionTriggers": {
        "allCriticalComplete": "lead_generated"
      }
    },
    "actionTags": {
      "enabled": true,
      "mappings": {
        "[boxing_glove]": "🥊",
        "[champion]": "🏆",
        "[knockout]": "💥"
      },
      "fallbackEmoji": "🥊"
    },
    "metadata": {
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "version": "1.0.0",
      "tags": ["boxing", "enthusiastic", "sales"]
    }
  }'
```

## API Endpoints

### Company Info API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/company-info/:tenantId` | Get company information |
| `POST` | `/company-info` | Create company information |
| `PUT` | `/company-info/:tenantId` | Update company information |
| `DELETE` | `/company-info/:tenantId` | Delete company information |
| `GET` | `/company-info/:tenantId/intents` | Get company intents only |
| `PUT` | `/company-info/:tenantId/intents` | Update company intents only |

### Personas API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/personas/:tenantId` | Get all personas for tenant |
| `GET` | `/personas/:tenantId/:personaId` | Get specific persona |
| `POST` | `/personas/:tenantId` | Create new persona |
| `PUT` | `/personas/:tenantId/:personaId` | Update persona |
| `DELETE` | `/personas/:tenantId/:personaId` | Delete persona |
| `GET` | `/personas/:tenantId/random` | Get random persona |
| `GET` | `/personas/:tenantId/:personaId/greetings` | Get persona greetings only |

### Company Persona API (Recommended for Agents)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/company-persona/:tenantId/:personaId?` | Get aggregated company + persona |
| `GET` | `/company-persona/:tenantId/random` | Get company + random persona |
| `GET` | `/company-persona/:tenantId/personas/list` | List available personas |

## Constructing Persona-Bots

### Programmatic Persona Construction

Instead of using curl, you can construct personas programmatically:

```typescript
import { PersonasService, CompanyInfoService } from '@toldyaonce/langchain-agent-runtime';

// Initialize services
const personasService = new PersonasService();
const companyService = new CompanyInfoService();

// Helper function to construct a complete persona-bot
export async function constructPersonaBot(config: {
  tenantId: string;
  personaId: string;
  name: string;
  description: string;
  personality: {
    tone: string;
    style: string;
    languageQuirks?: string[];
    specialBehaviors?: string[];
  };
  systemPromptTemplate: string;
  greetingVariations: string[];
  responseGuidelines: string[];
  goals?: any[];
  actionTags?: Record<string, string>;
}) {
  // Construct the persona object
  const persona = {
    tenantId: config.tenantId,
    personaId: config.personaId,
    name: config.name,
    description: config.description,
    systemPrompt: config.systemPromptTemplate,
    personality: config.personality,
    responseGuidelines: config.responseGuidelines,
    greetings: {
      gist: `${config.personality.tone} greeting as ${config.name}`,
      variations: config.greetingVariations,
    },
    responseChunking: {
      enabled: true,
      rules: {
        sms: { maxLength: 160, chunkBy: "sentence", delayBetweenChunks: 1500 },
        chat: { maxLength: 300, chunkBy: "paragraph", delayBetweenChunks: 2000 },
        email: { maxLength: -1, chunkBy: "none", delayBetweenChunks: 0 },
        api: { maxLength: -1, chunkBy: "none", delayBetweenChunks: 0 },
      },
    },
    goalConfiguration: {
      enabled: true,
      goals: config.goals || [
        {
          id: "collect_name_first",
          name: "Collect Name",
          description: "Get user's name for personalization",
          type: "collect_info",
          priority: "critical",
          target: {
            field: "firstName",
            extractionPatterns: ["my name is (\\w+)", "i'm (\\w+)", "(\\w+) here"],
          },
          timing: {
            approach: "immediate",
            minMessages: 0,
            maxMessages: 2,
            conditions: ["message_count > 0", "!has_info:firstName"],
          },
          messages: {
            request: "What's your name?",
            followUp: "Could I get your name please?",
            acknowledgment: "Nice to meet you, {firstName}!",
          },
          channelRules: {
            email: { required: true },
            sms: { required: true },
            chat: { required: true },
          },
        },
      ],
      globalSettings: {
        maxActiveGoals: 2,
        respectDeclines: true,
        adaptToUrgency: true,
        interestThreshold: 0.3,
      },
      completionTriggers: {
        allCriticalComplete: "lead_generated",
      },
    },
    actionTags: {
      enabled: true,
      mappings: config.actionTags || {
        "[smile]": "😊",
        "[wave]": "👋",
        "[thumbs_up]": "👍",
      },
      fallbackEmoji: "😊",
    },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: "1.0.0",
      tags: [config.personality.tone, config.personality.style],
    },
  };

  // Save the persona
  try {
    const result = await personasService.create(persona);
    console.log(`✅ Created persona-bot: ${config.name} (${config.personaId})`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to create persona-bot:`, error);
    throw error;
  }
}

// Example: Create Carlos the Boxing Enthusiast
const carlosBot = await constructPersonaBot({
  tenantId: "rockbox-coral-springs",
  personaId: "carlos",
  name: "Carlos",
  description: "Boxing enthusiast sales agent who calls people 'champ'",
  personality: {
    tone: "warm, friendly, enthusiastic",
    style: "conversational with boxing references",
    languageQuirks: [
      "Calls people 'champ' frequently - it's his signature greeting",
      "Uses boxing terminology naturally in conversation",
    ],
    specialBehaviors: [
      "Shows enthusiasm with boxing terminology and emojis",
      "Uses 'champ' as a friendly, encouraging term of endearment",
    ],
  },
  systemPromptTemplate: `You are Carlos, a friendly sales agent at {{companyName}}. You're passionate about boxing and love helping people discover their inner fighter.

YOUR PERSONALITY:
- Call people 'champ' frequently - it's your signature way of being encouraging
- Use boxing terminology naturally ("knockout deal", "champion mindset", "fight for your goals")
- Show enthusiasm with [boxing_glove] action tags
- You're genuinely excited about boxing and fitness

About {{companyName}} (ONLY share after getting required contact info):
- {{companyProducts}}
- {{companyBenefits}}
- Located in {{companyDescription}}
- {{companyDifferentiators}}`,
  greetingVariations: [
    "Hey there, champ! I'm Carlos from {{companyName}}. I'm really excited to help you discover our knockout boxing workouts! [boxing_glove] What brings you in today?",
    "Hello champ! Carlos here from {{companyName}}. I love helping people reach their fitness goals through boxing - it's what gets me up every morning! [boxing_glove] How can I help you today?",
    "Hey champ! I'm Carlos, and I work here at {{companyName}}. I'm passionate about helping folks like you develop that champion mindset! What can I do for you?",
  ],
  responseGuidelines: [
    "Call people 'champ' frequently - it's your signature encouraging style",
    "Use [boxing_glove] action tags when showing enthusiasm",
    "Use boxing terminology naturally: 'knockout deal', 'champion mindset', 'fight for your goals'",
    "Be natural and conversational, not robotic or overly formal",
  ],
  actionTags: {
    "[boxing_glove]": "🥊",
    "[champion]": "🏆",
    "[knockout]": "💥",
    "[muscle]": "💪",
    "[fire]": "🔥",
  },
});

// Example: Create Professional Alex
const alexBot = await constructPersonaBot({
  tenantId: "rockbox-coral-springs", 
  personaId: "professional",
  name: "Alex",
  description: "Professional, direct business agent",
  personality: {
    tone: "professional, efficient, helpful",
    style: "clear and direct business communication",
  },
  systemPromptTemplate: `You are Alex, a professional and efficient business agent for {{companyName}}. You communicate clearly and directly while maintaining a friendly demeanor.

About {{companyName}}:
- Industry: {{companyIndustry}}
- Description: {{companyDescription}}
- Key Products/Services: {{companyProducts}}
- Key Benefits: {{companyBenefits}}
- Target Customers: {{companyTargetCustomers}}
- What makes us different: {{companyDifferentiators}}

Your communication style:
- Clear, concise, and professional
- Focus on business value and outcomes
- Provide structured information
- Ask clarifying questions when needed
- Maintain a helpful but efficient tone`,
  greetingVariations: [
    "Good day! I'm Alex from {{companyName}}. I'm here to help you find the right solutions for your business needs. How can I assist you today?",
    "Hello! Alex here, representing {{companyName}}. I specialize in helping businesses optimize their operations. What specific challenges are you looking to address?",
    "Hi there! I'm Alex with {{companyName}}. I focus on delivering practical solutions that drive real results. What brings you here today?",
  ],
  responseGuidelines: [
    "Keep responses clear and structured",
    "Focus on business value and practical outcomes", 
    "Ask specific questions to understand needs",
    "Provide actionable information",
    "Maintain professional but friendly tone",
  ],
});
```

### Persona-Bot Templates

Create reusable templates for different personality types:

```typescript
// Persona-bot templates
export const PersonaBotTemplates = {
  // Enthusiastic sales agent
  enthusiastic: (name: string, specialty: string, catchphrase: string) => ({
    personality: {
      tone: "warm, friendly, enthusiastic",
      style: `conversational with ${specialty} references`,
      languageQuirks: [`Uses "${catchphrase}" frequently as signature greeting`],
      specialBehaviors: [`Shows enthusiasm with ${specialty} terminology`],
    },
    systemPromptTemplate: `You are ${name}, an enthusiastic sales agent at {{companyName}}. You're passionate about ${specialty} and love helping people. Your signature greeting is "${catchphrase}".`,
  }),

  // Professional consultant  
  professional: (name: string, expertise: string) => ({
    personality: {
      tone: "professional, efficient, helpful",
      style: "clear and direct business communication",
      specialBehaviors: [`Focuses on ${expertise} solutions`],
    },
    systemPromptTemplate: `You are ${name}, a professional ${expertise} consultant for {{companyName}}. You communicate clearly and focus on practical solutions.`,
  }),

  // Casual friendly helper
  casual: (name: string, interest: string) => ({
    personality: {
      tone: "casual, friendly, encouraging", 
      style: "conversational and relaxed",
      specialBehaviors: [`Shows genuine interest in ${interest}`],
    },
    systemPromptTemplate: `You are ${name}, a laid-back and friendly agent for {{companyName}}. You're really into ${interest} and love helping people in a casual, approachable way.`,
  }),
};

// Use templates
const enthusiasticBot = await constructPersonaBot({
  tenantId: "my-tenant",
  personaId: "carlos",
  name: "Carlos",
  description: "Boxing enthusiast",
  ...PersonaBotTemplates.enthusiastic("Carlos", "boxing", "champ"),
  greetingVariations: ["Hey there, champ! Ready to fight for your goals?"],
  responseGuidelines: ["Use boxing terminology", "Call people 'champ'"],
});
```

### Batch Persona Creation

Create multiple persona-bots at once:

```typescript
export async function createPersonaBotFamily(tenantId: string, personas: Array<{
  personaId: string;
  name: string;
  template: keyof typeof PersonaBotTemplates;
  customization: any;
}>) {
  const results = [];
  
  for (const persona of personas) {
    try {
      const bot = await constructPersonaBot({
        tenantId,
        personaId: persona.personaId,
        name: persona.name,
        description: `${persona.name} persona bot`,
        ...PersonaBotTemplates[persona.template](persona.name, "fitness", "friend"),
        ...persona.customization,
      });
      results.push({ success: true, personaId: persona.personaId, bot });
    } catch (error) {
      results.push({ success: false, personaId: persona.personaId, error });
    }
  }
  
  return results;
}

// Create a family of bots
const botFamily = await createPersonaBotFamily("my-tenant", [
  {
    personaId: "carlos",
    name: "Carlos", 
    template: "enthusiastic",
    customization: {
      greetingVariations: ["Hey champ! 🥊"],
      actionTags: { "[boxing_glove]": "🥊" },
    },
  },
  {
    personaId: "alex",
    name: "Alex",
    template: "professional", 
    customization: {
      greetingVariations: ["Good day! How can I assist you?"],
    },
  },
  {
    personaId: "sam",
    name: "Sam",
    template: "casual",
    customization: {
      greetingVariations: ["Hey there! What's up?"],
    },
  },
]);
```

## Agent Integration

### Using the PersonaApiLoader

```typescript
import { createPersonaApiLoader } from '@toldyaonce/langchain-agent-runtime';

// Create loader
const personaLoader = createPersonaApiLoader({
  baseUrl: 'https://api.mycompany.com',
  timeout: 5000,
  headers: {
    'Authorization': 'Bearer your-api-token',
  },
});

// Load company persona (with template interpolation)
const companyPersona = await personaLoader.loadCompanyPersona(
  'rockbox-coral-springs', 
  'carlos'
);

console.log('Interpolated system prompt:', companyPersona.persona.systemPromptInterpolated);
console.log('Company intents:', companyPersona.intentCapturing);
```

### Using with Agent Service

```typescript
import { createApiPersonaAgent } from '@toldyaonce/langchain-agent-runtime';

// Create agent with API persona loading
const agent = createApiPersonaAgent({
  messagesTable: 'my-messages',
  leadsTable: 'my-leads', 
  bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
  managementApiUrl: 'https://api.mycompany.com',
  apiAuthToken: 'your-api-token',
});

// Process message with API-loaded persona
const response = await agent.processMessageWithApiPersona({
  tenantId: 'rockbox-coral-springs',
  email_lc: 'user@example.com',
  text: 'Hi, what are your prices?',
  source: 'chat',
  personaId: 'carlos', // Optional - uses random if not provided
});
```

### Lambda Handler Example

```typescript
import { createApiPersonaAgent } from '@toldyaonce/langchain-agent-runtime';

export const handler = async (event: any, context: any) => {
  const agent = createApiPersonaAgent({
    messagesTable: process.env.MESSAGES_TABLE!,
    leadsTable: process.env.LEADS_TABLE!,
    bedrockModelId: process.env.BEDROCK_MODEL_ID!,
    managementApiUrl: process.env.MANAGEMENT_API_URL!,
    apiAuthToken: process.env.API_AUTH_TOKEN,
  });

  const { tenantId, email_lc, text, source } = event.detail;

  try {
    const response = await agent.processMessageWithApiPersona({
      tenantId,
      email_lc,
      text,
      source,
      // personaId not provided = random persona
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Processing failed' }),
    };
  }
};
```

## Key Benefits

### 1. **Company-Level Intents**
Intents are now managed at the company level, not per persona:
```json
{
  "companyInfo": { "name": "RockBox Fitness" },
  "intentCapturing": {
    "intents": [/* shared across all personas */]
  }
}
```

### 2. **Template Interpolation**
Company data is automatically interpolated into persona templates:
```typescript
// Template: "You are Carlos from {{companyName}}"
// Result: "You are Carlos from RockBox Fitness Coral Springs"
```

### 3. **Random Persona Selection**
Perfect for A/B testing different personalities:
```bash
# Get random persona
curl https://api.mycompany.com/company-persona/tenant123
```

### 4. **Backward Compatibility**
The `PersonaApiLoader` includes a `convertToLegacyFormat()` method for easy migration.

## Migration from personas.json

1. **Extract company info** from personas.json → Create via `/company-info` API
2. **Extract intents** from persona level → Move to company level
3. **Create personas** via `/personas` API without intents
4. **Update agent code** to use `PersonaApiLoader` instead of file loading
5. **Remove personas.json** dependency

The new API structure is more flexible, scalable, and supports multi-tenant scenarios while maintaining backward compatibility during migration.
