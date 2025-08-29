// Popup logic for Kit Memory Extension

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const elements = {
    enabled: document.getElementById('enabled'),
    status: document.getElementById('status'),
    memoryCount: document.getElementById('memoryCount'),
    daysActive: document.getElementById('daysActive'),
    lastSync: document.getElementById('lastSync'),
    configSection: document.getElementById('configSection'),
    toggleConfig: document.getElementById('toggleConfig'),
    configToggleText: document.getElementById('configToggleText'),
    supabaseUrl: document.getElementById('supabaseUrl'),
    supabaseKey: document.getElementById('supabaseKey'),
    saveConfig: document.getElementById('saveConfig'),
    clearRecent: document.getElementById('clearRecent'),
    exportMemories: document.getElementById('exportMemories'),
    feedback: document.getElementById('feedback')
  };

  // Load current state
  async function loadState() {
    try {
      const storage = await chrome.storage.local.get([
        'enabled', 
        'supabaseUrl', 
        'supabaseKey'
      ]);
      
      // Set enabled state
      elements.enabled.checked = storage.enabled !== false;
      updateStatus(storage.enabled !== false);
      
      // Set config if exists
      if (storage.supabaseUrl) {
        elements.supabaseUrl.value = storage.supabaseUrl;
      }
      if (storage.supabaseKey) {
        elements.supabaseKey.value = storage.supabaseKey;
      }
      
      // Get statistics
      const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      updateStats(stats);
      
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  }

  // Update status display
  function updateStatus(enabled) {
    const statusDot = elements.status.querySelector('.status-dot');
    const statusText = elements.status.querySelector('.status-text');
    
    if (enabled) {
      statusDot.classList.add('active');
      statusText.textContent = 'Active';
      elements.status.style.background = '#e6f4ea';
    } else {
      statusDot.classList.remove('active');
      statusText.textContent = 'Inactive';
      elements.status.style.background = '#fce8e6';
    }
  }

  // Update statistics
  function updateStats(stats) {
    if (stats.totalMemories !== undefined) {
      elements.memoryCount.textContent = formatNumber(stats.totalMemories);
    }
    
    if (stats.daysActive !== undefined) {
      elements.daysActive.textContent = stats.daysActive;
    }
    
    if (stats.lastSync) {
      const date = new Date(stats.lastSync);
      const now = new Date();
      const diff = now - date;
      
      if (diff < 60000) {
        elements.lastSync.textContent = 'Just now';
      } else if (diff < 3600000) {
        elements.lastSync.textContent = `${Math.floor(diff / 60000)}m ago`;
      } else if (diff < 86400000) {
        elements.lastSync.textContent = `${Math.floor(diff / 3600000)}h ago`;
      } else {
        elements.lastSync.textContent = `${Math.floor(diff / 86400000)}d ago`;
      }
    }
  }

  // Format large numbers
  function formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  // Toggle enabled state
  elements.enabled.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    updateStatus(enabled);
    
    // Save state
    await chrome.storage.local.set({ enabled });
    
    // Notify content scripts
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { 
        type: 'TOGGLE_MEMORY', 
        enabled 
      });
    }
    
    // Notify background
    chrome.runtime.sendMessage({ 
      type: 'TOGGLE_ENABLED', 
      enabled 
    });
  });

  // Toggle configuration section
  elements.toggleConfig.addEventListener('click', () => {
    const isVisible = elements.configSection.style.display !== 'none';
    
    if (isVisible) {
      elements.configSection.style.display = 'none';
      elements.configToggleText.textContent = 'Configure';
    } else {
      elements.configSection.style.display = 'block';
      elements.configToggleText.textContent = 'Hide Config';
    }
  });

  // Save configuration
  elements.saveConfig.addEventListener('click', async () => {
    const url = elements.supabaseUrl.value.trim();
    const key = elements.supabaseKey.value.trim();
    
    if (!url || !key) {
      showMessage('Please enter both Supabase URL and Key', 'error');
      return;
    }
    
    // Save to storage
    await chrome.storage.local.set({
      supabaseUrl: url,
      supabaseKey: key
    });
    
    // Update background
    await chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { supabaseUrl: url, supabaseKey: key }
    });
    
    showMessage('Configuration saved!', 'success');
    
    // Hide config section
    elements.configSection.style.display = 'none';
    elements.configToggleText.textContent = 'Configure';
    
    // Refresh stats
    setTimeout(loadState, 1000);
  });

  // Clear recent memories
  elements.clearRecent.addEventListener('click', async () => {
    if (!confirm('Clear memories from the last 24 hours?')) {
      return;
    }
    
    elements.clearRecent.disabled = true;
    elements.clearRecent.textContent = 'Clearing...';
    
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CLEAR_RECENT' });
      
      if (result.success) {
        showMessage('Recent memories cleared', 'success');
        loadState(); // Refresh stats
      } else {
        showMessage('Failed to clear memories', 'error');
      }
    } catch (error) {
      showMessage('Error clearing memories', 'error');
    } finally {
      elements.clearRecent.disabled = false;
      elements.clearRecent.textContent = 'Clear Last 24h';
    }
  });

  // Export memories
  elements.exportMemories.addEventListener('click', async () => {
    elements.exportMemories.disabled = true;
    elements.exportMemories.textContent = 'Exporting...';
    
    try {
      const result = await chrome.runtime.sendMessage({ type: 'EXPORT_MEMORIES' });
      
      if (result.success) {
        showMessage(`Exported ${result.count} memories`, 'success');
      } else {
        showMessage('Failed to export memories', 'error');
      }
    } catch (error) {
      showMessage('Error exporting memories', 'error');
    } finally {
      elements.exportMemories.disabled = false;
      elements.exportMemories.textContent = 'Export All';
    }
  });

  // Feedback link
  elements.feedback.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({
      url: 'https://github.com/yourusername/kit-extension/issues'
    });
  });

  // Show message
  function showMessage(text, type) {
    // Remove existing messages
    const existing = document.querySelector('.error, .success');
    if (existing) existing.remove();
    
    const message = document.createElement('div');
    message.className = type;
    message.textContent = text;
    
    elements.status.parentNode.insertBefore(message, elements.status.nextSibling);
    
    setTimeout(() => {
      message.remove();
    }, 3000);
  }

  // Check for Supabase configuration
  async function checkConfiguration() {
    const { supabaseUrl, supabaseKey } = await chrome.storage.local.get([
      'supabaseUrl', 
      'supabaseKey'
    ]);
    
    if (!supabaseUrl || !supabaseKey) {
      // Show configuration section by default if not configured
      elements.configSection.style.display = 'block';
      elements.configToggleText.textContent = 'Hide Config';
      showMessage('Please configure Supabase to start using Kit Memory', 'error');
    }
  }

  // Initialize
  await loadState();
  await checkConfiguration();
  
  // Refresh stats every 30 seconds
  setInterval(loadState, 30000);
});