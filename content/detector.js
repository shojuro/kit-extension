// Site Detection Logic for Kit Memory Extension
// Identifies which AI platform we're on and provides selectors

class SiteDetector {
  constructor() {
    this.site = null;
    this.selectors = null;
    this.detect();
  }

  detect() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
      this.site = 'chatgpt';
      this.selectors = this.getChatGPTSelectors();
    } else if (hostname.includes('claude.ai')) {
      this.site = 'claude';
      this.selectors = this.getClaudeSelectors();
    }
    
    return this.site;
  }

  getChatGPTSelectors() {
    // Multiple fallback selectors for ChatGPT
    return {
      input: [
        'textarea[data-id="root"]',
        'textarea[data-id="prompt-textarea"]',
        '#prompt-textarea',
        'textarea[placeholder*="Send"]',
        'textarea[placeholder*="Message"]'
      ],
      sendButton: [
        'button[data-testid="send-button"]',
        'button[data-testid="fruitjuice-send-button"]',
        'button svg.text-white',
        'button[aria-label*="Send"]'
      ],
      messages: [
        '[data-message-author-role]',
        '[data-testid^="conversation-turn"]',
        '.text-base',
        '.group.w-full'
      ],
      userMessage: [
        '[data-message-author-role="user"]',
        '[data-testid*="user-turn"]'
      ],
      assistantMessage: [
        '[data-message-author-role="assistant"]',
        '[data-testid*="assistant-turn"]'
      ],
      conversationContainer: [
        'main',
        '[role="main"]',
        '.flex.flex-col.items-center'
      ]
    };
  }

  getClaudeSelectors() {
    // Multiple fallback selectors for Claude
    return {
      input: [
        'div[contenteditable="true"]',
        '[data-placeholder*="Reply"]',
        '[class*="ProseMirror"]',
        '.DraftEditor-editorContainer'
      ],
      sendButton: [
        'button[aria-label*="Send"]',
        'button[type="submit"]',
        'button svg[class*="send"]'
      ],
      messages: [
        '[data-test-render-message]',
        '[class*="Message"]',
        '[data-message-id]'
      ],
      userMessage: [
        '[data-sender="user"]',
        '[class*="UserMessage"]'
      ],
      assistantMessage: [
        '[data-sender="assistant"]',
        '[class*="AssistantMessage"]'
      ],
      conversationContainer: [
        '[class*="conversation"]',
        '[data-test="conversation"]',
        'main'
      ]
    };
  }

  findElement(selectorArray) {
    // Try each selector until one works
    for (const selector of selectorArray) {
      try {
        const element = document.querySelector(selector);
        if (element) return element;
      } catch (e) {
        // Invalid selector, try next
        continue;
      }
    }
    return null;
  }

  findAllElements(selectorArray) {
    // Try each selector and combine results
    const elements = new Set();
    
    for (const selector of selectorArray) {
      try {
        const found = document.querySelectorAll(selector);
        found.forEach(el => elements.add(el));
      } catch (e) {
        // Invalid selector, try next
        continue;
      }
    }
    
    return Array.from(elements);
  }

  getInput() {
    if (!this.selectors) return null;
    return this.findElement(this.selectors.input);
  }

  getSendButton() {
    if (!this.selectors) return null;
    return this.findElement(this.selectors.sendButton);
  }

  getMessages() {
    if (!this.selectors) return null;
    return this.findAllElements(this.selectors.messages);
  }

  getUserMessages() {
    if (!this.selectors) return null;
    return this.findAllElements(this.selectors.userMessage);
  }

  getAssistantMessages() {
    if (!this.selectors) return null;
    return this.findAllElements(this.selectors.assistantMessage);
  }

  getConversationContainer() {
    if (!this.selectors) return null;
    return this.findElement(this.selectors.conversationContainer);
  }

  // Wait for element to appear
  async waitForElement(selectorArray, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = this.findElement(selectorArray);
      if (element) return element;
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return null;
  }

  // Get clean text from element
  extractText(element) {
    if (!element) return '';
    
    // For ChatGPT
    if (this.site === 'chatgpt') {
      // Try to get markdown content first
      const codeBlocks = element.querySelectorAll('code');
      let text = element.innerText || element.textContent || '';
      
      // Preserve code blocks
      codeBlocks.forEach(block => {
        const code = block.innerText || block.textContent;
        text = text.replace(code, `\`\`\`\n${code}\n\`\`\``);
      });
      
      return text.trim();
    }
    
    // For Claude
    if (this.site === 'claude') {
      // Claude often uses contenteditable divs
      if (element.contentEditable === 'true') {
        return element.innerText || element.textContent || '';
      }
      
      return element.innerText || element.textContent || '';
    }
    
    return element.innerText || element.textContent || '';
  }

  // Check if element is a user message
  isUserMessage(element) {
    if (!element) return false;
    
    // Check various attributes
    const role = element.getAttribute('data-message-author-role');
    if (role === 'user') return true;
    
    const sender = element.getAttribute('data-sender');
    if (sender === 'user') return true;
    
    // Check class names
    const className = element.className || '';
    if (className.includes('user') || className.includes('User')) return true;
    
    // Check parent elements
    const parent = element.closest('[data-message-author-role="user"]');
    if (parent) return true;
    
    return false;
  }

  // Check if element is an assistant message
  isAssistantMessage(element) {
    if (!element) return false;
    
    // Check various attributes
    const role = element.getAttribute('data-message-author-role');
    if (role === 'assistant') return true;
    
    const sender = element.getAttribute('data-sender');
    if (sender === 'assistant') return true;
    
    // Check class names
    const className = element.className || '';
    if (className.includes('assistant') || className.includes('Assistant')) return true;
    
    // Check parent elements
    const parent = element.closest('[data-message-author-role="assistant"]');
    if (parent) return true;
    
    return false;
  }
}

// Export for use in inject.js
window.KitSiteDetector = SiteDetector;