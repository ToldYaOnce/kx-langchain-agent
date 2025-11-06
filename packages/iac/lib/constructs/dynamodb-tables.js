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
exports.DynamoDBTables = void 0;
const constructs_1 = require("constructs");
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const aws_cdk_lib_1 = require("aws-cdk-lib");
/**
 * DynamoDB Tables construct for KxGen LangChain Agent
 *
 * Creates all necessary DynamoDB tables with proper schemas, indexes, and documentation
 * for the LangChain agent system. This includes:
 *
 * - Messages Table: Conversation history and agent responses
 * - Leads Table: Contact information and lead management
 * - Personas Table: Dynamic persona configurations
 *
 * @example
 * ```typescript
 * const tables = new DynamoDBTables(this, 'AgentTables', {
 *   messagesTableName: 'my-app-messages',
 *   leadsTableName: 'my-app-leads',
 *   personasTableName: 'my-app-personas',
 *   billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
 *   removalPolicy: RemovalPolicy.DESTROY, // For dev environments
 * });
 *
 * // Use in LangchainAgent construct
 * const agent = new LangchainAgent(this, 'Agent', {
 *   messagesTableName: tables.messagesTable.tableName,
 *   leadsTableName: tables.leadsTable.tableName,
 *   // ... other props
 * });
 * ```
 */
