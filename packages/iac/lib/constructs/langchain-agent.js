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
        // This assumes the IaC package is in packages/iac and runtime is in packages/runtime
        // Adjust the path based on your actual monorepo structure
        return path.resolve(__dirname, '../../../runtime');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ2NoYWluLWFnZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2NvbnN0cnVjdHMvbGFuZ2NoYWluLWFnZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUF1QztBQUN2QywrREFBaUQ7QUFDakQsd0VBQTBEO0FBQzFELCtEQUFpRDtBQUNqRCxzRUFBd0Q7QUFDeEQseURBQTJDO0FBQzNDLDJEQUE2QztBQUM3Qyw2Q0FBdUM7QUFDdkMsMkNBQTZCO0FBQzdCLDZEQUFnRjtBQWtEaEY7O0dBRUc7QUFDSCxNQUFhLGNBQWUsU0FBUSxzQkFBUztJQU0zQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBCO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsMEJBQTBCO1FBQzFCLE1BQU0sUUFBUSxHQUFHLE9BQU8sS0FBSyxDQUFDLFFBQVEsS0FBSyxRQUFRO1lBQ2pELENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUM7WUFDbkUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUM7UUFFbkIseUNBQXlDO1FBQ3pDLElBQUksaUJBQXlCLENBQUM7UUFDOUIsSUFBSSxjQUFzQixDQUFDO1FBQzNCLElBQUksaUJBQXlCLENBQUM7UUFFOUIsSUFBSSxLQUFLLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDekIsc0JBQXNCO1lBQ3RCLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsaUJBQWlCLENBQUM7WUFDM0QsY0FBYyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDO1lBQ3JELGlCQUFpQixHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsaUJBQWlCLElBQUksZ0JBQWdCLENBQUM7UUFDakYsQ0FB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Q0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7U0FDaEUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdE5ELHdDQXNOQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgbm9kZWpzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0IHsgRHVyYXRpb24gfSBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgRHluYW1vREJUYWJsZXMsIHR5cGUgRHluYW1vREJUYWJsZXNQcm9wcyB9IGZyb20gJy4vZHluYW1vZGItdGFibGVzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBMYW5nY2hhaW5BZ2VudFByb3BzIHtcbiAgLyoqXG4gICAqIEluamVjdGVkIEV2ZW50QnJpZGdlIGJ1cyAoSUV2ZW50QnVzIG9yIEFSTiBzdHJpbmcpXG4gICAqL1xuICBldmVudEJ1czogZXZlbnRzLklFdmVudEJ1cyB8IHN0cmluZztcbiAgXG4gIC8qKlxuICAgKiBCZWRyb2NrIG1vZGVsIElEIChlLmcuLCBDbGF1ZGUgU29ubmV0KVxuICAgKi9cbiAgYmVkcm9ja01vZGVsSWQ6IHN0cmluZztcbiAgXG4gIC8qKlxuICAgKiBPcHRpb25hbCBPcGVuU2VhcmNoIFNlcnZlcmxlc3MgY29sbGVjdGlvbiBBUk4gZm9yIFJBR1xuICAgKi9cbiAgb3BlbnNlYXJjaENvbGxlY3Rpb25Bcm4/OiBzdHJpbmc7XG4gIFxuICAvKipcbiAgICogT3B0aW9uYWwgY3Jvc3MtYWNjb3VudCByb2xlIEFSTiBmb3IgRXZlbnRCcmlkZ2UgUHV0RXZlbnRzXG4gICAqL1xuICBwdXRFdmVudHNSb2xlQXJuPzogc3RyaW5nO1xuICBcbiAgLyoqXG4gICAqIE9wdGlvbmFsIHByZWZpeCBmb3IgUkFHIGluZGV4IG5hbWVzIChkZWZhdWx0OiBcImt4Z2VuX1wiKVxuICAgKi9cbiAgcmFnSW5kZXhOYW1lUHJlZml4Pzogc3RyaW5nO1xuICBcbiAgLyoqXG4gICAqIE9wdGlvbmFsIGhpc3RvcnkgbGltaXQgZm9yIGNoYXQgbWVtb3J5IChkZWZhdWx0OiA1MClcbiAgICovXG4gIGhpc3RvcnlMaW1pdD86IG51bWJlcjtcblxuICAvKipcbiAgICogRHluYW1vREIgdGFibGVzIGNvbmZpZ3VyYXRpb25cbiAgICogSWYgbm90IHByb3ZpZGVkLCB0YWJsZXMgd2lsbCBiZSBjcmVhdGVkIHdpdGggZGVmYXVsdCBzZXR0aW5nc1xuICAgKi9cbiAgZHluYW1vREJUYWJsZXNQcm9wcz86IER5bmFtb0RCVGFibGVzUHJvcHM7XG5cbiAgLyoqXG4gICAqIEV4aXN0aW5nIER5bmFtb0RCIHRhYmxlcyAoYWx0ZXJuYXRpdmUgdG8gY3JlYXRpbmcgbmV3IG9uZXMpXG4gICAqIElmIHByb3ZpZGVkLCBkeW5hbW9EQlRhYmxlc1Byb3BzIHdpbGwgYmUgaWdub3JlZFxuICAgKi9cbiAgZXhpc3RpbmdUYWJsZXM/OiB7XG4gICAgbWVzc2FnZXNUYWJsZU5hbWU6IHN0cmluZztcbiAgICBsZWFkc1RhYmxlTmFtZTogc3RyaW5nO1xuICAgIHBlcnNvbmFzVGFibGVOYW1lPzogc3RyaW5nO1xuICB9O1xufVxuXG4vKipcbiAqIExhbmdDaGFpbiBBZ2VudCBjb25zdHJ1Y3QgdGhhdCBjcmVhdGVzIExhbWJkYSBmdW5jdGlvbnMgYW5kIEV2ZW50QnJpZGdlIHJ1bGVzXG4gKi9cbmV4cG9ydCBjbGFzcyBMYW5nY2hhaW5BZ2VudCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBhZ2VudFJvdXRlckZ1bmN0aW9uOiBub2RlanMuTm9kZWpzRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBhZ2VudEZ1bmN0aW9uOiBub2RlanMuTm9kZWpzRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBpbmRleGVyRnVuY3Rpb24/OiBub2RlanMuTm9kZWpzRnVuY3Rpb247XG4gIHB1YmxpYyByZWFkb25seSBkeW5hbW9EQlRhYmxlcz86IER5bmFtb0RCVGFibGVzO1xuICBcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IExhbmdjaGFpbkFnZW50UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuICAgIFxuICAgIC8vIFJlc29sdmUgRXZlbnRCcmlkZ2UgYnVzXG4gICAgY29uc3QgZXZlbnRCdXMgPSB0eXBlb2YgcHJvcHMuZXZlbnRCdXMgPT09ICdzdHJpbmcnIFxuICAgICAgPyBldmVudHMuRXZlbnRCdXMuZnJvbUV2ZW50QnVzQXJuKHRoaXMsICdFdmVudEJ1cycsIHByb3BzLmV2ZW50QnVzKVxuICAgICAgOiBwcm9wcy5ldmVudEJ1cztcblxuICAgIC8vIENyZWF0ZSBvciB1c2UgZXhpc3RpbmcgRHluYW1vREIgdGFibGVzXG4gICAgbGV0IG1lc3NhZ2VzVGFibGVOYW1lOiBzdHJpbmc7XG4gICAgbGV0IGxlYWRzVGFibGVOYW1lOiBzdHJpbmc7XG4gICAgbGV0IHBlcnNvbmFzVGFibGVOYW1lOiBzdHJpbmc7XG5cbiAgICBpZiAocHJvcHMuZXhpc3RpbmdUYWJsZXMpIHtcbiAgICAgIC8vIFVzZSBleGlzdGluZyB0YWJsZXNcbiAgICAgIG1lc3NhZ2VzVGFibGVOYW1lID0gcHJvcHMuZXhpc3RpbmdUYWJsZXMubWVzc2FnZXNUYWJsZU5hbWU7XG4gICAgICBsZWFkc1RhYmxlTmFtZSA9IHByb3BzLmV4aXN0aW5nVGFibGVzLmxlYWRzVGFibGVOYW1lO1xuICAgICAgcGVyc29uYXNUYWJsZU5hbWUgPSBwcm9wcy5leGlzdGluZ1RhYmxlcy5wZXJzb25hc1RhYmxlTmFtZSB8fCAna3hnZW4tcGVyc29uYXMnO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBDcmVhdGUgbmV3IHRhYmxlc1xuICAgICAgdGhpcy5keW5hbW9EQlRhYmxlcyA9IG5ldyBEeW5hbW9EQlRhYmxlcyh0aGlzLCAnVGFibGVzJywgcHJvcHMuZHluYW1vREJUYWJsZXNQcm9wcyk7XG4gICAgICBjb25zdCB0YWJsZU5hbWVzID0gdGhpcy5keW5hbW9EQlRhYmxlcy5nZXRUYWJsZU5hbWVzKCk7XG4gICAgICBtZXNzYWdlc1RhYmxlTmFtZSA9IHRhYmxlTmFtZXMubWVzc2FnZXM7XG4gICAgICBsZWFkc1RhYmxlTmFtZSA9IHRhYmxlTmFtZXMubGVhZHM7XG4gICAgICBwZXJzb25hc1RhYmxlTmFtZSA9IHRhYmxlTmFtZXMucGVyc29uYXM7XG4gICAgfVxuICAgIFxuICAgIC8vIENvbW1vbiBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBjb25zdCBjb21tb25FbnYgPSB7XG4gICAgICBNRVNTQUdFU19UQUJMRTogbWVzc2FnZXNUYWJsZU5hbWUsXG4gICAgICBMRUFEU19UQUJMRTogbGVhZHNUYWJsZU5hbWUsXG4gICAgICBQRVJTT05BU19UQUJMRTogcGVyc29uYXNUYWJsZU5hbWUsXG4gICAgICBCRURST0NLX01PREVMX0lEOiBwcm9wcy5iZWRyb2NrTW9kZWxJZCxcbiAgICAgIE9VVEJPVU5EX0VWRU5UX0JVU19OQU1FOiBldmVudEJ1cy5ldmVudEJ1c05hbWUsXG4gICAgICBPVVRCT1VORF9FVkVOVF9CVVNfQVJOOiBldmVudEJ1cy5ldmVudEJ1c0FybixcbiAgICAgIFJBR19JTkRFWF9OQU1FX1BSRUZJWDogcHJvcHMucmFnSW5kZXhOYW1lUHJlZml4IHx8ICdreGdlbl8nLFxuICAgICAgSElTVE9SWV9MSU1JVDogKHByb3BzLmhpc3RvcnlMaW1pdCB8fCA1MCkudG9TdHJpbmcoKSxcbiAgICAgIC4uLihwcm9wcy5wdXRFdmVudHNSb2xlQXJuICYmIHsgRVZFTlRfQlVTX1BVVF9FVkVOVFNfUk9MRV9BUk46IHByb3BzLnB1dEV2ZW50c1JvbGVBcm4gfSksXG4gICAgfTtcbiAgICBcbiAgICAvLyBDb21tb24gTGFtYmRhIGNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBjb21tb25MYW1iZGFQcm9wcyA9IHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgdGltZW91dDogRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnYsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIGZvcm1hdDogbm9kZWpzLk91dHB1dEZvcm1hdC5FU00sXG4gICAgICAgIHRhcmdldDogJ2VzMjAyMicsXG4gICAgICAgIHBsYXRmb3JtOiAnbm9kZScsXG4gICAgICAgIG1haW5GaWVsZHM6IFsnbW9kdWxlJywgJ21haW4nXSxcbiAgICAgICAgY29uZGl0aW9uczogWydpbXBvcnQnLCAnbW9kdWxlJ10sXG4gICAgICAgIGJhbm5lcjogJ2ltcG9ydCB7IGNyZWF0ZVJlcXVpcmUgfSBmcm9tIFwibW9kdWxlXCI7IGNvbnN0IHJlcXVpcmUgPSBjcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCk7JyxcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbXG4gICAgICAgICAgJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYicsXG4gICAgICAgICAgJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYicsXG4gICAgICAgICAgJ0Bhd3Mtc2RrL2NsaWVudC1ldmVudGJyaWRnZScsXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIH07XG4gICAgXG4gICAgLy8gRmluZCB0aGUgcnVudGltZSBwYWNrYWdlIHBhdGhcbiAgICBjb25zdCBydW50aW1lUGFja2FnZVBhdGggPSB0aGlzLmZpbmRSdW50aW1lUGFja2FnZVBhdGgoKTtcbiAgICBcbiAgICAvLyBBZ2VudCBSb3V0ZXIgRnVuY3Rpb25cbiAgICB0aGlzLmFnZW50Um91dGVyRnVuY3Rpb24gPSBuZXcgbm9kZWpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdBZ2VudFJvdXRlckZ1bmN0aW9uJywge1xuICAgICAgLi4uY29tbW9uTGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGAke2lkfS1hZ2VudC1yb3V0ZXJgLFxuICAgICAgZGVzY3JpcHRpb246ICdSb3V0ZXMgaW5ib3VuZCBtZXNzYWdlcyBhbmQgaW52b2tlcyBhZ2VudCBwcm9jZXNzaW5nJyxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4ocnVudGltZVBhY2thZ2VQYXRoLCAnc3JjL2hhbmRsZXJzL3JvdXRlci50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgIH0pO1xuICAgIFxuICAgIC8vIEFnZW50IEZ1bmN0aW9uXG4gICAgdGhpcy5hZ2VudEZ1bmN0aW9uID0gbmV3IG5vZGVqcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnQWdlbnRGdW5jdGlvbicsIHtcbiAgICAgIC4uLmNvbW1vbkxhbWJkYVByb3BzLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgJHtpZH0tYWdlbnRgLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9jZXNzZXMgbWVzc2FnZXMgd2l0aCBMYW5nQ2hhaW4gYW5kIGdlbmVyYXRlcyByZXNwb25zZXMnLFxuICAgICAgZW50cnk6IHBhdGguam9pbihydW50aW1lUGFja2FnZVBhdGgsICdzcmMvaGFuZGxlcnMvYWdlbnQudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoMTApLCAvLyBMb25nZXIgdGltZW91dCBmb3IgTExNIHByb2Nlc3NpbmdcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsIC8vIE1vcmUgbWVtb3J5IGZvciBMYW5nQ2hhaW5cbiAgICB9KTtcbiAgICBcbiAgICAvLyBPcHRpb25hbCBJbmRleGVyIEZ1bmN0aW9uIGZvciBSQUdcbiAgICBpZiAocHJvcHMub3BlbnNlYXJjaENvbGxlY3Rpb25Bcm4pIHtcbiAgICAgIHRoaXMuaW5kZXhlckZ1bmN0aW9uID0gbmV3IG5vZGVqcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnSW5kZXhlckZ1bmN0aW9uJywge1xuICAgICAgICAuLi5jb21tb25MYW1iZGFQcm9wcyxcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBgJHtpZH0taW5kZXhlcmAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnSW5kZXhlcyBkb2N1bWVudHMgZm9yIFJBRyByZXRyaWV2YWwnLFxuICAgICAgICBlbnRyeTogcGF0aC5qb2luKHJ1bnRpbWVQYWNrYWdlUGF0aCwgJ3NyYy9oYW5kbGVycy9pbmRleGVyLnRzJyksXG4gICAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAuLi5jb21tb25FbnYsXG4gICAgICAgICAgT1BFTlNFQVJDSF9DT0xMRUNUSU9OX0FSTjogcHJvcHMub3BlbnNlYXJjaENvbGxlY3Rpb25Bcm4sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgLy8gSUFNIHBlcm1pc3Npb25zXG4gICAgLy8gR2V0IHRhYmxlIEFSTnMgZm9yIElBTSBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IHRhYmxlQXJucyA9IHRoaXMuZHluYW1vREJUYWJsZXMgXG4gICAgICA/IHRoaXMuZHluYW1vREJUYWJsZXMuZ2V0VGFibGVBcm5zKClcbiAgICAgIDogW1xuICAgICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOio6Kjp0YWJsZS8ke21lc3NhZ2VzVGFibGVOYW1lfWAsXG4gICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6KjoqOnRhYmxlLyR7bWVzc2FnZXNUYWJsZU5hbWV9L2luZGV4LypgLFxuICAgICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOio6Kjp0YWJsZS8ke2xlYWRzVGFibGVOYW1lfWAsXG4gICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6KjoqOnRhYmxlLyR7bGVhZHNUYWJsZU5hbWV9L2luZGV4LypgLFxuICAgICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOio6Kjp0YWJsZS8ke3BlcnNvbmFzVGFibGVOYW1lfWAsXG4gICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6KjoqOnRhYmxlLyR7cGVyc29uYXNUYWJsZU5hbWV9L2luZGV4LypgLFxuICAgICAgICBdO1xuXG4gICAgdGhpcy5zZXR1cElhbVBlcm1pc3Npb25zKHByb3BzLCBldmVudEJ1cywgdGFibGVBcm5zKTtcbiAgICBcbiAgICAvLyBFdmVudEJyaWRnZSBydWxlc1xuICAgIHRoaXMuc2V0dXBFdmVudEJyaWRnZVJ1bGVzKGV2ZW50QnVzKTtcbiAgfVxuICBcbiAgLyoqXG4gICAqIEZpbmQgdGhlIHJ1bnRpbWUgcGFja2FnZSBwYXRoIHJlbGF0aXZlIHRvIHRoaXMgY29uc3RydWN0XG4gICAqL1xuICBwcml2YXRlIGZpbmRSdW50aW1lUGFja2FnZVBhdGgoKTogc3RyaW5nIHtcbiAgICAvLyBUaGlzIGFzc3VtZXMgdGhlIElhQyBwYWNrYWdlIGlzIGluIHBhY2thZ2VzL2lhYyBhbmQgcnVudGltZSBpcyBpbiBwYWNrYWdlcy9ydW50aW1lXG4gICAgLy8gQWRqdXN0IHRoZSBwYXRoIGJhc2VkIG9uIHlvdXIgYWN0dWFsIG1vbm9yZXBvIHN0cnVjdHVyZVxuICAgIHJldHVybiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vLi4vLi4vcnVudGltZScpO1xuICB9XG4gIFxuICAvKipcbiAgICogU2V0dXAgSUFNIHBlcm1pc3Npb25zIGZvciBMYW1iZGEgZnVuY3Rpb25zXG4gICAqL1xuICBwcml2YXRlIHNldHVwSWFtUGVybWlzc2lvbnMocHJvcHM6IExhbmdjaGFpbkFnZW50UHJvcHMsIGV2ZW50QnVzOiBldmVudHMuSUV2ZW50QnVzLCB0YWJsZUFybnM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgLy8gRHluYW1vREIgcGVybWlzc2lvbnNcbiAgICBjb25zdCBkeW5hbW9Qb2xpY3kgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpCYXRjaEdldEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6QmF0Y2hXcml0ZUl0ZW0nLFxuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogdGFibGVBcm5zLFxuICAgIH0pO1xuICAgIFxuICAgIC8vIEJlZHJvY2sgcGVybWlzc2lvbnNcbiAgICBjb25zdCBiZWRyb2NrUG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnYmVkcm9jazpJbnZva2VNb2RlbCcsXG4gICAgICAgICdiZWRyb2NrOkludm9rZU1vZGVsV2l0aFJlc3BvbnNlU3RyZWFtJyxcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6YmVkcm9jazoqOjpmb3VuZGF0aW9uLW1vZGVsLyR7cHJvcHMuYmVkcm9ja01vZGVsSWR9YCxcbiAgICAgICAgJ2Fybjphd3M6YmVkcm9jazoqOjpmb3VuZGF0aW9uLW1vZGVsL2FtYXpvbi50aXRhbi1lbWJlZC10ZXh0LXYxJyxcbiAgICAgIF0sXG4gICAgfSk7XG4gICAgXG4gICAgLy8gRXZlbnRCcmlkZ2UgcGVybWlzc2lvbnNcbiAgICBjb25zdCBldmVudEJyaWRnZVBvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnZXZlbnRzOlB1dEV2ZW50cyddLFxuICAgICAgcmVzb3VyY2VzOiBbZXZlbnRCdXMuZXZlbnRCdXNBcm5dLFxuICAgIH0pO1xuICAgIFxuICAgIC8vIEFwcGx5IHBlcm1pc3Npb25zIHRvIGZ1bmN0aW9uc1xuICAgIFt0aGlzLmFnZW50Um91dGVyRnVuY3Rpb24sIHRoaXMuYWdlbnRGdW5jdGlvbl0uZm9yRWFjaChmbiA9PiB7XG4gICAgICBmbi5hZGRUb1JvbGVQb2xpY3koZHluYW1vUG9saWN5KTtcbiAgICAgIGZuLmFkZFRvUm9sZVBvbGljeShiZWRyb2NrUG9saWN5KTtcbiAgICAgIGZuLmFkZFRvUm9sZVBvbGljeShldmVudEJyaWRnZVBvbGljeSk7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gT3BlblNlYXJjaCBwZXJtaXNzaW9ucyBmb3IgaW5kZXhlclxuICAgIGlmICh0aGlzLmluZGV4ZXJGdW5jdGlvbiAmJiBwcm9wcy5vcGVuc2VhcmNoQ29sbGVjdGlvbkFybikge1xuICAgICAgY29uc3Qgb3BlbnNlYXJjaFBvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2Fvc3M6QVBJQWNjZXNzQWxsJyxcbiAgICAgICAgICAnYW9zczpEYXNoYm9hcmRzQWNjZXNzQWxsJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMub3BlbnNlYXJjaENvbGxlY3Rpb25Bcm5dLFxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIHRoaXMuaW5kZXhlckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShvcGVuc2VhcmNoUG9saWN5KTtcbiAgICAgIHRoaXMuaW5kZXhlckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShkeW5hbW9Qb2xpY3kpO1xuICAgICAgdGhpcy5pbmRleGVyRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KGV2ZW50QnJpZGdlUG9saWN5KTtcbiAgICB9XG4gICAgXG4gICAgLy8gTGFtYmRhIGludm9rZSBwZXJtaXNzaW9ucyAoZm9yIHJvdXRlciB0byBpbnZva2UgYWdlbnQpXG4gICAgdGhpcy5hZ2VudEZ1bmN0aW9uLmdyYW50SW52b2tlKHRoaXMuYWdlbnRSb3V0ZXJGdW5jdGlvbik7XG4gIH1cbiAgXG4gIC8qKlxuICAgKiBTZXR1cCBFdmVudEJyaWRnZSBydWxlcyB0byB0cmlnZ2VyIExhbWJkYSBmdW5jdGlvbnNcbiAgICovXG4gIHByaXZhdGUgc2V0dXBFdmVudEJyaWRnZVJ1bGVzKGV2ZW50QnVzOiBldmVudHMuSUV2ZW50QnVzKTogdm9pZCB7XG4gICAgLy8gUnVsZSBmb3IgaW5ib3VuZCBtZXNzYWdlc1xuICAgIG5ldyBldmVudHMuUnVsZSh0aGlzLCAnSW5ib3VuZE1lc3NhZ2VSdWxlJywge1xuICAgICAgZXZlbnRCdXMsXG4gICAgICBkZXNjcmlwdGlvbjogJ1JvdXRlIGluYm91bmQgbGVhZCBtZXNzYWdlcyB0byBhZ2VudCByb3V0ZXInLFxuICAgICAgZXZlbnRQYXR0ZXJuOiB7XG4gICAgICAgIHNvdXJjZTogWydreGdlbi5tZXNzYWdpbmcnXSxcbiAgICAgICAgZGV0YWlsVHlwZTogWydsZWFkLm1lc3NhZ2UuY3JlYXRlZCddLFxuICAgICAgfSxcbiAgICAgIHRhcmdldHM6IFtuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbih0aGlzLmFnZW50Um91dGVyRnVuY3Rpb24pXSxcbiAgICB9KTtcbiAgfVxufVxuIl19