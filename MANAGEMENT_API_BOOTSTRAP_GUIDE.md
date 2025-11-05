# Management API Bootstrap Guide

This guide shows how to integrate the Management API services with your existing API Gateway using the `@toldyaonce/kx-cdk-lambda-utils` pattern.

## 🏗️ Architecture Overview

The Management API provides three services that can be attached to your existing API Gateway:

- **CompanyInfoService**: Manages company information and intent capturing configuration
- **PersonasService**: Manages persona configurations for different AI personalities  
- **CompanyPersonaService**: Provides combined company + persona data with template interpolation

## 📦 Service Pattern

Each service follows the `@toldyaonce/kx-cdk-lambda-utils` pattern:

```typescript
// Service class with decorators
@ApiBasePath('/company-info')
export class CompanyInfoService extends Service<CompanyInfo> {
  @ApiMethod('GET', '/{tenantId}')
  async get(event: any): Promise<any> {
    // Implementation
  }
}

// Export service + method handlers
module.exports = {
  CompanyInfoService,
  ...getApiMethodHandlers(new CompanyInfoService())
};
```

## 🚀 Bootstrap Steps

### Option 1: Automatic Bootstrap (Recommended)

```typescript
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

// Just 3 lines for complete integration!
const delayedReplies = new DelayedRepliesStack(this, 'DelayedReplies', {
  eventBusName: 'your-event-bus',
  apiGatewayConfig: {
    existingApi: yourExistingApi,  // RestApi from aws-cdk-lib/aws-apigateway
    basePath: '/api'               // Optional prefix (default: '/')
  }
});

// That's it! All endpoints are automatically created with:
// - Proper Lambda integrations
// - CORS preflight support
// - All HTTP methods (GET, POST, PATCH, DELETE)
// - Automatic permissions via LambdaIntegration

## ✨ Benefits of Automatic Bootstrap

- **Reduces boilerplate**: From ~20 lines to 3 lines of configuration
- **Consistent with kx-notifications-and-messaging-cdk pattern**
- **Automatic CORS handling**: All resources get proper CORS preflight
- **LambdaIntegration permissions**: No manual IAM configuration needed
- **Backward compatible**: Manual integration still available
- **Uses `resourceForPath()`**: Avoids conflicts with existing resources

```

### Option 2: Manual Integration

```typescript
import { DelayedRepliesStack } from '@toldyaonce/kx-delayed-replies-infra';

// Deploy without automatic integration
const delayedReplies = new DelayedRepliesStack(this, 'DelayedReplies', {
  eventBusName: 'your-event-bus'
});

// Use helper method for manual attachment
delayedReplies.attachToApiGateway(yourExistingApi, '/api');

// Or get function details for custom integration
const managementFunctions = delayedReplies.getManagementApiFunctions();
```

### 2. Import Services in Your Consumer Code

```typescript
// Import the services directly
import { 
  CompanyInfoService, 
  PersonasService, 
  CompanyPersonaService 
} from '@toldyaonce/kx-langchain-agent-runtime';

// Or import the method handlers for Lambda integration
const { 
  CompanyInfoService,
  handler: companyInfoHandler 
} = require('@toldyaonce/kx-langchain-agent-runtime/services/company-info-service');
```

### 3. Attach to Your API Gateway

```typescript
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';

// Reference your existing API Gateway
const existingApi = apigateway.RestApi.fromRestApiAttributes(this, 'ExistingApi', {
  restApiId: 'your-api-id',
  rootResourceId: 'your-root-resource-id'
});

const managementFunctions = delayedReplies.getManagementApiFunctions();

// Company Info API
const companyInfoResource = existingApi.root.addResource('company-info');
const companyInfoFn = lambda.Function.fromFunctionArn(
  this, 'CompanyInfoFn', managementFunctions.companyInfo.functionArn
);
const companyInfoIntegration = new apigateway.LambdaIntegration(companyInfoFn);

// Add methods
companyInfoResource.addMethod('POST', companyInfoIntegration); // Create
companyInfoResource.addMethod('GET', companyInfoIntegration);  // List

const companyByIdResource = companyInfoResource.addResource('{tenantId}');
companyByIdResource.addMethod('GET', companyInfoIntegration);    // Get
companyByIdResource.addMethod('PUT', companyInfoIntegration);    // Update
companyByIdResource.addMethod('DELETE', companyInfoIntegration); // Delete

// Personas API
const personasResource = existingApi.root.addResource('personas');
const personasFn = lambda.Function.fromFunctionArn(
  this, 'PersonasFn', managementFunctions.personas.functionArn
);
const personasIntegration = new apigateway.LambdaIntegration(personasFn);

const personasByTenantResource = personasResource.addResource('{tenantId}');
personasByTenantResource.addMethod('GET', personasIntegration);  // List personas
personasByTenantResource.addMethod('POST', personasIntegration); // Create persona

const personaByIdResource = personasByTenantResource.addResource('{personaId}');
personaByIdResource.addMethod('GET', personasIntegration);    // Get persona
personaByIdResource.addMethod('PUT', personasIntegration);    // Update persona
personaByIdResource.addMethod('DELETE', personasIntegration); // Delete persona

// Random persona endpoint
const randomPersonaResource = personasByTenantResource.addResource('random');
randomPersonaResource.addMethod('GET', personasIntegration); // Get random persona

// Combined Company + Persona API
const companyPersonaResource = existingApi.root.addResource('company-persona');
const companyPersonaFn = lambda.Function.fromFunctionArn(
  this, 'CompanyPersonaFn', managementFunctions.companyPersona.functionArn
);
const companyPersonaIntegration = new apigateway.LambdaIntegration(companyPersonaFn);

const companyPersonaByTenantResource = companyPersonaResource.addResource('{tenantId}');
companyPersonaByTenantResource.addMethod('GET', companyPersonaIntegration); // Get company + random persona

const companyPersonaByIdResource = companyPersonaByTenantResource.addResource('{personaId}');
companyPersonaByIdResource.addMethod('GET', companyPersonaIntegration); // Get company + specific persona
```

