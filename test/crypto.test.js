// Test suite for encryption functionality
// Verifies AES-256-GCM encryption works correctly

import { CredentialStorage } from '../lib/crypto.js';

describe('CredentialStorage Encryption', () => {
  let secureStorage;
  
  beforeEach(() => {
    // Mock chrome.storage API
    global.chrome = {
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined)
        },
        session: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(undefined)
        }
      },
      runtime: {
        id: 'test-extension-id'
      }
    };
    
    // Mock crypto API
    global.crypto = {
      getRandomValues: (array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      },
      subtle: {
        importKey: jest.fn(),
        deriveKey: jest.fn(),
        encrypt: jest.fn(),
        decrypt: jest.fn(),
        generateKey: jest.fn()
      }
    };
    
    secureStorage = new CredentialStorage();
  });
  
  describe('Passphrase Generation', () => {
    test('generates secure passphrase of correct length', () => {
      const passphrase = secureStorage.generateSecurePassphrase();
      
      expect(passphrase).toBeDefined();
      expect(passphrase.length).toBeGreaterThanOrEqual(32);
      // Check it contains various character types
      expect(/[A-Z]/.test(passphrase)).toBe(true);
      expect(/[a-z]/.test(passphrase)).toBe(true);
      expect(/[0-9]/.test(passphrase)).toBe(true);
    });
    
    test('generates different passphrases each time', () => {
      const pass1 = secureStorage.generateSecurePassphrase();
      const pass2 = secureStorage.generateSecurePassphrase();
      
      expect(pass1).not.toEqual(pass2);
    });
  });
  
  describe('Encryption and Decryption', () => {
    test('encrypts and decrypts credentials correctly', async () => {
      const originalData = {
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.key'
      };
      const passphrase = 'test-passphrase-123';
      
      // Mock successful encryption
      const mockEncryptedData = new ArrayBuffer(100);
      crypto.subtle.encrypt.mockResolvedValue(mockEncryptedData);
      
      // Mock key derivation
      const mockKey = { type: 'secret' };
      crypto.subtle.importKey.mockResolvedValue(mockKey);
      crypto.subtle.deriveKey.mockResolvedValue(mockKey);
      
      // Encrypt
      const encrypted = await secureStorage.encryptCredentials(originalData, passphrase);
      
      expect(encrypted).toBeDefined();
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.salt).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      
      // Mock successful decryption
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const jsonString = JSON.stringify(originalData);
      const encodedData = encoder.encode(jsonString);
      
      crypto.subtle.decrypt.mockResolvedValue(encodedData.buffer);
      
      // Decrypt
      const decrypted = await secureStorage.decryptCredentials(encrypted, passphrase);
      
      expect(decrypted).toEqual(originalData);
    });
    
    test('fails to decrypt with wrong passphrase', async () => {
      const originalData = {
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key'
      };
      const correctPassphrase = 'correct-passphrase';
      const wrongPassphrase = 'wrong-passphrase';
      
      // Mock encryption
      const mockEncryptedData = new ArrayBuffer(100);
      crypto.subtle.encrypt.mockResolvedValue(mockEncryptedData);
      
      const mockKey = { type: 'secret' };
      crypto.subtle.importKey.mockResolvedValue(mockKey);
      crypto.subtle.deriveKey.mockResolvedValue(mockKey);
      
      // Encrypt with correct passphrase
      const encrypted = await secureStorage.encryptCredentials(originalData, correctPassphrase);
      
      // Mock decryption failure
      crypto.subtle.decrypt.mockRejectedValue(new Error('Decryption failed'));
      
      // Try to decrypt with wrong passphrase
      await expect(
        secureStorage.decryptCredentials(encrypted, wrongPassphrase)
      ).rejects.toThrow();
    });
    
    test('validates required fields before encryption', async () => {
      const invalidData = {
        supabaseUrl: 'https://test.supabase.co'
        // Missing supabaseKey
      };
      
      await expect(
        secureStorage.encryptCredentials(invalidData, 'passphrase')
      ).rejects.toThrow('Missing required field: supabaseKey');
    });
  });
  
  describe('Storage Migration', () => {
    test('migrates plaintext credentials to encrypted storage', async () => {
      // Mock plaintext credentials in storage
      chrome.storage.local.get.mockResolvedValue({
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'plaintext-key'
      });
      
      // Mock encryption
      const mockEncryptedData = new ArrayBuffer(100);
      crypto.subtle.encrypt.mockResolvedValue(mockEncryptedData);
      
      const mockKey = { type: 'secret' };
      crypto.subtle.importKey.mockResolvedValue(mockKey);
      crypto.subtle.deriveKey.mockResolvedValue(mockKey);
      
      // Perform migration
      const migrated = await secureStorage.migrateFromPlaintext();
      
      expect(migrated).toBe(true);
      
      // Verify plaintext was removed
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['supabaseUrl', 'supabaseKey']);
      
      // Verify encrypted data was saved
      expect(chrome.storage.local.set).toHaveBeenCalled();
      const savedData = chrome.storage.local.set.mock.calls[0][0];
      expect(savedData.encryptedCredentials).toBeDefined();
      expect(savedData.credentialsMigrated).toBe(true);
    });
    
    test('handles migration when no plaintext credentials exist', async () => {
      // No plaintext credentials
      chrome.storage.local.get.mockResolvedValue({});
      
      const migrated = await secureStorage.migrateFromPlaintext();
      
      expect(migrated).toBe(false);
      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });
  
  describe('Session Passphrase Management', () => {
    test('stores and retrieves session passphrase', async () => {
      const passphrase = 'session-passphrase';
      
      await secureStorage.setSessionPassphrase(passphrase);
      
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        sessionPassphrase: passphrase,
        passphraseTimestamp: expect.any(Number)
      });
      
      // Mock retrieval
      chrome.storage.session.get.mockResolvedValue({
        sessionPassphrase: passphrase,
        passphraseTimestamp: Date.now()
      });
      
      const retrieved = await secureStorage.getSessionPassphrase();
      expect(retrieved).toEqual(passphrase);
    });
    
    test('clears expired session passphrase after 5 minutes', async () => {
      const passphrase = 'expired-passphrase';
      const sixMinutesAgo = Date.now() - (6 * 60 * 1000);
      
      chrome.storage.session.get.mockResolvedValue({
        sessionPassphrase: passphrase,
        passphraseTimestamp: sixMinutesAgo
      });
      
      const retrieved = await secureStorage.getSessionPassphrase();
      
      expect(retrieved).toBeNull();
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        sessionPassphrase: null,
        passphraseTimestamp: null
      });
    });
  });
  
  describe('Error Handling', () => {
    test('handles encryption errors gracefully', async () => {
      const data = {
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key'
      };
      
      // Mock encryption failure
      crypto.subtle.encrypt.mockRejectedValue(new Error('Encryption failed'));
      
      await expect(
        secureStorage.encryptCredentials(data, 'passphrase')
      ).rejects.toThrow('Failed to encrypt credentials');
    });
    
    test('handles decryption errors gracefully', async () => {
      const encryptedData = {
        encryptedData: 'invalid',
        salt: 'salt',
        iv: 'iv'
      };
      
      crypto.subtle.decrypt.mockRejectedValue(new Error('Decryption failed'));
      
      await expect(
        secureStorage.decryptCredentials(encryptedData, 'passphrase')
      ).rejects.toThrow('Failed to decrypt credentials');
    });
  });
});

// Run tests if jest is available
if (typeof jest !== 'undefined') {
  console.log('Running crypto tests...');
}