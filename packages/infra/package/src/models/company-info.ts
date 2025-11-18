// Note: These decorators would come from @toldyaonce/kx-aws-utils when available
// For now, using placeholder decorators
const Table = (options: any) => (target: any) => target;
const Column = (options: any) => (target: any, propertyKey: string) => {};
const PrimaryKey = () => (target: any, propertyKey: string) => {};
const StringColumn = (options: any) => (target: any, propertyKey: string) => {};

export interface Intent {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  patterns: string[];
  priority: 'high' | 'medium' | 'low';
  response: {
    type: 'template' | 'operational' | 'persona_handled' | 'conversational';
    template: string;
    followUp: string[];
  };
  actions: string[];
}

export interface IntentCapturing {
  enabled: boolean;
  intents: Intent[];
  fallbackIntent: {
    id: string;
    name: string;
    description: string;
    response: {
      type: string;
      template: string;
    };
    actions: string[];
  };
  confidence: {
    threshold: number;
    multipleIntentHandling: string;
  };
}

@Table({ name: 'company_info', primaryKey: 'tenantId' })
export class CompanyInfo {
  @PrimaryKey()
  tenantId!: string;

  @StringColumn({ length: 200 })
  name!: string;

  @StringColumn({ length: 100 })
  industry!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text' })
  products!: string;

  @Column({ type: 'text' })
  benefits!: string;

  @Column({ type: 'text' })
  targetCustomers!: string;

  @Column({ type: 'text' })
  differentiators!: string;

  // Company-level intent configuration
  @Column({ type: 'jsonb' })
  intentCapturing!: IntentCapturing;

  @Column({ type: 'datetime' })
  createdAt!: Date;

  @Column({ type: 'datetime' })
  updatedAt!: Date;
}
