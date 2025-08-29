// Sanitizer module for Kit Memory Extension
// Prevents XSS attacks by sanitizing user input and content

class InputSanitizer {
  constructor() {
    // Define allowed HTML tags and attributes for different contexts
    this.profiles = {
      // Strict: No HTML allowed, only text content
      strict: {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true,
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false
      },
      
      // Message: Allow basic formatting for chat messages
      message: {
        ALLOWED_TAGS: ['b', 'i', 'u', 'code', 'pre', 'br', 'p', 'span'],
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true,
        RETURN_DOM: false
      },
      
      // Display: For showing content in popup (more permissive)
      display: {
        ALLOWED_TAGS: ['b', 'i', 'u', 'code', 'pre', 'br', 'p', 'span', 'div', 'strong', 'em'],
        ALLOWED_ATTR: ['class'],
        ALLOWED_CLASSES: ['highlight', 'memory-item', 'timestamp'],
        KEEP_CONTENT: true,
        RETURN_DOM: false
      }
    };

    // Dangerous patterns to always remove
    this.dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi, // Event handlers like onclick, onerror, etc.
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^>]*>/gi,
      /<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi,
      /data:text\/html/gi,
      /vbscript:/gi
    ];

    // URL validation patterns
    this.urlWhitelist = [
      /^https:\/\/chat\.openai\.com/,
      /^https:\/\/chatgpt\.com/,
      /^https:\/\/claude\.ai/,
      /^https:\/\/[a-zA-Z0-9]+\.supabase\.co/
    ];
  }

  // Main sanitization function
  sanitize(input, profile = 'strict') {
    if (!input) return '';
    
    // Convert to string if needed
    const text = String(input);
    
    // First pass: Remove dangerous patterns
    let cleaned = this.removeDangerousPatterns(text);
    
    // Second pass: HTML entity encoding for strict profile
    if (profile === 'strict') {
      return this.escapeHtml(cleaned);
    }
    
    // Third pass: Use DOMPurify if available, otherwise fallback
    if (typeof DOMPurify !== 'undefined') {
      return this.sanitizeWithDOMPurify(cleaned, profile);
    } else {
      return this.sanitizeWithFallback(cleaned, profile);
    }
  }

  // Remove dangerous patterns
  removeDangerousPatterns(text) {
    let cleaned = text;
    
    for (const pattern of this.dangerousPatterns) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    return cleaned;
  }

  // HTML entity encoding
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Unescape HTML entities (for display)
  unescapeHtml(text) {
    const div = document.createElement('div');
    div.innerHTML = text;
    return div.textContent || div.innerText || '';
  }

  // Sanitize with DOMPurify library
  sanitizeWithDOMPurify(text, profile) {
    const config = this.profiles[profile] || this.profiles.strict;
    return DOMPurify.sanitize(text, config);
  }

  // Fallback sanitization without DOMPurify
  sanitizeWithFallback(text, profile) {
    // Create a temporary DOM element
    const temp = document.createElement('div');
    temp.innerHTML = text;
    
    // Get profile configuration
    const config = this.profiles[profile] || this.profiles.strict;
    const allowedTags = config.ALLOWED_TAGS || [];
    
    // Remove all script tags and event handlers
    const scripts = temp.querySelectorAll('script, iframe, object, embed, applet');
    scripts.forEach(el => el.remove());
    
    // Remove event handlers from all elements
    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
      // Remove all event handler attributes
      for (let attr of el.attributes) {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      }
      
      // Remove javascript: hrefs
      if (el.hasAttribute('href')) {
        const href = el.getAttribute('href');
        if (href && href.toLowerCase().includes('javascript:')) {
          el.removeAttribute('href');
        }
      }
      
      // Remove if not in allowed tags
      if (allowedTags.length > 0 && !allowedTags.includes(el.tagName.toLowerCase())) {
        el.replaceWith(...el.childNodes);
      }
    });
    
    return temp.innerHTML;
  }

  // Sanitize URL
  sanitizeUrl(url) {
    if (!url) return '';
    
    // Remove any control characters and trim
    let cleaned = url.replace(/[\x00-\x1F\x7F]/g, '').trim();
    
    // Prevent javascript: and data: protocols
    if (/^(javascript|data|vbscript):/i.test(cleaned)) {
      return '';
    }
    
    // Check against whitelist
    const isWhitelisted = this.urlWhitelist.some(pattern => pattern.test(cleaned));
    
    if (!isWhitelisted) {
      console.warn('URL not in whitelist:', cleaned);
      // Still return it but log for monitoring
    }
    
    return cleaned;
  }

  // Sanitize for storage in database
  sanitizeForStorage(content) {
    if (!content) return '';
    
    // Use strict profile for storage
    const sanitized = this.sanitize(content, 'strict');
    
    // Additional cleanup for storage
    // Truncate if too long (prevent DoS)
    const maxLength = 50000; // 50KB limit
    if (sanitized.length > maxLength) {
      return sanitized.substring(0, maxLength) + '... [truncated]';
    }
    
    return sanitized;
  }

  // Sanitize for display in popup
  sanitizeForDisplay(content) {
    if (!content) return '';
    
    // Use display profile
    return this.sanitize(content, 'display');
  }

  // Sanitize message content from ChatGPT/Claude
  sanitizeMessage(message) {
    if (!message) return { role: '', content: '' };
    
    return {
      role: this.sanitize(message.role, 'strict'),
      content: this.sanitizeForStorage(message.content),
      timestamp: message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString(),
      url: message.url ? this.sanitizeUrl(message.url) : '',
      site: this.sanitize(message.site, 'strict')
    };
  }

  // Validate and sanitize conversation ID
  sanitizeConversationId(id) {
    if (!id) return '';
    
    // Allow only alphanumeric, dash, and underscore
    return String(id).replace(/[^a-zA-Z0-9\-_]/g, '');
  }

  // Check if content contains potential XSS
  detectXSS(content) {
    if (!content) return false;
    
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /eval\s*\(/i,
      /document\.(write|writeln|cookie)/i,
      /window\.location/i,
      /innerHTML\s*=/i,
      /<img[^>]+onerror/i,
      /<svg[^>]+onload/i
    ];
    
    return xssPatterns.some(pattern => pattern.test(content));
  }

  // Log security events
  logSecurityEvent(type, details) {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      details,
      blocked: true
    };
    
    // Store security events for monitoring
    chrome.storage.local.get(['securityEvents'], (result) => {
      const events = result.securityEvents || [];
      events.push(event);
      
      // Keep only last 100 events
      if (events.length > 100) {
        events.shift();
      }
      
      chrome.storage.local.set({ securityEvents: events });
    });
    
    console.warn('Security Event:', event);
  }

  // Sanitize batch of messages
  sanitizeBatch(messages) {
    if (!Array.isArray(messages)) return [];
    
    return messages.map(msg => this.sanitizeMessage(msg));
  }

  // Create safe DOM element from content
  createSafeElement(tag, content, attributes = {}) {
    const element = document.createElement(tag);
    
    // Set text content (automatically escaped)
    if (content) {
      element.textContent = content;
    }
    
    // Set safe attributes
    const safeAttributes = ['class', 'id', 'data-id', 'data-timestamp'];
    for (const [key, value] of Object.entries(attributes)) {
      if (safeAttributes.includes(key)) {
        element.setAttribute(key, this.sanitize(value, 'strict'));
      }
    }
    
    return element;
  }
}

// Load DOMPurify if available
if (typeof window !== 'undefined' && !window.DOMPurify) {
  // Try to load DOMPurify from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js';
  script.integrity = 'sha512-H+rglffZ6f5gF7UJgvH4Naa+fGCgjrHKMgoFOGmcPTRwR6oILo5R+gtzNrpDp7iMV3udbymBVjkeZGNz1Em4rQ==';
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InputSanitizer;
} else {
  window.InputSanitizer = InputSanitizer;
}