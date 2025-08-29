// Supabase client wrapper for Kit Memory Extension

export class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    };
  }

  async createUser(userId) {
    try {
      const response = await fetch(`${this.url}/rest/v1/users`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          id: userId,
          created_at: new Date().toISOString(),
          settings: {}
        })
      });
      
      if (!response.ok && response.status !== 409) { // 409 = already exists
        throw new Error(`Failed to create user: ${response.status}`);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Create user error:', error);
      return { success: false, error: error.message };
    }
  }

  async storeMemory(memory) {
    try {
      const response = await fetch(`${this.url}/rest/v1/memories`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          ...memory,
          created_at: new Date().toISOString()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to store memory: ${response.status}`);
      }
      
      const data = await response.json();
      return data[0] || data;
    } catch (error) {
      console.error('Store memory error:', error);
      throw error;
    }
  }

  async searchMemories(userId, query, options = {}) {
    try {
      const params = new URLSearchParams({
        user_id: `eq.${userId}`,
        order: 'created_at.desc',
        limit: options.limit || 5
      });
      
      // Add text search if query provided
      if (query) {
        params.append('content', `ilike.*${query}*`);
      }
      
      const response = await fetch(`${this.url}/rest/v1/memories?${params}`, {
        headers: this.headers
      });
      
      if (!response.ok) {
        throw new Error(`Failed to search memories: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Search memories error:', error);
      return [];
    }
  }

  async deleteMemories(userId, options = {}) {
    try {
      let url = `${this.url}/rest/v1/memories?user_id=eq.${userId}`;
      
      if (options.after) {
        url += `&created_at=gte.${options.after}`;
      }
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.headers
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete memories: ${response.status}`);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Delete memories error:', error);
      throw error;
    }
  }

  async getMemoryCount(userId) {
    try {
      const response = await fetch(
        `${this.url}/rest/v1/memories?user_id=eq.${userId}&select=count`,
        {
          headers: {
            ...this.headers,
            'Prefer': 'count=exact'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to get count: ${response.status}`);
      }
      
      const range = response.headers.get('content-range');
      if (range) {
        const count = range.split('/')[1];
        return parseInt(count) || 0;
      }
      
      return 0;
    } catch (error) {
      console.error('Get count error:', error);
      return 0;
    }
  }

  async exportMemories(userId) {
    try {
      const response = await fetch(
        `${this.url}/rest/v1/memories?user_id=eq.${userId}&order=created_at.desc`,
        { headers: this.headers }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to export: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Export error:', error);
      throw error;
    }
  }
}