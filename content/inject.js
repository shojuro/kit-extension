// Content Script for Kit Memory Extension
// Captures messages and handles prompt enhancement

class MemoryCapture {
  constructor() {
    this.detector = new window.KitSiteDetector();
    this.site = this.detector.site;
    this.enabled = true;
    this.lastUserMessage = '';
    this.lastAssistantMessage = '';
    this.observer = null;
    this.isProcessing = false;
    
    this.init();
  }

  async init() {
    if (!this.site) {
      console.log('Kit Memory: Site not supported');
      return;
    }
    
    console.log(`Kit Memory: Initialized on ${this.site}`);
    
    // Check if enabled
    const storage = await chrome.storage.local.get('enabled');
    this.enabled = storage.enabled !== false;
    
    // Listen for enable/disable messages
    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === 'TOGGLE_MEMORY') {
        this.enabled = request.enabled;
      }
    });
    
    // Start capturing
    this.startCapturing();
    this.observeMessages();
  }

  startCapturing() {
    // Wait for input element
    this.waitForInput();
  }

  async waitForInput() {
    const input = await this.detector.waitForElement(this.detector.selectors.input);
    if (!input) {
      console.log('Kit Memory: Could not find input element');
      return;
    }
    
    this.attachInputListeners(input);
  }

  attachInputListeners(input) {
    // Capture on send button click
    const sendButton = this.detector.getSendButton();
    if (sendButton) {
      sendButton.addEventListener('click', () => {
        setTimeout(() => this.captureUserMessage(input), 100);
      });
    }
    
    // Capture on Enter key (without Shift)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        setTimeout(() => this.captureUserMessage(input), 100);
      }
    });
    
    // Also enhance prompt before sending
    if (this.enabled) {
      this.attachPromptEnhancer(input);
    }
  }

  async captureUserMessage(input) {
    if (!this.enabled) return;
    
    let message = '';
    
    if (this.site === 'chatgpt') {
      message = input.value || '';
    } else if (this.site === 'claude') {
      message = input.innerText || input.textContent || '';
    }
    
    if (message && message !== this.lastUserMessage) {
      this.lastUserMessage = message;
      
      // Store in memory
      await this.storeMemory('user', message);
    }
  }

  observeMessages() {
    // Watch for new messages in the conversation
    const container = this.detector.getConversationContainer();
    if (!container) {
      setTimeout(() => this.observeMessages(), 1000);
      return;
    }
    
    this.observer = new MutationObserver((mutations) => {
      if (!this.enabled || this.isProcessing) return;
      
      this.isProcessing = true;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            this.checkForNewMessages(node);
          }
        });
      });
      
      setTimeout(() => {
        this.isProcessing = false;
      }, 500);
    });
    
    this.observer.observe(container, {
      childList: true,
      subtree: true
    });
  }

  checkForNewMessages(node) {
    // Check if this node or its children contain messages
    const messages = this.detector.getMessages();
    
    messages.forEach(msg => {
      if (!msg.dataset.kitCaptured) {
        const text = this.detector.extractText(msg);
        
        if (this.detector.isAssistantMessage(msg) && text) {
          if (text !== this.lastAssistantMessage) {
            this.lastAssistantMessage = text;
            this.storeMemory('assistant', text);
            msg.dataset.kitCaptured = 'true';
          }
        }
      }
    });
  }

  async storeMemory(role, content) {
    if (!content || content.length < 2) return;
    
    try {
      await chrome.runtime.sendMessage({
        type: 'STORE_MEMORY',
        data: {
          role,
          content,
          site: this.site,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }
      });
      
      console.log(`Kit Memory: Stored ${role} message (${content.length} chars)`);
    } catch (error) {
      console.error('Kit Memory: Failed to store memory:', error);
    }
  }

  // Prompt enhancement
  attachPromptEnhancer(input) {
    // Store original send handlers
    const originalHandlers = {
      click: null,
      keydown: null
    };
    
    // Intercept send button
    const sendButton = this.detector.getSendButton();
    if (sendButton) {
      const newClickHandler = async (e) => {
        if (this.enabled) {
          await this.enhancePrompt(input);
        }
      };
      
      // Clone and replace button to remove existing listeners
      const newButton = sendButton.cloneNode(true);
      newButton.addEventListener('click', newClickHandler);
      sendButton.parentNode.replaceChild(newButton, sendButton);
    }
    
    // Intercept Enter key
    const keyHandler = async (e) => {
      if (e.key === 'Enter' && !e.shiftKey && this.enabled) {
        const query = this.site === 'chatgpt' ? input.value : input.innerText;
        
        if (this.shouldEnhance(query)) {
          e.preventDefault();
          e.stopPropagation();
          
          await this.enhancePrompt(input);
          
          // Trigger send after enhancement
          setTimeout(() => {
            if (this.site === 'chatgpt') {
              // Trigger form submit for ChatGPT
              const form = input.closest('form');
              if (form) {
                form.requestSubmit();
              }
            } else {
              // For Claude, simulate Enter key
              const event = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
              });
              input.dispatchEvent(event);
            }
          }, 100);
        }
      }
    };
    
    input.addEventListener('keydown', keyHandler, true);
  }

  shouldEnhance(query) {
    if (!query || query.length < 10) return false;
    
    // Keywords that suggest memory is needed
    const memoryTriggers = [
      'continue', 'remember', 'recall', 'last time', 'yesterday',
      'earlier', 'previous', 'before', 'we discussed', 'we talked',
      'our conversation', 'you said', 'I said', 'mentioned',
      'referring to', 'context', 'what were we', 'where were we'
    ];
    
    const lowerQuery = query.toLowerCase();
    return memoryTriggers.some(trigger => lowerQuery.includes(trigger));
  }

  async enhancePrompt(input) {
    const query = this.site === 'chatgpt' ? input.value : input.innerText;
    
    if (!this.shouldEnhance(query)) return;
    
    try {
      // Search for relevant memories
      const memories = await chrome.runtime.sendMessage({
        type: 'SEARCH_MEMORIES',
        query: query
      });
      
      if (memories && memories.length > 0) {
        const enhanced = this.formatEnhancedPrompt(query, memories);
        
        // Update input with enhanced prompt
        if (this.site === 'chatgpt') {
          input.value = enhanced;
          
          // Trigger input event to update UI
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          input.innerText = enhanced;
          
          // Trigger input event for Claude
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Show indicator
        this.showMemoryIndicator(memories.length);
      }
    } catch (error) {
      console.error('Kit Memory: Enhancement failed:', error);
    }
  }

  formatEnhancedPrompt(query, memories) {
    let context = '--- Previous Context ---\n';
    
    // Group memories by conversation
    const grouped = {};
    memories.forEach(mem => {
      const convId = mem.conversation_id || 'default';
      if (!grouped[convId]) grouped[convId] = [];
      grouped[convId].push(mem);
    });
    
    // Format each conversation
    for (const [convId, mems] of Object.entries(grouped)) {
      const date = new Date(mems[0].created_at).toLocaleDateString();
      context += `\n[From ${date}]\n`;
      
      mems.forEach(m => {
        const role = m.role === 'user' ? 'You' : 'Assistant';
        const preview = m.content.substring(0, 200);
        context += `${role}: ${preview}${m.content.length > 200 ? '...' : ''}\n`;
      });
    }
    
    context += '\n--- Current Query ---\n';
    return context + query;
  }

  showMemoryIndicator(count) {
    // Create temporary indicator
    const indicator = document.createElement('div');
    indicator.className = 'kit-memory-indicator';
    indicator.textContent = `✨ Added ${count} memories to context`;
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #10a37f;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(indicator);
    
    setTimeout(() => {
      indicator.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => indicator.remove(), 300);
    }, 3000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new MemoryCapture();
  });
} else {
  new MemoryCapture();
}