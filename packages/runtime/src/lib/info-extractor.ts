export interface ExtractedInfo {
  email?: {
    value: string;
    confidence: number;
    validated: boolean;
  };
  phone?: {
    value: string;
    confidence: number;
    validated: boolean;
    formatted: string;
  };
  firstName?: {
    value: string;
    confidence: number;
  };
  lastName?: {
    value: string;
    confidence: number;
  };
  fullName?: {
    value: string;
    confidence: number;
  };
}

export class InfoExtractor {
  // Email regex patterns
  private emailPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Z|a-z]{2,}\b/g // With spaces
  ];

  // Phone regex patterns
  private phonePatterns = [
    /\(\d{3}\)\s*\d{3}[-.]?\d{4}/g, // (954) 682-3329
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // 123-456-7890, 123.456.7890, 1234567890
    /\b\+?1?[-.\s]?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g, // Various formats with +1
    /\b\d{10}\b/g // Simple 10 digits
  ];

  // Common name prefixes and suffixes to filter out
  private nameFilters = {
    prefixes: ['mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'madam'],
    suffixes: ['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'esq'],
    excludeWords: [
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
      'below', 'between', 'among', 'is', 'am', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'gym', 'fitness', 'workout', 'class',
      'membership', 'planet', 'carlos', 'agent', 'hello', 'hi', 'hey', 'thanks'
    ]
  };

  /**
   * Extract all possible information from a message
   */
  extractInfo(message: string): ExtractedInfo {
    const extracted: ExtractedInfo = {};

    // Extract email
    const emailResult = this.extractEmail(message);
    if (emailResult) {
      extracted.email = emailResult;
    }

    // Extract phone
    const phoneResult = this.extractPhone(message);
    if (phoneResult) {
      extracted.phone = phoneResult;
    }

    // Extract names
    const nameResult = this.extractNames(message);
    if (nameResult.firstName) {
      extracted.firstName = nameResult.firstName;
    }
    if (nameResult.lastName) {
      extracted.lastName = nameResult.lastName;
    }
    if (nameResult.fullName) {
      extracted.fullName = nameResult.fullName;
    }

    return extracted;
  }

  /**
   * Extract email addresses from message
   */
  private extractEmail(message: string): ExtractedInfo['email'] | null {
    for (const pattern of this.emailPatterns) {
      const matches = message.match(pattern);
      if (matches && matches.length > 0) {
        const email = matches[0].replace(/\s/g, ''); // Remove any spaces
        const isValid = this.validateEmail(email);
        
        return {
          value: email.toLowerCase(),
          confidence: isValid ? 0.95 : 0.7,
          validated: isValid
        };
      }
    }
    return null;
  }

  /**
   * Extract phone numbers from message
   */
  private extractPhone(message: string): ExtractedInfo['phone'] | null {
    for (const pattern of this.phonePatterns) {
      const matches = message.match(pattern);
      if (matches && matches.length > 0) {
        const rawPhone = matches[0];
        const cleanPhone = this.cleanPhoneNumber(rawPhone);
        const formatted = this.formatPhoneNumber(cleanPhone);
        const isValid = this.validatePhone(cleanPhone);
        
        if (isValid) {
          return {
            value: cleanPhone,
            confidence: 0.9,
            validated: true,
            formatted
          };
        }
      }
    }
    return null;
  }

  /**
   * Extract names from message
   */
  private extractNames(message: string): {
    firstName?: ExtractedInfo['firstName'];
    lastName?: ExtractedInfo['lastName'];
    fullName?: ExtractedInfo['fullName'];
  } {
    // Look for common name introduction patterns
    const namePatterns = [
      /(?:my name is|i'm|im|i am|call me|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /(?:name['']?s|named)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?:\s+here|$)/i, // Name at start
      /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g // Two capitalized words
    ];

    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const fullName = match[1].trim();
        const nameParts = this.parseFullName(fullName);
        
        if (nameParts.isValid) {
          const result: any = {};
          
          if (nameParts.firstName) {
            result.firstName = {
              value: nameParts.firstName,
              confidence: nameParts.confidence
            };
          }
          
          if (nameParts.lastName) {
            result.lastName = {
              value: nameParts.lastName,
              confidence: nameParts.confidence
            };
          }
          
          result.fullName = {
            value: fullName,
            confidence: nameParts.confidence
          };
          
          return result;
        }
      }
    }

    return {};
  }

  /**
   * Parse a full name into first and last name components
   */
  private parseFullName(fullName: string): {
    firstName?: string;
    lastName?: string;
    confidence: number;
    isValid: boolean;
  } {
    const words = fullName.split(/\s+/).filter(word => 
      word.length > 1 && 
      !this.nameFilters.excludeWords.includes(word.toLowerCase()) &&
      !this.nameFilters.prefixes.includes(word.toLowerCase()) &&
      !this.nameFilters.suffixes.includes(word.toLowerCase())
    );

    if (words.length === 0) {
      return { confidence: 0, isValid: false };
    }

    if (words.length === 1) {
      // Single name - assume it's first name
      return {
        firstName: words[0],
        confidence: 0.7,
        isValid: true
      };
    }

    if (words.length >= 2) {
      // Multiple names - first is first name, last is last name
      return {
        firstName: words[0],
        lastName: words[words.length - 1],
        confidence: 0.9,
        isValid: true
      };
    }

    return { confidence: 0, isValid: false };
  }

  /**
   * Validate email format
   */
  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && 
           email.length <= 254 && 
           !email.includes('..') &&
           !email.startsWith('.') &&
           !email.endsWith('.');
  }

  /**
   * Clean phone number to digits only
   */
  private cleanPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    
    // Remove leading 1 if it's 11 digits (US format)
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return cleaned.substring(1);
    }
    
    return cleaned;
  }

  /**
   * Validate phone number
   */
  private validatePhone(phone: string): boolean {
    // Must be exactly 10 digits for US numbers
    if (phone.length !== 10) return false;
    
    // First digit can't be 0 or 1
    if (phone[0] === '0' || phone[0] === '1') return false;
    
    // Area code (first 3 digits) can't start with 0 or 1
    if (phone[0] === '0' || phone[0] === '1') return false;
    
    // Exchange code (digits 4-6) can't start with 0 or 1
    if (phone[3] === '0' || phone[3] === '1') return false;
    
    return true;
  }

  /**
   * Format phone number for display
   */
  private formatPhoneNumber(phone: string): string {
    if (phone.length === 10) {
      return `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
    }
    return phone;
  }

  /**
   * Check if message contains information request decline
   */
  detectInformationDecline(message: string): {
    declined: boolean;
    type: 'email' | 'phone' | 'name' | 'general' | null;
    confidence: number;
  } {
    const declinePatterns = [
      /no thanks?/i,
      /not right now/i,
      /maybe later/i,
      /don'?t want to/i,
      /prefer not to/i,
      /rather not/i,
      /not comfortable/i,
      /privacy/i,
      /personal/i,
      /skip/i,
      /pass/i
    ];

    const messageLower = message.toLowerCase();
    let declined = false;
    let confidence = 0;

    for (const pattern of declinePatterns) {
      if (pattern.test(message)) {
        declined = true;
        confidence = 0.8;
        break;
      }
    }

    // Check for specific information type declines
    let type: 'email' | 'phone' | 'name' | 'general' | null = null;
    if (declined) {
      if (messageLower.includes('email')) type = 'email';
      else if (messageLower.includes('phone') || messageLower.includes('number')) type = 'phone';
      else if (messageLower.includes('name')) type = 'name';
      else type = 'general';
    }

    return { declined, type, confidence };
  }

  /**
   * Detect if user is providing information in response to a request
   */
  detectInformationProvision(message: string, requestedType: 'email' | 'phone' | 'name'): {
    isProviding: boolean;
    confidence: number;
    extracted?: any;
  } {
    const extracted = this.extractInfo(message);
    
    switch (requestedType) {
      case 'email':
        return {
          isProviding: !!extracted.email,
          confidence: extracted.email?.confidence || 0,
          extracted: extracted.email
        };
        
      case 'phone':
        return {
          isProviding: !!extracted.phone,
          confidence: extracted.phone?.confidence || 0,
          extracted: extracted.phone
        };
        
      case 'name':
        const hasName = !!(extracted.firstName || extracted.lastName || extracted.fullName);
        const nameConfidence = Math.max(
          extracted.firstName?.confidence || 0,
          extracted.lastName?.confidence || 0,
          extracted.fullName?.confidence || 0
        );
        
        return {
          isProviding: hasName,
          confidence: nameConfidence,
          extracted: {
            firstName: extracted.firstName,
            lastName: extracted.lastName,
            fullName: extracted.fullName
          }
        };
        
      default:
        return { isProviding: false, confidence: 0 };
    }
  }
}
