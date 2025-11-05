import { AgentPersona } from '../config/personas';
import { type CompanyInfo } from './persona-service.js';
import { OperationalService } from './operational-service.js';

export interface IntentTrigger {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  patterns: string[];
  priority: 'high' | 'medium' | 'low';
  response: {
    type: 'template' | 'conversational';
    template: string;
    followUp?: string[];
  };
  actions: string[];
}

export interface IntentCapturing {
  enabled: boolean;
  intents: IntentTrigger[];
  fallbackIntent: {
    id: string;
    name: string;
    description: string;
    response: {
      type: 'template' | 'conversational';
      template: string;
    };
    actions: string[];
  };
  confidence: {
    threshold: number;
    multipleIntentHandling: 'highest_confidence' | 'all' | 'first_match';
  };
}

export interface IntentMatch {
  intent: IntentTrigger;
  confidence: number;
  matchedTriggers: string[];
  matchedPatterns: string[];
  response: string;
  followUp?: string[];
  actions: string[];
}

export interface IntentAnalytics {
  intentId: string;
  tenantId: string;
  userId: string;
  message: string;
  confidence: number;
  timestamp: string;
  sessionId?: string;
  channel?: string;
}

export class IntentService {
  private analytics: IntentAnalytics[] = [];
  private operationalService: OperationalService;

  constructor() {
    this.operationalService = new OperationalService();
  }

