import type { PersonalityTraits } from '../config/personas.js';

/**
 * Converts numeric personality trait scales (1-10) into natural language
 * instructions that Claude can interpret and follow consistently.
 */
export class PersonalityTraitsInterpreter {
  /**
   * Generate a system prompt section from personality traits
   */
  static generatePromptSection(traits: PersonalityTraits): string {
    const sections: string[] = [];
    
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
  
  private static interpretEnthusiasm(level: number): string {
    if (level <= 2) return 'Very calm and measured energy';
    if (level <= 4) return 'Mild enthusiasm, mostly neutral';
    if (level <= 6) return 'Moderate energy and positivity';
    if (level <= 8) return 'High energy and motivating';
    return 'Extremely energetic and hype-driven';
  }
  
  private static interpretWarmth(level: number): string {
    if (level <= 2) return 'Professional distance, minimal warmth';
    if (level <= 4) return 'Polite but not overly friendly';
    if (level <= 6) return 'Friendly and approachable';
    if (level <= 8) return 'Very warm and welcoming';
    return 'Exceptionally warm, nurturing, and inviting';
  }
  
  private static interpretProfessionalism(level: number): string {
    if (level <= 2) return 'Very casual, informal language';
    if (level <= 4) return 'Conversational with some casual elements';
    if (level <= 6) return 'Balanced professional tone';
    if (level <= 8) return 'Formal and polished communication';
    return 'Highly formal, corporate language';
  }
  
  private static interpretAssertiveness(level: number): string {
    if (level <= 2) return 'Very passive, lets user drive';
    if (level <= 4) return 'Gentle guidance, minimal pushing';
    if (level <= 6) return 'Moderate assertiveness, balanced guidance';
    if (level <= 8) return 'Confidently directive, clear CTAs';
    return 'Highly assertive, strongly drives toward goals';
  }
  
  private static interpretEmpathy(level: number): string {
    if (level <= 2) return 'Direct and factual, minimal emotional acknowledgment';
    if (level <= 4) return 'Polite acknowledgment of feelings';
    if (level <= 6) return 'Understanding and considerate';
    if (level <= 8) return 'Highly empathetic, adjusts tone carefully';
    return 'Deeply empathetic, mirrors and validates emotions extensively';
  }
  
  private static interpretHumor(level: number): string {
    if (level <= 2) return 'Serious and straightforward, no jokes';
    if (level <= 4) return 'Occasional light humor if appropriate';
    if (level <= 6) return 'Regular use of humor and playfulness';
    if (level <= 8) return 'Frequent jokes, banter, and metaphors';
    return 'Constantly playful, heavy use of humor and wit';
  }
  
  private static interpretConfidence(level: number): string {
    if (level <= 2) return 'Humble helper, tentative suggestions';
    if (level <= 4) return 'Supportive but not overly confident';
    if (level <= 6) return 'Confident and knowledgeable';
    if (level <= 8) return 'Strong expert tone, authoritative';
    return 'Alpha expert, commanding presence';
  }
  
  private static interpretSalesAggression(level: number): string {
    if (level <= 2) return 'Very passive, waits for user to ask';
    if (level <= 4) return 'Gentle nudges toward next steps';
    if (level <= 6) return 'Clear CTAs when appropriate';
    if (level <= 8) return 'Proactive conversion focus';
    return 'Highly aggressive, constant conversion push';
  }
  
  private static interpretVerbosity(level: number): string {
    if (level <= 2) return 'EXTREMELY BRIEF - Maximum 1-2 sentences per response, NO EXCEPTIONS. Get to the point immediately.';
    if (level <= 4) return 'CONCISE - Maximum 2-3 sentences per response. Be direct and avoid rambling.';
    if (level <= 6) return 'BALANCED - Keep responses to 3-4 sentences. Be thorough but not excessive.';
    if (level <= 8) return 'DETAILED - 4-6 sentences per response. Provide explanations and context.';
    return 'COMPREHENSIVE - 6-10 sentences when needed. Be thorough and educational.';
  }
  
  private static interpretTechnicality(level: number): string {
    if (level <= 2) return 'Plain language, no jargon';
    if (level <= 4) return 'Simple terms with minimal technical words';
    if (level <= 6) return 'Balanced mix of technical and plain language';
    if (level <= 8) return 'Industry terminology and jargon-heavy';
    return 'Highly technical, expert-level language';
  }
  
  private static interpretEmpathicEmotionality(level: number): string {
    if (level <= 2) return 'Neutral tone, minimal emotion mirroring';
    if (level <= 4) return 'Subtle acknowledgment of user emotions';
    if (level <= 6) return 'Moderate emotional responsiveness';
    if (level <= 8) return 'Strong emotional mirroring and validation';
    return 'Dramatic empathic responses, intense emotion matching';
  }
  
  private static interpretHumorStyle(level: number): string {
    if (level <= 2) return 'Safe, inoffensive humor only';
    if (level <= 4) return 'Light, universally acceptable jokes';
    if (level <= 6) return 'Balanced humor with mild edge';
    if (level <= 8) return 'Edgier humor, playful teasing';
    return 'Bold humor, trash talk, edgy jokes';
  }
  
  private static interpretDirectness(level: number): string {
    if (level <= 2) return 'Very indirect, gentle, roundabout';
    if (level <= 4) return 'Polite with some indirection';
    if (level <= 6) return 'Balanced directness';
    if (level <= 8) return 'Quite direct and to-the-point';
    return 'Extremely blunt and concise';
  }
  
  private static interpretBrandedLanguage(level: number): string {
    if (level <= 2) return 'Rarely use custom terminology';
    if (level <= 4) return 'Occasional branded phrases';
    if (level <= 6) return 'Regular use of brand terminology';
    if (level <= 8) return 'Frequent branded language integration';
    return 'Constant use of brand-specific terms and phrases';
  }
  
  private static interpretCharacterActing(level: number): string {
    if (level <= 2) return 'Neutral assistant, no character';
    if (level <= 4) return 'Subtle character hints';
    if (level <= 6) return 'Moderate character embodiment';
    if (level <= 8) return 'Strong character commitment';
    return 'Full character immersion with accents, slang, signature lines';
  }
  
  private static interpretEmojiFrequency(level: number): string {
    if (level <= 2) return 'Never use emojis';
    if (level <= 4) return 'Rare emoji usage';
    if (level <= 6) return 'Occasional emojis for emphasis';
    if (level <= 8) return 'Frequent emoji usage';
    return 'Heavy emoji usage in most messages';
  }
  
  private static interpretQuestionRatio(level: number): string {
    if (level <= 2) return 'Rarely ask questions - mostly make statements and share information';
    if (level <= 4) return 'Occasionally ask questions when it feels natural';
    if (level <= 6) return 'Regularly ask questions to maintain engagement and show interest';
    if (level <= 8) return 'Frequently end your responses with a question to keep the conversation flowing';
    return 'ALWAYS end EVERY response with a question - keep them engaged! Make it natural and in your voice, not generic.';
  }
  
  private static interpretLeadConversion(level: number): string {
    if (level <= 2) return 'Passive, wait for user to volunteer info';
    if (level <= 4) return 'Gentle requests when contextually appropriate';
    if (level <= 6) return 'Proactive but polite contact collection';
    if (level <= 8) return 'Strong focus on capturing contact info';
    return 'Aggressive lead capture, persistent requests';
  }
  
  private static interpretSupportiveness(level: number): string {
    if (level <= 2) return 'Neutral, minimal affirmation';
    if (level <= 4) return 'Polite acknowledgment';
    if (level <= 6) return 'Encouraging and supportive';
    if (level <= 8) return 'Highly affirming and motivating';
    return 'Extremely supportive, constant positive reinforcement';
  }
  
  private static interpretEducationDepth(level: number): string {
    if (level <= 2) return 'Minimal explanation, just answers';
    if (level <= 4) return 'Brief context when needed';
    if (level <= 6) return 'Moderate educational content';
    if (level <= 8) return 'Detailed teaching and explanation';
    return 'Comprehensive education, deep explanations';
  }
  
  private static interpretPersonalization(level: number): string {
    if (level <= 2) return 'Generic responses, minimal tailoring';
    if (level <= 4) return 'Basic acknowledgment of user details';
    if (level <= 6) return 'Moderate personalization';
    if (level <= 8) return 'Strong personalization based on user info';
    return 'Highly personalized, references many user details';
  }
}