class DynamoDBTables extends constructs_1.Construct {
    constructor(scope, id, props = {}) {
        super(scope, id);
        const { messagesTableName = 'kxgen-messages', leadsTableName = 'kxgen-leads', personasTableName = 'kxgen-personas', billingMode = dynamodb.BillingMode.PAY_PER_REQUEST, removalPolicy = aws_cdk_lib_1.RemovalPolicy.RETAIN, pointInTimeRecovery = true, tableClass = dynamodb.TableClass.STANDARD, } = props;
        // Common table configuration
        const commonProps = {
            billingMode,
            removalPolicy,
            pointInTimeRecovery,
            tableClass,
        };
        // Messages Table
        this.messagesTable = new dynamodb.Table(this, 'MessagesTable', {
            ...commonProps,
            tableName: messagesTableName,
            partitionKey: {
                name: 'contact_pk',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'ts',
                type: dynamodb.AttributeType.STRING,
            },
        });
        // Messages Table GSI1: Recent messages per tenant
        this.messagesTable.addGlobalSecondaryIndex({
            indexName: 'GSI1',
            partitionKey: {
                name: 'GSI1PK', // tenantId
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'GSI1SK', // ts (timestamp)
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        // Messages Table GSI2: Messages by lead ID
        this.messagesTable.addGlobalSecondaryIndex({
            indexName: 'GSI2',
            partitionKey: {
                name: 'GSI2PK', // lead_id
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'GSI2SK', // ts (timestamp)
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        // Leads Table
        this.leadsTable = new dynamodb.Table(this, 'LeadsTable', {
            ...commonProps,
            tableName: leadsTableName,
            partitionKey: {
                name: 'contact_pk',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'sk',
                type: dynamodb.AttributeType.STRING,
            },
        });
        // Leads Table GSI1: Phone number lookup
        this.leadsTable.addGlobalSecondaryIndex({
            indexName: 'GSI1',
            partitionKey: {
                name: 'GSI1PK', // tenantId#phone
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'GSI1SK', // PHONE_LOOKUP
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        // Leads Table GSI2: Lead status queries
        this.leadsTable.addGlobalSecondaryIndex({
            indexName: 'GSI2',
            partitionKey: {
                name: 'GSI2PK', // tenantId#status
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'GSI2SK', // created_at
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        // Personas Table
        this.personasTable = new dynamodb.Table(this, 'PersonasTable', {
            ...commonProps,
            tableName: personasTableName,
            partitionKey: {
                name: 'persona_pk',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'sk',
                type: dynamodb.AttributeType.STRING,
            },
        });
        // Personas Table GSI1: Active personas per tenant
        this.personasTable.addGlobalSecondaryIndex({
            indexName: 'GSI1',
            partitionKey: {
                name: 'GSI1PK', // tenantId
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'GSI1SK', // status#updated_at
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        // Personas Table GSI2: Persona templates
        this.personasTable.addGlobalSecondaryIndex({
            indexName: 'GSI2',
            partitionKey: {
                name: 'GSI2PK', // TEMPLATE#category
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'GSI2SK', // popularity_score
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
        });
        // Add tags for better resource management
        const tables = [this.messagesTable, this.leadsTable, this.personasTable];
        tables.forEach(table => {
            table.node.addMetadata('component', 'kxgen-langchain-agent');
            table.node.addMetadata('purpose', 'AI agent data storage');
        });
    }
    /**
     * Get all table names as a convenient object
     *
     * @returns Object containing all table names
     */
    getTableNames() {
        return {
            messages: this.messagesTable.tableName,
            leads: this.leadsTable.tableName,
            personas: this.personasTable.tableName,
        };
    }
    /**
     * Get all table ARNs for IAM policy creation
     *
     * @returns Array of table ARNs including indexes
     */
    getTableArns() {
        const arns = [];
        // Add table ARNs
        arns.push(this.messagesTable.tableArn);
        arns.push(this.leadsTable.tableArn);
        arns.push(this.personasTable.tableArn);
        // Add GSI ARNs
        arns.push(`${this.messagesTable.tableArn}/index/*`);
        arns.push(`${this.leadsTable.tableArn}/index/*`);
        arns.push(`${this.personasTable.tableArn}/index/*`);
        return arns;
    }
}
exports.DynamoDBTables = DynamoDBTables;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluYW1vZGItdGFibGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2NvbnN0cnVjdHMvZHluYW1vZGItdGFibGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJDQUF1QztBQUN2QyxtRUFBcUQ7QUFDckQsNkNBQTRDO0FBaUQ1Qzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBMkJHO0FBQ0gsTUFBYSxjQUFlLFNBQVEsc0JBQVM7SUEwRDNDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsUUFBNkIsRUFBRTtRQUN2RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sRUFDSixpQkFBaUIsR0FBRyxnQkFBZ0IsRUFDcEMsY0FBYyxHQUFHLGFBQWEsRUFDOUIsaUJBQWlCLEdBQUcsZ0JBQWdCLEVBQ3BDLFdBQVcsR0FBRyxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWUsRUFDbEQsYUFBYSxHQUFHLDJCQUFhLENBQUMsTUFBTSxFQUNwQyxtQkFBbUIsR0FBRyxJQUFJLEVBQzFCLFVBQVUsR0FBRyxRQUFRLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FDMUMsR0FBRyxLQUFLLENBQUM7UUFFViw2QkFBNkI7UUFDN0IsTUFBTSxXQUFXLEdBQUc7WUFDbEIsV0FBVztZQUNYLGFBQWE7WUFDYixtQkFBbUI7WUFDbkIsVUFBVTtTQUNYLENBQUM7UUFFRixpQkFBaUI7UUFDakIsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM3RCxHQUFHLFdBQVc7WUFDZCxTQUFTLEVBQUUsaUJBQWlCO1lBQzVCLFlBQVksRUFBRTtnQkFDWixJQUFJLEVBQUUsWUFBWTtnQkFDbEIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTthQUNwQztZQUNELE9BQU8s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Iiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCB7IFJlbW92YWxQb2xpY3kgfSBmcm9tICdhd3MtY2RrLWxpYic7XHJcblxyXG4vKipcclxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBEeW5hbW9EQiB0YWJsZXNcclxuICovXHJcbmV4cG9ydCBpbnRlcmZhY2UgRHluYW1vREJUYWJsZXNQcm9wcyB7XHJcbiAgLyoqXHJcbiAgICogTmFtZSBmb3IgdGhlIG1lc3NhZ2VzIHRhYmxlXHJcbiAgICogQGRlZmF1bHQgJ2t4Z2VuLW1lc3NhZ2VzJ1xyXG4gICAqL1xyXG4gIG1lc3NhZ2VzVGFibGVOYW1lPzogc3RyaW5nO1xyXG5cclxuICAvKipcclxuICAgKiBOYW1lIGZvciB0aGUgbGVhZHMgdGFibGVcclxuICAgKiBAZGVmYXVsdCAna3hnZW4tbGVhZHMnXHJcbiAgICovXHJcbiAgbGVhZHNUYWJsZU5hbWU/OiBzdHJpbmc7XHJcblxyXG4gIC8qKlxyXG4gICAqIE5hbWUgZm9yIHRoZSBwZXJzb25hcyB0YWJsZVxyXG4gICAqIEBkZWZhdWx0ICdreGdlbi1wZXJzb25hcydcclxuICAgKi9cclxuICBwZXJzb25hc1RhYmxlTmFtZT86IHN0cmluZztcclxuXHJcbiAgLyoqXHJcbiAgICogQmlsbGluZyBtb2RlIGZvciBhbGwgdGFibGVzXHJcbiAgICogQGRlZmF1bHQgZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNUXHJcbiAgICovXHJcbiAgYmlsbGluZ01vZGU/OiBkeW5hbW9kYi5CaWxsaW5nTW9kZTtcclxuXHJcbiAgLyoqXHJcbiAgICogUmVtb3ZhbCBwb2xpY3kgZm9yIHRhYmxlcyAoREVTVFJPWSBmb3IgZGV2LCBSRVRBSU4gZm9yIHByb2QpXHJcbiAgICogQGRlZmF1bHQgUmVtb3ZhbFBvbGljeS5SRVRBSU5cclxuICAgKi9cclxuICByZW1vdmFsUG9saWN5PzogUmVtb3ZhbFBvbGljeTtcclxuXHJcbiAgLyoqXHJcbiAgICogRW5hYmxlIHBvaW50LWluLXRpbWUgcmVjb3ZlcnlcclxuICAgKiBAZGVmYXVsdCB0cnVlXHJcbiAgICovXHJcbiAgcG9pbnRJblRpbWVSZWNvdmVyeT86IGJvb2xlYW47XHJcblxyXG4gIC8qKlxyXG4gICAqIFRhYmxlIGNsYXNzIChTVEFOREFSRCBvciBTVEFOREFSRF9JTkZSRVFVRU5UX0FDQ0VTUylcclxuICAgKiBAZGVmYXVsdCBkeW5hbW9kYi5UYWJsZUNsYXNzLlNUQU5EQVJEXHJcbiAgICovXHJcbiAgdGFibGVDbGFzcz86IGR5bmFtb2RiLlRhYmxlQ2xhc3M7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEeW5hbW9EQiBUYWJsZXMgY29uc3RydWN0IGZvciBLeEdlbiBMYW5nQ2hhaW4gQWdlbnRcclxuICogXHJcbiAqIENyZWF0ZXMgYWxsIG5lY2Vzc2FyeSBEeW5hbW9EQiB0YWJsZXMgd2l0aCBwcm9wZXIgc2NoZW1hcywgaW5kZXhlcywgYW5kIGRvY3VtZW50YXRpb25cclxuICogZm9yIHRoZSBMYW5nQ2hhaW4gYWdlbnQgc3lzdGVtLiBUaGlzIGluY2x1ZGVzOlxyXG4gKiBcclxuICogLSBNZXNzYWdlcyBUYWJsZTogQ29udmVyc2F0aW9uIGhpc3RvcnkgYW5kIGFnZW50IHJlc3BvbnNlc1xyXG4gKiAtIExlYWRzIFRhYmxlOiBDb250YWN0IGluZm9ybWF0aW9uIGFuZCBsZWFkIG1hbmFnZW1lbnRcclxuICogLSBQZXJzb25hcyBUYWJsZTogRHluYW1pYyBwZXJzb25hIGNvbmZpZ3VyYXRpb25zXHJcbiAqIFxyXG4gKiBAZXhhbXBsZVxyXG4gKiBgYGB0eXBlc2NyaXB0XHJcbiAqIGNvbnN0IHRhYmxlcyA9IG5ldyBEeW5hbW9EQlRhYmxlcyh0aGlzLCAnQWdlbnRUYWJsZXMnLCB7XHJcbiAqICAgbWVzc2FnZXNUYWJsZU5hbWU6ICdteS1hcHAtbWVzc2FnZXMnLFxyXG4gKiAgIGxlYWRzVGFibGVOYW1lOiAnbXktYXBwLWxlYWRzJyxcclxuICogICBwZXJzb25hc1RhYmxlTmFtZTogJ215LWFwcC1wZXJzb25hcycsXHJcbiAqICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICogICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIEZvciBkZXYgZW52aXJvbm1lbnRzXHJcbiAqIH0pO1xyXG4gKiBcclxuICogLy8gVXNlIGluIExhbmdjaGFpbkFnZW50IGNvbnN0cnVjdFxyXG4gKiBjb25zdCBhZ2VudCA9IG5ldyBMYW5nY2hhaW5BZ2VudCh0aGlzLCAnQWdlbnQnLCB7XHJcbiAqICAgbWVzc2FnZXNUYWJsZU5hbWU6IHRhYmxlcy5tZXNzYWdlc1RhYmxlLnRhYmxlTmFtZSxcclxuICogICBsZWFkc1RhYmxlTmFtZTogdGFibGVzLmxlYWRzVGFibGUudGFibGVOYW1lLFxyXG4gKiAgIC8vIC4uLiBvdGhlciBwcm9wc1xyXG4gKiB9KTtcclxuICogYGBgXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgRHluYW1vREJUYWJsZXMgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xyXG4gIC8qKlxyXG4gICAqIE1lc3NhZ2VzIHRhYmxlIGZvciBzdG9yaW5nIGNvbnZlcnNhdGlvbiBoaXN0b3J5XHJcbiAgICogXHJcbiAgICogKipTY2hlbWE6KipcclxuICAgKiAtIFBLOiBgdGVuYW50SWQjZW1haWxfbGNgIChDb250YWN0IGlkZW50aWZpZXIpXHJcbiAgICogLSBTSzogYHRzYCAoVGltZXN0YW1wIGZvciBtZXNzYWdlIG9yZGVyaW5nKVxyXG4gICAqIFxyXG4gICAqICoqR2xvYmFsIFNlY29uZGFyeSBJbmRleGVzOioqXHJcbiAgICogLSBHU0kxOiBSZWNlbnQgbWVzc2FnZXMgcGVyIHRlbmFudFxyXG4gICAqIC0gR1NJMjogTWVzc2FnZXMgYnkgbGVhZCBJRFxyXG4gICAqIFxyXG4gICAqICoqVXNlIENhc2VzOioqXHJcbiAgICogLSBTdG9yZSBpbmJvdW5kL291dGJvdW5kIG1lc3NhZ2VzXHJcbiAgICogLSBSZXRyaWV2ZSBjb252ZXJzYXRpb24gaGlzdG9yeVxyXG4gICAqIC0gUXVlcnkgcmVjZW50IG1lc3NhZ2VzIGFjcm9zcyB0ZW5hbnRzXHJcbiAgICogLSBUcmFjayBtZXNzYWdlcyBieSBsZWFkXHJcbiAgICovXHJcbiAgcHVibGljIHJlYWRvbmx5IG1lc3NhZ2VzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG5cclxuICAvKipcclxuICAgKiBMZWFkcyB0YWJsZSBmb3IgY29udGFjdCBtYW5hZ2VtZW50IGFuZCBwaG9uZeKGkmVtYWlsIHJlc29sdXRpb25cclxuICAgKiBcclxuICAgKiAqKlNjaGVtYToqKlxyXG4gICAqIC0gUEs6IGB0ZW5hbnRJZCNlbWFpbF9sY2AgKFByaW1hcnkgY29udGFjdCBpZGVudGlmaWVyKVxyXG4gICAqIC0gU0s6IGBQUk9GSUxFYCAoU29ydCBrZXkgZm9yIGNvbnRhY3QgcHJvZmlsZSlcclxuICAgKiBcclxuICAgKiAqKkdsb2JhbCBTZWNvbmRhcnkgSW5kZXhlczoqKlxyXG4gICAqIC0gR1NJMTogUGhvbmUgbnVtYmVyIGxvb2t1cCAoYHRlbmFudElkI3Bob25lYCDihpIgY29udGFjdClcclxuICAgKiAtIEdTSTI6IExlYWQgc3RhdHVzIGFuZCBjcmVhdGlvbiBkYXRlIHF1ZXJpZXNcclxuICAgKiBcclxuICAgKiAqKlVzZSBDYXNlczoqKlxyXG4gICAqIC0gUmVzb2x2ZSBwaG9uZSBudW1iZXJzIHRvIGVtYWlsIGFkZHJlc3Nlc1xyXG4gICAqIC0gU3RvcmUgY29udGFjdCBpbmZvcm1hdGlvbiBhbmQgcHJlZmVyZW5jZXNcclxuICAgKiAtIFRyYWNrIGxlYWQgc3RhdHVzIGFuZCBxdWFsaWZpY2F0aW9uXHJcbiAgICogLSBRdWVyeSBsZWFkcyBieSB2YXJpb3VzIGNyaXRlcmlhXHJcbiAgICovXHJcbiAgcHVibGljIHJlYWRvbmx5IGxlYWRzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG5cclxuICAvKipcclxuICAgKiBQZXJzb25hcyB0YWJsZSBmb3IgZHluYW1pYyBBSSBwZXJzb25hbGl0eSBjb25maWd1cmF0aW9uXHJcbiAgICogXHJcbiAgICogKipTY2hlbWE6KipcclxuICAgKiAtIFBLOiBgdGVuYW50SWQjcGVyc29uYV9pZGAgKFBlcnNvbmEgaWRlbnRpZmllcilcclxuICAgKiAtIFNLOiBgQ09ORklHYCAoU29ydCBrZXkgZm9yIHBlcnNvbmEgY29uZmlndXJhdGlvbilcclxuICAgKiBcclxuICAgKiAqKkdsb2JhbCBTZWNvbmRhcnkgSW5kZXhlczoqKlxyXG4gICAqIC0gR1NJMTogQWN0aXZlIHBlcnNvbmFzIHBlciB0ZW5hbnRcclxuICAgKiAtIEdTSTI6IFBlcnNvbmEgdGVtcGxhdGVzIGFuZCBzaGFyaW5nXHJcbiAgICogXHJcbiAgICogKipVc2UgQ2FzZXM6KipcclxuICAgKiAtIFN0b3JlIGR5bmFtaWMgcGVyc29uYSBjb25maWd1cmF0aW9uc1xyXG4gICAqIC0gTWFuYWdlIGNvbXBhbnktc3BlY2lmaWMgQUkgcGVyc29uYWxpdGllc1xyXG4gICAqIC0gVmVyc2lvbiBjb250cm9sIGZvciBwZXJzb25hIGNoYW5nZXNcclxuICAgKiAtIFNoYXJlIHBlcnNvbmEgdGVtcGxhdGVzIGFjcm9zcyB0ZW5hbnRzXHJcbiAgICovXHJcbiAgcHVibGljIHJlYWRvbmx5IHBlcnNvbmFzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRHluYW1vREJUYWJsZXNQcm9wcyA9IHt9KSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQpO1xyXG5cclxuICAgIGNvbnN0IHtcclxuICAgICAgbWVzc2FnZXNUYWJsZU5hbWUgPSAna3hnZW4tbWVzc2FnZXMnLFxyXG4gICAgICBsZWFkc1RhYmxlTmFtZSA9ICdreGdlbi1sZWFkcycsXHJcbiAgICAgIHBlcnNvbmFzVGFibGVOYW1lID0gJ2t4Z2VuLXBlcnNvbmFzJyxcclxuICAgICAgYmlsbGluZ01vZGUgPSBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHJlbW92YWxQb2xpY3kgPSBSZW1vdmFsUG9saWN5LlJFVEFJTixcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeSA9IHRydWUsXHJcbiAgICAgIHRhYmxlQ2xhc3MgPSBkeW5hbW9kYi5UYWJsZUNsYXNzLlNUQU5EQVJELFxyXG4gICAgfSA9IHByb3BzO1xyXG5cclxuICAgIC8vIENvbW1vbiB0YWJsZSBjb25maWd1cmF0aW9uXHJcbiAgICBjb25zdCBjb21tb25Qcm9wcyA9IHtcclxuICAgICAgYmlsbGluZ01vZGUsXHJcbiAgICAgIHJlbW92YWxQb2xpY3ksXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnksXHJcbiAgICAgIHRhYmxlQ2xhc3MsXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIE1lc3NhZ2VzIFRhYmxlXHJcbiAgICB0aGlzLm1lc3NhZ2VzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ01lc3NhZ2VzVGFibGUnLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICB0YWJsZU5hbWU6IG1lc3NhZ2VzVGFibGVOYW1lLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcclxuICAgICAgICBuYW1lOiAnY29udGFjdF9waycsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAndHMnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTWVzc2FnZXMgVGFibGUgR1NJMTogUmVjZW50IG1lc3NhZ2VzIHBlciB0ZW5hbnRcclxuICAgIHRoaXMubWVzc2FnZXNUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ0dTSTEnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcclxuICAgICAgICBuYW1lOiAnR1NJMVBLJywgLy8gdGVuYW50SWRcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6ICdHU0kxU0snLCAvLyB0cyAodGltZXN0YW1wKVxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTWVzc2FnZXMgVGFibGUgR1NJMjogTWVzc2FnZXMgYnkgbGVhZCBJRFxyXG4gICAgdGhpcy5tZXNzYWdlc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnR1NJMicsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdHU0kyUEsnLCAvLyBsZWFkX2lkXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAnR1NJMlNLJywgLy8gdHMgKHRpbWVzdGFtcClcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIExlYWRzIFRhYmxlXHJcbiAgICB0aGlzLmxlYWRzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0xlYWRzVGFibGUnLCB7XHJcbiAgICAgIC4uLmNvbW1vblByb3BzLFxyXG4gICAgICB0YWJsZU5hbWU6IGxlYWRzVGFibGVOYW1lLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcclxuICAgICAgICBuYW1lOiAnY29udGFjdF9waycsXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAnc2snLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTGVhZHMgVGFibGUgR1NJMTogUGhvbmUgbnVtYmVyIGxvb2t1cFxyXG4gICAgdGhpcy5sZWFkc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnR1NJMScsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdHU0kxUEsnLCAvLyB0ZW5hbnRJZCNwaG9uZVxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ0dTSTFTSycsIC8vIFBIT05FX0xPT0tVUFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTGVhZHMgVGFibGUgR1NJMjogTGVhZCBzdGF0dXMgcXVlcmllc1xyXG4gICAgdGhpcy5sZWFkc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnR1NJMicsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6ICdHU0kyUEsnLCAvLyB0ZW5hbnRJZCNzdGF0dXNcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleToge1xyXG4gICAgICAgIG5hbWU6ICdHU0kyU0snLCAvLyBjcmVhdGVkX2F0XHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBQZXJzb25hcyBUYWJsZVxyXG4gICAgdGhpcy5wZXJzb25hc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdQZXJzb25hc1RhYmxlJywge1xyXG4gICAgICAuLi5jb21tb25Qcm9wcyxcclxuICAgICAgdGFibGVOYW1lOiBwZXJzb25hc1RhYmxlTmFtZSxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ3BlcnNvbmFfcGsnLFxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBzb3J0S2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ3NrJyxcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFBlcnNvbmFzIFRhYmxlIEdTSTE6IEFjdGl2ZSBwZXJzb25hcyBwZXIgdGVuYW50XHJcbiAgICB0aGlzLnBlcnNvbmFzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdHU0kxJyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ0dTSTFQSycsIC8vIHRlbmFudElkXHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAnR1NJMVNLJywgLy8gc3RhdHVzI3VwZGF0ZWRfYXRcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFBlcnNvbmFzIFRhYmxlIEdTSTI6IFBlcnNvbmEgdGVtcGxhdGVzXHJcbiAgICB0aGlzLnBlcnNvbmFzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdHU0kyJyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7XHJcbiAgICAgICAgbmFtZTogJ0dTSTJQSycsIC8vIFRFTVBMQVRFI2NhdGVnb3J5XHJcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHNvcnRLZXk6IHtcclxuICAgICAgICBuYW1lOiAnR1NJMlNLJywgLy8gcG9wdWxhcml0eV9zY29yZVxyXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxyXG4gICAgICB9LFxyXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIHRhZ3MgZm9yIGJldHRlciByZXNvdXJjZSBtYW5hZ2VtZW50XHJcbiAgICBjb25zdCB0YWJsZXMgPSBbdGhpcy5tZXNzYWdlc1RhYmxlLCB0aGlzLmxlYWRzVGFibGUsIHRoaXMucGVyc29uYXNUYWJsZV07XHJcbiAgICB0YWJsZXMuZm9yRWFjaCh0YWJsZSA9PiB7XHJcbiAgICAgIHRhYmxlLm5vZGUuYWRkTWV0YWRhdGEoJ2NvbXBvbmVudCcsICdreGdlbi1sYW5nY2hhaW4tYWdlbnQnKTtcclxuICAgICAgdGFibGUubm9kZS5hZGRNZXRhZGF0YSgncHVycG9zZScsICdBSSBhZ2VudCBkYXRhIHN0b3JhZ2UnKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGFsbCB0YWJsZSBuYW1lcyBhcyBhIGNvbnZlbmllbnQgb2JqZWN0XHJcbiAgICogXHJcbiAgICogQHJldHVybnMgT2JqZWN0IGNvbnRhaW5pbmcgYWxsIHRhYmxlIG5hbWVzXHJcbiAgICovXHJcbiAgcHVibGljIGdldFRhYmxlTmFtZXMoKToge1xyXG4gICAgbWVzc2FnZXM6IHN0cmluZztcclxuICAgIGxlYWRzOiBzdHJpbmc7XHJcbiAgICBwZXJzb25hczogc3RyaW5nO1xyXG4gIH0ge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgbWVzc2FnZXM6IHRoaXMubWVzc2FnZXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIGxlYWRzOiB0aGlzLmxlYWRzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBwZXJzb25hczogdGhpcy5wZXJzb25hc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgYWxsIHRhYmxlIEFSTnMgZm9yIElBTSBwb2xpY3kgY3JlYXRpb25cclxuICAgKiBcclxuICAgKiBAcmV0dXJucyBBcnJheSBvZiB0YWJsZSBBUk5zIGluY2x1ZGluZyBpbmRleGVzXHJcbiAgICovXHJcbiAgcHVibGljIGdldFRhYmxlQXJucygpOiBzdHJpbmdbXSB7XHJcbiAgICBjb25zdCBhcm5zOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgXHJcbiAgICAvLyBBZGQgdGFibGUgQVJOc1xyXG4gICAgYXJucy5wdXNoKHRoaXMubWVzc2FnZXNUYWJsZS50YWJsZUFybik7XHJcbiAgICBhcm5zLnB1c2godGhpcy5sZWFkc1RhYmxlLnRhYmxlQXJuKTtcclxuICAgIGFybnMucHVzaCh0aGlzLnBlcnNvbmFzVGFibGUudGFibGVBcm4pO1xyXG4gICAgXHJcbiAgICAvLyBBZGQgR1NJIEFSTnNcclxuICAgIGFybnMucHVzaChgJHt0aGlzLm1lc3NhZ2VzVGFibGUudGFibGVBcm59L2luZGV4LypgKTtcclxuICAgIGFybnMucHVzaChgJHt0aGlzLmxlYWRzVGFibGUudGFibGVBcm59L2luZGV4LypgKTtcclxuICAgIGFybnMucHVzaChgJHt0aGlzLnBlcnNvbmFzVGFibGUudGFibGVBcm59L2luZGV4LypgKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIGFybnM7XHJcbiAgfVxyXG59XHJcblxyXG4iXX0=