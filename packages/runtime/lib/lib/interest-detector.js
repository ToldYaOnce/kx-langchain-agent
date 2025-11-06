"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterestDetector = void 0;
class InterestDetector {
    constructor() {
        // High interest indicators
        this.highInterestKeywords = [
            'interested', 'want', 'need', 'love', 'excited', 'ready', 'sign up', 'join',
            'start', 'begin', 'when can', 'how do i', 'tell me more', 'sounds great',
            'perfect', 'awesome', 'amazing', 'definitely', 'absolutely', 'yes please',
            'membership', 'pricing', 'cost', 'schedule', 'classes', 'workout'
        ];
        // Low interest indicators
        this.lowInterestKeywords = [
            'maybe', 'not sure', 'thinking about', 'considering', 'later', 'sometime',
            'not ready', 'busy', 'no time', 'expensive', 'too much', 'cant afford',
            'just looking', 'browsing', 'information only', 'not interested'
        ];
        // Urgency indicators
        this.urgencyKeywords = [
            'now', 'today', 'asap', 'quickly', 'urgent', 'immediate', 'right away',
            'this week', 'soon', 'fast', 'hurry', 'rush', 'deadline', 'limited time',
            'before', 'by when', 'how long', 'waiting'
        ];
        // Casual indicators
        this.casualKeywords = [
            'whenever', 'no rush', 'take my time', 'eventually', 'someday', 'flexible',
            'no hurry', 'when convenient', 'at some point', 'down the road',
            'in the future', 'maybe later', 'not urgent'
        ];
        // Question patterns that indicate high interest
        this.interestQuestions = [
            /what.*cost/i, /how much/i, /what.*price/i, /what.*include/i,
            /when.*open/i, /what.*hours/i, /how.*join/i, /where.*located/i,
            /what.*classes/i, /what.*equipment/i, /can.*bring/i, /do.*have/i
        ];
        // Patterns that indicate low interest
        this.disinterestPatterns = [
            /just.*looking/i, /not.*ready/i, /maybe.*later/i, /too.*expensive/i,
            /cant.*afford/i, /no.*time/i, /too.*busy/i, /not.*interested/i
        ];
    }
    /**
     * Analyze a message for interest and urgency levels
     */
    analyzeMessage(message, conversationHistory) {
        const messageLower = message.toLowerCase();
        const indicators = {
            positive: [],
            negative: [],
            urgency: [],
            casual: []
        };
        // Check for high interest keywords
        this.highInterestKeywords.forEach(keyword => {
            if (messageLower.includes(keyword)) {
                indicators.positive.push(keyword);
            }
        });
        // Check for low interest keywords
        this.lowInterestKeywords.forEach(keyword => {
            if (messageLower.includes(keyword)) {
                indicators.negative.push(keyword);
            }
        });
        // Check for urgency keywords
        this.urgencyKeywords.forEach(keyword => {
            if (messageLower.includes(keyword)) {
                indicators.urgency.push(keyword);
            }
        });
        // Check for casual keywords
        this.casualKeywords.forEach(keyword => {
            if (messageLower.includes(keyword)) {
                indicators.casual.push(keyword);
            }
        });
        // Check question patterns
        let questionScore = 0;
        this.interestQuestions.forEach(pattern => {
            if (pattern.test(message)) {
                questionScore += 2;
                indicators.positive.push('interest_question');
            }
        });
        this.disinterestPatterns.forEach(pattern => {
            if (pattern.test(message)) {
                questionScore -= 2;
                indicators.negative.push('disinterest_pattern');
            }
        });
        // Calculate interest level
        const positiveScore = indicators.positive.length * 2 + questionScore;
        const negativeScore = indicators.negative.length * 2;
        const netInterestScore = positiveScore - negativeScore;
        let interestLevel;
        if (netInterestScore >= 4) {
            interestLevel = 'high';
        }
        else if (netInterestScore >= 1) {
            interestLevel = 'medium';
        }
        else {
            interestLevel = 'low';
        }
        // Calculate urgency level
        const urgencyScore = indicators.urgency.length * 2;
        const casualScore = indicators.casual.length * 2;
        const netUrgencyScore = urgencyScore - casualScore;
        let urgencyLevel;
        if (netUrgencyScore >= 2) {
            urgencyLevel = 'urgent';
        }
        else if (netUrgencyScore <= -2) {
            urgencyLevel = 'casual';
        }
        else {
            urgencyLevel = 'normal';
        }
        // Adjust based on conversation history if provided
        if (conversationHistory && conversationHistory.length > 0) {
            const historyAnalysis = this.analyzeConversationHistory(conversationHistory);
            // Blend current message with history (70% current, 30% history)
            if (historyAnalysis.interestLevel === 'high' && interestLevel !== 'low') {
                interestLevel = 'high';
            }
            else if (historyAnalysis.interestLevel === 'low' && interestLevel !== 'high') {
                interestLevel = 'low';
            }
        }
        // Calculate confidence based on number of indicators
        const totalIndicators = indicators.positive.length + indicators.negative.length +
            indicators.urgency.length + indicators.casual.length;
        const confidence = Math.min(0.9, Math.max(0.3, totalIndicators * 0.15 + 0.3));
        return {
            interestLevel,
            urgencyLevel,
            confidence,
            indicators
        };
    }
    /**
     * Analyze conversation history for patterns
     */
    analyzeConversationHistory(history) {
        let totalPositive = 0;
        let totalNegative = 0;
        let totalUrgency = 0;
        let totalCasual = 0;
        history.forEach(message => {
            const analysis = this.analyzeMessage(message);
            totalPositive += analysis.indicators.positive.length;
            totalNegative += analysis.indicators.negative.length;
            totalUrgency += analysis.indicators.urgency.length;
            totalCasual += analysis.indicators.casual.length;
        });
        const avgPositive = totalPositive / history.length;
        const avgNegative = totalNegative / history.length;
        const netInterest = avgPositive - avgNegative;
        let interestLevel;
        if (netInterest >= 1.5) {
            interestLevel = 'high';
        }
        else if (netInterest >= 0.5) {
            interestLevel = 'medium';
        }
        else {
            interestLevel = 'low';
        }
        const avgUrgency = totalUrgency / history.length;
        const avgCasual = totalCasual / history.length;
        const netUrgency = avgUrgency - avgCasual;
        let urgencyLevel;
        if (netUrgency >= 0.5) {
            urgencyLevel = 'urgent';
        }
        else if (netUrgency <= -0.5) {
            urgencyLevel = 'casual';
        }
        else {
            urgencyLevel = 'normal';
        }
        return {
            interestLevel,
            urgencyLevel,
            confidence: Math.min(0.8, history.length * 0.1 + 0.3),
            indicators: {
                positive: [`avg_positive: ${avgPositive.toFixed(1)}`],
                negative: [`avg_negative: ${avgNegative.toFixed(1)}`],
                urgency: [`avg_urgency: ${avgUrgency.toFixed(1)}`],
                casual: [`avg_casual: ${avgCasual.toFixed(1)}`]
            }
        };
    }
    /**
     * Determine if user is showing buying signals
     */
    detectBuyingSignals(message) {
        const buyingSignals = [
            'how do i sign up', 'want to join', 'ready to start', 'lets do this',
            'sign me up', 'where do i pay', 'what do i need', 'when can i start',
            'sounds good', 'im interested', 'yes please', 'perfect'
        ];
        const messageLower = message.toLowerCase();
        const foundSignals = [];
        buyingSignals.forEach(signal => {
            if (messageLower.includes(signal)) {
                foundSignals.push(signal);
            }
        });
        let strength;
        if (foundSignals.length >= 3) {
            strength = 'strong';
        }
        else if (foundSignals.length >= 1) {
            strength = 'moderate';
        }
        else {
            strength = 'weak';
        }
        return {
            hasBuyingSignals: foundSignals.length > 0,
            signals: foundSignals,
            strength
        };
    }
    /**
     * Detect objections or hesitations
     */
    detectObjections(message) {
        const objectionPatterns = {
            price: ['expensive', 'cost', 'afford', 'money', 'budget', 'cheap'],
            time: ['busy', 'no time', 'schedule', 'when', 'available'],
            commitment: ['contract', 'commitment', 'locked in', 'cancel', 'quit'],
            location: ['far', 'close', 'location', 'drive', 'distance'],
            general: ['not sure', 'maybe', 'thinking', 'hesitant', 'worried']
        };
        const messageLower = message.toLowerCase();
        const foundObjections = [];
        let primaryType = 'none';
        Object.entries(objectionPatterns).forEach(([type, keywords]) => {
            keywords.forEach(keyword => {
                if (messageLower.includes(keyword)) {
                    foundObjections.push(`${type}: ${keyword}`);
                    if (primaryType === 'none') {
                        primaryType = type;
                    }
                }
            });
        });
        return {
            hasObjections: foundObjections.length > 0,
            objections: foundObjections,
            type: primaryType
        };
    }
}
exports.InterestDetector = InterestDetector;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJlc3QtZGV0ZWN0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2ludGVyZXN0LWRldGVjdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQVlBLE1BQWEsZ0JBQWdCO0lBQTdCO1FBQ0UsMkJBQTJCO1FBQ25CLHlCQUFvQixHQUFHO1lBQzdCLFlBQVksRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNO1lBQzNFLE9BQU8sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsY0FBYztZQUN4RSxTQUFTLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLFlBQVk7WUFDekUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLFNBQVMsRUFBRSxTQUFTO1NBQ2xFLENBQUM7UUFFRiwwQkFBMEI7UUFDbEIsd0JBQW1CLEdBQUc7WUFDNUIsT0FBTyxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLFVBQVU7WUFDekUsV0FBVyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxhQUFhO1lBQ3RFLGNBQWMsRUFBRSxVQUFVLEVBQUUsa0JBQWtCLEVBQUUsZ0JBQWdCO1NBQ2pFLENBQUM7UUFFRixxQkFBcUI7UUFDYixvQkFBZSxHQUFHO1lBQ3hCLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLFlBQVk7WUFDdEUsV0FBVyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsY0FBYztZQUN4RSxRQUFRLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxTQUFTO1NBQzNDLENBQUM7UUFFRixv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QUNsRSxDQUFDO1FBRUYsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQzNDLE1BQU0sZUFBZSxHQUFhLEVBQUUsQ0FBQztRQUNyQyxJQUFJLFdBQVcsR0FBc0UsTUFBTSxDQUFDO1FBRTVGLE1BQU0sQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsRUFBRSxFQUFFO1lBQzdELFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ3pCLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUNuQyxlQUFlLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDLENBQUM7b0JBQzVDLElBQUksV0FBVyxLQUFLLE1BQU0sRUFBRSxDQUFDO3dCQUMzQixXQUFXLEdBQUcsSUFBVyxDQUFDO29CQUM1QixDQUFDO2dCQUNILENBQUM7WUFDSCxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTztZQUNMLGFBQWEsRUFBRSxlQUFlLENBQUMsTUFBTSxHQUFHLENBQUM7WUFDekMsVUFBVSxFQUFFLGVBQWU7WUFDM0IsSUFBSSxFQUFFLFdBQVc7U0FDbEIsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQTVSRCw0Q0E0UkMiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgaW50ZXJmYWNlIEludGVyZXN0QW5hbHlzaXMge1xyXG4gIGludGVyZXN0TGV2ZWw6ICdoaWdoJyB8ICdtZWRpdW0nIHwgJ2xvdyc7XHJcbiAgdXJnZW5jeUxldmVsOiAndXJnZW50JyB8ICdub3JtYWwnIHwgJ2Nhc3VhbCc7XHJcbiAgY29uZmlkZW5jZTogbnVtYmVyO1xyXG4gIGluZGljYXRvcnM6IHtcclxuICAgIHBvc2l0aXZlOiBzdHJpbmdbXTtcclxuICAgIG5lZ2F0aXZlOiBzdHJpbmdbXTtcclxuICAgIHVyZ2VuY3k6IHN0cmluZ1tdO1xyXG4gICAgY2FzdWFsOiBzdHJpbmdbXTtcclxuICB9O1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgSW50ZXJlc3REZXRlY3RvciB7XHJcbiAgLy8gSGlnaCBpbnRlcmVzdCBpbmRpY2F0b3JzXHJcbiAgcHJpdmF0ZSBoaWdoSW50ZXJlc3RLZXl3b3JkcyA9IFtcclxuICAgICdpbnRlcmVzdGVkJywgJ3dhbnQnLCAnbmVlZCcsICdsb3ZlJywgJ2V4Y2l0ZWQnLCAncmVhZHknLCAnc2lnbiB1cCcsICdqb2luJyxcclxuICAgICdzdGFydCcsICdiZWdpbicsICd3aGVuIGNhbicsICdob3cgZG8gaScsICd0ZWxsIG1lIG1vcmUnLCAnc291bmRzIGdyZWF0JyxcclxuICAgICdwZXJmZWN0JywgJ2F3ZXNvbWUnLCAnYW1hemluZycsICdkZWZpbml0ZWx5JywgJ2Fic29sdXRlbHknLCAneWVzIHBsZWFzZScsXHJcbiAgICAnbWVtYmVyc2hpcCcsICdwcmljaW5nJywgJ2Nvc3QnLCAnc2NoZWR1bGUnLCAnY2xhc3NlcycsICd3b3Jrb3V0J1xyXG4gIF07XHJcblxyXG4gIC8vIExvdyBpbnRlcmVzdCBpbmRpY2F0b3JzXHJcbiAgcHJpdmF0ZSBsb3dJbnRlcmVzdEtleXdvcmRzID0gW1xyXG4gICAgJ21heWJlJywgJ25vdCBzdXJlJywgJ3RoaW5raW5nIGFib3V0JywgJ2NvbnNpZGVyaW5nJywgJ2xhdGVyJywgJ3NvbWV0aW1lJyxcclxuICAgICdub3QgcmVhZHknLCAnYnVzeScsICdubyB0aW1lJywgJ2V4cGVuc2l2ZScsICd0b28gbXVjaCcsICdjYW50IGFmZm9yZCcsXHJcbiAgICAnanVzdCBsb29raW5nJywgJ2Jyb3dzaW5nJywgJ2luZm9ybWF0aW9uIG9ubHknLCAnbm90IGludGVyZXN0ZWQnXHJcbiAgXTtcclxuXHJcbiAgLy8gVXJnZW5jeSBpbmRpY2F0b3JzXHJcbiAgcHJpdmF0ZSB1cmdlbmN5S2V5d29yZHMgPSBbXHJcbiAgICAnbm93JywgJ3RvZGF5JywgJ2FzYXAnLCAncXVpY2tseScsICd1cmdlbnQnLCAnaW1tZWRpYXRlJywgJ3JpZ2h0IGF3YXknLFxyXG4gICAgJ3RoaXMgd2VlaycsICdzb29uJywgJ2Zhc3QnLCAnaHVycnknLCAncnVzaCcsICdkZWFkbGluZScsICdsaW1pdGVkIHRpbWUnLFxyXG4gICAgJ2JlZm9yZScsICdieSB3aGVuJywgJ2hvdyBsb25nJywgJ3dhaXRpbmcnXHJcbiAgXTtcclxuXHJcbiAgLy8gQ2FzdWFsIGluZGljYXRvcnNcclxuICBwcml2YXRlIGNhc3VhbEtleXdvcmRzID0gW1xyXG4gICAgJ3doZW5ldmVyJywgJ25vIHJ1c2gnLCAndGFrZSBteSB0aW1lJywgJ2V2ZW50dWFsbHknLCAnc29tZWRheScsICdmbGV4aWJsZScsXHJcbiAgICAnbm8gaHVycnknLCAnd2hlbiBjb252ZW5pZW50JywgJ2F0IHNvbWUgcG9pbnQnLCAnZG93biB0aGUgcm9hZCcsXHJcbiAgICAnaW4gdGhlIGZ1dHVyZScsICdtYXliZSBsYXRlcicsICdub3QgdXJnZW50J1xyXG4gIF07XHJcblxyXG4gIC8vIFF1ZXN0aW9uIHBhdHRlcm5zIHRoYXQgaW5kaWNhdGUgaGlnaCBpbnRlcmVzdFxyXG4gIHByaXZhdGUgaW50ZXJlc3RRdWVzdGlvbnMgPSBbXHJcbiAgICAvd2hhdC4qY29zdC9pLCAvaG93IG11Y2gvaSwgL3doYXQuKnByaWNlL2ksIC93aGF0LippbmNsdWRlL2ksXHJcbiAgICAvd2hlbi4qb3Blbi9pLCAvd2hhdC4qaG91cnMvaSwgL2hvdy4qam9pbi9pLCAvd2hlcmUuKmxvY2F0ZWQvaSxcclxuICAgIC93aGF0LipjbGFzc2VzL2ksIC93aGF0LiplcXVpcG1lbnQvaSwgL2Nhbi4qYnJpbmcvaSwgL2RvLipoYXZlL2lcclxuICBdO1xyXG5cclxuICAvLyBQYXR0ZXJucyB0aGF0IGluZGljYXRlIGxvdyBpbnRlcmVzdFxyXG4gIHByaXZhdGUgZGlzaW50ZXJlc3RQYXR0ZXJucyA9IFtcclxuICAgIC9qdXN0Lipsb29raW5nL2ksIC9ub3QuKnJlYWR5L2ksIC9tYXliZS4qbGF0ZXIvaSwgL3Rvby4qZXhwZW5zaXZlL2ksXHJcbiAgICAvY2FudC4qYWZmb3JkL2ksIC9uby4qdGltZS9pLCAvdG9vLipidXN5L2ksIC9ub3QuKmludGVyZXN0ZWQvaVxyXG4gIF07XHJcblxyXG4gIC8qKlxyXG4gICAqIEFuYWx5emUgYSBtZXNzYWdlIGZvciBpbnRlcmVzdCBhbmQgdXJnZW5jeSBsZXZlbHNcclxuICAgKi9cclxuICBhbmFseXplTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcsIGNvbnZlcnNhdGlvbkhpc3Rvcnk/OiBzdHJpbmdbXSk6IEludGVyZXN0QW5hbHlzaXMge1xyXG4gICAgY29uc3QgbWVzc2FnZUxvd2VyID0gbWVzc2FnZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgY29uc3QgaW5kaWNhdG9ycyA9IHtcclxuICAgICAgcG9zaXRpdmU6IFtdIGFzIHN0cmluZ1tdLFxyXG4gICAgICBuZWdhdGl2ZTogW10gYXMgc3RyaW5nW10sXHJcbiAgICAgIHVyZ2VuY3k6IFtdIGFzIHN0cmluZ1tdLFxyXG4gICAgICBjYXN1YWw6IFtdIGFzIHN0cmluZ1tdXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIENoZWNrIGZvciBoaWdoIGludGVyZXN0IGtleXdvcmRzXHJcbiAgICB0aGlzLmhpZ2hJbnRlcmVzdEtleXdvcmRzLmZvckVhY2goa2V5d29yZCA9PiB7XHJcbiAgICAgIGlmIChtZXNzYWdlTG93ZXIuaW5jbHVkZXMoa2V5d29yZCkpIHtcclxuICAgICAgICBpbmRpY2F0b3JzLnBvc2l0aXZlLnB1c2goa2V5d29yZCk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENoZWNrIGZvciBsb3cgaW50ZXJlc3Qga2V5d29yZHNcclxuICAgIHRoaXMubG93SW50ZXJlc3RLZXl3b3Jkcy5mb3JFYWNoKGtleXdvcmQgPT4ge1xyXG4gICAgICBpZiAobWVzc2FnZUxvd2VyLmluY2x1ZGVzKGtleXdvcmQpKSB7XHJcbiAgICAgICAgaW5kaWNhdG9ycy5uZWdhdGl2ZS5wdXNoKGtleXdvcmQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDaGVjayBmb3IgdXJnZW5jeSBrZXl3b3Jkc1xyXG4gICAgdGhpcy51cmdlbmN5S2V5d29yZHMuZm9yRWFjaChrZXl3b3JkID0+IHtcclxuICAgICAgaWYgKG1lc3NhZ2VMb3dlci5pbmNsdWRlcyhrZXl3b3JkKSkge1xyXG4gICAgICAgIGluZGljYXRvcnMudXJnZW5jeS5wdXNoKGtleXdvcmQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDaGVjayBmb3IgY2FzdWFsIGtleXdvcmRzXHJcbiAgICB0aGlzLmNhc3VhbEtleXdvcmRzLmZvckVhY2goa2V5d29yZCA9PiB7XHJcbiAgICAgIGlmIChtZXNzYWdlTG93ZXIuaW5jbHVkZXMoa2V5d29yZCkpIHtcclxuICAgICAgICBpbmRpY2F0b3JzLmNhc3VhbC5wdXNoKGtleXdvcmQpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDaGVjayBxdWVzdGlvbiBwYXR0ZXJuc1xyXG4gICAgbGV0IHF1ZXN0aW9uU2NvcmUgPSAwO1xyXG4gICAgdGhpcy5pbnRlcmVzdFF1ZXN0aW9ucy5mb3JFYWNoKHBhdHRlcm4gPT4ge1xyXG4gICAgICBpZiAocGF0dGVybi50ZXN0KG1lc3NhZ2UpKSB7XHJcbiAgICAgICAgcXVlc3Rpb25TY29yZSArPSAyO1xyXG4gICAgICAgIGluZGljYXRvcnMucG9zaXRpdmUucHVzaCgnaW50ZXJlc3RfcXVlc3Rpb24nKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5kaXNpbnRlcmVzdFBhdHRlcm5zLmZvckVhY2gocGF0dGVybiA9PiB7XHJcbiAgICAgIGlmIChwYXR0ZXJuLnRlc3QobWVzc2FnZSkpIHtcclxuICAgICAgICBxdWVzdGlvblNjb3JlIC09IDI7XHJcbiAgICAgICAgaW5kaWNhdG9ycy5uZWdhdGl2ZS5wdXNoKCdkaXNpbnRlcmVzdF9wYXR0ZXJuJyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENhbGN1bGF0ZSBpbnRlcmVzdCBsZXZlbFxyXG4gICAgY29uc3QgcG9zaXRpdmVTY29yZSA9IGluZGljYXRvcnMucG9zaXRpdmUubGVuZ3RoICogMiArIHF1ZXN0aW9uU2NvcmU7XHJcbiAgICBjb25zdCBuZWdhdGl2ZVNjb3JlID0gaW5kaWNhdG9ycy5uZWdhdGl2ZS5sZW5ndGggKiAyO1xyXG4gICAgY29uc3QgbmV0SW50ZXJlc3RTY29yZSA9IHBvc2l0aXZlU2NvcmUgLSBuZWdhdGl2ZVNjb3JlO1xyXG5cclxuICAgIGxldCBpbnRlcmVzdExldmVsOiAnaGlnaCcgfCAnbWVkaXVtJyB8ICdsb3cnO1xyXG4gICAgaWYgKG5ldEludGVyZXN0U2NvcmUgPj0gNCkge1xyXG4gICAgICBpbnRlcmVzdExldmVsID0gJ2hpZ2gnO1xyXG4gICAgfSBlbHNlIGlmIChuZXRJbnRlcmVzdFNjb3JlID49IDEpIHtcclxuICAgICAgaW50ZXJlc3RMZXZlbCA9ICdtZWRpdW0nO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaW50ZXJlc3RMZXZlbCA9ICdsb3cnO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENhbGN1bGF0ZSB1cmdlbmN5IGxldmVsXHJcbiAgICBjb25zdCB1cmdlbmN5U2NvcmUgPSBpbmRpY2F0b3JzLnVyZ2VuY3kubGVuZ3RoICogMjtcclxuICAgIGNvbnN0IGNhc3VhbFNjb3JlID0gaW5kaWNhdG9ycy5jYXN1YWwubGVuZ3RoICogMjtcclxuICAgIGNvbnN0IG5ldFVyZ2VuY3lTY29yZSA9IHVyZ2VuY3lTY29yZSAtIGNhc3VhbFNjb3JlO1xyXG5cclxuICAgIGxldCB1cmdlbmN5TGV2ZWw6ICd1cmdlbnQnIHwgJ25vcm1hbCcgfCAnY2FzdWFsJztcclxuICAgIGlmIChuZXRVcmdlbmN5U2NvcmUgPj0gMikge1xyXG4gICAgICB1cmdlbmN5TGV2ZWwgPSAndXJnZW50JztcclxuICAgIH0gZWxzZSBpZiAobmV0VXJnZW5jeVNjb3JlIDw9IC0yKSB7XHJcbiAgICAgIHVyZ2VuY3lMZXZlbCA9ICdjYXN1YWwnO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdXJnZW5jeUxldmVsID0gJ25vcm1hbCc7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQWRqdXN0IGJhc2VkIG9uIGNvbnZlcnNhdGlvbiBoaXN0b3J5IGlmIHByb3ZpZGVkXHJcbiAgICBpZiAoY29udmVyc2F0aW9uSGlzdG9yeSAmJiBjb252ZXJzYXRpb25IaXN0b3J5Lmxlbmd0aCA+IDApIHtcclxuICAgICAgY29uc3QgaGlzdG9yeUFuYWx5c2lzID0gdGhpcy5hbmFseXplQ29udmVyc2F0aW9uSGlzdG9yeShjb252ZXJzYXRpb25IaXN0b3J5KTtcclxuICAgICAgXHJcbiAgICAgIC8vIEJsZW5kIGN1cnJlbnQgbWVzc2FnZSB3aXRoIGhpc3RvcnkgKDcwJSBjdXJyZW50LCAzMCUgaGlzdG9yeSlcclxuICAgICAgaWYgKGhpc3RvcnlBbmFseXNpcy5pbnRlcmVzdExldmVsID09PSAnaGlnaCcgJiYgaW50ZXJlc3RMZXZlbCAhPT0gJ2xvdycpIHtcclxuICAgICAgICBpbnRlcmVzdExldmVsID0gJ2hpZ2gnO1xyXG4gICAgICB9IGVsc2UgaWYgKGhpc3RvcnlBbmFseXNpcy5pbnRlcmVzdExldmVsID09PSAnbG93JyAmJiBpbnRlcmVzdExldmVsICE9PSAnaGlnaCcpIHtcclxuICAgICAgICBpbnRlcmVzdExldmVsID0gJ2xvdyc7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBDYWxjdWxhdGUgY29uZmlkZW5jZSBiYXNlZCBvbiBudW1iZXIgb2YgaW5kaWNhdG9yc1xyXG4gICAgY29uc3QgdG90YWxJbmRpY2F0b3JzID0gaW5kaWNhdG9ycy5wb3NpdGl2ZS5sZW5ndGggKyBpbmRpY2F0b3JzLm5lZ2F0aXZlLmxlbmd0aCArIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBpbmRpY2F0b3JzLnVyZ2VuY3kubGVuZ3RoICsgaW5kaWNhdG9ycy5jYXN1YWwubGVuZ3RoO1xyXG4gICAgY29uc3QgY29uZmlkZW5jZSA9IE1hdGgubWluKDAuOSwgTWF0aC5tYXgoMC4zLCB0b3RhbEluZGljYXRvcnMgKiAwLjE1ICsgMC4zKSk7XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaW50ZXJlc3RMZXZlbCxcclxuICAgICAgdXJnZW5jeUxldmVsLFxyXG4gICAgICBjb25maWRlbmNlLFxyXG4gICAgICBpbmRpY2F0b3JzXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQW5hbHl6ZSBjb252ZXJzYXRpb24gaGlzdG9yeSBmb3IgcGF0dGVybnNcclxuICAgKi9cclxuICBwcml2YXRlIGFuYWx5emVDb252ZXJzYXRpb25IaXN0b3J5KGhpc3Rvcnk6IHN0cmluZ1tdKTogSW50ZXJlc3RBbmFseXNpcyB7XHJcbiAgICBsZXQgdG90YWxQb3NpdGl2ZSA9IDA7XHJcbiAgICBsZXQgdG90YWxOZWdhdGl2ZSA9IDA7XHJcbiAgICBsZXQgdG90YWxVcmdlbmN5ID0gMDtcclxuICAgIGxldCB0b3RhbENhc3VhbCA9IDA7XHJcblxyXG4gICAgaGlzdG9yeS5mb3JFYWNoKG1lc3NhZ2UgPT4ge1xyXG4gICAgICBjb25zdCBhbmFseXNpcyA9IHRoaXMuYW5hbHl6ZU1lc3NhZ2UobWVzc2FnZSk7XHJcbiAgICAgIHRvdGFsUG9zaXRpdmUgKz0gYW5hbHlzaXMuaW5kaWNhdG9ycy5wb3NpdGl2ZS5sZW5ndGg7XHJcbiAgICAgIHRvdGFsTmVnYXRpdmUgKz0gYW5hbHlzaXMuaW5kaWNhdG9ycy5uZWdhdGl2ZS5sZW5ndGg7XHJcbiAgICAgIHRvdGFsVXJnZW5jeSArPSBhbmFseXNpcy5pbmRpY2F0b3JzLnVyZ2VuY3kubGVuZ3RoO1xyXG4gICAgICB0b3RhbENhc3VhbCArPSBhbmFseXNpcy5pbmRpY2F0b3JzLmNhc3VhbC5sZW5ndGg7XHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBhdmdQb3NpdGl2ZSA9IHRvdGFsUG9zaXRpdmUgLyBoaXN0b3J5Lmxlbmd0aDtcclxuICAgIGNvbnN0IGF2Z05lZ2F0aXZlID0gdG90YWxOZWdhdGl2ZSAvIGhpc3RvcnkubGVuZ3RoO1xyXG4gICAgY29uc3QgbmV0SW50ZXJlc3QgPSBhdmdQb3NpdGl2ZSAtIGF2Z05lZ2F0aXZlO1xyXG5cclxuICAgIGxldCBpbnRlcmVzdExldmVsOiAnaGlnaCcgfCAnbWVkaXVtJyB8ICdsb3cnO1xyXG4gICAgaWYgKG5ldEludGVyZXN0ID49IDEuNSkge1xyXG4gICAgICBpbnRlcmVzdExldmVsID0gJ2hpZ2gnO1xyXG4gICAgfSBlbHNlIGlmIChuZXRJbnRlcmVzdCA+PSAwLjUpIHtcclxuICAgICAgaW50ZXJlc3RMZXZlbCA9ICdtZWRpdW0nO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaW50ZXJlc3RMZXZlbCA9ICdsb3cnO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGF2Z1VyZ2VuY3kgPSB0b3RhbFVyZ2VuY3kgLyBoaXN0b3J5Lmxlbmd0aDtcclxuICAgIGNvbnN0IGF2Z0Nhc3VhbCA9IHRvdGFsQ2FzdWFsIC8gaGlzdG9yeS5sZW5ndGg7XHJcbiAgICBjb25zdCBuZXRVcmdlbmN5ID0gYXZnVXJnZW5jeSAtIGF2Z0Nhc3VhbDtcclxuXHJcbiAgICBsZXQgdXJnZW5jeUxldmVsOiAndXJnZW50JyB8ICdub3JtYWwnIHwgJ2Nhc3VhbCc7XHJcbiAgICBpZiAobmV0VXJnZW5jeSA+PSAwLjUpIHtcclxuICAgICAgdXJnZW5jeUxldmVsID0gJ3VyZ2VudCc7XHJcbiAgICB9IGVsc2UgaWYgKG5ldFVyZ2VuY3kgPD0gLTAuNSkge1xyXG4gICAgICB1cmdlbmN5TGV2ZWwgPSAnY2FzdWFsJztcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHVyZ2VuY3lMZXZlbCA9ICdub3JtYWwnO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIGludGVyZXN0TGV2ZWwsXHJcbiAgICAgIHVyZ2VuY3lMZXZlbCxcclxuICAgICAgY29uZmlkZW5jZTogTWF0aC5taW4oMC44LCBoaXN0b3J5Lmxlbmd0aCAqIDAuMSArIDAuMyksXHJcbiAgICAgIGluZGljYXRvcnM6IHtcclxuICAgICAgICBwb3NpdGl2ZTogW2BhdmdfcG9zaXRpdmU6ICR7YXZnUG9zaXRpdmUudG9GaXhlZCgxKX1gXSxcclxuICAgICAgICBuZWdhdGl2ZTogW2BhdmdfbmVnYXRpdmU6ICR7YXZnTmVnYXRpdmUudG9GaXhlZCgxKX1gXSxcclxuICAgICAgICB1cmdlbmN5OiBbYGF2Z191cmdlbmN5OiAke2F2Z1VyZ2VuY3kudG9GaXhlZCgxKX1gXSxcclxuICAgICAgICBjYXN1YWw6IFtgYXZnX2Nhc3VhbDogJHthdmdDYXN1YWwudG9GaXhlZCgxKX1gXVxyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogRGV0ZXJtaW5lIGlmIHVzZXIgaXMgc2hvd2luZyBidXlpbmcgc2lnbmFsc1xyXG4gICAqL1xyXG4gIGRldGVjdEJ1eWluZ1NpZ25hbHMobWVzc2FnZTogc3RyaW5nKToge1xyXG4gICAgaGFzQnV5aW5nU2lnbmFsczogYm9vbGVhbjtcclxuICAgIHNpZ25hbHM6IHN0cmluZ1tdO1xyXG4gICAgc3RyZW5ndGg6ICd3ZWFrJyB8ICdtb2RlcmF0ZScgfCAnc3Ryb25nJztcclxuICB9IHtcclxuICAgIGNvbnN0IGJ1eWluZ1NpZ25hbHMgPSBbXHJcbiAgICAgICdob3cgZG8gaSBzaWduIHVwJywgJ3dhbnQgdG8gam9pbicsICdyZWFkeSB0byBzdGFydCcsICdsZXRzIGRvIHRoaXMnLFxyXG4gICAgICAnc2lnbiBtZSB1cCcsICd3aGVyZSBkbyBpIHBheScsICd3aGF0IGRvIGkgbmVlZCcsICd3aGVuIGNhbiBpIHN0YXJ0JyxcclxuICAgICAgJ3NvdW5kcyBnb29kJywgJ2ltIGludGVyZXN0ZWQnLCAneWVzIHBsZWFzZScsICdwZXJmZWN0J1xyXG4gICAgXTtcclxuXHJcbiAgICBjb25zdCBtZXNzYWdlTG93ZXIgPSBtZXNzYWdlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBjb25zdCBmb3VuZFNpZ25hbHM6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgYnV5aW5nU2lnbmFscy5mb3JFYWNoKHNpZ25hbCA9PiB7XHJcbiAgICAgIGlmIChtZXNzYWdlTG93ZXIuaW5jbHVkZXMoc2lnbmFsKSkge1xyXG4gICAgICAgIGZvdW5kU2lnbmFscy5wdXNoKHNpZ25hbCk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGxldCBzdHJlbmd0aDogJ3dlYWsnIHwgJ21vZGVyYXRlJyB8ICdzdHJvbmcnO1xyXG4gICAgaWYgKGZvdW5kU2lnbmFscy5sZW5ndGggPj0gMykge1xyXG4gICAgICBzdHJlbmd0aCA9ICdzdHJvbmcnO1xyXG4gICAgfSBlbHNlIGlmIChmb3VuZFNpZ25hbHMubGVuZ3RoID49IDEpIHtcclxuICAgICAgc3RyZW5ndGggPSAnbW9kZXJhdGUnO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgc3RyZW5ndGggPSAnd2Vhayc7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaGFzQnV5aW5nU2lnbmFsczogZm91bmRTaWduYWxzLmxlbmd0aCA+IDAsXHJcbiAgICAgIHNpZ25hbHM6IGZvdW5kU2lnbmFscyxcclxuICAgICAgc3RyZW5ndGhcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBEZXRlY3Qgb2JqZWN0aW9ucyBvciBoZXNpdGF0aW9uc1xyXG4gICAqL1xyXG4gIGRldGVjdE9iamVjdGlvbnMobWVzc2FnZTogc3RyaW5nKToge1xyXG4gICAgaGFzT2JqZWN0aW9uczogYm9vbGVhbjtcclxuICAgIG9iamVjdGlvbnM6IHN0cmluZ1tdO1xyXG4gICAgdHlwZTogJ3ByaWNlJyB8ICd0aW1lJyB8ICdjb21taXRtZW50JyB8ICdsb2NhdGlvbicgfCAnZ2VuZXJhbCcgfCAnbm9uZSc7XHJcbiAgfSB7XHJcbiAgICBjb25zdCBvYmplY3Rpb25QYXR0ZXJucyA9IHtcclxuICAgICAgcHJpY2U6IFsnZXhwZW5zaXZlJywgJ2Nvc3QnLCAnYWZmb3JkJywgJ21vbmV5JywgJ2J1ZGdldCcsICdjaGVhcCddLFxyXG4gICAgICB0aW1lOiBbJ2J1c3knLCAnbm8gdGltZScsICdzY2hlZHVsZScsICd3aGVuJywgJ2F2YWlsYWJsZSddLFxyXG4gICAgICBjb21taXRtZW50OiBbJ2NvbnRyYWN0JywgJ2NvbW1pdG1lbnQnLCAnbG9ja2VkIGluJywgJ2NhbmNlbCcsICdxdWl0J10sXHJcbiAgICAgIGxvY2F0aW9uOiBbJ2ZhcicsICdjbG9zZScsICdsb2NhdGlvbicsICdkcml2ZScsICdkaXN0YW5jZSddLFxyXG4gICAgICBnZW5lcmFsOiBbJ25vdCBzdXJlJywgJ21heWJlJywgJ3RoaW5raW5nJywgJ2hlc2l0YW50JywgJ3dvcnJpZWQnXVxyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBtZXNzYWdlTG93ZXIgPSBtZXNzYWdlLnRvTG93ZXJDYXNlKCk7XHJcbiAgICBjb25zdCBmb3VuZE9iamVjdGlvbnM6IHN0cmluZ1tdID0gW107XHJcbiAgICBsZXQgcHJpbWFyeVR5cGU6ICdwcmljZScgfCAndGltZScgfCAnY29tbWl0bWVudCcgfCAnbG9jYXRpb24nIHwgJ2dlbmVyYWwnIHwgJ25vbmUnID0gJ25vbmUnO1xyXG5cclxuICAgIE9iamVjdC5lbnRyaWVzKG9iamVjdGlvblBhdHRlcm5zKS5mb3JFYWNoKChbdHlwZSwga2V5d29yZHNdKSA9PiB7XHJcbiAgICAgIGtleXdvcmRzLmZvckVhY2goa2V5d29yZCA9PiB7XHJcbiAgICAgICAgaWYgKG1lc3NhZ2VMb3dlci5pbmNsdWRlcyhrZXl3b3JkKSkge1xyXG4gICAgICAgICAgZm91bmRPYmplY3Rpb25zLnB1c2goYCR7dHlwZX06ICR7a2V5d29yZH1gKTtcclxuICAgICAgICAgIGlmIChwcmltYXJ5VHlwZSA9PT0gJ25vbmUnKSB7XHJcbiAgICAgICAgICAgIHByaW1hcnlUeXBlID0gdHlwZSBhcyBhbnk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIGhhc09iamVjdGlvbnM6IGZvdW5kT2JqZWN0aW9ucy5sZW5ndGggPiAwLFxyXG4gICAgICBvYmplY3Rpb25zOiBmb3VuZE9iamVjdGlvbnMsXHJcbiAgICAgIHR5cGU6IHByaW1hcnlUeXBlXHJcbiAgICB9O1xyXG4gIH1cclxufVxyXG4iXX0=