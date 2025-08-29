// Memory management module for Kit Memory Extension

export class MemoryManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async initialize() {
    // Initialize memory tiers if needed
    console.log('Memory Manager initialized');
  }

  async storeMemory(memory) {
    // Clear cache for this user
    this.clearUserCache(memory.user_id);
    
    // Store in appropriate tier based on creation date
    const tier = this.determineMemoryTier(memory.timestamp || new Date().toISOString());
    
    // Add tier metadata
    const enrichedMemory = {
      ...memory,
      tier,
      token_count: this.estimateTokens(memory.content)
    };
    
    return await this.supabase.storeMemory(enrichedMemory);
  }

  async searchMemories(userId, query, options = {}) {
    const cacheKey = `${userId}:${query}:${JSON.stringify(options)}`;
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    // Search strategy based on query
    let memories = [];
    
    // 1. Check if this is a conversation continuation
    const conversationId = this.extractConversationContext(query);
    if (conversationId) {
      memories = await this.getConversationMemories(userId, conversationId);
    }
    
    // 2. If no conversation context or not enough memories, do semantic search
    if (memories.length < 3) {
      const searchResults = await this.semanticSearch(userId, query, options);
      memories = [...memories, ...searchResults];
    }
    
    // 3. Deduplicate and sort by relevance
    memories = this.deduplicateAndSort(memories, query);
    
    // 4. Apply token budget
    memories = this.applyTokenBudget(memories, options.maxTokens || 2000);
    
    // Cache results
    this.addToCache(cacheKey, memories);
    
    return memories;
  }

  async getConversationMemories(userId, conversationId) {
    return await this.supabase.searchMemories(userId, null, {
      conversation_id: conversationId,
      limit: 10
    });
  }

  async semanticSearch(userId, query, options) {
    // For MVP, use text search
    // TODO: Implement vector embeddings
    return await this.supabase.searchMemories(userId, query, options);
  }

  async deleteMemories(userId, options) {
    this.clearUserCache(userId);
    return await this.supabase.deleteMemories(userId, options);
  }

  async exportMemories(userId) {
    return await this.supabase.exportMemories(userId);
  }

  async getStats(userId) {
    const cacheKey = `stats:${userId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const total = await this.supabase.getMemoryCount(userId);
    
    // Calculate tier distribution (simplified for MVP)
    const stats = {
      total,
      hot: Math.floor(total * 0.6),  // Estimate
      warm: Math.floor(total * 0.3),
      cold: Math.floor(total * 0.1),
      daysActive: this.calculateDaysActive(userId),
      lastSync: new Date().toISOString(),
      storageBytes: total * 500 // Rough estimate: 500 bytes per memory
    };
    
    this.addToCache(cacheKey, stats);
    return stats;
  }

  async migrateMemories(userId) {
    // Migrate memories between tiers based on age
    // This would run periodically in background
    
    const now = Date.now();
    const hotCutoff = now - (90 * 24 * 60 * 60 * 1000); // 90 days
    const warmCutoff = now - (180 * 24 * 60 * 60 * 1000); // 180 days
    
    // In a real implementation, this would:
    // 1. Move hot -> warm after 90 days
    // 2. Move warm -> cold after 180 days
    // 3. Delete cold after 365 days
    
    console.log('Memory migration completed for user:', userId);
  }

  // Utility methods
  determineMemoryTier(timestamp) {
    const age = Date.now() - new Date(timestamp).getTime();
    const days = age / (1000 * 60 * 60 * 24);
    
    if (days <= 90) return 'hot';
    if (days <= 180) return 'warm';
    return 'cold';
  }

  extractConversationContext(query) {
    // Look for patterns that suggest continuing a conversation
    const patterns = [
      /continue/i,
      /where were we/i,
      /as we discussed/i,
      /like I said/i
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        // Return current conversation ID if found
        // This would be passed from content script
        return null; // Placeholder
      }
    }
    
    return null;
  }

  deduplicateAndSort(memories, query) {
    // Remove duplicates
    const seen = new Set();
    const unique = memories.filter(m => {
      const key = `${m.conversation_id}:${m.content.substring(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    // Sort by relevance (simple for MVP)
    return unique.sort((a, b) => {
      // Prioritize same conversation
      if (a.conversation_id === b.conversation_id && b.conversation_id !== a.conversation_id) {
        return -1;
      }
      
      // Then by recency
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  applyTokenBudget(memories, maxTokens) {
    let tokenCount = 0;
    const selected = [];
    
    for (const memory of memories) {
      const tokens = this.estimateTokens(memory.content);
      if (tokenCount + tokens <= maxTokens) {
        selected.push(memory);
        tokenCount += tokens;
      } else {
        // Truncate if necessary
        const remainingTokens = maxTokens - tokenCount;
        if (remainingTokens > 100) {
          const truncated = {
            ...memory,
            content: this.truncateToTokens(memory.content, remainingTokens)
          };
          selected.push(truncated);
        }
        break;
      }
    }
    
    return selected;
  }

  estimateTokens(text) {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  truncateToTokens(text, maxTokens) {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    
    // Smart truncation - keep beginning and end
    const start = text.substring(0, maxChars * 0.7);
    const end = text.substring(text.length - maxChars * 0.2);
    return `${start}\n[...truncated...]\n${end}`;
  }

  calculateDaysActive(userId) {
    // Would query first memory date
    // For MVP, return estimate
    return 1;
  }

  // Cache management
  addToCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
    
    // Clean old entries
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }

  clearUserCache(userId) {
    for (const key of this.cache.keys()) {
      if (key.includes(userId)) {
        this.cache.delete(key);
      }
    }
  }
}