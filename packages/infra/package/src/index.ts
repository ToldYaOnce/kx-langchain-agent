// Export types
export * from './types/index.js';
// Export specific types from dynamodb-schemas to avoid conflicts
export type {
  PersonaItem,
  PersonaConfig,
  CreatePersonaItem,
  UpdatePersonaItem,
  QueryPersonasByTenantParams,
  Timestamp,
  ULID,
  TenantId,
  EmailLowercase,
  PhoneE164,
  PersonaStatus,
  ResponseGuidelines,
  IntentTrigger as DynamoIntentTrigger,
  GoalDefinition,
  ActionTagConfig as DynamoActionTagConfig
} from './types/dynamodb-schemas.js';

// Export new models and types (these replace the old ones)
export { CompanyInfo } from './models/company-info.js';
export { Persona } from './models/personas.js';
export type { Intent, IntentCapturing } from './models/company-info.js';
export type { 
  PersonalityConfig, 
  GreetingConfig, 
  ResponseChunking, 
  GoalConfiguration, 
  Goal, 
  ActionTags, 
  PersonaMetadata 
} from './models/personas.js';

// Export new services
export { CompanyInfoService } from './services/company-info-service.js';
export { PersonasService } from './services/personas-service.js';
export { CompanyPersonaService } from './services/company-persona-service.js';
export type { CompanyPersonaResponse } from './services/company-persona-service.js';

// Export services and utilities
export { DynamoDBService } from './lib/dynamodb.js';
export { EventBridgeService } from './lib/eventbridge.js';
export { AgentService } from './lib/agent.js';
export { KxDynamoChatHistory } from './lib/chat-history.js';
export { MemoryChatHistory } from './lib/memory-chat-history.js';
export { ResponseChunker } from './lib/response-chunker.js';
export { GreetingService } from './lib/greeting-service.js';
export { PersonaService } from './lib/persona-service.js';
export { ActionTagProcessor, type ActionTagConfig, type ActionTagMapping, DEFAULT_ACTION_TAGS } from './lib/action-tag-processor.js';
export { IntentService, type IntentMatch, type IntentAnalytics } from './lib/intent-service.js';
export { OperationalService } from './lib/operational-service.js';
export { GoalStateManager } from './lib/goal-state-manager.js';
export { InterestDetector, type InterestAnalysis } from './lib/interest-detector.js';
export { InfoExtractor, type ExtractedInfo } from './lib/info-extractor.js';
export { GoalOrchestrator, type GoalRecommendation, type GoalOrchestrationResult } from './lib/goal-orchestrator.js';
export type { AgentResponse } from './types/index.js';
export type { ConversationGoal, ConversationGoalState } from './types/goals.js';
export { loadRuntimeConfig, validateRuntimeConfig, createTestConfig } from './lib/config.js';

// Export handler factories for consumer Lambda functions
export { 
  createApiGatewayHandler, 
  createEventBridgeHandler, 
  createHealthCheckHandler,
  type ApiGatewayHandlerConfig,
  type EventBridgeHandlerConfig,
  type BaseHandlerConfig,
  type MiddlewareFunction
} from './lib/agent-handler-factory.js';

// Export intent action system for customizable intent handling
export {
  IntentActionRegistry,
  IntentActionHelpers,
  defaultIntentActionRegistry,
  type IntentActionContext,
  type IntentActionResult,
  type IntentActionHandler,
  type IntentActionConfig
} from './lib/intent-action-registry.js';

// Export persona storage for DynamoDB-backed persona management
export {
  PersonaStorage,
  createPersonaStorage,
  type PersonaStorageConfig,
  type PersonaQueryOptions
} from './lib/persona-storage.js';

// Export handler functions (for CDK to reference)
export { handler as AgentRouterHandler } from './handlers/router.js';
export { handler as AgentHandler, structuredHandler as AgentStructuredHandler } from './handlers/agent.js';
export { handler as IndexerHandler } from './handlers/indexer.js';
export { handler as ApiGatewayHandler, healthHandler as ApiGatewayHealthHandler } from './handlers/api-gateway.js';

// Export handler types
export type { AgentInvocationEvent } from './handlers/agent.js';
export type { ResponseChunk } from './lib/response-chunker.js';
