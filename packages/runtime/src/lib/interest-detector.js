export class InterestDetector {
    // High interest indicators
    highInterestKeywords = [
        'interested', 'want', 'need', 'love', 'excited', 'ready', 'sign up', 'join',
        'start', 'begin', 'when can', 'how do i', 'tell me more', 'sounds great',
        'perfect', 'awesome', 'amazing', 'definitely', 'absolutely', 'yes please',
        'membership', 'pricing', 'cost', 'schedule', 'classes', 'workout'
    ];
    // Low interest indicators
    lowInterestKeywords = [
        'maybe', 'not sure', 'thinking about', 'considering', 'later', 'sometime',
        'not ready', 'busy', 'no time', 'expensive', 'too much', 'cant afford',
        'just looking', 'browsing', 'information only', 'not interested'
    ];
    // Urgency indicators
    urgencyKeywords = [
        'now', 'today', 'asap', 'quickly', 'urgent', 'immediate', 'right away',
        'this week', 'soon', 'fast', 'hurry', 'rush', 'deadline', 'limited time',
        'before', 'by when', 'how long', 'waiting'
    ];
    // Casual indicators
    casualKeywords = [
        'whenever', 'no rush', 'take my time', 'eventually', 'someday', 'flexible',
        'no hurry', 'when convenient', 'at some point', 'down the road',
        'in the future', 'maybe later', 'not urgent'
    ];
    // Question patterns that indicate high interest
    interestQuestions = [
        /what.*cost/i, /how much/i, /what.*price/i, /what.*include/i,
        /when.*open/i, /what.*hours/i, /how.*join/i, /where.*located/i,
        /what.*classes/i, /what.*equipment/i, /can.*bring/i, /do.*have/i
    ];
    // Patterns that indicate low interest
    disinterestPatterns = [
        /just.*looking/i, /not.*ready/i, /maybe.*later/i, /too.*expensive/i,
        /cant.*afford/i, /no.*time/i, /too.*busy/i, /not.*interested/i
    ];
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
//# sourceMappingURL=interest-detector.js.map