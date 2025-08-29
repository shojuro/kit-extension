// Crypto module for Kit Memory Extension
// Implements AES-256-GCM encryption for secure credential storage

class SecureStorage {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.ivLength = 12; // 96 bits for GCM
    this.saltLength = 16; // 128 bits
    this.iterations = 100000; // PBKDF2 iterations
  }

  // Generate a cryptographically secure random key
  async generateMasterKey() {
    try {
      const key = await crypto.subtle.generateKey(
        {
          name: this.algorithm,
          length: this.keyLength
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );
      
      // Export key for storage (will be encrypted with user passphrase)
      const exportedKey = await crypto.subtle.exportKey('raw', key);
      return this.arrayBufferToBase64(exportedKey);
    } catch (error) {
      console.error('Failed to generate master key:', error);
      throw new Error('Key generation failed');
    }
  }

  // Derive encryption key from passphrase using PBKDF2
  async deriveKeyFromPassphrase(passphrase, salt) {
    try {
      const encoder = new TextEncoder();
      const passphraseKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: this.iterations,
          hash: 'SHA-256'
        },
        passphraseKey,
        { name: this.algorithm, length: this.keyLength },
        true,
        ['encrypt', 'decrypt']
      );

      return key;
    } catch (error) {
      console.error('Key derivation failed:', error);
      throw new Error('Invalid passphrase or corrupted salt');
    }
  }

  // Encrypt credentials
  async encryptCredentials(credentials, passphrase) {
    try {
      const salt = crypto.getRandomValues(new Uint8Array(this.saltLength));
      const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
      const key = await this.deriveKeyFromPassphrase(passphrase, salt);
      
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(credentials));
      
      const encrypted = await crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        data
      );

      // Return encrypted data with metadata
      return {
        encrypted: this.arrayBufferToBase64(encrypted),
        salt: this.arrayBufferToBase64(salt),
        iv: this.arrayBufferToBase64(iv),
        version: 1, // For future migration support
        algorithm: this.algorithm,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt credentials');
    }
  }

  // Decrypt credentials
  async decryptCredentials(encryptedData, passphrase) {
    try {
      const salt = this.base64ToArrayBuffer(encryptedData.salt);
      const iv = this.base64ToArrayBuffer(encryptedData.iv);
      const ciphertext = this.base64ToArrayBuffer(encryptedData.encrypted);
      
      const key = await this.deriveKeyFromPassphrase(passphrase, salt);
      
      const decrypted = await crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        key,
        ciphertext
      );

      const decoder = new TextDecoder();
      const jsonString = decoder.decode(decrypted);
      
      // Clear sensitive data from memory
      this.clearBuffer(decrypted);
      
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt credentials - invalid passphrase or corrupted data');
    }
  }

  // Generate a secure random passphrase if user doesn't provide one
  generateSecurePassphrase() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.arrayBufferToBase64(array);
  }

  // Validate credential structure
  validateCredentials(credentials) {
    if (!credentials || typeof credentials !== 'object') {
      return false;
    }
    
    // Check for required fields
    const requiredFields = ['supabaseUrl', 'supabaseKey'];
    for (const field of requiredFields) {
      if (!credentials[field] || typeof credentials[field] !== 'string') {
        return false;
      }
    }
    
    // Validate Supabase URL format
    const urlPattern = /^https:\/\/[a-zA-Z0-9]+\.supabase\.co$/;
    if (!urlPattern.test(credentials.supabaseUrl)) {
      return false;
    }
    
    // Validate Supabase key format (JWT)
    const keyPattern = /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
    if (!keyPattern.test(credentials.supabaseKey)) {
      return false;
    }
    
    return true;
  }

  // Helper: Convert ArrayBuffer to Base64
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Helper: Convert Base64 to ArrayBuffer
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Clear sensitive data from memory (best effort)
  clearBuffer(buffer) {
    if (buffer instanceof ArrayBuffer) {
      const view = new Uint8Array(buffer);
      crypto.getRandomValues(view); // Overwrite with random data
    }
  }

  // Check if encryption is available
  async isEncryptionAvailable() {
    try {
      // Test if Web Crypto API is available and working
      const testKey = await crypto.subtle.generateKey(
        { name: this.algorithm, length: this.keyLength },
        true,
        ['encrypt', 'decrypt']
      );
      return !!testKey;
    } catch {
      return false;
    }
  }

  // Migrate plaintext credentials to encrypted storage
  async migrateToEncrypted(plaintextCreds, passphrase) {
    try {
      if (!this.validateCredentials(plaintextCreds)) {
        throw new Error('Invalid credential format');
      }
      
      const encrypted = await this.encryptCredentials(plaintextCreds, passphrase);
      
      // Store encrypted version
      await chrome.storage.local.set({
        encryptedCredentials: encrypted,
        credentialsMigrated: true,
        migrationDate: Date.now()
      });
      
      // Remove plaintext versions
      await chrome.storage.local.remove(['supabaseUrl', 'supabaseKey']);
      
      return true;
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecureStorage;
} else {
  window.SecureStorage = SecureStorage;
}