export interface InterestAnalysis {
    interestLevel: 'high' | 'medium' | 'low';
    urgencyLevel: 'urgent' | 'normal' | 'casual';
    confidence: number;
    indicators: {
        positive: string[];
        negative: string[];
        urgency: string[];
        casual: string[];
    };
}
export declare class InterestDetector {
    private highInterestKeywords;
    private lowInterestKeywords;
    private urgencyKeywords;
    private casualKeywords;
    private interestQuestions;
    private disinterestPatterns;
    /**
     * Analyze a message for interest and urgency levels
     */
    analyzeMessage(message: string, conversationHistory?: string[]): InterestAnalysis;
    /**
     * Analyze conversation history for patterns
     */
    private analyzeConversationHistory;
    /**
     * Determine if user is showing buying signals
     */
    detectBuyingSignals(message: string): {
        hasBuyingSignals: boolean;
        signals: string[];
        strength: 'weak' | 'moderate' | 'strong';
    };
    /**
     * Detect objections or hesitations
     */
    detectObjections(message: string): {
        hasObjections: boolean;
        objections: string[];
        type: 'price' | 'time' | 'commitment' | 'location' | 'general' | 'none';
    };
}
//# sourceMappingURL=interest-detector.d.ts.map