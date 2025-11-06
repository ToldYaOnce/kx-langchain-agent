"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InfoExtractor = void 0;
class InfoExtractor {
    constructor() {
        // Email regex patterns
        this.emailPatterns = [
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            /\b[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9.-]+\s*\.\s*[A-Z|a-z]{2,}\b/g // With spaces
        ];
        // Phone regex patterns
        this.phonePatterns = [
            /\(\d{3}\)\s*\d{3}[-.]?\d{4}/g, // (954) 682-3329
            /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // 123-456-7890, 123.456.7890, 1234567890
            /\b\+?1?[-.\s]?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g, // Various formats with +1
            /\b\d{10}\b/g // Simple 10 digits
        ];
        // Common name prefixes and suffixes to filter out
        this.nameFilters = {
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
    }
    /**
     * Extract all possible information from a message
     */
    extractInfo(message) {
        const extracted = {};
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
    extractEmail(message) {
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
    extractPhone(message) {
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
    extractNames(message) {
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
                    const result = {};
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
    parseFullName(fullName) {
        const words = fullName.split(/\s+/).filter(word => word.length > 1 &&
            !this.nameFilters.excludeWords.includes(word.toLowerCase()) &&
            !this.nameFilters.prefixes.includes(word.toLowerCase()) &&
            !this.nameFilters.suffixes.includes(word.toLowerCase()));
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
    validateEmail(email) {
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
    cleanPhoneNumber(phone) {
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
    validatePhone(phone) {
        // Must be exactly 10 digits for US numbers
        if (phone.length !== 10)
            return false;
        // First digit can't be 0 or 1
        if (phone[0] === '0' || phone[0] === '1')
            return false;
        // Area code (first 3 digits) can't start with 0 or 1
        if (phone[0] === '0' || phone[0] === '1')
            return false;
        // Exchange code (digits 4-6) can't start with 0 or 1
        if (phone[3] === '0' || phone[3] === '1')
            return false;
        return true;
    }
    /**
     * Format phone number for display
     */
    formatPhoneNumber(phone) {
        if (phone.length === 10) {
            return `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`;
        }
        return phone;
    }
    /**
     * Check if message contains information request decline
     */
    detectInformationDecline(message) {
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
        let type = null;
        if (declined) {
            if (messageLower.includes('email'))
                type = 'email';
            else if (messageLower.includes('phone') || messageLower.includes('number'))
                type = 'phone';
            else if (messageLower.includes('name'))
                type = 'name';
            else
                type = 'general';
        }
        return { declined, type, confidence };
    }
    /**
     * Detect if user is providing information in response to a request
     */
    detectInformationProvision(message, requestedType) {
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
                const nameConfidence = Math.max(extracted.firstName?.confidence || 0, extracted.lastName?.confidence || 0, extracted.fullName?.confidence || 0);
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
exports.InfoExtractor = InfoExtractor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mby1leHRyYWN0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbGliL2luZm8tZXh0cmFjdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQTBCQSxNQUFhLGFBQWE7SUFBMUI7UUFDRSx1QkFBdUI7UUFDZixrQkFBYSxHQUFHO1lBQ3RCLHNEQUFzRDtZQUN0RCxrRUFBa0UsQ0FBQyxjQUFjO1NBQ2xGLENBQUM7UUFFRix1QkFBdUI7UUFDZixrQkFBYSxHQUFHO1lBQ3RCLDhCQUE4QixFQUFFLGlCQUFpQjtZQUNqRCxnQ0FBZ0MsRUFBRSx5Q0FBeUM7WUFDM0UsNERBQTRELEVBQUUsMEJBQTBCO1lBQ3hGLGFBQWEsQ0FBQyxtQkFBbUI7U0FDbEMsQ0FBQztRQUVGLGtEQUFrRDtRQUMxQyxnQkFBVyxHQUFHO1lBQ3BCLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQztZQUMzRCxRQUFRLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDO1lBQzdELFlBQVksRUFBRTtnQkFDWixLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUk7Z0JBQzVFLE1BQU0sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsT0FBTztnQkFDOUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxJ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QUFPLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDakQsQ0FBQztJQUNILENBQUM7Q0FDRjtBQTdWRCxzQ0E2VkMiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgaW50ZXJmYWNlIEV4dHJhY3RlZEluZm8ge1xuICBlbWFpbD86IHtcbiAgICB2YWx1ZTogc3RyaW5nO1xuICAgIGNvbmZpZGVuY2U6IG51bWJlcjtcbiAgICB2YWxpZGF0ZWQ6IGJvb2xlYW47XG4gIH07XG4gIHBob25lPzoge1xuICAgIHZhbHVlOiBzdHJpbmc7XG4gICAgY29uZmlkZW5jZTogbnVtYmVyO1xuICAgIHZhbGlkYXRlZDogYm9vbGVhbjtcbiAgICBmb3JtYXR0ZWQ6IHN0cmluZztcbiAgfTtcbiAgZmlyc3ROYW1lPzoge1xuICAgIHZhbHVlOiBzdHJpbmc7XG4gICAgY29uZmlkZW5jZTogbnVtYmVyO1xuICB9O1xuICBsYXN0TmFtZT86IHtcbiAgICB2YWx1ZTogc3RyaW5nO1xuICAgIGNvbmZpZGVuY2U6IG51bWJlcjtcbiAgfTtcbiAgZnVsbE5hbWU/OiB7XG4gICAgdmFsdWU6IHN0cmluZztcbiAgICBjb25maWRlbmNlOiBudW1iZXI7XG4gIH07XG59XG5cbmV4cG9ydCBjbGFzcyBJbmZvRXh0cmFjdG9yIHtcbiAgLy8gRW1haWwgcmVnZXggcGF0dGVybnNcbiAgcHJpdmF0ZSBlbWFpbFBhdHRlcm5zID0gW1xuICAgIC9cXGJbQS1aYS16MC05Ll8lKy1dK0BbQS1aYS16MC05Li1dK1xcLltBLVp8YS16XXsyLH1cXGIvZyxcbiAgICAvXFxiW0EtWmEtejAtOS5fJSstXStcXHMqQFxccypbQS1aYS16MC05Li1dK1xccypcXC5cXHMqW0EtWnxhLXpdezIsfVxcYi9nIC8vIFdpdGggc3BhY2VzXG4gIF07XG5cbiAgLy8gUGhvbmUgcmVnZXggcGF0dGVybnNcbiAgcHJpdmF0ZSBwaG9uZVBhdHRlcm5zID0gW1xuICAgIC9cXChcXGR7M31cXClcXHMqXFxkezN9Wy0uXT9cXGR7NH0vZywgLy8gKDk1NCkgNjgyLTMzMjlcbiAgICAvXFxiXFxkezN9Wy0uXT9cXGR7M31bLS5dP1xcZHs0fVxcYi9nLCAvLyAxMjMtNDU2LTc4OTAsIDEyMy40NTYuNzg5MCwgMTIzNDU2Nzg5MFxuICAgIC9cXGJcXCs/MT9bLS5cXHNdP1xcKD8oXFxkezN9KVxcKT9bLS5cXHNdPyhcXGR7M30pWy0uXFxzXT8oXFxkezR9KVxcYi9nLCAvLyBWYXJpb3VzIGZvcm1hdHMgd2l0aCArMVxuICAgIC9cXGJcXGR7MTB9XFxiL2cgLy8gU2ltcGxlIDEwIGRpZ2l0c1xuICBdO1xuXG4gIC8vIENvbW1vbiBuYW1lIHByZWZpeGVzIGFuZCBzdWZmaXhlcyB0byBmaWx0ZXIgb3V0XG4gIHByaXZhdGUgbmFtZUZpbHRlcnMgPSB7XG4gICAgcHJlZml4ZXM6IFsnbXInLCAnbXJzJywgJ21zJywgJ2RyJywgJ3Byb2YnLCAnc2lyJywgJ21hZGFtJ10sXG4gICAgc3VmZml4ZXM6IFsnanInLCAnc3InLCAnaWknLCAnaWlpJywgJ2l2JywgJ3BoZCcsICdtZCcsICdlc3EnXSxcbiAgICBleGNsdWRlV29yZHM6IFtcbiAgICAgICd0aGUnLCAnYW5kJywgJ29yJywgJ2J1dCcsICdpbicsICdvbicsICdhdCcsICd0bycsICdmb3InLCAnb2YnLCAnd2l0aCcsICdieScsXG4gICAgICAnZnJvbScsICd1cCcsICdhYm91dCcsICdpbnRvJywgJ3Rocm91Z2gnLCAnZHVyaW5nJywgJ2JlZm9yZScsICdhZnRlcicsICdhYm92ZScsXG4gICAgICAnYmVsb3cnLCAnYmV0d2VlbicsICdhbW9uZycsICdpcycsICdhbScsICdhcmUnLCAnd2FzJywgJ3dlcmUnLCAnYmUnLCAnYmVlbicsXG4gICAgICAnYmVpbmcnLCAnaGF2ZScsICdoYXMnLCAnaGFkJywgJ2RvJywgJ2RvZXMnLCAnZGlkJywgJ3dpbGwnLCAnd291bGQnLCAnY291bGQnLFxuICAgICAgJ3Nob3VsZCcsICdtYXknLCAnbWlnaHQnLCAnbXVzdCcsICdjYW4nLCAnZ3ltJywgJ2ZpdG5lc3MnLCAnd29ya291dCcsICdjbGFzcycsXG4gICAgICAnbWVtYmVyc2hpcCcsICdwbGFuZXQnLCAnY2FybG9zJywgJ2FnZW50JywgJ2hlbGxvJywgJ2hpJywgJ2hleScsICd0aGFua3MnXG4gICAgXVxuICB9O1xuXG4gIC8qKlxuICAgKiBFeHRyYWN0IGFsbCBwb3NzaWJsZSBpbmZvcm1hdGlvbiBmcm9tIGEgbWVzc2FnZVxuICAgKi9cbiAgZXh0cmFjdEluZm8obWVzc2FnZTogc3RyaW5nKTogRXh0cmFjdGVkSW5mbyB7XG4gICAgY29uc3QgZXh0cmFjdGVkOiBFeHRyYWN0ZWRJbmZvID0ge307XG5cbiAgICAvLyBFeHRyYWN0IGVtYWlsXG4gICAgY29uc3QgZW1haWxSZXN1bHQgPSB0aGlzLmV4dHJhY3RFbWFpbChtZXNzYWdlKTtcbiAgICBpZiAoZW1haWxSZXN1bHQpIHtcbiAgICAgIGV4dHJhY3RlZC5lbWFpbCA9IGVtYWlsUmVzdWx0O1xuICAgIH1cblxuICAgIC8vIEV4dHJhY3QgcGhvbmVcbiAgICBjb25zdCBwaG9uZVJlc3VsdCA9IHRoaXMuZXh0cmFjdFBob25lKG1lc3NhZ2UpO1xuICAgIGlmIChwaG9uZVJlc3VsdCkge1xuICAgICAgZXh0cmFjdGVkLnBob25lID0gcGhvbmVSZXN1bHQ7XG4gICAgfVxuXG4gICAgLy8gRXh0cmFjdCBuYW1lc1xuICAgIGNvbnN0IG5hbWVSZXN1bHQgPSB0aGlzLmV4dHJhY3ROYW1lcyhtZXNzYWdlKTtcbiAgICBpZiAobmFtZVJlc3VsdC5maXJzdE5hbWUpIHtcbiAgICAgIGV4dHJhY3RlZC5maXJzdE5hbWUgPSBuYW1lUmVzdWx0LmZpcnN0TmFtZTtcbiAgICB9XG4gICAgaWYgKG5hbWVSZXN1bHQubGFzdE5hbWUpIHtcbiAgICAgIGV4dHJhY3RlZC5sYXN0TmFtZSA9IG5hbWVSZXN1bHQubGFzdE5hbWU7XG4gICAgfVxuICAgIGlmIChuYW1lUmVzdWx0LmZ1bGxOYW1lKSB7XG4gICAgICBleHRyYWN0ZWQuZnVsbE5hbWUgPSBuYW1lUmVzdWx0LmZ1bGxOYW1lO1xuICAgIH1cblxuICAgIHJldHVybiBleHRyYWN0ZWQ7XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdCBlbWFpbCBhZGRyZXNzZXMgZnJvbSBtZXNzYWdlXG4gICAqL1xuICBwcml2YXRlIGV4dHJhY3RFbWFpbChtZXNzYWdlOiBzdHJpbmcpOiBFeHRyYWN0ZWRJbmZvWydlbWFpbCddIHwgbnVsbCB7XG4gICAgZm9yIChjb25zdCBwYXR0ZXJuIG9mIHRoaXMuZW1haWxQYXR0ZXJucykge1xuICAgICAgY29uc3QgbWF0Y2hlcyA9IG1lc3NhZ2UubWF0Y2gocGF0dGVybik7XG4gICAgICBpZiAobWF0Y2hlcyAmJiBtYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgZW1haWwgPSBtYXRjaGVzWzBdLnJlcGxhY2UoL1xccy9nLCAnJyk7IC8vIFJlbW92ZSBhbnkgc3BhY2VzXG4gICAgICAgIGNvbnN0IGlzVmFsaWQgPSB0aGlzLnZhbGlkYXRlRW1haWwoZW1haWwpO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICB2YWx1ZTogZW1haWwudG9Mb3dlckNhc2UoKSxcbiAgICAgICAgICBjb25maWRlbmNlOiBpc1ZhbGlkID8gMC45NSA6IDAuNyxcbiAgICAgICAgICB2YWxpZGF0ZWQ6IGlzVmFsaWRcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdCBwaG9uZSBudW1iZXJzIGZyb20gbWVzc2FnZVxuICAgKi9cbiAgcHJpdmF0ZSBleHRyYWN0UGhvbmUobWVzc2FnZTogc3RyaW5nKTogRXh0cmFjdGVkSW5mb1sncGhvbmUnXSB8IG51bGwge1xuICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiB0aGlzLnBob25lUGF0dGVybnMpIHtcbiAgICAgIGNvbnN0IG1hdGNoZXMgPSBtZXNzYWdlLm1hdGNoKHBhdHRlcm4pO1xuICAgICAgaWYgKG1hdGNoZXMgJiYgbWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIGNvbnN0IHJhd1Bob25lID0gbWF0Y2hlc1swXTtcbiAgICAgICAgY29uc3QgY2xlYW5QaG9uZSA9IHRoaXMuY2xlYW5QaG9uZU51bWJlcihyYXdQaG9uZSk7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRlZCA9IHRoaXMuZm9ybWF0UGhvbmVOdW1iZXIoY2xlYW5QaG9uZSk7XG4gICAgICAgIGNvbnN0IGlzVmFsaWQgPSB0aGlzLnZhbGlkYXRlUGhvbmUoY2xlYW5QaG9uZSk7XG4gICAgICAgIFxuICAgICAgICBpZiAoaXNWYWxpZCkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICB2YWx1ZTogY2xlYW5QaG9uZSxcbiAgICAgICAgICAgIGNvbmZpZGVuY2U6IDAuOSxcbiAgICAgICAgICAgIHZhbGlkYXRlZDogdHJ1ZSxcbiAgICAgICAgICAgIGZvcm1hdHRlZFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvKipcbiAgICogRXh0cmFjdCBuYW1lcyBmcm9tIG1lc3NhZ2VcbiAgICovXG4gIHByaXZhdGUgZXh0cmFjdE5hbWVzKG1lc3NhZ2U6IHN0cmluZyk6IHtcbiAgICBmaXJzdE5hbWU/OiBFeHRyYWN0ZWRJbmZvWydmaXJzdE5hbWUnXTtcbiAgICBsYXN0TmFtZT86IEV4dHJhY3RlZEluZm9bJ2xhc3ROYW1lJ107XG4gICAgZnVsbE5hbWU/OiBFeHRyYWN0ZWRJbmZvWydmdWxsTmFtZSddO1xuICB9IHtcbiAgICAvLyBMb29rIGZvciBjb21tb24gbmFtZSBpbnRyb2R1Y3Rpb24gcGF0dGVybnNcbiAgICBjb25zdCBuYW1lUGF0dGVybnMgPSBbXG4gICAgICAvKD86bXkgbmFtZSBpc3xpJ218aW18aSBhbXxjYWxsIG1lfHRoaXMgaXMpXFxzKyhbQS1aXVthLXpdKyg/OlxccytbQS1aXVthLXpdKykqKS9pLFxuICAgICAgLyg/Om5hbWVbJyddP3N8bmFtZWQpXFxzKyhbQS1aXVthLXpdKyg/OlxccytbQS1aXVthLXpdKykqKS9pLFxuICAgICAgL14oW0EtWl1bYS16XSsoPzpcXHMrW0EtWl1bYS16XSspKikoPzpcXHMraGVyZXwkKS9pLCAvLyBOYW1lIGF0IHN0YXJ0XG4gICAgICAvXFxiKFtBLVpdW2Etel0rXFxzK1tBLVpdW2Etel0rKVxcYi9nIC8vIFR3byBjYXBpdGFsaXplZCB3b3Jkc1xuICAgIF07XG5cbiAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgbmFtZVBhdHRlcm5zKSB7XG4gICAgICBjb25zdCBtYXRjaCA9IG1lc3NhZ2UubWF0Y2gocGF0dGVybik7XG4gICAgICBpZiAobWF0Y2ggJiYgbWF0Y2hbMV0pIHtcbiAgICAgICAgY29uc3QgZnVsbE5hbWUgPSBtYXRjaFsxXS50cmltKCk7XG4gICAgICAgIGNvbnN0IG5hbWVQYXJ0cyA9IHRoaXMucGFyc2VGdWxsTmFtZShmdWxsTmFtZSk7XG4gICAgICAgIFxuICAgICAgICBpZiAobmFtZVBhcnRzLmlzVmFsaWQpIHtcbiAgICAgICAgICBjb25zdCByZXN1bHQ6IGFueSA9IHt9O1xuICAgICAgICAgIFxuICAgICAgICAgIGlmIChuYW1lUGFydHMuZmlyc3ROYW1lKSB7XG4gICAgICAgICAgICByZXN1bHQuZmlyc3ROYW1lID0ge1xuICAgICAgICAgICAgICB2YWx1ZTogbmFtZVBhcnRzLmZpcnN0TmFtZSxcbiAgICAgICAgICAgICAgY29uZmlkZW5jZTogbmFtZVBhcnRzLmNvbmZpZGVuY2VcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIGlmIChuYW1lUGFydHMubGFzdE5hbWUpIHtcbiAgICAgICAgICAgIHJlc3VsdC5sYXN0TmFtZSA9IHtcbiAgICAgICAgICAgICAgdmFsdWU6IG5hbWVQYXJ0cy5sYXN0TmFtZSxcbiAgICAgICAgICAgICAgY29uZmlkZW5jZTogbmFtZVBhcnRzLmNvbmZpZGVuY2VcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHJlc3VsdC5mdWxsTmFtZSA9IHtcbiAgICAgICAgICAgIHZhbHVlOiBmdWxsTmFtZSxcbiAgICAgICAgICAgIGNvbmZpZGVuY2U6IG5hbWVQYXJ0cy5jb25maWRlbmNlXG4gICAgICAgICAgfTtcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHt9O1xuICB9XG5cbiAgLyoqXG4gICAqIFBhcnNlIGEgZnVsbCBuYW1lIGludG8gZmlyc3QgYW5kIGxhc3QgbmFtZSBjb21wb25lbnRzXG4gICAqL1xuICBwcml2YXRlIHBhcnNlRnVsbE5hbWUoZnVsbE5hbWU6IHN0cmluZyk6IHtcbiAgICBmaXJzdE5hbWU/OiBzdHJpbmc7XG4gICAgbGFzdE5hbWU/OiBzdHJpbmc7XG4gICAgY29uZmlkZW5jZTogbnVtYmVyO1xuICAgIGlzVmFsaWQ6IGJvb2xlYW47XG4gIH0ge1xuICAgIGNvbnN0IHdvcmRzID0gZnVsbE5hbWUuc3BsaXQoL1xccysvKS5maWx0ZXIod29yZCA9PiBcbiAgICAgIHdvcmQubGVuZ3RoID4gMSAmJiBcbiAgICAgICF0aGlzLm5hbWVGaWx0ZXJzLmV4Y2x1ZGVXb3Jkcy5pbmNsdWRlcyh3b3JkLnRvTG93ZXJDYXNlKCkpICYmXG4gICAgICAhdGhpcy5uYW1lRmlsdGVycy5wcmVmaXhlcy5pbmNsdWRlcyh3b3JkLnRvTG93ZXJDYXNlKCkpICYmXG4gICAgICAhdGhpcy5uYW1lRmlsdGVycy5zdWZmaXhlcy5pbmNsdWRlcyh3b3JkLnRvTG93ZXJDYXNlKCkpXG4gICAgKTtcblxuICAgIGlmICh3b3Jkcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB7IGNvbmZpZGVuY2U6IDAsIGlzVmFsaWQ6IGZhbHNlIH07XG4gICAgfVxuXG4gICAgaWYgKHdvcmRzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgLy8gU2luZ2xlIG5hbWUgLSBhc3N1bWUgaXQncyBmaXJzdCBuYW1lXG4gICAgICByZXR1cm4ge1xuICAgICAgICBmaXJzdE5hbWU6IHdvcmRzWzBdLFxuICAgICAgICBjb25maWRlbmNlOiAwLjcsXG4gICAgICAgIGlzVmFsaWQ6IHRydWVcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKHdvcmRzLmxlbmd0aCA+PSAyKSB7XG4gICAgICAvLyBNdWx0aXBsZSBuYW1lcyAtIGZpcnN0IGlzIGZpcnN0IG5hbWUsIGxhc3QgaXMgbGFzdCBuYW1lXG4gICAgICByZXR1cm4ge1xuICAgICAgICBmaXJzdE5hbWU6IHdvcmRzWzBdLFxuICAgICAgICBsYXN0TmFtZTogd29yZHNbd29yZHMubGVuZ3RoIC0gMV0sXG4gICAgICAgIGNvbmZpZGVuY2U6IDAuOSxcbiAgICAgICAgaXNWYWxpZDogdHJ1ZVxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBjb25maWRlbmNlOiAwLCBpc1ZhbGlkOiBmYWxzZSB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlIGVtYWlsIGZvcm1hdFxuICAgKi9cbiAgcHJpdmF0ZSB2YWxpZGF0ZUVtYWlsKGVtYWlsOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBlbWFpbFJlZ2V4ID0gL15bXlxcc0BdK0BbXlxcc0BdK1xcLlteXFxzQF0rJC87XG4gICAgcmV0dXJuIGVtYWlsUmVnZXgudGVzdChlbWFpbCkgJiYgXG4gICAgICAgICAgIGVtYWlsLmxlbmd0aCA8PSAyNTQgJiYgXG4gICAgICAgICAgICFlbWFpbC5pbmNsdWRlcygnLi4nKSAmJlxuICAgICAgICAgICAhZW1haWwuc3RhcnRzV2l0aCgnLicpICYmXG4gICAgICAgICAgICFlbWFpbC5lbmRzV2l0aCgnLicpO1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFuIHBob25lIG51bWJlciB0byBkaWdpdHMgb25seVxuICAgKi9cbiAgcHJpdmF0ZSBjbGVhblBob25lTnVtYmVyKHBob25lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IGNsZWFuZWQgPSBwaG9uZS5yZXBsYWNlKC9cXEQvZywgJycpO1xuICAgIFxuICAgIC8vIFJlbW92ZSBsZWFkaW5nIDEgaWYgaXQncyAxMSBkaWdpdHMgKFVTIGZvcm1hdClcbiAgICBpZiAoY2xlYW5lZC5sZW5ndGggPT09IDExICYmIGNsZWFuZWQuc3RhcnRzV2l0aCgnMScpKSB7XG4gICAgICByZXR1cm4gY2xlYW5lZC5zdWJzdHJpbmcoMSk7XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBjbGVhbmVkO1xuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlIHBob25lIG51bWJlclxuICAgKi9cbiAgcHJpdmF0ZSB2YWxpZGF0ZVBob25lKHBob25lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAvLyBNdXN0IGJlIGV4YWN0bHkgMTAgZGlnaXRzIGZvciBVUyBudW1iZXJzXG4gICAgaWYgKHBob25lLmxlbmd0aCAhPT0gMTApIHJldHVybiBmYWxzZTtcbiAgICBcbiAgICAvLyBGaXJzdCBkaWdpdCBjYW4ndCBiZSAwIG9yIDFcbiAgICBpZiAocGhvbmVbMF0gPT09ICcwJyB8fCBwaG9uZVswXSA9PT0gJzEnKSByZXR1cm4gZmFsc2U7XG4gICAgXG4gICAgLy8gQXJlYSBjb2RlIChmaXJzdCAzIGRpZ2l0cykgY2FuJ3Qgc3RhcnQgd2l0aCAwIG9yIDFcbiAgICBpZiAocGhvbmVbMF0gPT09ICcwJyB8fCBwaG9uZVswXSA9PT0gJzEnKSByZXR1cm4gZmFsc2U7XG4gICAgXG4gICAgLy8gRXhjaGFuZ2UgY29kZSAoZGlnaXRzIDQtNikgY2FuJ3Qgc3RhcnQgd2l0aCAwIG9yIDFcbiAgICBpZiAocGhvbmVbM10gPT09ICcwJyB8fCBwaG9uZVszXSA9PT0gJzEnKSByZXR1cm4gZmFsc2U7XG4gICAgXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICAvKipcbiAgICogRm9ybWF0IHBob25lIG51bWJlciBmb3IgZGlzcGxheVxuICAgKi9cbiAgcHJpdmF0ZSBmb3JtYXRQaG9uZU51bWJlcihwaG9uZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBpZiAocGhvbmUubGVuZ3RoID09PSAxMCkge1xuICAgICAgcmV0dXJuIGAoJHtwaG9uZS5zdWJzdHJpbmcoMCwgMyl9KSAke3Bob25lLnN1YnN0cmluZygzLCA2KX0tJHtwaG9uZS5zdWJzdHJpbmcoNil9YDtcbiAgICB9XG4gICAgcmV0dXJuIHBob25lO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIG1lc3NhZ2UgY29udGFpbnMgaW5mb3JtYXRpb24gcmVxdWVzdCBkZWNsaW5lXG4gICAqL1xuICBkZXRlY3RJbmZvcm1hdGlvbkRlY2xpbmUobWVzc2FnZTogc3RyaW5nKToge1xuICAgIGRlY2xpbmVkOiBib29sZWFuO1xuICAgIHR5cGU6ICdlbWFpbCcgfCAncGhvbmUnIHwgJ25hbWUnIHwgJ2dlbmVyYWwnIHwgbnVsbDtcbiAgICBjb25maWRlbmNlOiBudW1iZXI7XG4gIH0ge1xuICAgIGNvbnN0IGRlY2xpbmVQYXR0ZXJucyA9IFtcbiAgICAgIC9ubyB0aGFua3M/L2ksXG4gICAgICAvbm90IHJpZ2h0IG5vdy9pLFxuICAgICAgL21heWJlIGxhdGVyL2ksXG4gICAgICAvZG9uJz90IHdhbnQgdG8vaSxcbiAgICAgIC9wcmVmZXIgbm90IHRvL2ksXG4gICAgICAvcmF0aGVyIG5vdC9pLFxuICAgICAgL25vdCBjb21mb3J0YWJsZS9pLFxuICAgICAgL3ByaXZhY3kvaSxcbiAgICAgIC9wZXJzb25hbC9pLFxuICAgICAgL3NraXAvaSxcbiAgICAgIC9wYXNzL2lcbiAgICBdO1xuXG4gICAgY29uc3QgbWVzc2FnZUxvd2VyID0gbWVzc2FnZS50b0xvd2VyQ2FzZSgpO1xuICAgIGxldCBkZWNsaW5lZCA9IGZhbHNlO1xuICAgIGxldCBjb25maWRlbmNlID0gMDtcblxuICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBkZWNsaW5lUGF0dGVybnMpIHtcbiAgICAgIGlmIChwYXR0ZXJuLnRlc3QobWVzc2FnZSkpIHtcbiAgICAgICAgZGVjbGluZWQgPSB0cnVlO1xuICAgICAgICBjb25maWRlbmNlID0gMC44O1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDaGVjayBmb3Igc3BlY2lmaWMgaW5mb3JtYXRpb24gdHlwZSBkZWNsaW5lc1xuICAgIGxldCB0eXBlOiAnZW1haWwnIHwgJ3Bob25lJyB8ICduYW1lJyB8ICdnZW5lcmFsJyB8IG51bGwgPSBudWxsO1xuICAgIGlmIChkZWNsaW5lZCkge1xuICAgICAgaWYgKG1lc3NhZ2VMb3dlci5pbmNsdWRlcygnZW1haWwnKSkgdHlwZSA9ICdlbWFpbCc7XG4gICAgICBlbHNlIGlmIChtZXNzYWdlTG93ZXIuaW5jbHVkZXMoJ3Bob25lJykgfHwgbWVzc2FnZUxvd2VyLmluY2x1ZGVzKCdudW1iZXInKSkgdHlwZSA9ICdwaG9uZSc7XG4gICAgICBlbHNlIGlmIChtZXNzYWdlTG93ZXIuaW5jbHVkZXMoJ25hbWUnKSkgdHlwZSA9ICduYW1lJztcbiAgICAgIGVsc2UgdHlwZSA9ICdnZW5lcmFsJztcbiAgICB9XG5cbiAgICByZXR1cm4geyBkZWNsaW5lZCwgdHlwZSwgY29uZmlkZW5jZSB9O1xuICB9XG5cbiAgLyoqXG4gICAqIERldGVjdCBpZiB1c2VyIGlzIHByb3ZpZGluZyBpbmZvcm1hdGlvbiBpbiByZXNwb25zZSB0byBhIHJlcXVlc3RcbiAgICovXG4gIGRldGVjdEluZm9ybWF0aW9uUHJvdmlzaW9uKG1lc3NhZ2U6IHN0cmluZywgcmVxdWVzdGVkVHlwZTogJ2VtYWlsJyB8ICdwaG9uZScgfCAnbmFtZScpOiB7XG4gICAgaXNQcm92aWRpbmc6IGJvb2xlYW47XG4gICAgY29uZmlkZW5jZTogbnVtYmVyO1xuICAgIGV4dHJhY3RlZD86IGFueTtcbiAgfSB7XG4gICAgY29uc3QgZXh0cmFjdGVkID0gdGhpcy5leHRyYWN0SW5mbyhtZXNzYWdlKTtcbiAgICBcbiAgICBzd2l0Y2ggKHJlcXVlc3RlZFR5cGUpIHtcbiAgICAgIGNhc2UgJ2VtYWlsJzpcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBpc1Byb3ZpZGluZzogISFleHRyYWN0ZWQuZW1haWwsXG4gICAgICAgICAgY29uZmlkZW5jZTogZXh0cmFjdGVkLmVtYWlsPy5jb25maWRlbmNlIHx8IDAsXG4gICAgICAgICAgZXh0cmFjdGVkOiBleHRyYWN0ZWQuZW1haWxcbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICBjYXNlICdwaG9uZSc6XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgaXNQcm92aWRpbmc6ICEhZXh0cmFjdGVkLnBob25lLFxuICAgICAgICAgIGNvbmZpZGVuY2U6IGV4dHJhY3RlZC5waG9uZT8uY29uZmlkZW5jZSB8fCAwLFxuICAgICAgICAgIGV4dHJhY3RlZDogZXh0cmFjdGVkLnBob25lXG4gICAgICAgIH07XG4gICAgICAgIFxuICAgICAgY2FzZSAnbmFtZSc6XG4gICAgICAgIGNvbnN0IGhhc05hbWUgPSAhIShleHRyYWN0ZWQuZmlyc3ROYW1lIHx8IGV4dHJhY3RlZC5sYXN0TmFtZSB8fCBleHRyYWN0ZWQuZnVsbE5hbWUpO1xuICAgICAgICBjb25zdCBuYW1lQ29uZmlkZW5jZSA9IE1hdGgubWF4KFxuICAgICAgICAgIGV4dHJhY3RlZC5maXJzdE5hbWU/LmNvbmZpZGVuY2UgfHwgMCxcbiAgICAgICAgICBleHRyYWN0ZWQubGFzdE5hbWU/LmNvbmZpZGVuY2UgfHwgMCxcbiAgICAgICAgICBleHRyYWN0ZWQuZnVsbE5hbWU/LmNvbmZpZGVuY2UgfHwgMFxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBpc1Byb3ZpZGluZzogaGFzTmFtZSxcbiAgICAgICAgICBjb25maWRlbmNlOiBuYW1lQ29uZmlkZW5jZSxcbiAgICAgICAgICBleHRyYWN0ZWQ6IHtcbiAgICAgICAgICAgIGZpcnN0TmFtZTogZXh0cmFjdGVkLmZpcnN0TmFtZSxcbiAgICAgICAgICAgIGxhc3ROYW1lOiBleHRyYWN0ZWQubGFzdE5hbWUsXG4gICAgICAgICAgICBmdWxsTmFtZTogZXh0cmFjdGVkLmZ1bGxOYW1lXG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICBcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB7IGlzUHJvdmlkaW5nOiBmYWxzZSwgY29uZmlkZW5jZTogMCB9O1xuICAgIH1cbiAgfVxufVxuIl19