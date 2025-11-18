import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { RemovalPolicy } from "aws-cdk-lib";
import * as path from "path";

export interface DelayedRepliesProps {
  eventBusName?: string;
  existingAgentFunction?: lambda.IFunction;
  apiGatewayConfig?: {
    existingApi: apigateway.RestApi;
    basePath?: string;
  };
  chatHistoryTableName?: string;
  chatHistoryTableArn?: string;
  channelsTableName?: string;
}

export interface DelayedRepliesStackProps extends StackProps {
  eventBusName?: string;
  existingAgentFunction?: lambda.IFunction;
  apiGatewayConfig?: {
    existingApi: apigateway.RestApi;
    basePath?: string;
  };
  channelsTableName?: string;
  chatHistoryTableName?: string;
  chatHistoryTableArn?: string;
}

/**
 * DelayedReplies Construct - Use this within an existing Stack to avoid cross-stack reference issues
 * This is the recommended approach following the pattern from kx-auth
 */
export class DelayedReplies extends Construct {
  public readonly releaseQueue: sqs.Queue;
  public readonly releaseRouterFunction: lambdaNodejs.NodejsFunction;
  public readonly companyInfoTable: dynamodb.Table;
  public readonly personasTable: dynamodb.Table;
  public readonly companyInfoFunction: lambdaNodejs.NodejsFunction;
  public readonly personasFunction: lambdaNodejs.NodejsFunction;
  public readonly companyPersonaFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: DelayedRepliesProps = {}) {
    super(scope, id);

    const eventBusName = props.eventBusName || process.env.EVENT_BUS_NAME || "default";

    // Create FIFO queue for delayed message releases
    this.releaseQueue = new sqs.Queue(this, "ReplyReleaseQueue", {
      fifo: true,
      queueName: `${id}-reply-release.fifo`,
      visibilityTimeout: Duration.seconds(60),
      contentBasedDeduplication: false,
      // Add dead letter queue for failed messages
      deadLetterQueue: {
        queue: new sqs.Queue(this, "ReplyReleaseDeadLetterQueue", {
          fifo: true,
          queueName: `${id}-reply-release-dlq.fifo`,
        }),
        maxReceiveCount: 3
      }
    });

    // Create release router Lambda function
    const handlerPath = this.findReleaseRouterPackagePath();
    this.releaseRouterFunction = new lambdaNodejs.NodejsFunction(this, "ReleaseRouterFunction", {
      functionName: `${id}-release-router-function`,
      entry: path.join(handlerPath, 'src/handler.ts'),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        EVENT_BUS_NAME: eventBusName,
        NODE_OPTIONS: "--enable-source-maps"
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "es2022"
      }
    });

    // Add SQS event source to Lambda
    this.releaseRouterFunction.addEventSource(new sources.SqsEventSource(this.releaseQueue, {
      batchSize: 5,
      reportBatchItemFailures: true
    }));

    // Grant permissions
    this.releaseQueue.grantConsumeMessages(this.releaseRouterFunction);

    // Allow release router to put events to EventBridge
    this.releaseRouterFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ["events:PutEvents"],
      resources: [
        `arn:aws:events:${Stack.of(this).region}:${Stack.of(this).account}:event-bus/${eventBusName}`,
        `arn:aws:events:${Stack.of(this).region}:${Stack.of(this).account}:event-bus/default`
      ]
    }));

    // If existing Agent Lambda is provided, grant it permission to send to our queue
    if (props.existingAgentFunction) {
      this.releaseQueue.grantSendMessages(props.existingAgentFunction);
    }
    
    // Grant agent function access to channels table if provided
    if (props.existingAgentFunction && props.channelsTableName) {
      const channelsTable = dynamodb.Table.fromTableName(
        this,
        'ImportedChannelsTable',
        props.channelsTableName
      );
      channelsTable.grantReadWriteData(props.existingAgentFunction);
    }

    // Create DynamoDB tables for Management API
    this.companyInfoTable = new dynamodb.Table(this, 'CompanyInfoTable', {
      tableName: `${id}-company-info`,
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN, // Use DESTROY for dev environments
      pointInTimeRecovery: true,
    });

    this.personasTable = new dynamodb.Table(this, 'PersonasTable', {
      tableName: `${id}-personas`,
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'personaId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // Create Lambda functions for Management API
    const runtimePath = this.findRuntimePackagePath();

    this.companyInfoFunction = new lambdaNodejs.NodejsFunction(this, 'CompanyInfoFunction', {
      functionName: `${id}-company-info-function`,
      entry: path.join(runtimePath, 'src/services/company-info-service.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        COMPANY_INFO_TABLE: this.companyInfoTable.tableName,
        NODE_OPTIONS: "--enable-source-maps"
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "es2022"
      }
    });

    this.personasFunction = new lambdaNodejs.NodejsFunction(this, 'PersonasFunction', {
      functionName: `${id}-personas-function`,
      entry: path.join(runtimePath, 'src/services/personas-service.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        PERSONAS_TABLE: this.personasTable.tableName,
        NODE_OPTIONS: "--enable-source-maps"
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "es2022"
      }
    });

    this.companyPersonaFunction = new lambdaNodejs.NodejsFunction(this, 'CompanyPersonaFunction', {
      functionName: `${id}-company-persona-function`,
      entry: path.join(runtimePath, 'src/services/company-persona-service.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        COMPANY_INFO_TABLE: this.companyInfoTable.tableName,
        PERSONAS_TABLE: this.personasTable.tableName,
        CHAT_HISTORY_TABLE: props.chatHistoryTableName || '',
        NODE_OPTIONS: "--enable-source-maps"
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: "es2022"
      }
    });

    // Grant DynamoDB permissions
    this.companyInfoTable.grantReadWriteData(this.companyInfoFunction);
    this.personasTable.grantReadWriteData(this.personasFunction);
    this.companyInfoTable.grantReadWriteData(this.companyPersonaFunction);
    this.personasTable.grantReadWriteData(this.companyPersonaFunction);
    
    // Grant agent function access to company_info and personas tables
    if (props.existingAgentFunction) {
      this.companyInfoTable.grantReadData(props.existingAgentFunction);
      this.personasTable.grantReadData(props.existingAgentFunction);
      
      // Add environment variables to agent function so it knows which tables to use
      if (props.existingAgentFunction instanceof lambda.Function) {
        props.existingAgentFunction.addEnvironment('COMPANY_INFO_TABLE', this.companyInfoTable.tableName);
        props.existingAgentFunction.addEnvironment('PERSONAS_TABLE', this.personasTable.tableName);
        console.log(`✅ Added COMPANY_INFO_TABLE and PERSONAS_TABLE env vars to agent function`);
      }
    }
    
    // Grant read access to chat history table if provided
    if (props.chatHistoryTableArn) {
      this.companyPersonaFunction.addToRolePolicy(new iam.PolicyStatement({
        actions: ['dynamodb:Query', 'dynamodb:GetItem', 'dynamodb:Scan'],
        resources: [props.chatHistoryTableArn, `${props.chatHistoryTableArn}/index/*`]
      }));
    }

    // Auto-attach to API Gateway if configured
    if (props.apiGatewayConfig) {
      this.attachToApiGateway(props.apiGatewayConfig.existingApi, props.apiGatewayConfig.basePath);
    }
  }

  /**
   * Attach Management API endpoints to an existing API Gateway
   */
  public attachToApiGateway(api: apigateway.RestApi, basePath: string = 'agent'): void {
    // Clean basePath - remove leading/trailing slashes and ensure it's a valid resource path
    const cleanBasePath = basePath.replace(/^\/+|\/+$/g, '') || 'agent';
    
    // Try to get existing resource or create new one
    let agentResource: apigateway.Resource;
    try {
      // Check if resource already exists by trying to get it
      agentResource = api.root.resourceForPath(cleanBasePath);
    } catch (error) {
      // Resource doesn't exist, create it
      agentResource = api.root.addResource(cleanBasePath);
    }

    // Company Info endpoints: /agent/company/{tenantId}
    const companyResource = agentResource.addResource('company');
    const companyTenantResource = companyResource.addResource('{tenantId}');
    
    companyTenantResource.addMethod('GET', new apigateway.LambdaIntegration(this.companyInfoFunction));
    companyTenantResource.addMethod('PATCH', new apigateway.LambdaIntegration(this.companyInfoFunction));
    companyTenantResource.addCorsPreflight({
      allowOrigins: ['*'],
      allowMethods: ['GET', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    });

    // Personas endpoints: /agent/personas/{tenantId} and /agent/personas/{tenantId}/{personaId}
    const personasResource = agentResource.addResource('personas');
    const personasTenantResource = personasResource.addResource('{tenantId}');
    
    personasTenantResource.addMethod('GET', new apigateway.LambdaIntegration(this.personasFunction));
    personasTenantResource.addMethod('POST', new apigateway.LambdaIntegration(this.personasFunction));
    personasTenantResource.addCorsPreflight({
      allowOrigins: ['*'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    });

    const personasIdResource = personasTenantResource.addResource('{personaId}');
    personasIdResource.addMethod('GET', new apigateway.LambdaIntegration(this.personasFunction));
    personasIdResource.addMethod('PATCH', new apigateway.LambdaIntegration(this.personasFunction));
    personasIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(this.personasFunction));
    personasIdResource.addCorsPreflight({
      allowOrigins: ['*'],
      allowMethods: ['GET', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    });

    // Company-Persona endpoints: /agent/company-persona/{tenantId}/{personaId}
    const companyPersonaResource = agentResource.addResource('company-persona');
    const companyPersonaTenantResource = companyPersonaResource.addResource('{tenantId}');
    const companyPersonaIdResource = companyPersonaTenantResource.addResource('{personaId}');
    
    companyPersonaIdResource.addMethod('GET', new apigateway.LambdaIntegration(this.companyPersonaFunction));
    companyPersonaIdResource.addCorsPreflight({
      allowOrigins: ['*'],
      allowMethods: ['GET', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    });
  }

  /**
   * Grant a Lambda function permission to send messages to the release queue
   */
  public grantSendToQueue(lambdaFunction: lambda.IFunction): void {
    this.releaseQueue.grantSendMessages(lambdaFunction);
  }

  /**
   * @deprecated Use attachToApiGateway() instead. This method will be removed in a future version.
   */
  public grantApiGatewayInvoke(role: iam.IRole): void {
    console.warn('grantApiGatewayInvoke() is deprecated. Use attachToApiGateway() for automatic integration.');
    
    this.companyInfoFunction.grantInvoke(role);
    this.personasFunction.grantInvoke(role);
    this.companyPersonaFunction.grantInvoke(role);
  }

  private findReleaseRouterPackagePath(): string {
    try {
      // Try to resolve the package in the consuming application
      const packageJsonPath = require.resolve('@toldyaonce/kx-release-router/package.json');
      return path.dirname(packageJsonPath);
    } catch (error) {
      // Fallback for development - look for the package in the monorepo
      const fallbackPath = path.resolve(__dirname, '../../../release-router');
      if (require('fs').existsSync(fallbackPath)) {
        return fallbackPath;
      }
      throw new Error(`Cannot find @toldyaonce/kx-release-router package. Please ensure it's installed.`);
    }
  }

  private findRuntimePackagePath(): string {
    try {
      // Try to resolve the package in the consuming application
      const packageJsonPath = require.resolve('@toldyaonce/kx-langchain-agent-runtime/package.json');
      return path.dirname(packageJsonPath);
    } catch (error) {
      // Fallback for development - look for the package in the monorepo
      const fallbackPath = path.resolve(__dirname, '../../../runtime');
      if (require('fs').existsSync(fallbackPath)) {
        return fallbackPath;
      }
      throw new Error(`Cannot find @toldyaonce/kx-langchain-agent-runtime package. Please ensure it's installed.`);
    }
  }
}

/**
 * DelayedRepliesStack - Standalone Stack version (for backward compatibility)
 * @deprecated Use DelayedReplies construct within your existing stack instead to avoid cross-stack reference issues
 */
export class DelayedRepliesStack extends Stack {
  public readonly delayedReplies: DelayedReplies;
  
  // Expose individual resources for backward compatibility
  public readonly releaseQueue: sqs.Queue;
  public readonly releaseRouterFunction: lambdaNodejs.NodejsFunction;
  public readonly companyInfoTable: dynamodb.Table;
  public readonly personasTable: dynamodb.Table;
  public readonly companyInfoFunction: lambdaNodejs.NodejsFunction;
  public readonly personasFunction: lambdaNodejs.NodejsFunction;
  public readonly companyPersonaFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: DelayedRepliesStackProps = {}) {
    super(scope, id, props);

    // Create the DelayedReplies construct
    this.delayedReplies = new DelayedReplies(this, 'DelayedReplies', {
      eventBusName: props.eventBusName,
      existingAgentFunction: props.existingAgentFunction,
      apiGatewayConfig: props.apiGatewayConfig,
    });

    // Expose resources for backward compatibility
    this.releaseQueue = this.delayedReplies.releaseQueue;
    this.releaseRouterFunction = this.delayedReplies.releaseRouterFunction;
    this.companyInfoTable = this.delayedReplies.companyInfoTable;
    this.personasTable = this.delayedReplies.personasTable;
    this.companyInfoFunction = this.delayedReplies.companyInfoFunction;
    this.personasFunction = this.delayedReplies.personasFunction;
    this.companyPersonaFunction = this.delayedReplies.companyPersonaFunction;

    // Export values for integration
    new CfnOutput(this, "ReplyReleaseQueueUrl", {
      value: this.releaseQueue.queueUrl,
      description: "URL of the reply release queue",
      exportName: `${id}-ReplyReleaseQueueUrl`
    });

    new CfnOutput(this, "ReplyReleaseQueueArn", {
      value: this.releaseQueue.queueArn,
      description: "ARN of the reply release queue",
      exportName: `${id}-ReplyReleaseQueueArn`
    });

    new CfnOutput(this, "ReleaseRouterFunctionArn", {
      value: this.releaseRouterFunction.functionArn,
      description: "ARN of the release router function",
      exportName: `${id}-ReleaseRouterFunctionArn`
    });

    new CfnOutput(this, "CompanyInfoTableName", {
      value: this.companyInfoTable.tableName,
      description: "Name of the company info table",
      exportName: `${id}-CompanyInfoTableName`
    });

    new CfnOutput(this, "PersonasTableName", {
      value: this.personasTable.tableName,
      description: "Name of the personas table",
      exportName: `${id}-PersonasTableName`
    });

    new CfnOutput(this, "CompanyInfoFunctionArn", {
      value: this.companyInfoFunction.functionArn,
      description: "ARN of the company info function",
      exportName: `${id}-CompanyInfoFunctionArn`
    });

    new CfnOutput(this, "PersonasFunctionArn", {
      value: this.personasFunction.functionArn,
      description: "ARN of the personas function",
      exportName: `${id}-PersonasFunctionArn`
    });

    new CfnOutput(this, "CompanyPersonaFunctionArn", {
      value: this.companyPersonaFunction.functionArn,
      description: "ARN of the company persona function",
      exportName: `${id}-CompanyPersonaFunctionArn`
    });
  }

  /**
   * Grant a Lambda function permission to send messages to the release queue
   */
  public grantSendToQueue(lambdaFunction: lambda.IFunction): void {
    this.delayedReplies.grantSendToQueue(lambdaFunction);
  }

  /**
   * Attach Management API endpoints to an existing API Gateway
   */
  public attachToApiGateway(api: apigateway.RestApi, basePath?: string): void {
    this.delayedReplies.attachToApiGateway(api, basePath);
  }

  /**
   * @deprecated Use attachToApiGateway() instead. This method will be removed in a future version.
   */
  public grantApiGatewayInvoke(role: iam.IRole): void {
    this.delayedReplies.grantApiGatewayInvoke(role);
  }
}