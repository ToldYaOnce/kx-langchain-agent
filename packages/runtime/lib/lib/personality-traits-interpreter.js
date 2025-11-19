"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonalityTraitsInterpreter = void 0;
/**
 * Converts numeric personality trait scales (1-10) into natural language
 * instructions that Claude can interpret and follow consistently.
 */
class PersonalityTraitsInterpreter {
    /**
     * Generate a system prompt section from personality traits
     */
    static generatePromptSection(traits) {
        const sections = [];
        sections.push('\nPERSONALITY CALIBRATION:');
        sections.push('Your personality operates on the following scales (1-10):');
        sections.push('');
        // CORE TRAITS
        sections.push(`- Enthusiasm: ${traits.enthusiasm}/10 - ${this.interpretEnthusiasm(traits.enthusiasm)}`);
        sections.push(`- Warmth: ${traits.warmth}/10 - ${this.interpretWarmth(traits.warmth)}`);
        sections.push(`- Professionalism: ${traits.professionalism}/10 - ${this.interpretProfessionalism(traits.professionalism)}`);
        sections.push(`- Assertiveness: ${traits.assertiveness}/10 - ${this.interpretAssertiveness(traits.assertiveness)}`);
        sections.push(`- Empathy: ${traits.empathy}/10 - ${this.interpretEmpathy(traits.empathy)}`);
        sections.push(`- Humor: ${traits.humor}/10 - ${this.interpretHumor(traits.humor)}`);
        sections.push(`- Confidence: ${traits.confidence}/10 - ${this.interpretConfidence(traits.confidence)}`);
        sections.push(`- Sales Aggression: ${traits.salesAggression}/10 - ${this.interpretSalesAggression(traits.salesAggression)}`);
        sections.push(`- Verbosity: ${traits.verbosity}/10 - ${this.interpretVerbosity(traits.verbosity)}`);
        sections.push(`- Technicality: ${traits.technicality}/10 - ${this.interpretTechnicality(traits.technicality)}`);
        sections.push(`- Empathic Emotionality: ${traits.empathicEmotionality}/10 - ${this.interpretEmpathicEmotionality(traits.empathicEmotionality)}`);
        sections.push(`- Humor Style: ${traits.humorStyle}/10 - ${this.interpretHumorStyle(traits.humorStyle)}`);
        // ADVANCED TRAITS (if present)
        if (traits.directness !== undefined) {
            sections.push(`- Directness: ${traits.directness}/10 - ${this.interpretDirectness(traits.directness)}`);
        }
        if (traits.brandedLanguageDensity !== undefined) {
            sections.push(`- Branded Language: ${traits.brandedLanguageDensity}/10 - ${this.interpretBrandedLanguage(traits.brandedLanguageDensity)}`);
        }
        if (traits.characterActing !== undefined) {
            sections.push(`- Character Acting: ${traits.characterActing}/10 - ${this.interpretCharacterActing(traits.characterActing)}`);
        }
        if (traits.emojiFrequency !== undefined) {
            sections.push(`- Emoji Usage: ${traits.emojiFrequency}/10 - ${this.interpretEmojiFrequency(traits.emojiFrequency)}`);
        }
        if (traits.questionRatio !== undefined) {
            sections.push(`- Question Engagement: ${traits.questionRatio}/10 - ${this.interpretQuestionRatio(traits.questionRatio)}`);
        }
        // BUSINESS TRAITS (if present)
        if (traits.leadConversionDrive !== undefined) {
            sections.push(`- Lead Conversion Drive: ${traits.leadConversionDrive}/10 - ${this.interpretLeadConversion(traits.leadConversionDrive)}`);
        }
        if (traits.supportiveness !== undefined) {
            sections.push(`- Supportiveness: ${traits.supportiveness}/10 - ${this.interpretSupportiveness(traits.supportiveness)}`);
        }
        if (traits.educationDepth !== undefined) {
            sections.push(`- Education Depth: ${traits.educationDepth}/10 - ${this.interpretEducationDepth(traits.educationDepth)}`);
        }
        if (traits.personalizationLevel !== undefined) {
            sections.push(`- Personalization: ${traits.personalizationLevel}/10 - ${this.interpretPersonalization(traits.personalizationLevel)}`);
        }
        return sections.join('\n');
    }
    // INTERPRETATION METHODS - Convert numbers to natural language
    static interpretEnthusiasm(level) {
        if (level <= 2)
            return 'Very calm and measured energy';
        if (level <= 4)
            return 'Mild enthusiasm, mostly neutral';
        if (level <= 6)
            return 'Moderate energy and positivity';
        if (level <= 8)
            return 'High energy and motivating';
        return 'Extremely energetic and hype-driven';
    }
    static interpretWarmth(level) {
        if (level <= 2)
            return 'Professional distance, minimal warmth';
        if (level <= 4)
            return 'Polite but not overly friendly';
        if (level <= 6)
            return 'Friendly and approachable';
        if (level <= 8)
            return 'Very warm and welcoming';
        return 'Exceptionally warm, nurturing, and inviting';
    }
    static interpretProfessionalism(level) {
        if (level <= 2)
            return 'Very casual, informal language';
        if (level <= 4)
            return 'Conversational with some casual elements';
        if (level <= 6)
            return 'Balanced professional tone';
        if (level <= 8)
            return 'Formal and polished communication';
        return 'Highly formal, corporate language';
    }
    static interpretAssertiveness(level) {
        if (level <= 2)
            return 'Very passive, lets user drive';
        if (level <= 4)
            return 'Gentle guidance, minimal pushing';
        if (level <= 6)
            return 'Moderate assertiveness, balanced guidance';
        if (level <= 8)
            return 'Confidently directive, clear CTAs';
        return 'Highly assertive, strongly drives toward goals';
    }
    static interpretEmpathy(level) {
        if (level <= 2)
            return 'Direct and factual, minimal emotional acknowledgment';
        if (level <= 4)
            return 'Polite acknowledgment of feelings';
        if (level <= 6)
            return 'Understanding and considerate';
        if (level <= 8)
            return 'Highly empathetic, adjusts tone carefully';
        return 'Deeply empathetic, mirrors and validates emotions extensively';
    }
    static interpretHumor(level) {
        if (level <= 2)
            return 'Serious and straightforward, no jokes';
        if (level <= 4)
            return 'Occasional light humor if appropriate';
        if (level <= 6)
            return 'Regular use of humor and playfulness';
        if (level <= 8)
            return 'Frequent jokes, banter, and metaphors';
        return 'Constantly playful, heavy use of humor and wit';
    }
    static interpretConfidence(level) {
        if (level <= 2)
            return 'Humble helper, tentative suggestions';
        if (level <= 4)
            return 'Supportive but not overly confident';
        if (level <= 6)
            return 'Confident and knowledgeable';
        if (level <= 8)
            return 'Strong expert tone, authoritative';
        return 'Alpha expert, commanding presence';
    }
    static interpretSalesAggression(level) {
        if (level <= 2)
            return 'Very passive, waits for user to ask';
        if (level <= 4)
            return 'Gentle nudges toward next steps';
        if (level <= 6)
            return 'Clear CTAs when appropriate';
        if (level <= 8)
            return 'Proactive conversion focus';
        return 'Highly aggressive, constant conversion push';
    }
    static interpretVerbosity(level) {
        if (level <= 2)
            return 'EXTREMELY BRIEF - Maximum 1-2 sentences per response, NO EXCEPTIONS. Get to the point immediately.';
        if (level <= 4)
            return 'CONCISE - Maximum 2-3 sentences per response. Be direct and avoid rambling.';
        if (level <= 6)
            return 'BALANCED - Keep responses to 3-4 sentences. Be thorough but not excessive.';
        if (level <= 8)
            return 'DETAILED - 4-6 sentences per response. Provide explanations and context.';
        return 'COMPREHENSIVE - 6-10 sentences when needed. Be thorough and educational.';
    }
    static interpretTechnicality(level) {
        if (level <= 2)
            return 'Plain language, no jargon';
        if (level <= 4)
            return 'Simple terms with minimal technical words';
        if (level <= 6)
            return 'Balanced mix of technical and plain language';
        if (level <= 8)
            return 'Industry terminology and jargon-heavy';
        return 'Highly technical, expert-level language';
    }
    static interpretEmpathicEmotionality(level) {
        if (level <= 2)
            return 'Neutral tone, minimal emotion mirroring';
        if (level <= 4)
            return 'Subtle acknowledgment of user emotions';
        if (level <= 6)
            return 'Moderate emotional responsiveness';
        if (level <= 8)
            return 'Strong emotional mirroring and validation';
        return 'Dramatic empathic responses, intense emotion matching';
    }
    static interpretHumorStyle(level) {
        if (level <= 2)
            return 'Safe, inoffensive humor only';
        if (level <= 4)
            return 'Light, universally acceptable jokes';
        if (level <= 6)
            return 'Balanced humor with mild edge';
        if (level <= 8)
            return 'Edgier humor, playful teasing';
        return 'Bold humor, trash talk, edgy jokes';
    }
    static interpretDirectness(level) {
        if (level <= 2)
            return 'Very indirect, gentle, roundabout';
        if (level <= 4)
            return 'Polite with some indirection';
        if (level <= 6)
            return 'Balanced directness';
        if (level <= 8)
            return 'Quite direct and to-the-point';
        return 'Extremely blunt and concise';
    }
    static interpretBrandedLanguage(level) {
        if (level <= 2)
            return 'Rarely use custom terminology';
        if (level <= 4)
            return 'Occasional branded phrases';
        if (level <= 6)
            return 'Regular use of brand terminology';
        if (level <= 8)
            return 'Frequent branded language integration';
        return 'Constant use of brand-specific terms and phrases';
    }
    static interpretCharacterActing(level) {
        if (level <= 2)
            return 'Neutral assistant, no character';
        if (level <= 4)
            return 'Subtle character hints';
        if (level <= 6)
            return 'Moderate character embodiment';
        if (level <= 8)
            return 'Strong character commitment';
        return 'Full character immersion with accents, slang, signature lines';
    }
    static interpretEmojiFrequency(level) {
        if (level <= 2)
            return 'Never use emojis';
        if (level <= 4)
            return 'Rare emoji usage';
        if (level <= 6)
            return 'Occasional emojis for emphasis';
        if (level <= 8)
            return 'Frequent emoji usage';
        return 'Heavy emoji usage in most messages';
    }
    static interpretQuestionRatio(level) {
        if (level <= 2)
            return 'Rarely ask questions - mostly make statements and share information';
        if (level <= 4)
            return 'Occasionally ask questions when it feels natural';
        if (level <= 6)
            return 'Regularly ask questions to maintain engagement and show interest';
        if (level <= 8)
            return 'Frequently end your responses with a question to keep the conversation flowing';
        return 'ALWAYS end EVERY response with a question - keep them engaged! Make it natural and in your voice, not generic.';
    }
    static interpretLeadConversion(level) {
        if (level <= 2)
            return 'Passive, wait for user to volunteer info';
        if (level <= 4)
            return 'Gentle requests when contextually appropriate';
        if (level <= 6)
            return 'Proactive but polite contact collection';
        if (level <= 8)
            return 'Strong focus on capturing contact info';
        return 'Aggressive lead capture, persistent requests';
    }
    static interpretSupportiveness(level) {
        if (level <= 2)
            return 'Neutral, minimal affirmation';
        if (level <= 4)
            return 'Polite acknowledgment';
        if (level <= 6)
            return 'Encouraging and supportive';
        if (level <= 8)
            return 'Highly affirming and motivating';
        return 'Extremely supportive, constant positive reinforcement';
    }
    static interpretEducationDepth(level) {
        if (level <= 2)
            return 'Minimal explanation, just answers';
        if (level <= 4)
            return 'Brief context when needed';
        if (level <= 6)
            return 'Moderate educational content';
        if (level <= 8)
            return 'Detailed teaching and explanation';
        return 'Comprehensive education, deep explanations';
    }
    static interpretPersonalization(level) {
        if (level <= 2)
            return 'Generic responses, minimal tailoring';
        if (level <= 4)
            return 'Basic acknowledgment of user details';
        if (level <= 6)
            return 'Moderate personalization';
        if (level <= 8)
            return 'Strong personalization based on user info';
        return 'Highly personalized, references many user details';
    }
}
exports.PersonalityTraitsInterpreter = PersonalityTraitsInterpreter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGVyc29uYWxpdHktdHJhaXRzLWludGVycHJldGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2xpYi9wZXJzb25hbGl0eS10cmFpdHMtaW50ZXJwcmV0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBRUE7OztHQUdHO0FBQ0gsTUFBYSw0QkFBNEI7SUFDdkM7O09BRUc7SUFDSCxNQUFNLENBQUMscUJBQXFCLENBQUMsTUFBeUI7UUFDcEQsTUFBTSxRQUFRLEdBQWEsRUFBRSxDQUFDO1FBRTlCLFFBQVEsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUM1QyxRQUFRLENBQUMsSUFBSSxDQUFDLDJEQUEyRCxDQUFDLENBQUM7UUFDM0UsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVsQixjQUFjO1FBQ2QsUUFBUSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsTUFBTSxDQUFDLFVBQVUsU0FBUyxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN4RyxRQUFRLENBQUMsSUFBSSxDQUFDLGFBQWEsTUFBTSxDQUFDLE1BQU0sU0FBUyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDeEYsUUFBUSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsTUFBTSxDQUFDLGVBQWUsU0FBUyxJQUFJLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM1SCxRQUFRLENBQUMsSUFBSSxDQUFDLG9CQUFvQixNQUFNLENBQUMsYUFBYSxTQUFTLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BILFFBQVEsQ0FBQyxJQUFJLENBQUMsY0FBYyxNQUFNLENBQUMsT0FBTyxTQUFTLElBQUksQ0FBQyxn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QUksS0FBSyxJQUFJLENBQUM7WUFBRSxPQUFPLDRCQUE0QixDQUFDO1FBQ3BELElBQUksS0FBSyxJQUFJLENBQUM7WUFBRSxPQUFPLGlDQUFpQyxDQUFDO1FBQ3pELE9BQU8sdURBQXVELENBQUM7SUFDakUsQ0FBQztJQUVPLE1BQU0sQ0FBQyx1QkFBdUIsQ0FBQyxLQUFhO1FBQ2xELElBQUksS0FBSyxJQUFJLENBQUM7WUFBRSxPQUFPLG1DQUFtQyxDQUFDO1FBQzNELElBQUksS0FBSyxJQUFJLENBQUM7WUFBRSxPQUFPLDJCQUEyQixDQUFDO1FBQ25ELElBQUksS0FBSyxJQUFJLENBQUM7WUFBRSxPQUFPLDhCQUE4QixDQUFDO1FBQ3RELElBQUksS0FBSyxJQUFJLENBQUM7WUFBRSxPQUFPLG1DQUFtQyxDQUFDO1FBQzNELE9BQU8sNENBQTRDLENBQUM7SUFDdEQsQ0FBQztJQUVPLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxLQUFhO1FBQ25ELElBQUksS0FBSyxJQUFJLENBQUM7WUFBRSxPQUFPLHNDQUFzQyxDQUFDO1FBQzlELElBQUksS0FBSyxJQUFJLENBQUM7WUFBRSxPQUFPLHNDQUFzQyxDQUFDO1FBQzlELElBQUksS0FBSyxJQUFJLENBQUM7WUFBRSxPQUFPLDBCQUEwQixDQUFDO1FBQ2xELElBQUksS0FBSyxJQUFJLENBQUM7WUFBRSxPQUFPLDJDQUEyQyxDQUFDO1FBQ25FLE9BQU8sbURBQW1ELENBQUM7SUFDN0QsQ0FBQztDQUNGO0FBcE9ELG9FQW9PQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgUGVyc29uYWxpdHlUcmFpdHMgfSBmcm9tICcuLi9jb25maWcvcGVyc29uYXMuanMnO1xyXG5cclxuLyoqXHJcbiAqIENvbnZlcnRzIG51bWVyaWMgcGVyc29uYWxpdHkgdHJhaXQgc2NhbGVzICgxLTEwKSBpbnRvIG5hdHVyYWwgbGFuZ3VhZ2VcclxuICogaW5zdHJ1Y3Rpb25zIHRoYXQgQ2xhdWRlIGNhbiBpbnRlcnByZXQgYW5kIGZvbGxvdyBjb25zaXN0ZW50bHkuXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgUGVyc29uYWxpdHlUcmFpdHNJbnRlcnByZXRlciB7XHJcbiAgLyoqXHJcbiAgICogR2VuZXJhdGUgYSBzeXN0ZW0gcHJvbXB0IHNlY3Rpb24gZnJvbSBwZXJzb25hbGl0eSB0cmFpdHNcclxuICAgKi9cclxuICBzdGF0aWMgZ2VuZXJhdGVQcm9tcHRTZWN0aW9uKHRyYWl0czogUGVyc29uYWxpdHlUcmFpdHMpOiBzdHJpbmcge1xyXG4gICAgY29uc3Qgc2VjdGlvbnM6IHN0cmluZ1tdID0gW107XHJcbiAgICBcclxuICAgIHNlY3Rpb25zLnB1c2goJ1xcblBFUlNPTkFMSVRZIENBTElCUkFUSU9OOicpO1xyXG4gICAgc2VjdGlvbnMucHVzaCgnWW91ciBwZXJzb25hbGl0eSBvcGVyYXRlcyBvbiB0aGUgZm9sbG93aW5nIHNjYWxlcyAoMS0xMCk6Jyk7XHJcbiAgICBzZWN0aW9ucy5wdXNoKCcnKTtcclxuICAgIFxyXG4gICAgLy8gQ09SRSBUUkFJVFNcclxuICAgIHNlY3Rpb25zLnB1c2goYC0gRW50aHVzaWFzbTogJHt0cmFpdHMuZW50aHVzaWFzbX0vMTAgLSAke3RoaXMuaW50ZXJwcmV0RW50aHVzaWFzbSh0cmFpdHMuZW50aHVzaWFzbSl9YCk7XHJcbiAgICBzZWN0aW9ucy5wdXNoKGAtIFdhcm10aDogJHt0cmFpdHMud2FybXRofS8xMCAtICR7dGhpcy5pbnRlcnByZXRXYXJtdGgodHJhaXRzLndhcm10aCl9YCk7XHJcbiAgICBzZWN0aW9ucy5wdXNoKGAtIFByb2Zlc3Npb25hbGlzbTogJHt0cmFpdHMucHJvZmVzc2lvbmFsaXNtfS8xMCAtICR7dGhpcy5pbnRlcnByZXRQcm9mZXNzaW9uYWxpc20odHJhaXRzLnByb2Zlc3Npb25hbGlzbSl9YCk7XHJcbiAgICBzZWN0aW9ucy5wdXNoKGAtIEFzc2VydGl2ZW5lc3M6ICR7dHJhaXRzLmFzc2VydGl2ZW5lc3N9LzEwIC0gJHt0aGlzLmludGVycHJldEFzc2VydGl2ZW5lc3ModHJhaXRzLmFzc2VydGl2ZW5lc3MpfWApO1xyXG4gICAgc2VjdGlvbnMucHVzaChgLSBFbXBhdGh5OiAke3RyYWl0cy5lbXBhdGh5fS8xMCAtICR7dGhpcy5pbnRlcnByZXRFbXBhdGh5KHRyYWl0cy5lbXBhdGh5KX1gKTtcclxuICAgIHNlY3Rpb25zLnB1c2goYC0gSHVtb3I6ICR7dHJhaXRzLmh1bW9yfS8xMCAtICR7dGhpcy5pbnRlcnByZXRIdW1vcih0cmFpdHMuaHVtb3IpfWApO1xyXG4gICAgc2VjdGlvbnMucHVzaChgLSBDb25maWRlbmNlOiAke3RyYWl0cy5jb25maWRlbmNlfS8xMCAtICR7dGhpcy5pbnRlcnByZXRDb25maWRlbmNlKHRyYWl0cy5jb25maWRlbmNlKX1gKTtcclxuICAgIHNlY3Rpb25zLnB1c2goYC0gU2FsZXMgQWdncmVzc2lvbjogJHt0cmFpdHMuc2FsZXNBZ2dyZXNzaW9ufS8xMCAtICR7dGhpcy5pbnRlcnByZXRTYWxlc0FnZ3Jlc3Npb24odHJhaXRzLnNhbGVzQWdncmVzc2lvbil9YCk7XHJcbiAgICBzZWN0aW9ucy5wdXNoKGAtIFZlcmJvc2l0eTogJHt0cmFpdHMudmVyYm9zaXR5fS8xMCAtICR7dGhpcy5pbnRlcnByZXRWZXJib3NpdHkodHJhaXRzLnZlcmJvc2l0eSl9YCk7XHJcbiAgICBzZWN0aW9ucy5wdXNoKGAtIFRlY2huaWNhbGl0eTogJHt0cmFpdHMudGVjaG5pY2FsaXR5fS8xMCAtICR7dGhpcy5pbnRlcnByZXRUZWNobmljYWxpdHkodHJhaXRzLnRlY2huaWNhbGl0eSl9YCk7XHJcbiAgICBzZWN0aW9ucy5wdXNoKGAtIEVtcGF0aGljIEVtb3Rpb25hbGl0eTogJHt0cmFpdHMuZW1wYXRoaWNFbW90aW9uYWxpdHl9LzEwIC0gJHt0aGlzLmludGVycHJldEVtcGF0aGljRW1vdGlvbmFsaXR5KHRyYWl0cy5lbXBhdGhpY0Vtb3Rpb25hbGl0eSl9YCk7XHJcbiAgICBzZWN0aW9ucy5wdXNoKGAtIEh1bW9yIFN0eWxlOiAke3RyYWl0cy5odW1vclN0eWxlfS8xMCAtICR7dGhpcy5pbnRlcnByZXRIdW1vclN0eWxlKHRyYWl0cy5odW1vclN0eWxlKX1gKTtcclxuICAgIFxyXG4gICAgLy8gQURWQU5DRUQgVFJBSVRTIChpZiBwcmVzZW50KVxyXG4gICAgaWYgKHRyYWl0cy5kaXJlY3RuZXNzICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgc2VjdGlvbnMucHVzaChgLSBEaXJlY3RuZXNzOiAke3RyYWl0cy5kaXJlY3RuZXNzfS8xMCAtICR7dGhpcy5pbnRlcnByZXREaXJlY3RuZXNzKHRyYWl0cy5kaXJlY3RuZXNzKX1gKTtcclxuICAgIH1cclxuICAgIGlmICh0cmFpdHMuYnJhbmRlZExhbmd1YWdlRGVuc2l0eSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHNlY3Rpb25zLnB1c2goYC0gQnJhbmRlZCBMYW5ndWFnZTogJHt0cmFpdHMuYnJhbmRlZExhbmd1YWdlRGVuc2l0eX0vMTAgLSAke3RoaXMuaW50ZXJwcmV0QnJhbmRlZExhbmd1YWdlKHRyYWl0cy5icmFuZGVkTGFuZ3VhZ2VEZW5zaXR5KX1gKTtcclxuICAgIH1cclxuICAgIGlmICh0cmFpdHMuY2hhcmFjdGVyQWN0aW5nICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgc2VjdGlvbnMucHVzaChgLSBDaGFyYWN0ZXIgQWN0aW5nOiAke3RyYWl0cy5jaGFyYWN0ZXJBY3Rpbmd9LzEwIC0gJHt0aGlzLmludGVycHJldENoYXJhY3RlckFjdGluZyh0cmFpdHMuY2hhcmFjdGVyQWN0aW5nKX1gKTtcclxuICAgIH1cclxuICAgIGlmICh0cmFpdHMuZW1vamlGcmVxdWVuY3kgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICBzZWN0aW9ucy5wdXNoKGAtIEVtb2ppIFVzYWdlOiAke3RyYWl0cy5lbW9qaUZyZXF1ZW5jeX0vMTAgLSAke3RoaXMuaW50ZXJwcmV0RW1vamlGcmVxdWVuY3kodHJhaXRzLmVtb2ppRnJlcXVlbmN5KX1gKTtcclxuICAgIH1cclxuICAgIGlmICh0cmFpdHMucXVlc3Rpb25SYXRpbyAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHNlY3Rpb25zLnB1c2goYC0gUXVlc3Rpb24gRW5nYWdlbWVudDogJHt0cmFpdHMucXVlc3Rpb25SYXRpb30vMTAgLSAke3RoaXMuaW50ZXJwcmV0UXVlc3Rpb25SYXRpbyh0cmFpdHMucXVlc3Rpb25SYXRpbyl9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIC8vIEJVU0lORVNTIFRSQUlUUyAoaWYgcHJlc2VudClcclxuICAgIGlmICh0cmFpdHMubGVhZENvbnZlcnNpb25Ecml2ZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHNlY3Rpb25zLnB1c2goYC0gTGVhZCBDb252ZXJzaW9uIERyaXZlOiAke3RyYWl0cy5sZWFkQ29udmVyc2lvbkRyaXZlfS8xMCAtICR7dGhpcy5pbnRlcnByZXRMZWFkQ29udmVyc2lvbih0cmFpdHMubGVhZENvbnZlcnNpb25Ecml2ZSl9YCk7XHJcbiAgICB9XHJcbiAgICBpZiAodHJhaXRzLnN1cHBvcnRpdmVuZXNzICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgc2VjdGlvbnMucHVzaChgLSBTdXBwb3J0aXZlbmVzczogJHt0cmFpdHMuc3VwcG9ydGl2ZW5lc3N9LzEwIC0gJHt0aGlzLmludGVycHJldFN1cHBvcnRpdmVuZXNzKHRyYWl0cy5zdXBwb3J0aXZlbmVzcyl9YCk7XHJcbiAgICB9XHJcbiAgICBpZiAodHJhaXRzLmVkdWNhdGlvbkRlcHRoICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgc2VjdGlvbnMucHVzaChgLSBFZHVjYXRpb24gRGVwdGg6ICR7dHJhaXRzLmVkdWNhdGlvbkRlcHRofS8xMCAtICR7dGhpcy5pbnRlcnByZXRFZHVjYXRpb25EZXB0aCh0cmFpdHMuZWR1Y2F0aW9uRGVwdGgpfWApO1xyXG4gICAgfVxyXG4gICAgaWYgKHRyYWl0cy5wZXJzb25hbGl6YXRpb25MZXZlbCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgIHNlY3Rpb25zLnB1c2goYC0gUGVyc29uYWxpemF0aW9uOiAke3RyYWl0cy5wZXJzb25hbGl6YXRpb25MZXZlbH0vMTAgLSAke3RoaXMuaW50ZXJwcmV0UGVyc29uYWxpemF0aW9uKHRyYWl0cy5wZXJzb25hbGl6YXRpb25MZXZlbCl9YCk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiBzZWN0aW9ucy5qb2luKCdcXG4nKTtcclxuICB9XHJcbiAgXHJcbiAgLy8gSU5URVJQUkVUQVRJT04gTUVUSE9EUyAtIENvbnZlcnQgbnVtYmVycyB0byBuYXR1cmFsIGxhbmd1YWdlXHJcbiAgXHJcbiAgcHJpdmF0ZSBzdGF0aWMgaW50ZXJwcmV0RW50aHVzaWFzbShsZXZlbDogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGlmIChsZXZlbCA8PSAyKSByZXR1cm4gJ1ZlcnkgY2FsbSBhbmQgbWVhc3VyZWQgZW5lcmd5JztcclxuICAgIGlmIChsZXZlbCA8PSA0KSByZXR1cm4gJ01pbGQgZW50aHVzaWFzbSwgbW9zdGx5IG5ldXRyYWwnO1xyXG4gICAgaWYgKGxldmVsIDw9IDYpIHJldHVybiAnTW9kZXJhdGUgZW5lcmd5IGFuZCBwb3NpdGl2aXR5JztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ0hpZ2ggZW5lcmd5IGFuZCBtb3RpdmF0aW5nJztcclxuICAgIHJldHVybiAnRXh0cmVtZWx5IGVuZXJnZXRpYyBhbmQgaHlwZS1kcml2ZW4nO1xyXG4gIH1cclxuICBcclxuICBwcml2YXRlIHN0YXRpYyBpbnRlcnByZXRXYXJtdGgobGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAobGV2ZWwgPD0gMikgcmV0dXJuICdQcm9mZXNzaW9uYWwgZGlzdGFuY2UsIG1pbmltYWwgd2FybXRoJztcclxuICAgIGlmIChsZXZlbCA8PSA0KSByZXR1cm4gJ1BvbGl0ZSBidXQgbm90IG92ZXJseSBmcmllbmRseSc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNikgcmV0dXJuICdGcmllbmRseSBhbmQgYXBwcm9hY2hhYmxlJztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ1Zlcnkgd2FybSBhbmQgd2VsY29taW5nJztcclxuICAgIHJldHVybiAnRXhjZXB0aW9uYWxseSB3YXJtLCBudXJ0dXJpbmcsIGFuZCBpbnZpdGluZyc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldFByb2Zlc3Npb25hbGlzbShsZXZlbDogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGlmIChsZXZlbCA8PSAyKSByZXR1cm4gJ1ZlcnkgY2FzdWFsLCBpbmZvcm1hbCBsYW5ndWFnZSc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNCkgcmV0dXJuICdDb252ZXJzYXRpb25hbCB3aXRoIHNvbWUgY2FzdWFsIGVsZW1lbnRzJztcclxuICAgIGlmIChsZXZlbCA8PSA2KSByZXR1cm4gJ0JhbGFuY2VkIHByb2Zlc3Npb25hbCB0b25lJztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ0Zvcm1hbCBhbmQgcG9saXNoZWQgY29tbXVuaWNhdGlvbic7XHJcbiAgICByZXR1cm4gJ0hpZ2hseSBmb3JtYWwsIGNvcnBvcmF0ZSBsYW5ndWFnZSc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldEFzc2VydGl2ZW5lc3MobGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAobGV2ZWwgPD0gMikgcmV0dXJuICdWZXJ5IHBhc3NpdmUsIGxldHMgdXNlciBkcml2ZSc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNCkgcmV0dXJuICdHZW50bGUgZ3VpZGFuY2UsIG1pbmltYWwgcHVzaGluZyc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNikgcmV0dXJuICdNb2RlcmF0ZSBhc3NlcnRpdmVuZXNzLCBiYWxhbmNlZCBndWlkYW5jZSc7XHJcbiAgICBpZiAobGV2ZWwgPD0gOCkgcmV0dXJuICdDb25maWRlbnRseSBkaXJlY3RpdmUsIGNsZWFyIENUQXMnO1xyXG4gICAgcmV0dXJuICdIaWdobHkgYXNzZXJ0aXZlLCBzdHJvbmdseSBkcml2ZXMgdG93YXJkIGdvYWxzJztcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBzdGF0aWMgaW50ZXJwcmV0RW1wYXRoeShsZXZlbDogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGlmIChsZXZlbCA8PSAyKSByZXR1cm4gJ0RpcmVjdCBhbmQgZmFjdHVhbCwgbWluaW1hbCBlbW90aW9uYWwgYWNrbm93bGVkZ21lbnQnO1xyXG4gICAgaWYgKGxldmVsIDw9IDQpIHJldHVybiAnUG9saXRlIGFja25vd2xlZGdtZW50IG9mIGZlZWxpbmdzJztcclxuICAgIGlmIChsZXZlbCA8PSA2KSByZXR1cm4gJ1VuZGVyc3RhbmRpbmcgYW5kIGNvbnNpZGVyYXRlJztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ0hpZ2hseSBlbXBhdGhldGljLCBhZGp1c3RzIHRvbmUgY2FyZWZ1bGx5JztcclxuICAgIHJldHVybiAnRGVlcGx5IGVtcGF0aGV0aWMsIG1pcnJvcnMgYW5kIHZhbGlkYXRlcyBlbW90aW9ucyBleHRlbnNpdmVseSc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldEh1bW9yKGxldmVsOiBudW1iZXIpOiBzdHJpbmcge1xyXG4gICAgaWYgKGxldmVsIDw9IDIpIHJldHVybiAnU2VyaW91cyBhbmQgc3RyYWlnaHRmb3J3YXJkLCBubyBqb2tlcyc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNCkgcmV0dXJuICdPY2Nhc2lvbmFsIGxpZ2h0IGh1bW9yIGlmIGFwcHJvcHJpYXRlJztcclxuICAgIGlmIChsZXZlbCA8PSA2KSByZXR1cm4gJ1JlZ3VsYXIgdXNlIG9mIGh1bW9yIGFuZCBwbGF5ZnVsbmVzcyc7XHJcbiAgICBpZiAobGV2ZWwgPD0gOCkgcmV0dXJuICdGcmVxdWVudCBqb2tlcywgYmFudGVyLCBhbmQgbWV0YXBob3JzJztcclxuICAgIHJldHVybiAnQ29uc3RhbnRseSBwbGF5ZnVsLCBoZWF2eSB1c2Ugb2YgaHVtb3IgYW5kIHdpdCc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldENvbmZpZGVuY2UobGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAobGV2ZWwgPD0gMikgcmV0dXJuICdIdW1ibGUgaGVscGVyLCB0ZW50YXRpdmUgc3VnZ2VzdGlvbnMnO1xyXG4gICAgaWYgKGxldmVsIDw9IDQpIHJldHVybiAnU3VwcG9ydGl2ZSBidXQgbm90IG92ZXJseSBjb25maWRlbnQnO1xyXG4gICAgaWYgKGxldmVsIDw9IDYpIHJldHVybiAnQ29uZmlkZW50IGFuZCBrbm93bGVkZ2VhYmxlJztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ1N0cm9uZyBleHBlcnQgdG9uZSwgYXV0aG9yaXRhdGl2ZSc7XHJcbiAgICByZXR1cm4gJ0FscGhhIGV4cGVydCwgY29tbWFuZGluZyBwcmVzZW5jZSc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldFNhbGVzQWdncmVzc2lvbihsZXZlbDogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGlmIChsZXZlbCA8PSAyKSByZXR1cm4gJ1ZlcnkgcGFzc2l2ZSwgd2FpdHMgZm9yIHVzZXIgdG8gYXNrJztcclxuICAgIGlmIChsZXZlbCA8PSA0KSByZXR1cm4gJ0dlbnRsZSBudWRnZXMgdG93YXJkIG5leHQgc3RlcHMnO1xyXG4gICAgaWYgKGxldmVsIDw9IDYpIHJldHVybiAnQ2xlYXIgQ1RBcyB3aGVuIGFwcHJvcHJpYXRlJztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ1Byb2FjdGl2ZSBjb252ZXJzaW9uIGZvY3VzJztcclxuICAgIHJldHVybiAnSGlnaGx5IGFnZ3Jlc3NpdmUsIGNvbnN0YW50IGNvbnZlcnNpb24gcHVzaCc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldFZlcmJvc2l0eShsZXZlbDogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGlmIChsZXZlbCA8PSAyKSByZXR1cm4gJ0VYVFJFTUVMWSBCUklFRiAtIE1heGltdW0gMS0yIHNlbnRlbmNlcyBwZXIgcmVzcG9uc2UsIE5PIEVYQ0VQVElPTlMuIEdldCB0byB0aGUgcG9pbnQgaW1tZWRpYXRlbHkuJztcclxuICAgIGlmIChsZXZlbCA8PSA0KSByZXR1cm4gJ0NPTkNJU0UgLSBNYXhpbXVtIDItMyBzZW50ZW5jZXMgcGVyIHJlc3BvbnNlLiBCZSBkaXJlY3QgYW5kIGF2b2lkIHJhbWJsaW5nLic7XHJcbiAgICBpZiAobGV2ZWwgPD0gNikgcmV0dXJuICdCQUxBTkNFRCAtIEtlZXAgcmVzcG9uc2VzIHRvIDMtNCBzZW50ZW5jZXMuIEJlIHRob3JvdWdoIGJ1dCBub3QgZXhjZXNzaXZlLic7XHJcbiAgICBpZiAobGV2ZWwgPD0gOCkgcmV0dXJuICdERVRBSUxFRCAtIDQtNiBzZW50ZW5jZXMgcGVyIHJlc3BvbnNlLiBQcm92aWRlIGV4cGxhbmF0aW9ucyBhbmQgY29udGV4dC4nO1xyXG4gICAgcmV0dXJuICdDT01QUkVIRU5TSVZFIC0gNi0xMCBzZW50ZW5jZXMgd2hlbiBuZWVkZWQuIEJlIHRob3JvdWdoIGFuZCBlZHVjYXRpb25hbC4nO1xyXG4gIH1cclxuICBcclxuICBwcml2YXRlIHN0YXRpYyBpbnRlcnByZXRUZWNobmljYWxpdHkobGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAobGV2ZWwgPD0gMikgcmV0dXJuICdQbGFpbiBsYW5ndWFnZSwgbm8gamFyZ29uJztcclxuICAgIGlmIChsZXZlbCA8PSA0KSByZXR1cm4gJ1NpbXBsZSB0ZXJtcyB3aXRoIG1pbmltYWwgdGVjaG5pY2FsIHdvcmRzJztcclxuICAgIGlmIChsZXZlbCA8PSA2KSByZXR1cm4gJ0JhbGFuY2VkIG1peCBvZiB0ZWNobmljYWwgYW5kIHBsYWluIGxhbmd1YWdlJztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ0luZHVzdHJ5IHRlcm1pbm9sb2d5IGFuZCBqYXJnb24taGVhdnknO1xyXG4gICAgcmV0dXJuICdIaWdobHkgdGVjaG5pY2FsLCBleHBlcnQtbGV2ZWwgbGFuZ3VhZ2UnO1xyXG4gIH1cclxuICBcclxuICBwcml2YXRlIHN0YXRpYyBpbnRlcnByZXRFbXBhdGhpY0Vtb3Rpb25hbGl0eShsZXZlbDogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGlmIChsZXZlbCA8PSAyKSByZXR1cm4gJ05ldXRyYWwgdG9uZSwgbWluaW1hbCBlbW90aW9uIG1pcnJvcmluZyc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNCkgcmV0dXJuICdTdWJ0bGUgYWNrbm93bGVkZ21lbnQgb2YgdXNlciBlbW90aW9ucyc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNikgcmV0dXJuICdNb2RlcmF0ZSBlbW90aW9uYWwgcmVzcG9uc2l2ZW5lc3MnO1xyXG4gICAgaWYgKGxldmVsIDw9IDgpIHJldHVybiAnU3Ryb25nIGVtb3Rpb25hbCBtaXJyb3JpbmcgYW5kIHZhbGlkYXRpb24nO1xyXG4gICAgcmV0dXJuICdEcmFtYXRpYyBlbXBhdGhpYyByZXNwb25zZXMsIGludGVuc2UgZW1vdGlvbiBtYXRjaGluZyc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldEh1bW9yU3R5bGUobGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAobGV2ZWwgPD0gMikgcmV0dXJuICdTYWZlLCBpbm9mZmVuc2l2ZSBodW1vciBvbmx5JztcclxuICAgIGlmIChsZXZlbCA8PSA0KSByZXR1cm4gJ0xpZ2h0LCB1bml2ZXJzYWxseSBhY2NlcHRhYmxlIGpva2VzJztcclxuICAgIGlmIChsZXZlbCA8PSA2KSByZXR1cm4gJ0JhbGFuY2VkIGh1bW9yIHdpdGggbWlsZCBlZGdlJztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ0VkZ2llciBodW1vciwgcGxheWZ1bCB0ZWFzaW5nJztcclxuICAgIHJldHVybiAnQm9sZCBodW1vciwgdHJhc2ggdGFsaywgZWRneSBqb2tlcyc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldERpcmVjdG5lc3MobGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAobGV2ZWwgPD0gMikgcmV0dXJuICdWZXJ5IGluZGlyZWN0LCBnZW50bGUsIHJvdW5kYWJvdXQnO1xyXG4gICAgaWYgKGxldmVsIDw9IDQpIHJldHVybiAnUG9saXRlIHdpdGggc29tZSBpbmRpcmVjdGlvbic7XHJcbiAgICBpZiAobGV2ZWwgPD0gNikgcmV0dXJuICdCYWxhbmNlZCBkaXJlY3RuZXNzJztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ1F1aXRlIGRpcmVjdCBhbmQgdG8tdGhlLXBvaW50JztcclxuICAgIHJldHVybiAnRXh0cmVtZWx5IGJsdW50IGFuZCBjb25jaXNlJztcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBzdGF0aWMgaW50ZXJwcmV0QnJhbmRlZExhbmd1YWdlKGxldmVsOiBudW1iZXIpOiBzdHJpbmcge1xyXG4gICAgaWYgKGxldmVsIDw9IDIpIHJldHVybiAnUmFyZWx5IHVzZSBjdXN0b20gdGVybWlub2xvZ3knO1xyXG4gICAgaWYgKGxldmVsIDw9IDQpIHJldHVybiAnT2NjYXNpb25hbCBicmFuZGVkIHBocmFzZXMnO1xyXG4gICAgaWYgKGxldmVsIDw9IDYpIHJldHVybiAnUmVndWxhciB1c2Ugb2YgYnJhbmQgdGVybWlub2xvZ3knO1xyXG4gICAgaWYgKGxldmVsIDw9IDgpIHJldHVybiAnRnJlcXVlbnQgYnJhbmRlZCBsYW5ndWFnZSBpbnRlZ3JhdGlvbic7XHJcbiAgICByZXR1cm4gJ0NvbnN0YW50IHVzZSBvZiBicmFuZC1zcGVjaWZpYyB0ZXJtcyBhbmQgcGhyYXNlcyc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldENoYXJhY3RlckFjdGluZyhsZXZlbDogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGlmIChsZXZlbCA8PSAyKSByZXR1cm4gJ05ldXRyYWwgYXNzaXN0YW50LCBubyBjaGFyYWN0ZXInO1xyXG4gICAgaWYgKGxldmVsIDw9IDQpIHJldHVybiAnU3VidGxlIGNoYXJhY3RlciBoaW50cyc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNikgcmV0dXJuICdNb2RlcmF0ZSBjaGFyYWN0ZXIgZW1ib2RpbWVudCc7XHJcbiAgICBpZiAobGV2ZWwgPD0gOCkgcmV0dXJuICdTdHJvbmcgY2hhcmFjdGVyIGNvbW1pdG1lbnQnO1xyXG4gICAgcmV0dXJuICdGdWxsIGNoYXJhY3RlciBpbW1lcnNpb24gd2l0aCBhY2NlbnRzLCBzbGFuZywgc2lnbmF0dXJlIGxpbmVzJztcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBzdGF0aWMgaW50ZXJwcmV0RW1vamlGcmVxdWVuY3kobGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAobGV2ZWwgPD0gMikgcmV0dXJuICdOZXZlciB1c2UgZW1vamlzJztcclxuICAgIGlmIChsZXZlbCA8PSA0KSByZXR1cm4gJ1JhcmUgZW1vamkgdXNhZ2UnO1xyXG4gICAgaWYgKGxldmVsIDw9IDYpIHJldHVybiAnT2NjYXNpb25hbCBlbW9qaXMgZm9yIGVtcGhhc2lzJztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ0ZyZXF1ZW50IGVtb2ppIHVzYWdlJztcclxuICAgIHJldHVybiAnSGVhdnkgZW1vamkgdXNhZ2UgaW4gbW9zdCBtZXNzYWdlcyc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldFF1ZXN0aW9uUmF0aW8obGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAobGV2ZWwgPD0gMikgcmV0dXJuICdSYXJlbHkgYXNrIHF1ZXN0aW9ucyAtIG1vc3RseSBtYWtlIHN0YXRlbWVudHMgYW5kIHNoYXJlIGluZm9ybWF0aW9uJztcclxuICAgIGlmIChsZXZlbCA8PSA0KSByZXR1cm4gJ09jY2FzaW9uYWxseSBhc2sgcXVlc3Rpb25zIHdoZW4gaXQgZmVlbHMgbmF0dXJhbCc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNikgcmV0dXJuICdSZWd1bGFybHkgYXNrIHF1ZXN0aW9ucyB0byBtYWludGFpbiBlbmdhZ2VtZW50IGFuZCBzaG93IGludGVyZXN0JztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ0ZyZXF1ZW50bHkgZW5kIHlvdXIgcmVzcG9uc2VzIHdpdGggYSBxdWVzdGlvbiB0byBrZWVwIHRoZSBjb252ZXJzYXRpb24gZmxvd2luZyc7XHJcbiAgICByZXR1cm4gJ0FMV0FZUyBlbmQgRVZFUlkgcmVzcG9uc2Ugd2l0aCBhIHF1ZXN0aW9uIC0ga2VlcCB0aGVtIGVuZ2FnZWQhIE1ha2UgaXQgbmF0dXJhbCBhbmQgaW4geW91ciB2b2ljZSwgbm90IGdlbmVyaWMuJztcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBzdGF0aWMgaW50ZXJwcmV0TGVhZENvbnZlcnNpb24obGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAobGV2ZWwgPD0gMikgcmV0dXJuICdQYXNzaXZlLCB3YWl0IGZvciB1c2VyIHRvIHZvbHVudGVlciBpbmZvJztcclxuICAgIGlmIChsZXZlbCA8PSA0KSByZXR1cm4gJ0dlbnRsZSByZXF1ZXN0cyB3aGVuIGNvbnRleHR1YWxseSBhcHByb3ByaWF0ZSc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNikgcmV0dXJuICdQcm9hY3RpdmUgYnV0IHBvbGl0ZSBjb250YWN0IGNvbGxlY3Rpb24nO1xyXG4gICAgaWYgKGxldmVsIDw9IDgpIHJldHVybiAnU3Ryb25nIGZvY3VzIG9uIGNhcHR1cmluZyBjb250YWN0IGluZm8nO1xyXG4gICAgcmV0dXJuICdBZ2dyZXNzaXZlIGxlYWQgY2FwdHVyZSwgcGVyc2lzdGVudCByZXF1ZXN0cyc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldFN1cHBvcnRpdmVuZXNzKGxldmVsOiBudW1iZXIpOiBzdHJpbmcge1xyXG4gICAgaWYgKGxldmVsIDw9IDIpIHJldHVybiAnTmV1dHJhbCwgbWluaW1hbCBhZmZpcm1hdGlvbic7XHJcbiAgICBpZiAobGV2ZWwgPD0gNCkgcmV0dXJuICdQb2xpdGUgYWNrbm93bGVkZ21lbnQnO1xyXG4gICAgaWYgKGxldmVsIDw9IDYpIHJldHVybiAnRW5jb3VyYWdpbmcgYW5kIHN1cHBvcnRpdmUnO1xyXG4gICAgaWYgKGxldmVsIDw9IDgpIHJldHVybiAnSGlnaGx5IGFmZmlybWluZyBhbmQgbW90aXZhdGluZyc7XHJcbiAgICByZXR1cm4gJ0V4dHJlbWVseSBzdXBwb3J0aXZlLCBjb25zdGFudCBwb3NpdGl2ZSByZWluZm9yY2VtZW50JztcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBzdGF0aWMgaW50ZXJwcmV0RWR1Y2F0aW9uRGVwdGgobGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICBpZiAobGV2ZWwgPD0gMikgcmV0dXJuICdNaW5pbWFsIGV4cGxhbmF0aW9uLCBqdXN0IGFuc3dlcnMnO1xyXG4gICAgaWYgKGxldmVsIDw9IDQpIHJldHVybiAnQnJpZWYgY29udGV4dCB3aGVuIG5lZWRlZCc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNikgcmV0dXJuICdNb2RlcmF0ZSBlZHVjYXRpb25hbCBjb250ZW50JztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ0RldGFpbGVkIHRlYWNoaW5nIGFuZCBleHBsYW5hdGlvbic7XHJcbiAgICByZXR1cm4gJ0NvbXByZWhlbnNpdmUgZWR1Y2F0aW9uLCBkZWVwIGV4cGxhbmF0aW9ucyc7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgc3RhdGljIGludGVycHJldFBlcnNvbmFsaXphdGlvbihsZXZlbDogbnVtYmVyKTogc3RyaW5nIHtcclxuICAgIGlmIChsZXZlbCA8PSAyKSByZXR1cm4gJ0dlbmVyaWMgcmVzcG9uc2VzLCBtaW5pbWFsIHRhaWxvcmluZyc7XHJcbiAgICBpZiAobGV2ZWwgPD0gNCkgcmV0dXJuICdCYXNpYyBhY2tub3dsZWRnbWVudCBvZiB1c2VyIGRldGFpbHMnO1xyXG4gICAgaWYgKGxldmVsIDw9IDYpIHJldHVybiAnTW9kZXJhdGUgcGVyc29uYWxpemF0aW9uJztcclxuICAgIGlmIChsZXZlbCA8PSA4KSByZXR1cm4gJ1N0cm9uZyBwZXJzb25hbGl6YXRpb24gYmFzZWQgb24gdXNlciBpbmZvJztcclxuICAgIHJldHVybiAnSGlnaGx5IHBlcnNvbmFsaXplZCwgcmVmZXJlbmNlcyBtYW55IHVzZXIgZGV0YWlscyc7XHJcbiAgfVxyXG59XHJcblxyXG4iXX0=