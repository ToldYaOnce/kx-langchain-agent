import { Construct } from 'constructs';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
// Note: These would come from @toldyaonce/kx-aws-utils when available
// For now, using placeholder implementations
const attachServiceToApiGateway = (scope: any, api: any, serviceName: string, servicePath: string, options?: any) => {
  console.warn(`attachServiceToApiGateway placeholder called for ${serviceName} - requires @toldyaonce/kx-aws-utils`);
};

const createDynamoTable = (scope: any, id: string, props: any): dynamodb.Table => {
  console.warn(`createDynamoTable placeholder called for ${id} - requires @toldyaonce/kx-aws-utils`);
  // Create a real DynamoDB table as fallback
  return new dynamodb.Table(scope, id, {
    tableName: props.tableName,
    partitionKey: { name: props.partitionKey, type: dynamodb.AttributeType.STRING },
    sortKey: props.sortKey ? { name: props.sortKey, type: dynamodb.AttributeType.STRING } : undefined,
    billingMode: props.billingMode || dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: props.removalPolicy || RemovalPolicy.RETAIN,
    pointInTimeRecovery: props.pointInTimeRecovery !== false,
  });
};
import { RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';

export interface ManagementApiProps {
  /**
   * Name for the API Gateway
   * @default 'KxGenManagementApi'
   */
  apiName?: string;

  /**
   * Description for the API Gateway
   * @default 'KxGen LangChain Agent Management API'
   */
  apiDescription?: string;

  /**
   * DynamoDB table names
   */
  tableNames?: {
    companyInfo?: string;
    personas?: string;
  };

  /**
   * DynamoDB table configuration
   */
  tableConfig?: {
    billingMode?: dynamodb.BillingMode;
    removalPolicy?: RemovalPolicy;
    pointInTimeRecovery?: boolean;
  };

  /**
   * Path to the runtime package (for Lambda handlers)
   * @default '../runtime'
   */
  runtimePackagePath?: string;
}

export class ManagementApi extends Construct {
  public readonly api: RestApi;
  public readonly companyInfoTable: dynamodb.Table;
  public readonly personasTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ManagementApiProps = {}) {
    super(scope, id);

    const runtimePackagePath = props.runtimePackagePath || path.join(__dirname, '../../../runtime');
    
    // Create API Gateway
    this.api = new RestApi(this, 'ManagementApi', {
      restApiName: props.apiName || 'KxGenManagementApi',
      description: props.apiDescription || 'KxGen LangChain Agent Management API',
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'], // Configure appropriately for production
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Create DynamoDB tables
    this.companyInfoTable = createDynamoTable(this, 'CompanyInfoTable', {
      tableName: props.tableNames?.companyInfo || 'kxgen-company-info',
      partitionKey: 'tenantId',
      billingMode: props.tableConfig?.billingMode || dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.tableConfig?.removalPolicy || RemovalPolicy.RETAIN,
      pointInTimeRecovery: props.tableConfig?.pointInTimeRecovery !== false,
    });

    this.personasTable = createDynamoTable(this, 'PersonasTable', {
      tableName: props.tableNames?.personas || 'kxgen-personas',
      partitionKey: 'tenantId',
      sortKey: 'personaId',
      billingMode: props.tableConfig?.billingMode || dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: props.tableConfig?.removalPolicy || RemovalPolicy.RETAIN,
      pointInTimeRecovery: props.tableConfig?.pointInTimeRecovery !== false,
    });

    // Attach services to API Gateway using the decorator pattern
    try {
      // Company Info Service
      attachServiceToApiGateway(
        this,
        this.api,
        'CompanyInfoService', // Service class name
        path.join(runtimePackagePath, 'src/services/company-info-service.ts'),
        {
          environment: {
            COMPANY_INFO_TABLE_NAME: this.companyInfoTable.tableName,
            PERSONAS_TABLE_NAME: this.personasTable.tableName,
          },
        }
      );

      // Personas Service
      attachServiceToApiGateway(
        this,
        this.api,
        'PersonasService',
        path.join(runtimePackagePath, 'src/services/personas-service.ts'),
        {
          environment: {
            COMPANY_INFO_TABLE_NAME: this.companyInfoTable.tableName,
            PERSONAS_TABLE_NAME: this.personasTable.tableName,
          },
        }
      );

      // Company Persona Service (Aggregated)
      attachServiceToApiGateway(
        this,
        this.api,
        'CompanyPersonaService',
        path.join(runtimePackagePath, 'src/services/company-persona-service.ts'),
        {
          environment: {
            COMPANY_INFO_TABLE_NAME: this.companyInfoTable.tableName,
            PERSONAS_TABLE_NAME: this.personasTable.tableName,
          },
        }
      );

    } catch (error) {
      console.warn('Failed to attach services to API Gateway:', error);
      console.warn('This may be expected if @toldyaonce/kx-aws-utils is not available');
    }
  }

  /**
   * Get the API Gateway URL
   */
  public getApiUrl(): string {
    return this.api.url;
  }

  /**
   * Get table names for use in other constructs
   */
  public getTableNames(): { companyInfo: string; personas: string } {
    return {
      companyInfo: this.companyInfoTable.tableName,
      personas: this.personasTable.tableName,
    };
  }

  /**
   * Get table ARNs for IAM permissions
   */
  public getTableArns(): string[] {
    return [
      this.companyInfoTable.tableArn,
      this.personasTable.tableArn,
    ];
  }
}
