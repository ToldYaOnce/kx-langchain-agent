"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentService = void 0;
const operational_service_js_1 = require("./operational-service.js");
class IntentService {
    constructor() {
        this.analytics = [];
        this.operationalService = new operational_service_js_1.OperationalService();
    }
    /**
     * Detects user intent from a message using the persona's intent configuration
     */
    async detectIntent(message, persona, companyInfo, context) {
        if (!persona.intentCapturing?.enabled) {
            return null;
        }
        const { intents, confidence, fallbackIntent } = persona.intentCapturing;
        const normalizedMessage = message.toLowerCase().trim();
        const matches = [];
        // Check each intent for matches
        for (const intent of intents) {
            const matchedTriggers = [];
            const matchedPatterns = [];
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
            }
            else if (intent.priority === 'low') {
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
        let selectedMatch = null;
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
                },
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
                selectedMatch = matches.reduce((prev, current) => current.confidence > prev.confidence ? current : prev);
                break;
            case 'first_match':
                selectedMatch = matches[0];
                break;
            case 'all':
                // For now, just return the highest confidence one
                // In the future, this could return multiple intents
                selectedMatch = matches.reduce((prev, current) => current.confidence > prev.confidence ? current : prev);
                break;
        }
        if (!selectedMatch) {
            return null;
        }
        // Generate response with template substitution and operational data
        const response = await this.generateResponse(selectedMatch.intent, companyInfo, message);
        const followUp = selectedMatch.intent.response.followUp?.map(f => this.substituteTemplate(f, companyInfo));
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
    async generateResponse(intent, companyInfo, originalMessage) {
        const responseType = intent.response.type || 'template';
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
    async generateOperationalResponse(intent, companyInfo, originalMessage) {
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
                }
                else {
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
                    if (membership.popular)
                        response += ' ⭐ *Most Popular*';
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
                    if (membership.popular)
                        response += ' ⭐ *Most Popular*';
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
    formatTime(time) {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
        return `${displayHour}:${minutes} ${ampm}`;
    }
    /**
     * Substitutes template variables with company information
     */
    substituteTemplate(template, companyInfo) {
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
    trackIntent(analytics) {
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
    getAnalytics(tenantId, options) {
        let filtered = this.analytics.filter(a => a.tenantId === tenantId);
        if (options?.startDate) {
            filtered = filtered.filter(a => a.timestamp >= options.startDate);
        }
        if (options?.endDate) {
            filtered = filtered.filter(a => a.timestamp <= options.endDate);
        }
        if (options?.intentId) {
            filtered = filtered.filter(a => a.intentId === options.intentId);
        }
        if (options?.channel) {
            filtered = filtered.filter(a => a.channel === options.channel);
        }
        return filtered;
    }
    /**
     * Gets intent statistics for optimization
     */
    getIntentStats(tenantId) {
        const analytics = this.getAnalytics(tenantId);
        const stats = {};
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
exports.IntentService = IntentService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZW50LXNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2ludGVudC1zZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUVBLHFFQUE4RDtBQXlEOUQsTUFBYSxhQUFhO0lBSXhCO1FBSFEsY0FBUyxHQUFzQixFQUFFLENBQUM7UUFJeEMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksMkNBQWtCLEVBQUUsQ0FBQztJQUNyRCxDQUFDO0lBRUQ7O09BRUc7SUFDSSxLQUFLLENBQUMsWUFBWSxDQUN2QixPQUFlLEVBQ2YsT0FBcUIsRUFDckIsV0FBd0IsRUFDeEIsT0FLQztRQUVELElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLE9BQU8sRUFBRSxDQUFDO1lBQ3RDLE9BQU8sSUFBSSxDQUFDO1FBQ2QsQ0FBQztRQUVELE1BQU0sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUM7UUFDeEUsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFdkQsTUFBTSxPQUFPLEdBQStHLEVBQUUsQ0FBQztRQUUvSCxnQ0FBZ0M7UUFDaEMsS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUM3QixNQUFNLGVBQWUsR0FBYSxFQUFFLENBQUM7WUFDckMsTUFBTSxlQUFlLEdBQWEsRUFBRSxDQUFDO1lBQ3JDLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztZQUVkLHFFQUFxRTtZQUNyRSxLQUFLLE1BQU0sT0FBTyxJQUFJLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDdEMsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUMzQyx3REFBd0Q7Z0JBQ3hELE1BQU0sS0FBSyxHQUFHLElBQUksTUFBTSxDQUFDLE1BQU0sWUFBWSxDQUFDLE9BQU8s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LEVBQUUsRUFBRTtpQkFDYixDQUFDO1lBQ0osQ0FBQztZQUVELEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDN0IsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxpQkFBaUI7Z0JBQ3BDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7b0JBQzdGLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDO1lBRTdCLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUNqQixLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO29CQUN6QyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDM0QsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7Q0FDRjtBQTVYRCxzQ0E0WEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBZ2VudFBlcnNvbmEgfSBmcm9tICcuLi9jb25maWcvcGVyc29uYXMnO1xuaW1wb3J0IHsgdHlwZSBDb21wYW55SW5mbyB9IGZyb20gJy4vcGVyc29uYS1zZXJ2aWNlLmpzJztcbmltcG9ydCB7IE9wZXJhdGlvbmFsU2VydmljZSB9IGZyb20gJy4vb3BlcmF0aW9uYWwtc2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZW50VHJpZ2dlciB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgdHJpZ2dlcnM6IHN0cmluZ1tdO1xuICBwYXR0ZXJuczogc3RyaW5nW107XG4gIHByaW9yaXR5OiAnaGlnaCcgfCAnbWVkaXVtJyB8ICdsb3cnO1xuICByZXNwb25zZToge1xuICAgIHR5cGU6ICd0ZW1wbGF0ZScgfCAnY29udmVyc2F0aW9uYWwnO1xuICAgIHRlbXBsYXRlOiBzdHJpbmc7XG4gICAgZm9sbG93VXA/OiBzdHJpbmdbXTtcbiAgfTtcbiAgYWN0aW9uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZW50Q2FwdHVyaW5nIHtcbiAgZW5hYmxlZDogYm9vbGVhbjtcbiAgaW50ZW50czogSW50ZW50VHJpZ2dlcltdO1xuICBmYWxsYmFja0ludGVudDoge1xuICAgIGlkOiBzdHJpbmc7XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gICAgcmVzcG9uc2U6IHtcbiAgICAgIHR5cGU6ICd0ZW1wbGF0ZScgfCAnY29udmVyc2F0aW9uYWwnO1xuICAgICAgdGVtcGxhdGU6IHN0cmluZztcbiAgICB9O1xuICAgIGFjdGlvbnM6IHN0cmluZ1tdO1xuICB9O1xuICBjb25maWRlbmNlOiB7XG4gICAgdGhyZXNob2xkOiBudW1iZXI7XG4gICAgbXVsdGlwbGVJbnRlbnRIYW5kbGluZzogJ2hpZ2hlc3RfY29uZmlkZW5jZScgfCAnYWxsJyB8ICdmaXJzdF9tYXRjaCc7XG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZW50TWF0Y2gge1xuICBpbnRlbnQ6IEludGVudFRyaWdnZXI7XG4gIGNvbmZpZGVuY2U6IG51bWJlcjtcbiAgbWF0Y2hlZFRyaWdnZXJzOiBzdHJpbmdbXTtcbiAgbWF0Y2hlZFBhdHRlcm5zOiBzdHJpbmdbXTtcbiAgcmVzcG9uc2U6IHN0cmluZztcbiAgZm9sbG93VXA/OiBzdHJpbmdbXTtcbiAgYWN0aW9uczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW50ZW50QW5hbHl0aWNzIHtcbiAgaW50ZW50SWQ6IHN0cmluZztcbiAgdGVuYW50SWQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIG1lc3NhZ2U6IHN0cmluZztcbiAgY29uZmlkZW5jZTogbnVtYmVyO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgc2Vzc2lvbklkPzogc3RyaW5nO1xuICBjaGFubmVsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgSW50ZW50U2VydmljZSB7XG4gIHByaXZhdGUgYW5hbHl0aWNzOiBJbnRlbnRBbmFseXRpY3NbXSA9IFtdO1xuICBwcml2YXRlIG9wZXJhdGlvbmFsU2VydmljZTogT3BlcmF0aW9uYWxTZXJ2aWNlO1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMub3BlcmF0aW9uYWxTZXJ2aWNlID0gbmV3IE9wZXJhdGlvbmFsU2VydmljZSgpO1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVjdHMgdXNlciBpbnRlbnQgZnJvbSBhIG1lc3NhZ2UgdXNpbmcgdGhlIHBlcnNvbmEncyBpbnRlbnQgY29uZmlndXJhdGlvblxuICAgKi9cbiAgcHVibGljIGFzeW5jIGRldGVjdEludGVudChcbiAgICBtZXNzYWdlOiBzdHJpbmcsXG4gICAgcGVyc29uYTogQWdlbnRQZXJzb25hLFxuICAgIGNvbXBhbnlJbmZvOiBDb21wYW55SW5mbyxcbiAgICBjb250ZXh0Pzoge1xuICAgICAgdGVuYW50SWQ/OiBzdHJpbmc7XG4gICAgICB1c2VySWQ/OiBzdHJpbmc7XG4gICAgICBzZXNzaW9uSWQ/OiBzdHJpbmc7XG4gICAgICBjaGFubmVsPzogc3RyaW5nO1xuICAgIH1cbiAgKTogUHJvbWlzZTxJbnRlbnRNYXRjaCB8IG51bGw+IHtcbiAgICBpZiAoIXBlcnNvbmEuaW50ZW50Q2FwdHVyaW5nPy5lbmFibGVkKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCB7IGludGVudHMsIGNvbmZpZGVuY2UsIGZhbGxiYWNrSW50ZW50IH0gPSBwZXJzb25hLmludGVudENhcHR1cmluZztcbiAgICBjb25zdCBub3JtYWxpemVkTWVzc2FnZSA9IG1lc3NhZ2UudG9Mb3dlckNhc2UoKS50cmltKCk7XG4gICAgXG4gICAgY29uc3QgbWF0Y2hlczogQXJyYXk8eyBpbnRlbnQ6IEludGVudFRyaWdnZXI7IGNvbmZpZGVuY2U6IG51bWJlcjsgbWF0Y2hlZFRyaWdnZXJzOiBzdHJpbmdbXTsgbWF0Y2hlZFBhdHRlcm5zOiBzdHJpbmdbXSB9PiA9IFtdO1xuXG4gICAgLy8gQ2hlY2sgZWFjaCBpbnRlbnQgZm9yIG1hdGNoZXNcbiAgICBmb3IgKGNvbnN0IGludGVudCBvZiBpbnRlbnRzKSB7XG4gICAgICBjb25zdCBtYXRjaGVkVHJpZ2dlcnM6IHN0cmluZ1tdID0gW107XG4gICAgICBjb25zdCBtYXRjaGVkUGF0dGVybnM6IHN0cmluZ1tdID0gW107XG4gICAgICBsZXQgc2NvcmUgPSAwO1xuXG4gICAgICAvLyBDaGVjayB0cmlnZ2VyIHdvcmRzICh3aG9sZSB3b3JkIG1hdGNoaW5nIHRvIGF2b2lkIGZhbHNlIHBvc2l0aXZlcylcbiAgICAgIGZvciAoY29uc3QgdHJpZ2dlciBvZiBpbnRlbnQudHJpZ2dlcnMpIHtcbiAgICAgICAgY29uc3QgdHJpZ2dlckxvd2VyID0gdHJpZ2dlci50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAvLyBVc2Ugd29yZCBib3VuZGFyaWVzIHRvIG1hdGNoIHdob2xlIHdvcmRzL3BocmFzZXMgb25seVxuICAgICAgICBjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHt0cmlnZ2VyTG93ZXIucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKX1cXFxcYmAsICdpJyk7XG4gICAgICAgIGlmIChyZWdleC50ZXN0KG5vcm1hbGl6ZWRNZXNzYWdlKSkge1xuICAgICAgICAgIG1hdGNoZWRUcmlnZ2Vycy5wdXNoKHRyaWdnZXIpO1xuICAgICAgICAgIHNjb3JlICs9IDAuMzsgLy8gQmFzZSBzY29yZSBmb3IgdHJpZ2dlciBtYXRjaFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIENoZWNrIHBhdHRlcm5zIChtb3JlIHNvcGhpc3RpY2F0ZWQgbWF0Y2hpbmcpXG4gICAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgaW50ZW50LnBhdHRlcm5zKSB7XG4gICAgICAgIGlmIChub3JtYWxpemVkTWVzc2FnZS5pbmNsdWRlcyhwYXR0ZXJuLnRvTG93ZXJDYXNlKCkpKSB7XG4gICAgICAgICAgbWF0Y2hlZFBhdHRlcm5zLnB1c2gocGF0dGVybik7XG4gICAgICAgICAgc2NvcmUgKz0gMC41OyAvLyBIaWdoZXIgc2NvcmUgZm9yIHBhdHRlcm4gbWF0Y2hcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvLyBCb29zdCBzY29yZSBiYXNlZCBvbiBwcmlvcml0eVxuICAgICAgaWYgKGludGVudC5wcmlvcml0eSA9PT0gJ2hpZ2gnKSB7XG4gICAgICAgIHNjb3JlICo9IDEuMjtcbiAgICAgIH0gZWxzZSBpZiAoaW50ZW50LnByaW9yaXR5ID09PSAnbG93Jykge1xuICAgICAgICBzY29yZSAqPSAwLjg7XG4gICAgICB9XG5cbiAgICAgIC8vIE5vcm1hbGl6ZSBjb25maWRlbmNlIHNjb3JlICgwLTEpXG4gICAgICBjb25zdCBub3JtYWxpemVkQ29uZmlkZW5jZSA9IE1hdGgubWluKHNjb3JlLCAxLjApO1xuXG4gICAgICBpZiAobm9ybWFsaXplZENvbmZpZGVuY2UgPj0gY29uZmlkZW5jZS50aHJlc2hvbGQpIHtcbiAgICAgICAgbWF0Y2hlcy5wdXNoKHtcbiAgICAgICAgICBpbnRlbnQsXG4gICAgICAgICAgY29uZmlkZW5jZTogbm9ybWFsaXplZENvbmZpZGVuY2UsXG4gICAgICAgICAgbWF0Y2hlZFRyaWdnZXJzLFxuICAgICAgICAgIG1hdGNoZWRQYXR0ZXJuc1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgbXVsdGlwbGUgbWF0Y2hlcyBiYXNlZCBvbiBjb25maWd1cmF0aW9uXG4gICAgbGV0IHNlbGVjdGVkTWF0Y2g6IHR5cGVvZiBtYXRjaGVzWzBdIHwgbnVsbCA9IG51bGw7XG5cbiAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIC8vIFVzZSBmYWxsYmFjayBpbnRlbnRcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gdGhpcy5zdWJzdGl0dXRlVGVtcGxhdGUoZmFsbGJhY2tJbnRlbnQucmVzcG9uc2UudGVtcGxhdGUsIGNvbXBhbnlJbmZvKTtcbiAgICAgIFxuICAgICAgaWYgKGNvbnRleHQpIHtcbiAgICAgICAgdGhpcy50cmFja0ludGVudCh7XG4gICAgICAgICAgaW50ZW50SWQ6IGZhbGxiYWNrSW50ZW50LmlkLFxuICAgICAgICAgIHRlbmFudElkOiBjb250ZXh0LnRlbmFudElkIHx8ICd1bmtub3duJyxcbiAgICAgICAgICB1c2VySWQ6IGNvbnRleHQudXNlcklkIHx8ICd1bmtub3duJyxcbiAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgIGNvbmZpZGVuY2U6IDAuNSxcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuc2Vzc2lvbklkLFxuICAgICAgICAgIGNoYW5uZWw6IGNvbnRleHQuY2hhbm5lbFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaW50ZW50OiB7XG4gICAgICAgICAgaWQ6IGZhbGxiYWNrSW50ZW50LmlkLFxuICAgICAgICAgIG5hbWU6IGZhbGxiYWNrSW50ZW50Lm5hbWUsXG4gICAgICAgICAgZGVzY3JpcHRpb246IGZhbGxiYWNrSW50ZW50LmRlc2NyaXB0aW9uLFxuICAgICAgICAgIHRyaWdnZXJzOiBbXSxcbiAgICAgICAgICBwYXR0ZXJuczogW10sXG4gICAgICAgICAgcHJpb3JpdHk6ICdtZWRpdW0nLFxuICAgICAgICAgIHJlc3BvbnNlOiBmYWxsYmFja0ludGVudC5yZXNwb25zZSxcbiAgICAgICAgICBhY3Rpb25zOiBmYWxsYmFja0ludGVudC5hY3Rpb25zXG4gICAgICAgIH0gYXMgSW50ZW50VHJpZ2dlcixcbiAgICAgICAgY29uZmlkZW5jZTogMC41LFxuICAgICAgICBtYXRjaGVkVHJpZ2dlcnM6IFtdLFxuICAgICAgICBtYXRjaGVkUGF0dGVybnM6IFtdLFxuICAgICAgICByZXNwb25zZSxcbiAgICAgICAgYWN0aW9uczogZmFsbGJhY2tJbnRlbnQuYWN0aW9uc1xuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBTZWxlY3QgbWF0Y2ggYmFzZWQgb24gaGFuZGxpbmcgc3RyYXRlZ3lcbiAgICBzd2l0Y2ggKGNvbmZpZGVuY2UubXVsdGlwbGVJbnRlbnRIYW5kbGluZykge1xuICAgICAgY2FzZSAnaGlnaGVzdF9jb25maWRlbmNlJzpcbiAgICAgICAgc2VsZWN0ZWRNYXRjaCA9IG1hdGNoZXMucmVkdWNlKChwcmV2LCBjdXJyZW50KSA9PiBcbiAgICAgICAgICBjdXJyZW50LmNvbmZpZGVuY2UgPiBwcmV2LmNvbmZpZGVuY2UgPyBjdXJyZW50IDogcHJldlxuICAgICAgICApO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2ZpcnN0X21hdGNoJzpcbiAgICAgICAgc2VsZWN0ZWRNYXRjaCA9IG1hdGNoZXNbMF07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnYWxsJzpcbiAgICAgICAgLy8gRm9yIG5vdywganVzdCByZXR1cm4gdGhlIGhpZ2hlc3QgY29uZmlkZW5jZSBvbmVcbiAgICAgICAgLy8gSW4gdGhlIGZ1dHVyZSwgdGhpcyBjb3VsZCByZXR1cm4gbXVsdGlwbGUgaW50ZW50c1xuICAgICAgICBzZWxlY3RlZE1hdGNoID0gbWF0Y2hlcy5yZWR1Y2UoKHByZXYsIGN1cnJlbnQpID0+IFxuICAgICAgICAgIGN1cnJlbnQuY29uZmlkZW5jZSA+IHByZXYuY29uZmlkZW5jZSA/IGN1cnJlbnQgOiBwcmV2XG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGlmICghc2VsZWN0ZWRNYXRjaCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGUgcmVzcG9uc2Ugd2l0aCB0ZW1wbGF0ZSBzdWJzdGl0dXRpb24gYW5kIG9wZXJhdGlvbmFsIGRhdGFcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuZ2VuZXJhdGVSZXNwb25zZShzZWxlY3RlZE1hdGNoLmludGVudCwgY29tcGFueUluZm8sIG1lc3NhZ2UpO1xuICAgIGNvbnN0IGZvbGxvd1VwID0gc2VsZWN0ZWRNYXRjaC5pbnRlbnQucmVzcG9uc2UuZm9sbG93VXA/Lm1hcChmID0+IFxuICAgICAgdGhpcy5zdWJzdGl0dXRlVGVtcGxhdGUoZiwgY29tcGFueUluZm8pXG4gICAgKTtcblxuICAgIC8vIFRyYWNrIGFuYWx5dGljc1xuICAgIGlmIChjb250ZXh0KSB7XG4gICAgICB0aGlzLnRyYWNrSW50ZW50KHtcbiAgICAgICAgaW50ZW50SWQ6IHNlbGVjdGVkTWF0Y2guaW50ZW50LmlkLFxuICAgICAgICB0ZW5hbnRJZDogY29udGV4dC50ZW5hbnRJZCB8fCAndW5rbm93bicsXG4gICAgICAgIHVzZXJJZDogY29udGV4dC51c2VySWQgfHwgJ3Vua25vd24nLFxuICAgICAgICBtZXNzYWdlLFxuICAgICAgICBjb25maWRlbmNlOiBzZWxlY3RlZE1hdGNoLmNvbmZpZGVuY2UsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICBzZXNzaW9uSWQ6IGNvbnRleHQuc2Vzc2lvbklkLFxuICAgICAgICBjaGFubmVsOiBjb250ZXh0LmNoYW5uZWxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBpbnRlbnQ6IHNlbGVjdGVkTWF0Y2guaW50ZW50LFxuICAgICAgY29uZmlkZW5jZTogc2VsZWN0ZWRNYXRjaC5jb25maWRlbmNlLFxuICAgICAgbWF0Y2hlZFRyaWdnZXJzOiBzZWxlY3RlZE1hdGNoLm1hdGNoZWRUcmlnZ2VycyxcbiAgICAgIG1hdGNoZWRQYXR0ZXJuczogc2VsZWN0ZWRNYXRjaC5tYXRjaGVkUGF0dGVybnMsXG4gICAgICByZXNwb25zZSxcbiAgICAgIGZvbGxvd1VwLFxuICAgICAgYWN0aW9uczogc2VsZWN0ZWRNYXRjaC5pbnRlbnQuYWN0aW9uc1xuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGUgcmVzcG9uc2UgYmFzZWQgb24gaW50ZW50IHR5cGUgKHRlbXBsYXRlIG9yIG9wZXJhdGlvbmFsKVxuICAgKi9cbiAgcHJpdmF0ZSBhc3luYyBnZW5lcmF0ZVJlc3BvbnNlKGludGVudDogSW50ZW50VHJpZ2dlciwgY29tcGFueUluZm86IENvbXBhbnlJbmZvLCBvcmlnaW5hbE1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gICAgY29uc3QgcmVzcG9uc2VUeXBlID0gKGludGVudC5yZXNwb25zZSBhcyBhbnkpLnR5cGUgfHwgJ3RlbXBsYXRlJztcbiAgICBcbiAgICBpZiAocmVzcG9uc2VUeXBlID09PSAnb3BlcmF0aW9uYWwnKSB7XG4gICAgICByZXR1cm4gdGhpcy5nZW5lcmF0ZU9wZXJhdGlvbmFsUmVzcG9uc2UoaW50ZW50LCBjb21wYW55SW5mbywgb3JpZ2luYWxNZXNzYWdlKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKHJlc3BvbnNlVHlwZSA9PT0gJ3BlcnNvbmFfaGFuZGxlZCcpIHtcbiAgICAgIC8vIFJldHVybiBlbXB0eSBzdHJpbmcgLSBsZXQgdGhlIHBlcnNvbmEgaGFuZGxlIHRoZSByZXNwb25zZVxuICAgICAgcmV0dXJuICcnO1xuICAgIH1cbiAgICBcbiAgICAvLyBEZWZhdWx0IHRlbXBsYXRlIHJlc3BvbnNlXG4gICAgcmV0dXJuIHRoaXMuc3Vic3RpdHV0ZVRlbXBsYXRlKGludGVudC5yZXNwb25zZS50ZW1wbGF0ZSwgY29tcGFueUluZm8pO1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIG9wZXJhdGlvbmFsIHJlc3BvbnNlIHdpdGggbGl2ZSBkYXRhXG4gICAqL1xuICBwcml2YXRlIGFzeW5jIGdlbmVyYXRlT3BlcmF0aW9uYWxSZXNwb25zZShpbnRlbnQ6IEludGVudFRyaWdnZXIsIGNvbXBhbnlJbmZvOiBDb21wYW55SW5mbywgb3JpZ2luYWxNZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICAgIGxldCByZXNwb25zZSA9IHRoaXMuc3Vic3RpdHV0ZVRlbXBsYXRlKGludGVudC5yZXNwb25zZS50ZW1wbGF0ZSwgY29tcGFueUluZm8pO1xuICAgIFxuICAgIHN3aXRjaCAoaW50ZW50LmlkKSB7XG4gICAgICBjYXNlICdjdXJyZW50X3Byb21vdGlvbnMnOlxuICAgICAgICBjb25zdCBwcm9tb3Rpb25zID0gdGhpcy5vcGVyYXRpb25hbFNlcnZpY2UuZ2V0QWN0aXZlUHJvbW90aW9ucygpO1xuICAgICAgICBpZiAocHJvbW90aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgcmVzcG9uc2UgKz0gJ1xcblxcbvCfjokgQ3VycmVudCBBY3RpdmUgUHJvbW90aW9uczpcXG4nO1xuICAgICAgICAgIHByb21vdGlvbnMuZm9yRWFjaChwcm9tbyA9PiB7XG4gICAgICAgICAgICByZXNwb25zZSArPSBgXFxu4oCiICoqJHtwcm9tby5uYW1lfSoqOiAke3Byb21vLmRlc2NyaXB0aW9ufWA7XG4gICAgICAgICAgICByZXNwb25zZSArPSBgXFxuICBWYWxpZCB1bnRpbCAke25ldyBEYXRlKHByb21vLmVuZF9kYXRlKS50b0xvY2FsZURhdGVTdHJpbmcoKX1gO1xuICAgICAgICAgICAgaWYgKHByb21vLmJlbmVmaXRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgcmVzcG9uc2UgKz0gYFxcbiAgQmVuZWZpdHM6ICR7cHJvbW8uYmVuZWZpdHMuam9pbignLCAnKX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3BvbnNlICs9ICdcXG5cXG5XZSBkb25cXCd0IGhhdmUgYW55IHNwZWNpYWwgcHJvbW90aW9ucyBydW5uaW5nIHJpZ2h0IG5vdywgYnV0IG91ciByZWd1bGFyIHByaWNpbmcgaXMgc3RpbGwgYW1hemluZyEgT3VyIENsYXNzaWMgbWVtYmVyc2hpcCBpcyBqdXN0ICQxMC9tb250aCBhbmQgQmxhY2sgQ2FyZCBpcyAkMjIuOTkvbW9udGguJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgICAgXG4gICAgICBjYXNlICdvcGVyYXRpb25hbF9ob3Vycyc6XG4gICAgICAgIGNvbnN0IGhvdXJzSW5mbyA9IHRoaXMub3BlcmF0aW9uYWxTZXJ2aWNlLmdldEN1cnJlbnRIb3VycygpO1xuICAgICAgICByZXNwb25zZSArPSBgXFxuXFxu8J+VkCBDdXJyZW50IFN0YXR1czogJHtob3Vyc0luZm8uaXNPcGVuID8gJ+KchSBXZVxcJ3JlIE9QRU4hJyA6ICfinYwgQ3VycmVudGx5IGNsb3NlZCd9YDtcbiAgICAgICAgaWYgKGhvdXJzSW5mby5ob3Vycykge1xuICAgICAgICAgIHJlc3BvbnNlICs9IGBcXG7wn5OFIFRvZGF5J3MgSG91cnM6ICR7dGhpcy5mb3JtYXRUaW1lKGhvdXJzSW5mby5ob3Vycy5vcGVuKX0gLSAke3RoaXMuZm9ybWF0VGltZShob3Vyc0luZm8uaG91cnMuY2xvc2UpfWA7XG4gICAgICAgIH1cbiAgICAgICAgcmVzcG9uc2UgKz0gYFxcbuKPsCAke2hvdXJzSW5mby5uZXh0Q2hhbmdlfWA7XG4gICAgICAgIGlmIChob3Vyc0luZm8uc3BlY2lhbE5vdGUpIHtcbiAgICAgICAgICByZXNwb25zZSArPSBgXFxu8J+SoSAke2hvdXJzSW5mby5zcGVjaWFsTm90ZX1gO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBcbiAgICAgIGNhc2UgJ3ByaWNpbmdfaW5mb3JtYXRpb24nOlxuICAgICAgICBjb25zdCBwcmljaW5nSW5mbyA9IHRoaXMub3BlcmF0aW9uYWxTZXJ2aWNlLmdldEN1cnJlbnRQcmljaW5nKCk7XG4gICAgICAgIHJlc3BvbnNlICs9ICdcXG5cXG7wn5KwIEN1cnJlbnQgTWVtYmVyc2hpcCBQcmljaW5nOlxcbic7XG4gICAgICAgIHByaWNpbmdJbmZvLm1lbWJlcnNoaXBzLmZvckVhY2gobWVtYmVyc2hpcCA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UgKz0gYFxcbioqJHttZW1iZXJzaGlwLm5hbWV9KiogLSAkJHttZW1iZXJzaGlwLnByaWNlfS8ke21lbWJlcnNoaXAuYmlsbGluZ31gO1xuICAgICAgICAgIGlmIChtZW1iZXJzaGlwLnBvcHVsYXIpIHJlc3BvbnNlICs9ICcg4q2QICpNb3N0IFBvcHVsYXIqJztcbiAgICAgICAgICByZXNwb25zZSArPSBgXFxuICBLZXkgRmVhdHVyZXM6ICR7bWVtYmVyc2hpcC5mZWF0dXJlcy5zbGljZSgwLCAyKS5qb2luKCcsICcpfWA7XG4gICAgICAgICAgaWYgKG1lbWJlcnNoaXAuZmVhdHVyZXMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgcmVzcG9uc2UgKz0gYCArICR7bWVtYmVyc2hpcC5mZWF0dXJlcy5sZW5ndGggLSAyfSBtb3JlIGJlbmVmaXRzYDtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgLy8gQWRkIGZlZXMgaW5mb3JtYXRpb25cbiAgICAgICAgaWYgKHByaWNpbmdJbmZvLmZlZXMgJiYgcHJpY2luZ0luZm8uZmVlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgcmVzcG9uc2UgKz0gJ1xcblxcbvCfk4sgQWRkaXRpb25hbCBGZWVzOic7XG4gICAgICAgICAgcHJpY2luZ0luZm8uZmVlcy5mb3JFYWNoKGZlZSA9PiB7XG4gICAgICAgICAgICByZXNwb25zZSArPSBgXFxu4oCiICR7ZmVlLm5hbWV9OiAkJHtmZWUuYW1vdW50fSAoJHtmZWUuZnJlcXVlbmN5fSlgO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBNZW50aW9uIHByb21vdGlvbnMgaWYgYXZhaWxhYmxlXG4gICAgICAgIGNvbnN0IGN1cnJlbnRQcm9tb3MgPSBwcmljaW5nSW5mby5hY3RpdmVQcm9tb3Rpb25zO1xuICAgICAgICBpZiAoY3VycmVudFByb21vcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgcmVzcG9uc2UgKz0gJ1xcblxcbvCfjokgR29vZCBuZXdzISBXZSBoYXZlIHNwZWNpYWwgcHJvbW90aW9ucyBydW5uaW5nIHRoYXQgY291bGQgc2F2ZSB5b3UgbW9uZXkhJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgICAgXG4gICAgICBjYXNlICdtZW1iZXJzaGlwX2NvbXBhcmlzb24nOlxuICAgICAgICBjb25zdCBwcmljaW5nID0gdGhpcy5vcGVyYXRpb25hbFNlcnZpY2UuZ2V0Q3VycmVudFByaWNpbmcoKTtcbiAgICAgICAgcmVzcG9uc2UgKz0gJ1xcblxcbvCfkrMgSGVyZSBhcmUgb3VyIG1lbWJlcnNoaXAgb3B0aW9uczpcXG4nO1xuICAgICAgICBwcmljaW5nLm1lbWJlcnNoaXBzLmZvckVhY2gobWVtYmVyc2hpcCA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UgKz0gYFxcbioqJHttZW1iZXJzaGlwLm5hbWV9KiogLSAkJHttZW1iZXJzaGlwLnByaWNlfS8ke21lbWJlcnNoaXAuYmlsbGluZ31gO1xuICAgICAgICAgIGlmIChtZW1iZXJzaGlwLnBvcHVsYXIpIHJlc3BvbnNlICs9ICcg4q2QICpNb3N0IFBvcHVsYXIqJztcbiAgICAgICAgICByZXNwb25zZSArPSBgXFxuICBGZWF0dXJlczogJHttZW1iZXJzaGlwLmZlYXR1cmVzLnNsaWNlKDAsIDMpLmpvaW4oJywgJyl9YDtcbiAgICAgICAgICBpZiAobWVtYmVyc2hpcC5mZWF0dXJlcy5sZW5ndGggPiAzKSB7XG4gICAgICAgICAgICByZXNwb25zZSArPSBgIGFuZCAke21lbWJlcnNoaXAuZmVhdHVyZXMubGVuZ3RoIC0gM30gbW9yZSFgO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBhY3RpdmVQcm9tb3MgPSBwcmljaW5nLmFjdGl2ZVByb21vdGlvbnM7XG4gICAgICAgIGlmIChhY3RpdmVQcm9tb3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHJlc3BvbnNlICs9ICdcXG5cXG7wn46JIFBsdXMsIHdlIGhhdmUgY3VycmVudCBwcm9tb3Rpb25zIHRoYXQgY2FuIHNhdmUgeW91IG1vbmV5ISc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICAgIFxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gdGVtcGxhdGUgcmVzcG9uc2VcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGb3JtYXQgdGltZSBmb3IgZGlzcGxheVxuICAgKi9cbiAgcHJpdmF0ZSBmb3JtYXRUaW1lKHRpbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgW2hvdXJzLCBtaW51dGVzXSA9IHRpbWUuc3BsaXQoJzonKTtcbiAgICBjb25zdCBob3VyID0gcGFyc2VJbnQoaG91cnMpO1xuICAgIGNvbnN0IGFtcG0gPSBob3VyID49IDEyID8gJ1BNJyA6ICdBTSc7XG4gICAgY29uc3QgZGlzcGxheUhvdXIgPSBob3VyID4gMTIgPyBob3VyIC0gMTIgOiBob3VyID09PSAwID8gMTIgOiBob3VyO1xuICAgIHJldHVybiBgJHtkaXNwbGF5SG91cn06JHttaW51dGVzfSAke2FtcG19YDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdWJzdGl0dXRlcyB0ZW1wbGF0ZSB2YXJpYWJsZXMgd2l0aCBjb21wYW55IGluZm9ybWF0aW9uXG4gICAqL1xuICBwcml2YXRlIHN1YnN0aXR1dGVUZW1wbGF0ZSh0ZW1wbGF0ZTogc3RyaW5nLCBjb21wYW55SW5mbzogQ29tcGFueUluZm8pOiBzdHJpbmcge1xuICAgIHJldHVybiB0ZW1wbGF0ZVxuICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlOYW1lXFx9XFx9L2csIGNvbXBhbnlJbmZvLm5hbWUgfHwgJ291ciBjb21wYW55JylcbiAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55SW5kdXN0cnlcXH1cXH0vZywgY29tcGFueUluZm8uaW5kdXN0cnkgfHwgJ291ciBpbmR1c3RyeScpXG4gICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueURlc2NyaXB0aW9uXFx9XFx9L2csIGNvbXBhbnlJbmZvLmRlc2NyaXB0aW9uIHx8ICdvdXIgc2VydmljZXMnKVxuICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlQcm9kdWN0c1xcfVxcfS9nLCBjb21wYW55SW5mby5wcm9kdWN0cyB8fCAnb3VyIHByb2R1Y3RzJylcbiAgICAgIC5yZXBsYWNlKC9cXHtcXHtjb21wYW55QmVuZWZpdHNcXH1cXH0vZywgY29tcGFueUluZm8uYmVuZWZpdHMgfHwgJ291ciBiZW5lZml0cycpXG4gICAgICAucmVwbGFjZSgvXFx7XFx7Y29tcGFueVRhcmdldEN1c3RvbWVyc1xcfVxcfS9nLCBjb21wYW55SW5mby50YXJnZXRDdXN0b21lcnMgfHwgJ291ciBjdXN0b21lcnMnKVxuICAgICAgLnJlcGxhY2UoL1xce1xce2NvbXBhbnlEaWZmZXJlbnRpYXRvcnNcXH1cXH0vZywgY29tcGFueUluZm8uZGlmZmVyZW50aWF0b3JzIHx8ICd3aGF0IG1ha2VzIHVzIHNwZWNpYWwnKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUcmFja3MgaW50ZW50IGFuYWx5dGljcyBmb3IgcmVwb3J0aW5nIGFuZCBvcHRpbWl6YXRpb25cbiAgICovXG4gIHByaXZhdGUgdHJhY2tJbnRlbnQoYW5hbHl0aWNzOiBJbnRlbnRBbmFseXRpY3MpOiB2b2lkIHtcbiAgICB0aGlzLmFuYWx5dGljcy5wdXNoKGFuYWx5dGljcyk7XG4gICAgXG4gICAgLy8gSW4gYSByZWFsIGltcGxlbWVudGF0aW9uLCB0aGlzIHdvdWxkIHNlbmQgdG8gYW5hbHl0aWNzIHNlcnZpY2VcbiAgICBjb25zb2xlLmxvZygnSW50ZW50IHRyYWNrZWQ6Jywge1xuICAgICAgaW50ZW50OiBhbmFseXRpY3MuaW50ZW50SWQsXG4gICAgICBjb25maWRlbmNlOiBhbmFseXRpY3MuY29uZmlkZW5jZSxcbiAgICAgIHVzZXI6IGFuYWx5dGljcy51c2VySWQsXG4gICAgICBjaGFubmVsOiBhbmFseXRpY3MuY2hhbm5lbFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgaW50ZW50IGFuYWx5dGljcyBmb3IgYSB0ZW5hbnRcbiAgICovXG4gIHB1YmxpYyBnZXRBbmFseXRpY3ModGVuYW50SWQ6IHN0cmluZywgb3B0aW9ucz86IHtcbiAgICBzdGFydERhdGU/OiBzdHJpbmc7XG4gICAgZW5kRGF0ZT86IHN0cmluZztcbiAgICBpbnRlbnRJZD86IHN0cmluZztcbiAgICBjaGFubmVsPzogc3RyaW5nO1xuICB9KTogSW50ZW50QW5hbHl0aWNzW10ge1xuICAgIGxldCBmaWx0ZXJlZCA9IHRoaXMuYW5hbHl0aWNzLmZpbHRlcihhID0+IGEudGVuYW50SWQgPT09IHRlbmFudElkKTtcblxuICAgIGlmIChvcHRpb25zPy5zdGFydERhdGUpIHtcbiAgICAgIGZpbHRlcmVkID0gZmlsdGVyZWQuZmlsdGVyKGEgPT4gYS50aW1lc3RhbXAgPj0gb3B0aW9ucy5zdGFydERhdGUhKTtcbiAgICB9XG4gICAgaWYgKG9wdGlvbnM/LmVuZERhdGUpIHtcbiAgICAgIGZpbHRlcmVkID0gZmlsdGVyZWQuZmlsdGVyKGEgPT4gYS50aW1lc3RhbXAgPD0gb3B0aW9ucy5lbmREYXRlISk7XG4gICAgfVxuICAgIGlmIChvcHRpb25zPy5pbnRlbnRJZCkge1xuICAgICAgZmlsdGVyZWQgPSBmaWx0ZXJlZC5maWx0ZXIoYSA9PiBhLmludGVudElkID09PSBvcHRpb25zLmludGVudElkISk7XG4gICAgfVxuICAgIGlmIChvcHRpb25zPy5jaGFubmVsKSB7XG4gICAgICBmaWx0ZXJlZCA9IGZpbHRlcmVkLmZpbHRlcihhID0+IGEuY2hhbm5lbCA9PT0gb3B0aW9ucy5jaGFubmVsISk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZpbHRlcmVkO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldHMgaW50ZW50IHN0YXRpc3RpY3MgZm9yIG9wdGltaXphdGlvblxuICAgKi9cbiAgcHVibGljIGdldEludGVudFN0YXRzKHRlbmFudElkOiBzdHJpbmcpOiBSZWNvcmQ8c3RyaW5nLCB7XG4gICAgY291bnQ6IG51bWJlcjtcbiAgICBhdmVyYWdlQ29uZmlkZW5jZTogbnVtYmVyO1xuICAgIGNoYW5uZWxzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICB9PiB7XG4gICAgY29uc3QgYW5hbHl0aWNzID0gdGhpcy5nZXRBbmFseXRpY3ModGVuYW50SWQpO1xuICAgIGNvbnN0IHN0YXRzOiBSZWNvcmQ8c3RyaW5nLCB7XG4gICAgICBjb3VudDogbnVtYmVyO1xuICAgICAgYXZlcmFnZUNvbmZpZGVuY2U6IG51bWJlcjtcbiAgICAgIGNoYW5uZWxzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAgIH0+ID0ge307XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgYW5hbHl0aWNzKSB7XG4gICAgICBpZiAoIXN0YXRzW2l0ZW0uaW50ZW50SWRdKSB7XG4gICAgICAgIHN0YXRzW2l0ZW0uaW50ZW50SWRdID0ge1xuICAgICAgICAgIGNvdW50OiAwLFxuICAgICAgICAgIGF2ZXJhZ2VDb25maWRlbmNlOiAwLFxuICAgICAgICAgIGNoYW5uZWxzOiB7fVxuICAgICAgICB9O1xuICAgICAgfVxuXG4gICAgICBzdGF0c1tpdGVtLmludGVudElkXS5jb3VudCsrO1xuICAgICAgc3RhdHNbaXRlbS5pbnRlbnRJZF0uYXZlcmFnZUNvbmZpZGVuY2UgPSBcbiAgICAgICAgKHN0YXRzW2l0ZW0uaW50ZW50SWRdLmF2ZXJhZ2VDb25maWRlbmNlICogKHN0YXRzW2l0ZW0uaW50ZW50SWRdLmNvdW50IC0gMSkgKyBpdGVtLmNvbmZpZGVuY2UpIC8gXG4gICAgICAgIHN0YXRzW2l0ZW0uaW50ZW50SWRdLmNvdW50O1xuXG4gICAgICBpZiAoaXRlbS5jaGFubmVsKSB7XG4gICAgICAgIHN0YXRzW2l0ZW0uaW50ZW50SWRdLmNoYW5uZWxzW2l0ZW0uY2hhbm5lbF0gPSBcbiAgICAgICAgICAoc3RhdHNbaXRlbS5pbnRlbnRJZF0uY2hhbm5lbHNbaXRlbS5jaGFubmVsXSB8fCAwKSArIDE7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0YXRzO1xuICB9XG59XG4iXX0=