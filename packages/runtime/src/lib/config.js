/**
 * Load runtime configuration from environment variables
 */
export function loadRuntimeConfig() {
    const requiredEnvVars = [
        'MESSAGES_TABLE',
        'LEADS_TABLE',
        'BEDROCK_MODEL_ID',
        'AWS_REGION',
    ];
    // Optional environment variables
    const optionalEnvVars = [
        'PERSONAS_TABLE',
    ];
    // Check for required environment variables
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
    }
    return {
        messagesTable: process.env.MESSAGES_TABLE,
        leadsTable: process.env.LEADS_TABLE,
        personasTable: process.env.PERSONAS_TABLE,
        bedrockModelId: process.env.BEDROCK_MODEL_ID,
        outboundEventBusName: process.env.OUTBOUND_EVENT_BUS_NAME,
        outboundEventBusArn: process.env.OUTBOUND_EVENT_BUS_ARN,
        eventBusPutEventsRoleArn: process.env.EVENT_BUS_PUT_EVENTS_ROLE_ARN,
        ragIndexNamePrefix: process.env.RAG_INDEX_NAME_PREFIX || 'kxgen_',
        historyLimit: parseInt(process.env.HISTORY_LIMIT || '50', 10),
        awsRegion: process.env.AWS_REGION,
        dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT, // for local development
    };
}
/**
 * Validate runtime configuration
 */
export function validateRuntimeConfig(config) {
    if (!config.messagesTable) {
        throw new Error('messagesTable is required');
    }
    if (!config.leadsTable) {
        throw new Error('leadsTable is required');
    }
    if (!config.bedrockModelId) {
        throw new Error('bedrockModelId is required');
    }
    if (!config.awsRegion) {
        throw new Error('awsRegion is required');
    }
    if (config.historyLimit < 1 || config.historyLimit > 1000) {
        throw new Error('historyLimit must be between 1 and 1000');
    }
}
/**
 * Create a test configuration for local development
 */
export function createTestConfig(overrides = {}) {
    return {
        messagesTable: 'test-messages',
        leadsTable: 'test-leads',
        bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        outboundEventBusName: 'test-event-bus',
        ragIndexNamePrefix: 'test_kxgen_',
        historyLimit: 50,
        awsRegion: 'us-east-1',
        dynamodbEndpoint: 'http://localhost:8000',
        ...overrides,
    };
}
//# sourceMappingURL=config.js.map