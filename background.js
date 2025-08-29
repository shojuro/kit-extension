// Background Service Worker for Kit Memory Extension
// Handles all backend operations: storage, retrieval, and memory management

// Initialize state
let supabaseUrl = '';
let supabaseKey = '';
let userId = null;

// Load configuration from storage
async function loadConfig() {
  const config = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'userId']);
  supabaseUrl = config.supabaseUrl || '';
  supabaseKey = config.supabaseKey || '';
  userId = config.userId || null;
  
  // Create user if needed
  if (!userId) {
    userId = crypto.randomUUID();
    await chrome.storage.local.set({ userId });
  }
}

// Initialize on startup
loadConfig();

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(request, sender) {
  try {
    switch (request.type) {
      case 'STORE_MEMORY':
        return await storeMemory(request.data, sender);
        
      case 'SEARCH_MEMORIES':
        return await searchMemories(request.query);
        
      case 'GET_STATS':
        return await getStats();
        
      case 'CLEAR_RECENT':
        return await clearRecentMemories();
        
      case 'EXPORT_MEMORIES':
        return await exportMemories();
        
      case 'UPDATE_CONFIG':
        return await updateConfig(request.config);
        
      case 'TOGGLE_ENABLED':
        return await toggleEnabled(request.enabled);
        
      default:
        return { error: 'Unknown message type' };
    }
  } catch (error) {
    console.error('Message handler error:', error);
    return { error: error.message };
  }
}

