// Background Service Worker for Kit Memory Extension (Secure Version)
// Handles all backend operations with encrypted credential storage

// Import security modules
importScripts('lib/crypto.js', 'lib/sanitizer.js');

// Initialize security instances
const secureStorage = new SecureStorage();
const sanitizer = new InputSanitizer();

// State variables (never store raw credentials in memory)
let encryptedCredentials = null;
let sessionPassphrase = null; // Cleared after timeout
let userId = null;
let passphraseTimeout = null;

// Configuration
const PASSPHRASE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Load encrypted configuration
async function loadConfig() {
  try {
    const config = await chrome.storage.local.get([
      'encryptedCredentials', 
      'userId',
      'credentialsMigrated'
    ]);
    
    // Check if we need to migrate from plaintext
    if (!config.credentialsMigrated) {
      await migrateFromPlaintext();
      return loadConfig(); // Reload after migration
    }
    
    encryptedCredentials = config.encryptedCredentials || null;
    userId = config.userId || null;
    
    // Create secure user ID if needed
    if (!userId) {
      userId = crypto.randomUUID();
      await chrome.storage.local.set({ userId });
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

// Migrate from plaintext credentials
async function migrateFromPlaintext() {
  try {
    const oldConfig = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    
    if (oldConfig.supabaseUrl && oldConfig.supabaseKey) {
      // Generate a secure passphrase for this installation
      const installationPassphrase = secureStorage.generateSecurePassphrase();
      
      // Encrypt the credentials
      const encrypted = await secureStorage.encryptCredentials(
        {
          supabaseUrl: oldConfig.supabaseUrl,
          supabaseKey: oldConfig.supabaseKey
        },
        installationPassphrase
      );
      
      // Store encrypted version and installation passphrase
      await chrome.storage.local.set({
        encryptedCredentials: encrypted,
        credentialsMigrated: true,
        migrationDate: Date.now(),
        // Store installation passphrase (encrypted with extension ID)
        installationKey: await encryptInstallationKey(installationPassphrase)
      });
      
      // Remove plaintext versions
      await chrome.storage.local.remove(['supabaseUrl', 'supabaseKey']);
      
      console.log('Successfully migrated credentials to encrypted storage');
    } else {
      // No credentials to migrate
      await chrome.storage.local.set({ credentialsMigrated: true });
    }
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Encrypt installation key with extension ID
async function encryptInstallationKey(passphrase) {
  const extensionId = chrome.runtime.id;
  const encoder = new TextEncoder();
  const data = encoder.encode(passphrase);
  
  // Use extension ID as salt for key derivation
  const salt = encoder.encode(extensionId);
  
  // Simple XOR encryption with extension ID (better than plaintext)
  const encrypted = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    encrypted[i] = data[i] ^ salt[i % salt.length];
  }
  
  return btoa(String.fromCharCode(...encrypted));
}

// Decrypt installation key
async function decryptInstallationKey(encryptedKey) {
  const extensionId = chrome.runtime.id;
  const encoder = new TextEncoder();
  const salt = encoder.encode(extensionId);
  
  const encrypted = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
  const decrypted = new Uint8Array(encrypted.length);
  
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ salt[i % salt.length];
  }
  
  return new TextDecoder().decode(decrypted);
}

// Get decrypted credentials (with timeout)
async function getCredentials() {
  try {
    if (!encryptedCredentials) {
      return null;
    }
    
    // Check if we have a cached passphrase
    if (!sessionPassphrase) {
      // Get installation key
      const { installationKey } = await chrome.storage.local.get('installationKey');
      if (!installationKey) {
        throw new Error('No installation key found');
      }
      
      sessionPassphrase = await decryptInstallationKey(installationKey);
    }
    
    // Reset timeout
    clearTimeout(passphraseTimeout);
    passphraseTimeout = setTimeout(() => {
      sessionPassphrase = null; // Clear from memory
    }, PASSPHRASE_TIMEOUT);
    
    // Decrypt credentials
    const credentials = await secureStorage.decryptCredentials(
      encryptedCredentials,
      sessionPassphrase
    );
    
    return credentials;
  } catch (error) {
    console.error('Failed to decrypt credentials:', error);
    sessionPassphrase = null; // Clear on error
    return null;
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
    // Sanitize request data
    const sanitizedRequest = sanitizer.sanitizeMessage(request);
    
    switch (sanitizedRequest.type) {
      case 'STORE_MEMORY':
        return await storeMemory(sanitizedRequest.data, sender);
        
      case 'SEARCH_MEMORIES':
        return await searchMemories(sanitizedRequest.query);
        
      case 'GET_STATS':
        return await getStats();
        
      case 'CLEAR_RECENT':
        return await clearRecentMemories();
        
      case 'EXPORT_MEMORIES':
        return await exportMemories();
        
      case 'UPDATE_CONFIG':
        return await updateConfig(sanitizedRequest.config);
        
      case 'TOGGLE_ENABLED':
        return await toggleEnabled(sanitizedRequest.enabled);
        
      case 'CHECK_ENCRYPTION':
        return { encrypted: !!encryptedCredentials };
        
      default:
        return { error: 'Unknown message type' };
    }
  } catch (error) {
    console.error('Message handler error:', error);
    sanitizer.logSecurityEvent('MESSAGE_ERROR', { error: error.message });
    return { error: 'Request processing failed' };
  }
}

// Store memory in Supabase (with sanitization)
async function storeMemory(memory, sender) {
  try {
    // Check if enabled
    const { enabled = true } = await chrome.storage.local.get('enabled');
    if (!enabled) return { success: false, reason: 'disabled' };
    
    // Get decrypted credentials
    const credentials = await getCredentials();
    if (!credentials) {
      return queueForLater(memory);
    }
    
    // Sanitize memory content
    const sanitizedMemory = sanitizer.sanitizeMessage(memory);
    
    // Detect potential XSS
    if (sanitizer.detectXSS(memory.content)) {
      sanitizer.logSecurityEvent('XSS_BLOCKED', { 
        role: memory.role,
        site: memory.site,
        contentLength: memory.content.length
      });
    }
    
    // Extract conversation ID
    const conversationId = sanitizer.sanitizeConversationId(
      extractConversationId(sanitizedMemory.url)
    );
    
    // Check for duplicates
    if (await isDuplicate(sanitizedMemory)) {
      return { success: true, duplicate: true };
    }
    
    // Prepare memory object
    const memoryData = {
      user_id: userId,
      conversation_id: conversationId || 'default',
      role: sanitizedMemory.role,
      content: sanitizedMemory.content,
      site: sanitizedMemory.site,
      metadata: {
        url: sanitizedMemory.url,
        timestamp: sanitizedMemory.timestamp,
        tabId: sender.tab?.id
      }
    };
    
    // Store in Supabase
    const response = await fetch(`${credentials.supabaseUrl}/rest/v1/memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': credentials.supabaseKey,
        'Authorization': `Bearer ${credentials.supabaseKey}`
      },
      body: JSON.stringify(memoryData)
    });
    
    // Clear credentials from memory
    credentials.supabaseKey = null;
    
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

// Search memories (with sanitization)
async function searchMemories(query) {
  try {
    // Sanitize query
    const sanitizedQuery = sanitizer.sanitize(query, 'strict');
    
    // Get credentials
    const credentials = await getCredentials();
    if (!credentials) {
      return [];
    }
    
    // Determine search strategy
    const searchParams = analyzeQuery(sanitizedQuery);
    
    // Build Supabase query
    let url = `${credentials.supabaseUrl}/rest/v1/memories?user_id=eq.${userId}`;
    
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
        'apikey': credentials.supabaseKey,
        'Authorization': `Bearer ${credentials.supabaseKey}`
      }
    });
    
    // Clear credentials
    credentials.supabaseKey = null;
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const memories = await response.json();
    
    // Sanitize returned memories
    const sanitizedMemories = sanitizer.sanitizeBatch(memories);
    
    // Update statistics
    await updateStats('searched');
    
    return sanitizedMemories;
    
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
}

// Update configuration (with encryption)
async function updateConfig(config) {
  try {
    if (config.supabaseUrl && config.supabaseKey) {
      // Validate credentials format
      if (!secureStorage.validateCredentials(config)) {
        return { success: false, error: 'Invalid credential format' };
      }
      
      // Generate new installation passphrase
      const passphrase = secureStorage.generateSecurePassphrase();
      
      // Encrypt credentials
      const encrypted = await secureStorage.encryptCredentials(
        {
          supabaseUrl: config.supabaseUrl,
          supabaseKey: config.supabaseKey
        },
        passphrase
      );
      
      // Store encrypted version
      await chrome.storage.local.set({
        encryptedCredentials: encrypted,
        installationKey: await encryptInstallationKey(passphrase)
      });
      
      // Update local state
      encryptedCredentials = encrypted;
      sessionPassphrase = passphrase;
      
      // Set timeout to clear passphrase
      clearTimeout(passphraseTimeout);
      passphraseTimeout = setTimeout(() => {
        sessionPassphrase = null;
      }, PASSPHRASE_TIMEOUT);
    }
    
    // Store other config items
    const { supabaseUrl, supabaseKey, ...otherConfig } = config;
    if (Object.keys(otherConfig).length > 0) {
      await chrome.storage.local.set(otherConfig);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Update config error:', error);
    return { success: false, error: error.message };
  }
}

// Other functions remain similar but with sanitization added...

// Get statistics
async function getStats() {
  try {
    const stats = await chrome.storage.local.get(['stats']);
    const defaultStats = {
      totalMemories: 0,
      daysActive: 0,
      lastSync: null,
      securityEvents: 0
    };
    
    // Count security events
    const { securityEvents = [] } = await chrome.storage.local.get('securityEvents');
    defaultStats.securityEvents = securityEvents.length;
    
    const credentials = await getCredentials();
    if (!credentials) {
      return { ...defaultStats, ...stats.stats };
    }
    
    // Get count from Supabase
    const response = await fetch(
      `${credentials.supabaseUrl}/rest/v1/memories?user_id=eq.${userId}&select=count`,
      {
        headers: {
          'apikey': credentials.supabaseKey,
          'Authorization': `Bearer ${credentials.supabaseKey}`,
          'Prefer': 'count=exact'
        }
      }
    );
    
    // Clear credentials
    credentials.supabaseKey = null;
    
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
        lastSync: new Date().toISOString(),
        securityEvents: securityEvents.length
      };
    }
    
    return { ...defaultStats, ...stats.stats };
    
  } catch (error) {
    console.error('Stats error:', error);
    return { totalMemories: 0, daysActive: 0, securityEvents: 0 };
  }
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
  
  // Sanitize before queuing
  const sanitized = sanitizer.sanitizeMessage(memory);
  
  offlineQueue.push({
    ...sanitized,
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

// Clear recent memories
async function clearRecentMemories() {
  try {
    const credentials = await getCredentials();
    if (!credentials) {
      return { success: false, error: 'Not configured' };
    }
    
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const response = await fetch(
      `${credentials.supabaseUrl}/rest/v1/memories?user_id=eq.${userId}&created_at=gte.${cutoff}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': credentials.supabaseKey,
          'Authorization': `Bearer ${credentials.supabaseKey}`
        }
      }
    );
    
    // Clear credentials
    credentials.supabaseKey = null;
    
    if (!response.ok) {
      throw new Error(`Delete failed: ${response.status}`);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Clear memories error:', error);
    return { success: false, error: error.message };
  }
}

// Export memories
async function exportMemories() {
  try {
    const credentials = await getCredentials();
    if (!credentials) {
      return { success: false, error: 'Not configured' };
    }
    
    // Fetch all memories
    const response = await fetch(
      `${credentials.supabaseUrl}/rest/v1/memories?user_id=eq.${userId}&order=created_at.desc`,
      {
        headers: {
          'apikey': credentials.supabaseKey,
          'Authorization': `Bearer ${credentials.supabaseKey}`
        }
      }
    );
    
    // Clear credentials
    credentials.supabaseKey = null;
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }
    
    const memories = await response.json();
    
    // Sanitize before export
    const sanitizedMemories = sanitizer.sanitizeBatch(memories);
    
    // Create downloadable file
    const blob = new Blob([JSON.stringify(sanitizedMemories, null, 2)], {
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
    
    return { success: true, count: sanitizedMemories.length };
    
  } catch (error) {
    console.error('Export error:', error);
    return { success: false, error: error.message };
  }
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
  loadConfig();
  processOfflineQueue();
});

// Process queue every 5 minutes
setInterval(processOfflineQueue, 5 * 60 * 1000);

// Clear session passphrase on idle
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle' || state === 'locked') {
    sessionPassphrase = null;
    clearTimeout(passphraseTimeout);
  }
});