## 🔗 API Endpoints

### Company Info Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/company-info` | Create company info |
| `GET` | `/company-info` | List all companies |
| `GET` | `/company-info/{tenantId}` | Get company info |
| `PUT` | `/company-info/{tenantId}` | Update company info |
| `DELETE` | `/company-info/{tenantId}` | Delete company info |

### Personas Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/personas/{tenantId}` | List personas for tenant |
| `POST` | `/personas/{tenantId}` | Create persona |
| `GET` | `/personas/{tenantId}/{personaId}` | Get specific persona |
| `PUT` | `/personas/{tenantId}/{personaId}` | Update persona |
| `DELETE` | `/personas/{tenantId}/{personaId}` | Delete persona |
| `GET` | `/personas/{tenantId}/random` | Get random persona |

### Company Persona Service

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/company-persona/{tenantId}` | Get company + random persona |
| `GET` | `/company-persona/{tenantId}/{personaId}` | Get company + specific persona |

## 📝 Usage Examples

### Create Company Info

```bash
POST /company-info
{
  "tenantId": "acme-corp",
  "name": "Acme Corporation",
  "industry": "Technology",
  "description": "Leading provider of innovative solutions",
  "website": "https://acme.com",
  "phone": "+1-555-0123",
  "email": "contact@acme.com",
  "address": "123 Tech Street, Silicon Valley, CA 94000",
  "intentCapturing": {
    "enabled": true,
    "intents": ["appointment", "pricing", "support", "demo"],
    "confidence_threshold": 0.8
  }
}
```

### Create Persona

```bash
POST /personas/acme-corp
{
  "personaId": "carlos",
  "name": "Carlos",
  "personality": {
    "traits": ["friendly", "enthusiastic", "boxing-focused"],
    "tone": "casual",
    "style": "energetic",
    "quirks": ["calls people 'champ'", "uses boxing glove emoji 🥊"]
  },
  "greetings": {
    "initial": [
      "Hey there, champ! 🥊 Welcome to {{companyName}}!",
      "What's up, champ! 🥊 How can {{companyName}} help you today?"
    ],
    "returning": [
      "Welcome back, champ! 🥊 Ready for another round with {{companyName}}?"
    ]
  },
  "responseChunking": {
    "enabled": true,
    "maxLength": 500,
    "breakOnSentences": true
  },
  "goalConfiguration": {
    "primary": "assist_customers",
    "secondary": ["collect_contact_info", "schedule_appointments"],
    "fallback": "general_support"
  },
  "actionTags": ["enthusiastic", "boxing", "friendly"]
}
```

### Get Combined Company + Persona

```bash
GET /company-persona/acme-corp/carlos

# Response includes interpolated templates:
{
  "tenantId": "acme-corp",
  "companyInfo": { /* company data */ },
  "persona": { /* raw persona data */ },
  "compiledPersona": {
    "greetings": {
      "initial": [
        "Hey there, champ! 🥊 Welcome to Acme Corporation!",
        "What's up, champ! 🥊 How can Acme Corporation help you today?"
      ]
    }
    // ... other interpolated fields
  }
}
```

## 🔧 Environment Variables

Set these in your Lambda functions:

```bash
COMPANY_INFO_TABLE=your-stack-company-info
PERSONAS_TABLE=your-stack-personas
NODE_OPTIONS=--enable-source-maps
```

## 🛡️ Authentication

The services include CORS headers but **do not include authentication**. Add authentication at the API Gateway level:

```typescript
// Add authorizer to your API Gateway methods
const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
  cognitoUserPools: [userPool]
});

companyInfoResource.addMethod('POST', companyInfoIntegration, {
  authorizer: authorizer,
  authorizationType: apigateway.AuthorizationType.COGNITO
});
```

## 🔄 Service Integration Pattern

The services use the `@toldyaonce/kx-cdk-lambda-utils` pattern which provides:

- **Automatic method routing** based on HTTP method and path
- **Decorator-driven API definition** with `@ApiBasePath` and `@ApiMethod`
- **Built-in CORS handling** for web applications
- **Consistent error responses** with proper HTTP status codes
- **DynamoDB integration** through the base `Service` class

This pattern allows you to:

1. **Import services directly** for programmatic use
2. **Deploy as Lambda functions** using the exported handlers
3. **Attach to any API Gateway** with proper method routing
4. **Extend functionality** by subclassing the services

## 🎯 Next Steps

1. Deploy the `DelayedRepliesStack` to get the Lambda functions
2. Attach the functions to your existing API Gateway
3. Configure authentication and authorization as needed
4. Test the endpoints with your company and persona data
5. Update your agent to use the new `PersonaApiLoader` to fetch data from these APIs

The Management API is now ready to manage your company and persona configurations dynamically! 🚀
