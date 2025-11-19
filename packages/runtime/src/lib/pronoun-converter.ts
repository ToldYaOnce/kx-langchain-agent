/**
 * Converts first-person pronouns to second-person for AI system prompts
 * Allows users to write naturally ("I am...") while sending proper format to AI ("You are...")
 */
export class PronounConverter {
  /**
   * Convert first-person text to second-person with proper capitalization
   */
  static firstToSecondPerson(input: string): string {
    let text = input;

    // Step 1: Handle contractions & multi-word forms
    const replacements: [RegExp, string][] = [
      [/\bI'm\b/g, "you're"],
      [/\bI am\b/g, "you are"],
      [/\bI've\b/g, "you've"],
      [/\bI'd\b/g, "you'd"],
      [/\bI'll\b/g, "you'll"],
      [/\bme\b/g, "you"],
      [/\bmy\b/g, "your"],
      [/\bmine\b/g, "yours"],
      [/\bmyself\b/g, "yourself"],
      [/\bI\b/g, "you"]
    ];

    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }

    // Step 2: Fix capitalization at sentence starts
    // Capitalize "you" at the very beginning
    text = text.replace(/^you\b/, 'You');
    
    // Capitalize "you" after sentence-ending punctuation (. ! ? followed by space)
    text = text.replace(/([.!?]\s+)you\b/g, '$1You');
    
    // Capitalize "you" after newlines
    text = text.replace(/(\n\s*)you\b/g, '$1You');

    return text;
  }

  /**
   * Check if text appears to be in first person
   */
  static isFirstPerson(text: string): boolean {
    const firstPersonPattern = /\b(I am|I'm|I've|I'd|I'll|I\b|me\b|my\b|mine\b|myself\b)/i;
    return firstPersonPattern.test(text);
  }

  /**
   * Check if text appears to be in second person
   */
  static isSecondPerson(text: string): boolean {
    const secondPersonPattern = /\b(You are|You're|You've|You'd|You'll|You\b|your\b|yours\b|yourself\b)/i;
    return secondPersonPattern.test(text);
  }
}

