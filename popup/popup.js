// Secure Popup logic for Kit Memory Extension
// Handles UI interactions with encrypted credential storage

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const elements = {
    enabled: document.getElementById('enabled'),
    status: document.getElementById('status'),
    memoryCount: document.getElementById('memoryCount'),
    daysActive: document.getElementById('daysActive'),
    lastSync: document.getElementById('lastSync'),
    securityStatus: document.getElementById('securityStatus'),
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

  // Security indicators
  let credentialsEncrypted = false;
  let keyMasked = true;

  // Load current state
  async function loadState() {
    try {
      const storage = await chrome.storage.local.get([
        'enabled',
        'encryptedCredentials',
        'credentialsMigrated'
      ]);
      
      // Set enabled state
      elements.enabled.checked = storage.enabled !== false;
      updateStatus(storage.enabled !== false);
      
      // Check encryption status
      const encryptionCheck = await chrome.runtime.sendMessage({ type: 'CHECK_ENCRYPTION' });
      credentialsEncrypted = encryptionCheck.encrypted;
      
      // Update security status display
      updateSecurityStatus(credentialsEncrypted);
      
      // If credentials exist (encrypted), show masked placeholder
      if (credentialsEncrypted) {
        elements.supabaseUrl.value = '••••••••.supabase.co';
        elements.supabaseUrl.setAttribute('data-masked', 'true');
        elements.supabaseKey.value = '••••••••••••••••••••';
        elements.supabaseKey.setAttribute('data-masked', 'true');
        
        // Add reveal button if not exists
        if (!document.getElementById('revealCredentials')) {
          addRevealButton();
        }
      }
      
      // Get statistics
      const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      updateStats(stats);
      
    } catch (error) {
      console.error('Failed to load state:', error);
      showFeedback('Failed to load extension state', 'error');
    }
  }

  // Add reveal credentials button
  function addRevealButton() {
    const configHeader = document.querySelector('.config-header') || 
                        document.querySelector('.section-header');
    
    if (configHeader) {
      const revealBtn = document.createElement('button');
      revealBtn.id = 'revealCredentials';
      revealBtn.className = 'reveal-btn';
      revealBtn.textContent = '👁️ Show Credentials'; // Safe: Use textContent instead of innerHTML
      revealBtn.title = 'Temporarily reveal stored credentials';
      
      revealBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to reveal your credentials? They contain sensitive API keys.')) {
          return;
        }
        
        // Request decrypted credentials from background
        // Note: In production, this should require additional authentication
        showFeedback('For security, credentials cannot be revealed. Enter new ones to update.', 'warning');
      });
      
      configHeader.appendChild(revealBtn);
    }
  }

  // Update security status display
  function updateSecurityStatus(encrypted) {
    if (!elements.securityStatus) {
      // Create security status element if doesn't exist
      const statusContainer = elements.status.parentElement;
      const securityDiv = document.createElement('div');
      securityDiv.id = 'securityStatus';
      securityDiv.className = 'security-status';
      statusContainer.appendChild(securityDiv);
      elements.securityStatus = securityDiv;
    }
    
    if (encrypted) {
      // Safe DOM manipulation without innerHTML
      elements.securityStatus.textContent = ''; // Clear existing content
      
      const lockIcon = document.createElement('span');
      lockIcon.className = 'security-icon';
      lockIcon.textContent = '🔒';
      
      const lockText = document.createElement('span');
      lockText.className = 'security-text';
      lockText.textContent = 'Credentials Encrypted';
      
      elements.securityStatus.appendChild(lockIcon);
      elements.securityStatus.appendChild(lockText);
      elements.securityStatus.className = 'security-status secure';
    } else {
      // Safe DOM manipulation without innerHTML
      elements.securityStatus.textContent = ''; // Clear existing content
      
      const warnIcon = document.createElement('span');
      warnIcon.className = 'security-icon';
      warnIcon.textContent = '⚠️';
      
      const warnText = document.createElement('span');
      warnText.className = 'security-text';
      warnText.textContent = 'No Credentials Stored';
      
      elements.securityStatus.appendChild(warnIcon);
      elements.securityStatus.appendChild(warnText);
      elements.securityStatus.className = 'security-status warning';
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
    
    // Show security events count if available
    if (stats.securityEvents !== undefined && stats.securityEvents > 0) {
      showFeedback(`${stats.securityEvents} security events logged`, 'info');
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

  // Validate Supabase credentials format
  function validateCredentials(url, key) {
    // Validate URL
    const urlPattern = /^https:\/\/[a-zA-Z0-9]+\.supabase\.co$/;
    if (!urlPattern.test(url)) {
      showFeedback('Invalid Supabase URL format', 'error');
      return false;
    }
    
    // Validate key (JWT format)
    const keyPattern = /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
    if (!keyPattern.test(key)) {
      showFeedback('Invalid Supabase API key format', 'error');
      return false;
    }
    
    return true;
  }

  // Show feedback message
  function showFeedback(message, type = 'success') {
    elements.feedback.textContent = message;
    elements.feedback.className = `feedback ${type}`;
    elements.feedback.style.display = 'block';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      elements.feedback.style.display = 'none';
    }, 3000);
  }

  // Event Listeners
  
  // Toggle enabled state
  elements.enabled.addEventListener('change', async () => {
    const enabled = elements.enabled.checked;
    const response = await chrome.runtime.sendMessage({
      type: 'TOGGLE_ENABLED',
      enabled
    });
    
    if (response.success) {
      updateStatus(enabled);
      showFeedback(enabled ? 'Memory capture enabled' : 'Memory capture disabled');
    }
  });

  // Toggle configuration section
  elements.toggleConfig.addEventListener('click', () => {
    const isHidden = elements.configSection.style.display === 'none';
    elements.configSection.style.display = isHidden ? 'block' : 'none';
    elements.configToggleText.textContent = isHidden ? 'Hide' : 'Show';
  });

  // Clear masked fields on focus
  elements.supabaseUrl.addEventListener('focus', () => {
    if (elements.supabaseUrl.getAttribute('data-masked') === 'true') {
      elements.supabaseUrl.value = '';
      elements.supabaseUrl.removeAttribute('data-masked');
    }
  });

  elements.supabaseKey.addEventListener('focus', () => {
    if (elements.supabaseKey.getAttribute('data-masked') === 'true') {
      elements.supabaseKey.value = '';
      elements.supabaseKey.removeAttribute('data-masked');
    }
  });

  // Save configuration
  elements.saveConfig.addEventListener('click', async () => {
    const url = elements.supabaseUrl.value.trim();
    const key = elements.supabaseKey.value.trim();
    
    // Don't save if fields are masked or empty
    if (!url || !key || 
        url.includes('•') || key.includes('•')) {
      showFeedback('Please enter your Supabase credentials', 'error');
      return;
    }
    
    // Validate format
    if (!validateCredentials(url, key)) {
      return;
    }
    
    // Warn about credential update
    if (credentialsEncrypted) {
      if (!confirm('This will replace your existing encrypted credentials. Continue?')) {
        return;
      }
    }
    
    try {
      // Send to background for encryption and storage
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_CONFIG',
        config: {
          supabaseUrl: url,
          supabaseKey: key
        }
      });
      
      if (response.success) {
        showFeedback('Credentials encrypted and saved securely', 'success');
        credentialsEncrypted = true;
        updateSecurityStatus(true);
        
        // Mask the fields again
        elements.supabaseUrl.value = '••••••••.supabase.co';
        elements.supabaseUrl.setAttribute('data-masked', 'true');
        elements.supabaseKey.value = '••••••••••••••••••••';
        elements.supabaseKey.setAttribute('data-masked', 'true');
        
        // Add reveal button if needed
        if (!document.getElementById('revealCredentials')) {
          addRevealButton();
        }
      } else {
        showFeedback(response.error || 'Failed to save configuration', 'error');
      }
    } catch (error) {
      console.error('Save config error:', error);
      showFeedback('Failed to save configuration', 'error');
    }
  });

  // Clear recent memories
  elements.clearRecent.addEventListener('click', async () => {
    if (!confirm('Clear memories from the last 24 hours?')) {
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'CLEAR_RECENT'
    });
    
    if (response.success) {
      showFeedback('Recent memories cleared', 'success');
      // Refresh stats
      const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      updateStats(stats);
    } else {
      showFeedback(response.error || 'Failed to clear memories', 'error');
    }
  });

  // Export memories
  elements.exportMemories.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({
      type: 'EXPORT_MEMORIES'
    });
    
    if (response.success) {
      showFeedback(`Exported ${response.count} memories`, 'success');
    } else {
      showFeedback(response.error || 'Export failed', 'error');
    }
  });

  // Add security warning on page
  function addSecurityWarning() {
    const warning = document.createElement('div');
    warning.className = 'security-warning';
    
    // Safe DOM manipulation without innerHTML
    const strong = document.createElement('strong');
    strong.textContent = '🔒 Security Notice: ';
    
    const text = document.createTextNode(
      'Your credentials are encrypted using AES-256-GCM. Never share your API keys with anyone.'
    );
    
    warning.appendChild(strong);
    warning.appendChild(text);
    
    document.body.insertBefore(warning, document.body.firstChild);
  }

  // Add CSS for security elements
  function addSecurityStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .security-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 8px;
        margin-top: 8px;
        font-size: 12px;
      }
      
      .security-status.secure {
        background: #e6f4ea;
        color: #1e8e3e;
      }
      
      .security-status.warning {
        background: #fef7e0;
        color: #ea8600;
      }
      
      .security-icon {
        font-size: 16px;
      }
      
      .reveal-btn {
        padding: 4px 8px;
        font-size: 11px;
        background: #f8f9fa;
        border: 1px solid #dadce0;
        border-radius: 4px;
        cursor: pointer;
        margin-left: auto;
      }
      
      .reveal-btn:hover {
        background: #e8eaed;
      }
      
      .security-warning {
        background: #e8f0fe;
        color: #1967d2;
        padding: 12px;
        margin: 0;
        font-size: 12px;
        border-bottom: 1px solid #dadce0;
      }
      
      .feedback {
        padding: 8px 12px;
        border-radius: 4px;
        margin: 8px 0;
        font-size: 13px;
        display: none;
      }
      
      .feedback.success {
        background: #e6f4ea;
        color: #1e8e3e;
        border: 1px solid #ceead6;
      }
      
      .feedback.error {
        background: #fce8e6;
        color: #d93025;
        border: 1px solid #f5c6c2;
      }
      
      .feedback.warning {
        background: #fef7e0;
        color: #ea8600;
        border: 1px solid #feefc3;
      }
      
      .feedback.info {
        background: #e8f0fe;
        color: #1967d2;
        border: 1px solid #d2e3fc;
      }
      
      input[data-masked="true"] {
        font-family: monospace;
        letter-spacing: 2px;
        color: #5f6368;
      }
    `;
    document.head.appendChild(style);
  }

  // Initialize
  addSecurityStyles();
  addSecurityWarning();
  loadState();
  
  // Refresh stats every 30 seconds
  setInterval(async () => {
    const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    updateStats(stats);
  }, 30000);
});