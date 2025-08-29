// Message parser for Kit Memory Extension
// Handles different AI platform message formats

export class MessageParser {
  constructor(site) {
    this.site = site;
  }

  parseMessage(element, role) {
    const parsed = {
      role,
      content: '',
      metadata: {},
      timestamp: new Date().toISOString()
    };
    
    if (this.site === 'chatgpt') {
      parsed.content = this.parseChatGPTMessage(element);
      parsed.metadata = this.extractChatGPTMetadata(element);
    } else if (this.site === 'claude') {
      parsed.content = this.parseClaudeMessage(element);
      parsed.metadata = this.extractClaudeMetadata(element);
    }
    
    return parsed;
  }

  parseChatGPTMessage(element) {
    // Extract text content while preserving code blocks
    let content = '';
    
    // Check for code blocks
    const codeBlocks = element.querySelectorAll('pre code');
    const hasCode = codeBlocks.length > 0;
    
    if (hasCode) {
      // Complex parsing for messages with code
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        null,
        false
      );
      
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
          content += node.textContent;
        } else if (node.nodeName === 'CODE' && node.parentElement.nodeName === 'PRE') {
          content += '\n```\n' + node.textContent + '\n```\n';
        } else if (node.nodeName === 'BR') {
          content += '\n';
        }
      }
    } else {
      // Simple extraction for text-only messages
      content = element.innerText || element.textContent || '';
    }
    
    return this.cleanContent(content);
  }

  parseClaudeMessage(element) {
    // Claude uses different structure
    let content = '';
    
    // Check if it's a rich text message
    const richText = element.querySelector('[class*="prose"]');
    if (richText) {
      content = this.extractRichText(richText);
    } else {
      content = element.innerText || element.textContent || '';
    }
    
    return this.cleanContent(content);
  }

  extractRichText(element) {
    let content = '';
    
    // Walk through child nodes
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        content += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        
        switch (tag) {
          case 'p':
            content += '\n' + child.innerText + '\n';
            break;
          case 'pre':
            const code = child.querySelector('code');
            if (code) {
              const lang = code.className.replace('language-', '');
              content += `\n\`\`\`${lang}\n${code.textContent}\n\`\`\`\n`;
            } else {
              content += '\n```\n' + child.textContent + '\n```\n';
            }
            break;
          case 'ul':
          case 'ol':
            content += '\n' + this.parseList(child, tag === 'ol') + '\n';
            break;
          case 'blockquote':
            content += '\n> ' + child.innerText.replace(/\n/g, '\n> ') + '\n';
            break;
          case 'h1':
          case 'h2':
          case 'h3':
          case 'h4':
          case 'h5':
          case 'h6':
            const level = parseInt(tag[1]);
            content += '\n' + '#'.repeat(level) + ' ' + child.innerText + '\n';
            break;
          case 'code':
            content += '`' + child.textContent + '`';
            break;
          case 'strong':
          case 'b':
            content += '**' + child.innerText + '**';
            break;
          case 'em':
          case 'i':
            content += '*' + child.innerText + '*';
            break;
          case 'a':
            const href = child.getAttribute('href');
            content += `[${child.innerText}](${href})`;
            break;
          case 'br':
            content += '\n';
            break;
          default:
            content += child.innerText || '';
        }
      }
    }
    
    return content;
  }

  parseList(listElement, ordered = false) {
    let content = '';
    const items = listElement.querySelectorAll('li');
    
    items.forEach((item, index) => {
      const prefix = ordered ? `${index + 1}. ` : '- ';
      content += prefix + item.innerText + '\n';
    });
    
    return content;
  }

  extractChatGPTMetadata(element) {
    const metadata = {};
    
    // Try to extract model info
    const modelBadge = element.querySelector('[class*="model"]');
    if (modelBadge) {
      metadata.model = modelBadge.innerText;
    }
    
    // Extract message ID if available
    const messageId = element.getAttribute('data-message-id');
    if (messageId) {
      metadata.messageId = messageId;
    }
    
    // Extract conversation turn
    const turn = element.getAttribute('data-testid');
    if (turn) {
      metadata.turn = turn;
    }
    
    return metadata;
  }

  extractClaudeMetadata(element) {
    const metadata = {};
    
    // Extract message ID
    const messageId = element.getAttribute('data-message-id');
    if (messageId) {
      metadata.messageId = messageId;
    }
    
    // Extract sender info
    const sender = element.getAttribute('data-sender');
    if (sender) {
      metadata.sender = sender;
    }
    
    // Extract timestamp if available
    const timestamp = element.querySelector('[class*="timestamp"]');
    if (timestamp) {
      metadata.timestamp = timestamp.innerText;
    }
    
    return metadata;
  }

  cleanContent(content) {
    // Remove excessive whitespace
    content = content.replace(/\n{3,}/g, '\n\n');
    
    // Remove leading/trailing whitespace
    content = content.trim();
    
    // Fix code block formatting
    content = content.replace(/```\n\n/g, '```\n');
    content = content.replace(/\n\n```/g, '\n```');
    
    // Remove zero-width characters
    content = content.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    return content;
  }

  // Format memories for display
  formatMemory(memory) {
    const role = memory.role === 'user' ? 'You' : 'Assistant';
    const timestamp = new Date(memory.created_at).toLocaleString();
    
    return {
      header: `${role} (${timestamp})`,
      content: memory.content,
      metadata: memory.metadata
    };
  }

  // Create markdown summary
  createSummary(memories) {
    let summary = '## Conversation History\n\n';
    
    const grouped = this.groupByConversation(memories);
    
    for (const [convId, convMemories] of Object.entries(grouped)) {
      const date = new Date(convMemories[0].created_at).toLocaleDateString();
      summary += `### Conversation from ${date}\n\n`;
      
      for (const memory of convMemories) {
        const formatted = this.formatMemory(memory);
        summary += `**${formatted.header}**\n${formatted.content}\n\n`;
      }
    }
    
    return summary;
  }

  groupByConversation(memories) {
    const grouped = {};
    
    for (const memory of memories) {
      const convId = memory.conversation_id || 'default';
      if (!grouped[convId]) {
        grouped[convId] = [];
      }
      grouped[convId].push(memory);
    }
    
    return grouped;
  }
}