// Store memory in Supabase
async function storeMemory(memory, sender) {
  try {
    // Check if enabled
    const { enabled = true } = await chrome.storage.local.get('enabled');
    if (!enabled) return { success: false, reason: 'disabled' };
    
    // Check for Supabase config
    if (!supabaseUrl || !supabaseKey) {
      return queueForLater(memory);
    }
    
    // Extract conversation ID
    const conversationId = extractConversationId(memory.url);
    
    // Check for duplicates
    if (await isDuplicate(memory)) {
      return { success: true, duplicate: true };
    }
    
    // Prepare memory object
    const memoryData = {
      user_id: userId,
      conversation_id: conversationId || 'default',
      role: memory.role,
      content: memory.content,
      site: memory.site,
      metadata: {
        url: memory.url,
        timestamp: memory.timestamp,
        tabId: sender.tab?.id
      }
    };
    
    // Store in Supabase
    const response = await fetch(`${supabaseUrl}/rest/v1/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify(memoryData)
    });
    
    if (!response.ok) {
      throw new Error(`Storage failed: ${response.status}`);
    }
    
    // Update statistics
    await updateStats('stored');
    
    return { success: true };
    
  } catch (error) {
    console.error('Store memory error:', error);
    return queueForLater(memory);
  }
}

// Search memories
async function searchMemories(query) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return [];
    }
    
    // Determine search strategy
    const searchParams = analyzeQuery(query);
    
    // Build Supabase query
    let url = `${supabaseUrl}/rest/v1/memories?user_id=eq.${userId}`;
    
    // Add search filters
    if (searchParams.conversationId) {
      url += `&conversation_id=eq.${searchParams.conversationId}`;
    }
    
    // Add text search if available
    if (searchParams.searchTerms) {
      url += `&content=ilike.*${encodeURIComponent(searchParams.searchTerms)}*`;
    }
    
    // Order by recency and limit
    url += '&order=created_at.desc&limit=5';
    
    const response = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const memories = await response.json();
    
    // Update statistics
    await updateStats('searched');
    
    return memories;
    
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

// Get statistics
async function getStats() {
  try {
    const stats = await chrome.storage.local.get(['stats']);
    const defaultStats = {
      totalMemories: 0,
      daysActive: 0,
      lastSync: null
    };
    
    if (!supabaseUrl || !supabaseKey) {
      return { ...defaultStats, ...stats.stats };
    }
    
    // Get count from Supabase
    const response = await fetch(
      `${supabaseUrl}/rest/v1/memories?user_id=eq.${userId}&select=count`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'count=exact'
        }
      }
    );
    
    if (response.ok) {
      const count = response.headers.get('content-range')?.split('/')[1] || 0;
      
      // Calculate days active
      const { firstUse } = await chrome.storage.local.get('firstUse');
      const daysActive = firstUse 
        ? Math.floor((Date.now() - firstUse) / (1000 * 60 * 60 * 24))
        : 0;
      
      return {
        totalMemories: parseInt(count),
        daysActive,
        lastSync: new Date().toISOString()
      };
    }
    
    return { ...defaultStats, ...stats.stats };
    
  } catch (error) {
    console.error('Stats error:', error);
    return { totalMemories: 0, daysActive: 0 };
  }
}

// Clear recent memories (last 24 hours)
async function clearRecentMemories() {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Not configured' };
    }
    
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const response = await fetch(
      `${supabaseUrl}/rest/v1/memories?user_id=eq.${userId}&created_at=gte.${cutoff}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Delete failed: ${response.status}`);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Clear memories error:', error);
    return { success: false, error: error.message };
  }
}

// Export memories to JSON
async function exportMemories() {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: 'Not configured' };
    }
    
    // Fetch all memories
    const response = await fetch(
      `${supabaseUrl}/rest/v1/memories?user_id=eq.${userId}&order=created_at.desc`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }
    
    const memories = await response.json();
    
    // Create downloadable file
    const blob = new Blob([JSON.stringify(memories, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const filename = `kit-memories-${new Date().toISOString().split('T')[0]}.json`;
    
    // Trigger download
    chrome.downloads.download({
      url,
      filename,
      saveAs: true
    });
    
    return { success: true, count: memories.length };
    
  } catch (error) {
    console.error('Export error:', error);
    return { success: false, error: error.message };
  }
}

// Update configuration
async function updateConfig(config) {
  if (config.supabaseUrl) supabaseUrl = config.supabaseUrl;
  if (config.supabaseKey) supabaseKey = config.supabaseKey;
  
  await chrome.storage.local.set(config);
  return { success: true };
}

// Toggle enabled state
async function toggleEnabled(enabled) {
  await chrome.storage.local.set({ enabled });
  return { success: true, enabled };
}

// Utility functions
function extractConversationId(url) {
  const patterns = [
    /\/c\/([a-zA-Z0-9-]+)/,     // ChatGPT
    /\/chat\/([a-zA-Z0-9-]+)/   // Claude
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

function analyzeQuery(query) {
  const result = {
    conversationId: null,
    searchTerms: null,
    isMemoryQuery: false
  };
  
  // Check for memory-related keywords
  const memoryKeywords = [
    'continue', 'remember', 'last time', 'yesterday', 
    'earlier', 'previous', 'we discussed', 'we talked'
  ];
  
  result.isMemoryQuery = memoryKeywords.some(keyword => 
    query.toLowerCase().includes(keyword)
  );
  
  // Extract search terms
  if (result.isMemoryQuery) {
    result.searchTerms = query.slice(0, 100); // First 100 chars for search
  }
  
  return result;
}

async function isDuplicate(memory) {
  const { recentHashes = {} } = await chrome.storage.local.get('recentHashes');
  const hash = hashMemory(memory);
  
  if (recentHashes[hash]) {
    return true;
  }
  
  // Store hash
  recentHashes[hash] = Date.now();
  
  // Clean old hashes (older than 1 hour)
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [h, time] of Object.entries(recentHashes)) {
    if (time < cutoff) delete recentHashes[h];
  }
  
  await chrome.storage.local.set({ recentHashes });
  return false;
}

function hashMemory(memory) {
  const str = `${memory.role}:${memory.content.slice(0, 100)}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

// Queue memory for later storage
async function queueForLater(memory) {
  const { offlineQueue = [] } = await chrome.storage.local.get('offlineQueue');
  
  offlineQueue.push({
    ...memory,
    queuedAt: Date.now()
  });
  
  // Keep only last 100 items
  if (offlineQueue.length > 100) {
    offlineQueue.shift();
  }
  
  await chrome.storage.local.set({ offlineQueue });
  
  // Try to process queue later
  setTimeout(processOfflineQueue, 30000);
  
  return { success: true, queued: true };
}

// Process offline queue
async function processOfflineQueue() {
  const { offlineQueue = [] } = await chrome.storage.local.get('offlineQueue');
  if (offlineQueue.length === 0) return;
  
  const remaining = [];
  
  for (const memory of offlineQueue) {
    const result = await storeMemory(memory, {});
    if (!result.success && !result.queued) {
      remaining.push(memory);
    }
  }
  
  await chrome.storage.local.set({ offlineQueue: remaining });
}

// Update statistics
async function updateStats(action) {
  const { stats = {} } = await chrome.storage.local.get('stats');
  
  stats[action] = (stats[action] || 0) + 1;
  stats.lastActive = Date.now();
  
  // Set first use if not set
  if (!stats.firstUse) {
    stats.firstUse = Date.now();
    await chrome.storage.local.set({ firstUse: Date.now() });
  }
  
  await chrome.storage.local.set({ stats });
}

// Process queue on startup and periodically
chrome.runtime.onStartup.addListener(() => {
  processOfflineQueue();
});

// Process queue every 5 minutes
setInterval(processOfflineQueue, 5 * 60 * 1000);