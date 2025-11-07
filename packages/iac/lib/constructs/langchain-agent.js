"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LangchainAgent = void 0;
const constructs_1 = require("constructs");
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const nodejs = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const aws_cdk_lib_1 = require("aws-cdk-lib");
const path = __importStar(require("path"));
const dynamodb_tables_js_1 = require("./dynamodb-tables.js");
/**
 * LangChain Agent construct that creates Lambda functions and EventBridge rules
 */
class LangchainAgent extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Resolve EventBridge bus
        const eventBus = typeof props.eventBus === 'string'
            ? events.EventBus.fromEventBusArn(this, 'EventBus', props.eventBus)
            : props.eventBus;
        // Create or use existing DynamoDB tables
        let messagesTableName;
        let leadsTableName;
        let personasTableName;
        if (props.existingTables) {
            // Use existing tables
            messagesTableName = props.existingTables.messagesTableName;
            leadsTableName = props.existingTables.leadsTableName;
            personasTableName = props.existingTables.personasTableName || 'kxgen-personas';
        }
        else {
            // Create new tables
            this.dynamoDBTables = new dynamodb_tables_js_1.DynamoDBTables(this, 'Tables', props.dynamoDBTablesProps);
            const tableNames = this.dynamoDBTables.getTableNames();
            messagesTableName = tableNames.messages;
            leadsTableName = tableNames.leads;
            personasTableName = tableNames.personas;
        }
        // Common environment variables
        const commonEnv = {
            MESSAGES_TABLE: messagesTableName,
            LEADS_TABLE: leadsTableName,
            PERSONAS_TABLE: personasTableName,
            BEDROCK_MODEL_ID: props.bedrockModelId,
            OUTBOUND_EVENT_BUS_NAME: eventBus.eventBusName,
            OUTBOUND_EVENT_BUS_ARN: eventBus.eventBusArn,
            RAG_INDEX_NAME_PREFIX: props.ragIndexNamePrefix || 'kxgen_',
            HISTORY_LIMIT: (props.historyLimit || 50).toString(),
            ...(props.putEventsRoleArn && { EVENT_BUS_PUT_EVENTS_ROLE_ARN: props.putEventsRoleArn }),
        };
        // Common Lambda configuration
        const commonLambdaProps = {
            runtime: lambda.Runtime.NODEJS_20_X,
            timeout: aws_cdk_lib_1.Duration.minutes(5),
            memorySize: 512,
            environment: commonEnv,
            logRetention: logs.RetentionDays.ONE_WEEK,
            bundling: {
                format: nodejs.OutputFormat.ESM,
                target: 'es2022',
                platform: 'node',
                mainFields: ['module', 'main'],
                conditions: ['import', 'module'],
                banner: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
                externalModules: [
                    '@aws-sdk/client-dynamodb',
                    '@aws-sdk/lib-dynamodb',
                    '@aws-sdk/client-eventbridge',
                ],
            },
        };
        // Find the runtime package path
        const runtimePackagePath = this.findRuntimePackagePath();
        // Agent Router Function
        this.agentRouterFunction = new nodejs.NodejsFunction(this, 'AgentRouterFunction', {
            ...commonLambdaProps,
            functionName: `${id}-agent-router`,
            description: 'Routes inbound messages and invokes agent processing',
            entry: path.join(runtimePackagePath, 'src/handlers/router.ts'),
            handler: 'handler',
        });
        // Agent Function
        this.agentFunction = new nodejs.NodejsFunction(this, 'AgentFunction', {
            ...commonLambdaProps,
            functionName: `${id}-agent`,
            description: 'Processes messages with LangChain and generates responses',
            entry: path.join(runtimePackagePath, 'src/handlers/agent.ts'),
            handler: 'handler',
            timeout: aws_cdk_lib_1.Duration.minutes(10), // Longer timeout for LLM processing
            memorySize: 1024, // More memory for LangChain
        });
        // Optional Indexer Function for RAG
        if (props.opensearchCollectionArn) {
            this.indexerFunction = new nodejs.NodejsFunction(this, 'IndexerFunction', {
                ...commonLambdaProps,
                functionName: `${id}-indexer`,
                description: 'Indexes documents for RAG retrieval',
                entry: path.join(runtimePackagePath, 'src/handlers/indexer.ts'),
                handler: 'handler',
                environment: {
                    ...commonEnv,
                    OPENSEARCH_COLLECTION_ARN: props.opensearchCollectionArn,
                },
            });
        }
        // IAM permissions
        // Get table ARNs for IAM permissions
        const tableArns = this.dynamoDBTables
            ? this.dynamoDBTables.getTableArns()
            : [
                `arn:aws:dynamodb:*:*:table/${messagesTableName}`,
                `arn:aws:dynamodb:*:*:table/${messagesTableName}/index/*`,
                `arn:aws:dynamodb:*:*:table/${leadsTableName}`,
                `arn:aws:dynamodb:*:*:table/${leadsTableName}/index/*`,
                `arn:aws:dynamodb:*:*:table/${personasTableName}`,
                `arn:aws:dynamodb:*:*:table/${personasTableName}/index/*`,
            ];
        this.setupIamPermissions(props, eventBus, tableArns);
        // EventBridge rules
        this.setupEventBridgeRules(eventBus);
    }
    /**
     * Find the runtime package path relative to this construct
     */
    findRuntimePackagePath() {
        // Use require.resolve to find the runtime package location
        try {
            const runtimePath = require.resolve('@toldyaonce/kx-langchain-agent-runtime');
            return path.dirname(runtimePath);
        }
        catch (error) {
            // Fallback to relative path for development
            return path.resolve(__dirname, '../../../runtime');
        }
    }
    /**
     * Setup IAM permissions for Lambda functions
     */
    setupIamPermissions(props, eventBus, tableArns) {
        // DynamoDB permissions
        const dynamoPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:Query',
                'dynamodb:UpdateItem',
                'dynamodb:BatchGetItem',
                'dynamodb:BatchWriteItem',
            ],
            resources: tableArns,
        });
        // Bedrock permissions
        const bedrockPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
            ],
            resources: [
                `arn:aws:bedrock:*::foundation-model/${props.bedrockModelId}`,
                'arn:aws:bedrock:*::foundation-model/amazon.titan-embed-text-v1',
            ],
        });
        // EventBridge permissions
        const eventBridgePolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['events:PutEvents'],
            resources: [eventBus.eventBusArn],
        });
        // Apply permissions to functions
        [this.agentRouterFunction, this.agentFunction].forEach(fn => {
            fn.addToRolePolicy(dynamoPolicy);
            fn.addToRolePolicy(bedrockPolicy);
            fn.addToRolePolicy(eventBridgePolicy);
        });
        // OpenSearch permissions for indexer
        if (this.indexerFunction && props.opensearchCollectionArn) {
            const opensearchPolicy = new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                    'aoss:APIAccessAll',
                    'aoss:DashboardsAccessAll',
                ],
                resources: [props.opensearchCollectionArn],
            });
            this.indexerFunction.addToRolePolicy(opensearchPolicy);
            this.indexerFunction.addToRolePolicy(dynamoPolicy);
            this.indexerFunction.addToRolePolicy(eventBridgePolicy);
        }
        // Lambda invoke permissions (for router to invoke agent)
        this.agentFunction.grantInvoke(this.agentRouterFunction);
    }
    /**
     * Setup EventBridge rules to trigger Lambda functions
     */
    setupEventBridgeRules(eventBus) {
        // Rule for inbound messages
        new events.Rule(this, 'InboundMessageRule', {
            eventBus,
            description: 'Route inbound lead messages to agent router',
            eventPattern: {
                source: ['kxgen.messaging'],
                detailType: ['lead.message.created'],
            },
            targets: [new targets.LambdaFunction(this.agentRouterFunction)],
        });
    }
}
exports.LangchainAgent = LangchainAgent;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ2NoYWluLWFnZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2NvbnN0cnVjdHMvbGFuZ2NoYWluLWFnZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUF1QztBQUN2QywrREFBaUQ7QUFDakQsd0VBQTBEO0FBQzFELCtEQUFpRDtBQUNqRCxzRUFBd0Q7QUFDeEQseURBQTJDO0FBQzNDLDJEQUE2QztBQUM3Qyw2Q0FBdUM7QUFDdkMsMkNBQTZCO0FBQzdCLDZEQUFnRjtBQWtEaEY7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxzQkFBUztJQU0zQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsMEJBQTBCO1FBQzFCLE1BQU0sUUFBUSxHQUFHLE9BQU8sS0FBSyxDQUFDLFFBQVEsS0FBSyxRQUFRO1lBQ2pELENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUM7WUFDbkUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUM7UUFFbkIseUNBQXlDO1FBQ3pDLElBQUksaUJBQXlCLENBQUM7UUFDOUIsSUFBSSxjQUFzQixDQUFDO1FBQzNCLElBQUksaUJBQXlCLENBQUM7UUFFOUIsSUFBSSxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDekIsc0JBQXNCO1lBQ3RCLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsaUJBQWlCLENBQUM7WUFDM0QsY0FBYyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDO1lBQ3JELGlCQUFpQixHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsaUJBQWlCLElBQUksZ0JBQWdCLENBQUM7UUFDakYsQ0FB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b0JBQW9CLEVBQUU7WUFDMUMsUUFBUTtZQUNSLFdBQVcsRUFBRSw2Q0FBNkM7WUFDMUQsWUFBWSxFQUFFO2dCQUNaLE1BQU0sRUFBRSxDQUFDLGlCQUFpQixDQUFDO2dCQUMzQixVQUFVLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQzthQUNyQztZQUNELE9BQU8sRUFBRSxDQUFDLElBQUksT0FBTyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQztTQUNoRSxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUEzTkQsd0NBMk5DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBub2RlanMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgeyBEdXJhdGlvbiB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBEeW5hbW9EQlRhYmxlcywgdHlwZSBEeW5hbW9EQlRhYmxlc1Byb3BzIH0gZnJvbSAnLi9keW5hbW9kYi10YWJsZXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIExhbmdjaGFpbkFnZW50UHJvcHMge1xuICAvKipcbiAgICogSW5qZWN0ZWQgRXZlbnRCcmlkZ2UgYnVzIChJRXZlbnRCdXMgb3IgQVJOIHN0cmluZylcbiAgICovXG4gIGV2ZW50QnVzOiBldmVudHMuSUV2ZW50QnVzIHwgc3RyaW5nO1xuICBcbiAgLyoqXG4gICAqIEJlZHJvY2sgbW9kZWwgSUQgKGUuZy4sIENsYXVkZSBTb25uZXQpXG4gICAqL1xuICBiZWRyb2NrTW9kZWxJZDogc3RyaW5nO1xuICBcbiAgLyoqXG4gICAqIE9wdGlvbmFsIE9wZW5TZWFyY2ggU2VydmVybGVzcyBjb2xsZWN0aW9uIEFSTiBmb3IgUkFHXG4gICAqL1xuICBvcGVuc2VhcmNoQ29sbGVjdGlvbkFybj86IHN0cmluZztcbiAgXG4gIC8qKlxuICAgKiBPcHRpb25hbCBjcm9zcy1hY2NvdW50IHJvbGUgQVJOIGZvciBFdmVudEJyaWRnZSBQdXRFdmVudHNcbiAgICovXG4gIHB1dEV2ZW50c1JvbGVBcm4/OiBzdHJpbmc7XG4gIFxuICAvKipcbiAgICogT3B0aW9uYWwgcHJlZml4IGZvciBSQUcgaW5kZXggbmFtZXMgKGRlZmF1bHQ6IFwia3hnZW5fXCIpXG4gICAqL1xuICByYWdJbmRleE5hbWVQcmVmaXg/OiBzdHJpbmc7XG4gIFxuICAvKipcbiAgICogT3B0aW9uYWwgaGlzdG9yeSBsaW1pdCBmb3IgY2hhdCBtZW1vcnkgKGRlZmF1bHQ6IDUwKVxuICAgKi9cbiAgaGlzdG9yeUxpbWl0PzogbnVtYmVyO1xuXG4gIC8qKlxuICAgKiBEeW5hbW9EQiB0YWJsZXMgY29uZmlndXJhdGlvblxuICAgKiBJZiBub3QgcHJvdmlkZWQsIHRhYmxlcyB3aWxsIGJlIGNyZWF0ZWQgd2l0aCBkZWZhdWx0IHNldHRpbmdzXG4gICAqL1xuICBkeW5hbW9EQlRhYmxlc1Byb3BzPzogRHluYW1vREJUYWJsZXNQcm9wcztcblxuICAvKipcbiAgICogRXhpc3RpbmcgRHluYW1vREIgdGFibGVzIChhbHRlcm5hdGl2ZSB0byBjcmVhdGluZyBuZXcgb25lcylcbiAgICogSWYgcHJvdmlkZWQsIGR5bmFtb0RCVGFibGVzUHJvcHMgd2lsbCBiZSBpZ25vcmVkXG4gICAqL1xuICBleGlzdGluZ1RhYmxlcz86IHtcbiAgICBtZXNzYWdlc1RhYmxlTmFtZTogc3RyaW5nO1xuICAgIGxlYWRzVGFibGVOYW1lOiBzdHJpbmc7XG4gICAgcGVyc29uYXNUYWJsZU5hbWU/OiBzdHJpbmc7XG4gIH07XG59XG5cbi8qKlxuICogTGFuZ0NoYWluIEFnZW50IGNvbnN0cnVjdCB0aGF0IGNyZWF0ZXMgTGFtYmRhIGZ1bmN0aW9ucyBhbmQgRXZlbnRCcmlkZ2UgcnVsZXNcbiAqL1xuZXhwb3J0IGNsYXNzIExhbmdjaGFpbkFnZW50IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGFnZW50Um91dGVyRnVuY3Rpb246IG5vZGVqcy5Ob2RlanNGdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGFnZW50RnVuY3Rpb246IG5vZGVqcy5Ob2RlanNGdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGluZGV4ZXJGdW5jdGlvbj86IG5vZGVqcy5Ob2RlanNGdW5jdGlvbjtcbiAgcHVibGljIHJlYWRvbmx5IGR5bmFtb0RCVGFibGVzPzogRHluYW1vREJUYWJsZXM7XG4gIFxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTGFuZ2NoYWluQWdlbnRQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG4gICAgXG4gICAgLy8gUmVzb2x2ZSBFdmVudEJyaWRnZSBidXNcbiAgICBjb25zdCBldmVudEJ1cyA9IHR5cGVvZiBwcm9wcy5ldmVudEJ1cyA9PT0gJ3N0cmluZycgXG4gICAgICA/IGV2ZW50cy5FdmVudEJ1cy5mcm9tRXZlbnRCdXNBcm4odGhpcywgJ0V2ZW50QnVzJywgcHJvcHMuZXZlbnRCdXMpXG4gICAgICA6IHByb3BzLmV2ZW50QnVzO1xuXG4gICAgLy8gQ3JlYXRlIG9yIHVzZSBleGlzdGluZyBEeW5hbW9EQiB0YWJsZXNcbiAgICBsZXQgbWVzc2FnZXNUYWJsZU5hbWU6IHN0cmluZztcbiAgICBsZXQgbGVhZHNUYWJsZU5hbWU6IHN0cmluZztcbiAgICBsZXQgcGVyc29uYXNUYWJsZU5hbWU6IHN0cmluZztcblxuICAgIGlmIChwcm9wcy5leGlzdGluZ1RhYmxlcykge1xuICAgICAgLy8gVXNlIGV4aXN0aW5nIHRhYmxlc1xuICAgICAgbWVzc2FnZXNUYWJsZU5hbWUgPSBwcm9wcy5leGlzdGluZ1RhYmxlcy5tZXNzYWdlc1RhYmxlTmFtZTtcbiAgICAgIGxlYWRzVGFibGVOYW1lID0gcHJvcHMuZXhpc3RpbmdUYWJsZXMubGVhZHNUYWJsZU5hbWU7XG4gICAgICBwZXJzb25hc1RhYmxlTmFtZSA9IHByb3BzLmV4aXN0aW5nVGFibGVzLnBlcnNvbmFzVGFibGVOYW1lIHx8ICdreGdlbi1wZXJzb25hcyc7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIENyZWF0ZSBuZXcgdGFibGVzXG4gICAgICB0aGlzLmR5bmFtb0RCVGFibGVzID0gbmV3IER5bmFtb0RCVGFibGVzKHRoaXMsICdUYWJsZXMnLCBwcm9wcy5keW5hbW9EQlRhYmxlc1Byb3BzKTtcbiAgICAgIGNvbnN0IHRhYmxlTmFtZXMgPSB0aGlzLmR5bmFtb0RCVGFibGVzLmdldFRhYmxlTmFtZXMoKTtcbiAgICAgIG1lc3NhZ2VzVGFibGVOYW1lID0gdGFibGVOYW1lcy5tZXNzYWdlcztcbiAgICAgIGxlYWRzVGFibGVOYW1lID0gdGFibGVOYW1lcy5sZWFkcztcbiAgICAgIHBlcnNvbmFzVGFibGVOYW1lID0gdGFibGVOYW1lcy5wZXJzb25hcztcbiAgICB9XG4gICAgXG4gICAgLy8gQ29tbW9uIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIGNvbnN0IGNvbW1vbkVudiA9IHtcbiAgICAgIE1FU1NBR0VTX1RBQkxFOiBtZXNzYWdlc1RhYmxlTmFtZSxcbiAgICAgIExFQURTX1RBQkxFOiBsZWFkc1RhYmxlTmFtZSxcbiAgICAgIFBFUlNPTkFTX1RBQkxFOiBwZXJzb25hc1RhYmxlTmFtZSxcbiAgICAgIEJFRFJPQ0tfTU9ERUxfSUQ6IHByb3BzLmJlZHJvY2tNb2RlbElkLFxuICAgICAgT1VUQk9VTkRfRVZFTlRfQlVTX05BTUU6IGV2ZW50QnVzLmV2ZW50QnVzTmFtZSxcbiAgICAgIE9VVEJPVU5EX0VWRU5UX0JVU19BUk46IGV2ZW50QnVzLmV2ZW50QnVzQXJuLFxuICAgICAgUkFHX0lOREVYX05BTUVfUFJFRklYOiBwcm9wcy5yYWdJbmRleE5hbWVQcmVmaXggfHwgJ2t4Z2VuXycsXG4gICAgICBISVNUT1JZX0xJTUlUOiAocHJvcHMuaGlzdG9yeUxpbWl0IHx8IDUwKS50b1N0cmluZygpLFxuICAgICAgLi4uKHByb3BzLnB1dEV2ZW50c1JvbGVBcm4gJiYgeyBFVkVOVF9CVVNfUFVUX0VWRU5UU19ST0xFX0FSTjogcHJvcHMucHV0RXZlbnRzUm9sZUFybiB9KSxcbiAgICB9O1xuICAgIFxuICAgIC8vIENvbW1vbiBMYW1iZGEgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGNvbW1vbkxhbWJkYVByb3BzID0ge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZm9ybWF0OiBub2RlanMuT3V0cHV0Rm9ybWF0LkVTTSxcbiAgICAgICAgdGFyZ2V0OiAnZXMyMDIyJyxcbiAgICAgICAgcGxhdGZvcm06ICdub2RlJyxcbiAgICAgICAgbWFpbkZpZWxkczogWydtb2R1bGUnLCAnbWFpbiddLFxuICAgICAgICBjb25kaXRpb25zOiBbJ2ltcG9ydCcsICdtb2R1bGUnXSxcbiAgICAgICAgYmFubmVyOiAnaW1wb3J0IHsgY3JlYXRlUmVxdWlyZSB9IGZyb20gXCJtb2R1bGVcIjsgY29uc3QgcmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTsnLFxuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFtcbiAgICAgICAgICAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJyxcbiAgICAgICAgICAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJyxcbiAgICAgICAgICAnQGF3cy1zZGsvY2xpZW50LWV2ZW50YnJpZGdlJyxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBcbiAgICAvLyBGaW5kIHRoZSBydW50aW1lIHBhY2thZ2UgcGF0aFxuICAgIGNvbnN0IHJ1bnRpbWVQYWNrYWdlUGF0aCA9IHRoaXMuZmluZFJ1bnRpbWVQYWNrYWdlUGF0aCgpO1xuICAgIFxuICAgIC8vIEFnZW50IFJvdXRlciBGdW5jdGlvblxuICAgIHRoaXMuYWdlbnRSb3V0ZXJGdW5jdGlvbiA9IG5ldyBub2RlanMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0FnZW50Um91dGVyRnVuY3Rpb24nLCB7XG4gICAgICAuLi5jb21tb25MYW1iZGFQcm9wcyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogYCR7aWR9LWFnZW50LXJvdXRlcmAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1JvdXRlcyBpbmJvdW5kIG1lc3NhZ2VzIGFuZCBpbnZva2VzIGFnZW50IHByb2Nlc3NpbmcnLFxuICAgICAgZW50cnk6IHBhdGguam9pbihydW50aW1lUGFja2FnZVBhdGgsICdzcmMvaGFuZGxlcnMvcm91dGVyLnRzJyksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgfSk7XG4gICAgXG4gICAgLy8gQWdlbnQgRnVuY3Rpb25cbiAgICB0aGlzLmFnZW50RnVuY3Rpb24gPSBuZXcgbm9kZWpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdBZ2VudEZ1bmN0aW9uJywge1xuICAgICAgLi4uY29tbW9uTGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGAke2lkfS1hZ2VudGAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2Nlc3NlcyBtZXNzYWdlcyB3aXRoIExhbmdDaGFpbiBhbmQgZ2VuZXJhdGVzIHJlc3BvbnNlcycsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKHJ1bnRpbWVQYWNrYWdlUGF0aCwgJ3NyYy9oYW5kbGVycy9hZ2VudC50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgdGltZW91dDogRHVyYXRpb24ubWludXRlcygxMCksIC8vIExvbmdlciB0aW1lb3V0IGZvciBMTE0gcHJvY2Vzc2luZ1xuICAgICAgbWVtb3J5U2l6ZTogMTAyNCwgLy8gTW9yZSBtZW1vcnkgZm9yIExhbmdDaGFpblxuICAgIH0pO1xuICAgIFxuICAgIC8vIE9wdGlvbmFsIEluZGV4ZXIgRnVuY3Rpb24gZm9yIFJBR1xuICAgIGlmIChwcm9wcy5vcGVuc2VhcmNoQ29sbGVjdGlvbkFybikge1xuICAgICAgdGhpcy5pbmRleGVyRnVuY3Rpb24gPSBuZXcgbm9kZWpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdJbmRleGVyRnVuY3Rpb24nLCB7XG4gICAgICAgIC4uLmNvbW1vbkxhbWJkYVByb3BzLFxuICAgICAgICBmdW5jdGlvbk5hbWU6IGAke2lkfS1pbmRleGVyYCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdJbmRleGVzIGRvY3VtZW50cyBmb3IgUkFHIHJldHJpZXZhbCcsXG4gICAgICAgIGVudHJ5OiBwYXRoLmpvaW4ocnVudGltZVBhY2thZ2VQYXRoLCAnc3JjL2hhbmRsZXJzL2luZGV4ZXIudHMnKSxcbiAgICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIC4uLmNvbW1vbkVudixcbiAgICAgICAgICBPUEVOU0VBUkNIX0NPTExFQ1RJT05fQVJOOiBwcm9wcy5vcGVuc2VhcmNoQ29sbGVjdGlvbkFybixcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICAvLyBJQU0gcGVybWlzc2lvbnNcbiAgICAvLyBHZXQgdGFibGUgQVJOcyBmb3IgSUFNIHBlcm1pc3Npb25zXG4gICAgY29uc3QgdGFibGVBcm5zID0gdGhpcy5keW5hbW9EQlRhYmxlcyBcbiAgICAgID8gdGhpcy5keW5hbW9EQlRhYmxlcy5nZXRUYWJsZUFybnMoKVxuICAgICAgOiBbXG4gICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6KjoqOnRhYmxlLyR7bWVzc2FnZXNUYWJsZU5hbWV9YCxcbiAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoqOio6dGFibGUvJHttZXNzYWdlc1RhYmxlTmFtZX0vaW5kZXgvKmAsXG4gICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6KjoqOnRhYmxlLyR7bGVhZHNUYWJsZU5hbWV9YCxcbiAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoqOio6dGFibGUvJHtsZWFkc1RhYmxlTmFtZX0vaW5kZXgvKmAsXG4gICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6KjoqOnRhYmxlLyR7cGVyc29uYXNUYWJsZU5hbWV9YCxcbiAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoqOio6dGFibGUvJHtwZXJzb25hc1RhYmxlTmFtZX0vaW5kZXgvKmAsXG4gICAgICAgIF07XG5cbiAgICB0aGlzLnNldHVwSWFtUGVybWlzc2lvbnMocHJvcHMsIGV2ZW50QnVzLCB0YWJsZUFybnMpO1xuICAgIFxuICAgIC8vIEV2ZW50QnJpZGdlIHJ1bGVzXG4gICAgdGhpcy5zZXR1cEV2ZW50QnJpZGdlUnVsZXMoZXZlbnRCdXMpO1xuICB9XG4gIFxuICAvKipcbiAgICogRmluZCB0aGUgcnVudGltZSBwYWNrYWdlIHBhdGggcmVsYXRpdmUgdG8gdGhpcyBjb25zdHJ1Y3RcbiAgICovXG4gIHByaXZhdGUgZmluZFJ1bnRpbWVQYWNrYWdlUGF0aCgpOiBzdHJpbmcge1xuICAgIC8vIFVzZSByZXF1aXJlLnJlc29sdmUgdG8gZmluZCB0aGUgcnVudGltZSBwYWNrYWdlIGxvY2F0aW9uXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJ1bnRpbWVQYXRoID0gcmVxdWlyZS5yZXNvbHZlKCdAdG9sZHlhb25jZS9reC1sYW5nY2hhaW4tYWdlbnQtcnVudGltZScpO1xuICAgICAgcmV0dXJuIHBhdGguZGlybmFtZShydW50aW1lUGF0aCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIC8vIEZhbGxiYWNrIHRvIHJlbGF0aXZlIHBhdGggZm9yIGRldmVsb3BtZW50XG4gICAgICByZXR1cm4gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uLy4uL3J1bnRpbWUnKTtcbiAgICB9XG4gIH1cbiAgXG4gIC8qKlxuICAgKiBTZXR1cCBJQU0gcGVybWlzc2lvbnMgZm9yIExhbWJkYSBmdW5jdGlvbnNcbiAgICovXG4gIHByaXZhdGUgc2V0dXBJYW1QZXJtaXNzaW9ucyhwcm9wczogTGFuZ2NoYWluQWdlbnRQcm9wcywgZXZlbnRCdXM6IGV2ZW50cy5JRXZlbnRCdXMsIHRhYmxlQXJuczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IGR5bmFtb1BvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOkJhdGNoR2V0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpCYXRjaFdyaXRlSXRlbScsXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiB0YWJsZUFybnMsXG4gICAgfSk7XG4gICAgXG4gICAgLy8gQmVkcm9jayBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IGJlZHJvY2tQb2xpY3kgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsJyxcbiAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWxXaXRoUmVzcG9uc2VTdHJlYW0nLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpiZWRyb2NrOio6OmZvdW5kYXRpb24tbW9kZWwvJHtwcm9wcy5iZWRyb2NrTW9kZWxJZH1gLFxuICAgICAgICAnYXJuOmF3czpiZWRyb2NrOio6OmZvdW5kYXRpb24tbW9kZWwvYW1hem9uLnRpdGFuLWVtYmVkLXRleHQtdjEnLFxuICAgICAgXSxcbiAgICB9KTtcbiAgICBcbiAgICAvLyBFdmVudEJyaWRnZSBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IGV2ZW50QnJpZGdlUG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydldmVudHM6UHV0RXZlbnRzJ10sXG4gICAgICByZXNvdXJjZXM6IFtldmVudEJ1cy5ldmVudEJ1c0Fybl0sXG4gICAgfSk7XG4gICAgXG4gICAgLy8gQXBwbHkgcGVybWlzc2lvbnMgdG8gZnVuY3Rpb25zXG4gICAgW3RoaXMuYWdlbnRSb3V0ZXJGdW5jdGlvbiwgdGhpcy5hZ2VudEZ1bmN0aW9uXS5mb3JFYWNoKGZuID0+IHtcbiAgICAgIGZuLmFkZFRvUm9sZVBvbGljeShkeW5hbW9Qb2xpY3kpO1xuICAgICAgZm4uYWRkVG9Sb2xlUG9saWN5KGJlZHJvY2tQb2xpY3kpO1xuICAgICAgZm4uYWRkVG9Sb2xlUG9saWN5KGV2ZW50QnJpZGdlUG9saWN5KTtcbiAgICB9KTtcbiAgICBcbiAgICAvLyBPcGVuU2VhcmNoIHBlcm1pc3Npb25zIGZvciBpbmRleGVyXG4gICAgaWYgKHRoaXMuaW5kZXhlckZ1bmN0aW9uICYmIHByb3BzLm9wZW5zZWFyY2hDb2xsZWN0aW9uQXJuKSB7XG4gICAgICBjb25zdCBvcGVuc2VhcmNoUG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnYW9zczpBUElBY2Nlc3NBbGwnLFxuICAgICAgICAgICdhb3NzOkRhc2hib2FyZHNBY2Nlc3NBbGwnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5vcGVuc2VhcmNoQ29sbGVjdGlvbkFybl0sXG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgdGhpcy5pbmRleGVyRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG9wZW5zZWFyY2hQb2xpY3kpO1xuICAgICAgdGhpcy5pbmRleGVyRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KGR5bmFtb1BvbGljeSk7XG4gICAgICB0aGlzLmluZGV4ZXJGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koZXZlbnRCcmlkZ2VQb2xpY3kpO1xuICAgIH1cbiAgICBcbiAgICAvLyBMYW1iZGEgaW52b2tlIHBlcm1pc3Npb25zIChmb3Igcm91dGVyIHRvIGludm9rZSBhZ2VudClcbiAgICB0aGlzLmFnZW50RnVuY3Rpb24uZ3JhbnRJbnZva2UodGhpcy5hZ2VudFJvdXRlckZ1bmN0aW9uKTtcbiAgfVxuICBcbiAgLyoqXG4gICAqIFNldHVwIEV2ZW50QnJpZGdlIHJ1bGVzIHRvIHRyaWdnZXIgTGFtYmRhIGZ1bmN0aW9uc1xuICAgKi9cbiAgcHJpdmF0ZSBzZXR1cEV2ZW50QnJpZGdlUnVsZXMoZXZlbnRCdXM6IGV2ZW50cy5JRXZlbnRCdXMpOiB2b2lkIHtcbiAgICAvLyBSdWxlIGZvciBpbmJvdW5kIG1lc3NhZ2VzXG4gICAgbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdJbmJvdW5kTWVzc2FnZVJ1bGUnLCB7XG4gICAgICBldmVudEJ1cyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm91dGUgaW5ib3VuZCBsZWFkIG1lc3NhZ2VzIHRvIGFnZW50IHJvdXRlcicsXG4gICAgICBldmVudFBhdHRlcm46IHtcbiAgICAgICAgc291cmNlOiBbJ2t4Z2VuLm1lc3NhZ2luZyddLFxuICAgICAgICBkZXRhaWxUeXBlOiBbJ2xlYWQubWVzc2FnZS5jcmVhdGVkJ10sXG4gICAgICB9LFxuICAgICAgdGFyZ2V0czogW25ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKHRoaXMuYWdlbnRSb3V0ZXJGdW5jdGlvbildLFxuICAgIH0pO1xuICB9XG59XG4iXX0=