  /**
   * Detects user intent from a message using the persona's intent configuration
   */
  public async detectIntent(
    message: string,
    persona: AgentPersona,
    companyInfo: CompanyInfo,
    context?: {
      tenantId?: string;
      userId?: string;
      sessionId?: string;
      channel?: string;
    }
  ): Promise<IntentMatch | null> {
    if (!persona.intentCapturing?.enabled) {
      return null;
    }

    const { intents, confidence, fallbackIntent } = persona.intentCapturing;
    const normalizedMessage = message.toLowerCase().trim();
    
    const matches: Array<{ intent: IntentTrigger; confidence: number; matchedTriggers: string[]; matchedPatterns: string[] }> = [];

    // Check each intent for matches
    for (const intent of intents) {
      const matchedTriggers: string[] = [];
      const matchedPatterns: string[] = [];
      let score = 0;

      // Check trigger words (whole word matching to avoid false positives)
      for (const trigger of intent.triggers) {
        const triggerLower = trigger.toLowerCase();
        // Use word boundaries to match whole words/phrases only
        const regex = new RegExp(`\\b${triggerLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(normalizedMessage)) {
          matchedTriggers.push(trigger);
          score += 0.3; // Base score for trigger match
        }
      }

      // Check patterns (more sophisticated matching)
      for (const pattern of intent.patterns) {
        if (normalizedMessage.includes(pattern.toLowerCase())) {
          matchedPatterns.push(pattern);
          score += 0.5; // Higher score for pattern match
        }
      }

      // Boost score based on priority
      if (intent.priority === 'high') {
        score *= 1.2;
      } else if (intent.priority === 'low') {
        score *= 0.8;
      }

      // Normalize confidence score (0-1)
      const normalizedConfidence = Math.min(score, 1.0);

      if (normalizedConfidence >= confidence.threshold) {
        matches.push({
          intent,
          confidence: normalizedConfidence,
          matchedTriggers,
          matchedPatterns
        });
      }
    }

    // Handle multiple matches based on configuration
    let selectedMatch: typeof matches[0] | null = null;

    if (matches.length === 0) {
      // Use fallback intent
      const response = this.substituteTemplate(fallbackIntent.response.template, companyInfo);
      
      if (context) {
        this.trackIntent({
          intentId: fallbackIntent.id,
          tenantId: context.tenantId || 'unknown',
          userId: context.userId || 'unknown',
          message,
          confidence: 0.5,
          timestamp: new Date().toISOString(),
          sessionId: context.sessionId,
          channel: context.channel
        });
      }

      return {
        intent: {
          id: fallbackIntent.id,
          name: fallbackIntent.name,
          description: fallbackIntent.description,
          triggers: [],
          patterns: [],
          priority: 'medium',
          response: fallbackIntent.response,
          actions: fallbackIntent.actions
        } as IntentTrigger,
        confidence: 0.5,
        matchedTriggers: [],
        matchedPatterns: [],
        response,
        actions: fallbackIntent.actions
      };
    }

    // Select match based on handling strategy
    switch (confidence.multipleIntentHandling) {
      case 'highest_confidence':
        selectedMatch = matches.reduce((prev, current) => 
          current.confidence > prev.confidence ? current : prev
        );
        break;
      case 'first_match':
        selectedMatch = matches[0];
        break;
      case 'all':
        // For now, just return the highest confidence one
        // In the future, this could return multiple intents
        selectedMatch = matches.reduce((prev, current) => 
          current.confidence > prev.confidence ? current : prev
        );
        break;
    }

    if (!selectedMatch) {
      return null;
    }

    // Generate response with template substitution and operational data
    const response = await this.generateResponse(selectedMatch.intent, companyInfo, message);
    const followUp = selectedMatch.intent.response.followUp?.map(f => 
      this.substituteTemplate(f, companyInfo)
    );

    // Track analytics
    if (context) {
      this.trackIntent({
        intentId: selectedMatch.intent.id,
        tenantId: context.tenantId || 'unknown',
        userId: context.userId || 'unknown',
        message,
        confidence: selectedMatch.confidence,
        timestamp: new Date().toISOString(),
        sessionId: context.sessionId,
        channel: context.channel
      });
    }

    return {
      intent: selectedMatch.intent,
      confidence: selectedMatch.confidence,
      matchedTriggers: selectedMatch.matchedTriggers,
      matchedPatterns: selectedMatch.matchedPatterns,
      response,
      followUp,
      actions: selectedMatch.intent.actions
    };
  }

  /**
   * Generate response based on intent type (template or operational)
   */
  private async generateResponse(intent: IntentTrigger, companyInfo: CompanyInfo, originalMessage: string): Promise<string> {
    const responseType = (intent.response as any).type || 'template';
    
    if (responseType === 'operational') {
      return this.generateOperationalResponse(intent, companyInfo, originalMessage);
    }
    
    if (responseType === 'persona_handled') {
      // Return empty string - let the persona handle the response
      return '';
    }
    
    // Default template response
    return this.substituteTemplate(intent.response.template, companyInfo);
  }

  /**
   * Generate operational response with live data
   */
  private async generateOperationalResponse(intent: IntentTrigger, companyInfo: CompanyInfo, originalMessage: string): Promise<string> {
    let response = this.substituteTemplate(intent.response.template, companyInfo);
    
    switch (intent.id) {
      case 'current_promotions':
        const promotions = this.operationalService.getActivePromotions();
        if (promotions.length > 0) {
          response += '\n\n🎉 Current Active Promotions:\n';
          promotions.forEach(promo => {
            response += `\n• **${promo.name}**: ${promo.description}`;
            response += `\n  Valid until ${new Date(promo.end_date).toLocaleDateString()}`;
            if (promo.benefits.length > 0) {
              response += `\n  Benefits: ${promo.benefits.join(', ')}`;
            }
          });
        } else {
          response += '\n\nWe don\'t have any special promotions running right now, but our regular pricing is still amazing! Our Classic membership is just $10/month and Black Card is $22.99/month.';
        }
        break;
        
      case 'operational_hours':
        const hoursInfo = this.operationalService.getCurrentHours();
        response += `\n\n🕐 Current Status: ${hoursInfo.isOpen ? '✅ We\'re OPEN!' : '❌ Currently closed'}`;
        if (hoursInfo.hours) {
          response += `\n📅 Today's Hours: ${this.formatTime(hoursInfo.hours.open)} - ${this.formatTime(hoursInfo.hours.close)}`;
        }
        response += `\n⏰ ${hoursInfo.nextChange}`;
        if (hoursInfo.specialNote) {
          response += `\n💡 ${hoursInfo.specialNote}`;
        }
        break;
        
      case 'pricing_information':
        const pricingInfo = this.operationalService.getCurrentPricing();
        response += '\n\n💰 Current Membership Pricing:\n';
        pricingInfo.memberships.forEach(membership => {
          response += `\n**${membership.name}** - $${membership.price}/${membership.billing}`;
          if (membership.popular) response += ' ⭐ *Most Popular*';
          response += `\n  Key Features: ${membership.features.slice(0, 2).join(', ')}`;
          if (membership.features.length > 2) {
            response += ` + ${membership.features.length - 2} more benefits`;
          }
        });
        
        // Add fees information
        if (pricingInfo.fees && pricingInfo.fees.length > 0) {
          response += '\n\n📋 Additional Fees:';
          pricingInfo.fees.forEach(fee => {
            response += `\n• ${fee.name}: $${fee.amount} (${fee.frequency})`;
          });
        }
        
        // Mention promotions if available
        const currentPromos = pricingInfo.activePromotions;
        if (currentPromos.length > 0) {
          response += '\n\n🎉 Good news! We have special promotions running that could save you money!';
        }
        break;
        
      case 'membership_comparison':
        const pricing = this.operationalService.getCurrentPricing();
        response += '\n\n💳 Here are our membership options:\n';
        pricing.memberships.forEach(membership => {
          response += `\n**${membership.name}** - $${membership.price}/${membership.billing}`;
          if (membership.popular) response += ' ⭐ *Most Popular*';
          response += `\n  Features: ${membership.features.slice(0, 3).join(', ')}`;
          if (membership.features.length > 3) {
            response += ` and ${membership.features.length - 3} more!`;
          }
        });
        
        const activePromos = pricing.activePromotions;
        if (activePromos.length > 0) {
          response += '\n\n🎉 Plus, we have current promotions that can save you money!';
        }
        break;
        
      default:
        // Fallback to template response
        break;
    }
    
    return response;
  }

  /**
   * Format time for display
   */
  private formatTime(time: string): string {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  /**
   * Substitutes template variables with company information
   */
  private substituteTemplate(template: string, companyInfo: CompanyInfo): string {
    return template
      .replace(/\{\{companyName\}\}/g, companyInfo.name || 'our company')
      .replace(/\{\{companyIndustry\}\}/g, companyInfo.industry || 'our industry')
      .replace(/\{\{companyDescription\}\}/g, companyInfo.description || 'our services')
      .replace(/\{\{companyProducts\}\}/g, companyInfo.products || 'our products')
      .replace(/\{\{companyBenefits\}\}/g, companyInfo.benefits || 'our benefits')
      .replace(/\{\{companyTargetCustomers\}\}/g, companyInfo.targetCustomers || 'our customers')
      .replace(/\{\{companyDifferentiators\}\}/g, companyInfo.differentiators || 'what makes us special');
  }

  /**
   * Tracks intent analytics for reporting and optimization
   */
  private trackIntent(analytics: IntentAnalytics): void {
    this.analytics.push(analytics);
    
    // In a real implementation, this would send to analytics service
    console.log('Intent tracked:', {
      intent: analytics.intentId,
      confidence: analytics.confidence,
      user: analytics.userId,
      channel: analytics.channel
    });
  }

  /**
   * Gets intent analytics for a tenant
   */
  public getAnalytics(tenantId: string, options?: {
    startDate?: string;
    endDate?: string;
    intentId?: string;
    channel?: string;
  }): IntentAnalytics[] {
    let filtered = this.analytics.filter(a => a.tenantId === tenantId);

    if (options?.startDate) {
      filtered = filtered.filter(a => a.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      filtered = filtered.filter(a => a.timestamp <= options.endDate!);
    }
    if (options?.intentId) {
      filtered = filtered.filter(a => a.intentId === options.intentId!);
    }
    if (options?.channel) {
      filtered = filtered.filter(a => a.channel === options.channel!);
    }

    return filtered;
  }

  /**
   * Gets intent statistics for optimization
   */
  public getIntentStats(tenantId: string): Record<string, {
    count: number;
    averageConfidence: number;
    channels: Record<string, number>;
  }> {
    const analytics = this.getAnalytics(tenantId);
    const stats: Record<string, {
      count: number;
      averageConfidence: number;
      channels: Record<string, number>;
    }> = {};

    for (const item of analytics) {
      if (!stats[item.intentId]) {
        stats[item.intentId] = {
          count: 0,
          averageConfidence: 0,
          channels: {}
        };
      }

      stats[item.intentId].count++;
      stats[item.intentId].averageConfidence = 
        (stats[item.intentId].averageConfidence * (stats[item.intentId].count - 1) + item.confidence) / 
        stats[item.intentId].count;

      if (item.channel) {
        stats[item.intentId].channels[item.channel] = 
          (stats[item.intentId].channels[item.channel] || 0) + 1;
      }
    }

    return stats;
  }
}
