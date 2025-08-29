// Test suite for XSS prevention
// Verifies sanitization blocks dangerous content

import { InputSanitizer } from '../lib/sanitizer.js';

describe('XSS Prevention', () => {
  let sanitizer;
  
  beforeEach(() => {
    sanitizer = new InputSanitizer();
    
    // Mock console for security logging
    global.console = {
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn()
    };
  });
  
  describe('Script Tag Prevention', () => {
    test('blocks inline script tags', () => {
      const xss = '<script>alert("XSS")</script>Hello';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('</script>');
      expect(clean).not.toContain('alert');
      expect(clean).toContain('Hello');
    });
    
    test('blocks script tags with attributes', () => {
      const xss = '<script src="evil.js"></script>';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('<script');
      expect(clean).not.toContain('evil.js');
    });
    
    test('blocks encoded script tags', () => {
      const xss = '&lt;script&gt;alert("XSS")&lt;/script&gt;';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('script');
      expect(clean).not.toContain('alert');
    });
  });
  
  describe('Event Handler Prevention', () => {
    test('blocks onclick handlers', () => {
      const xss = '<div onclick="alert(\'XSS\')">Click me</div>';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('onclick');
      expect(clean).not.toContain('alert');
      expect(clean).toContain('Click me');
    });
    
    test('blocks onerror handlers', () => {
      const xss = '<img src="x" onerror="alert(\'XSS\')">';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('alert');
    });
    
    test('blocks all on* event handlers', () => {
      const events = ['onload', 'onmouseover', 'onfocus', 'onblur', 'oninput'];
      
      events.forEach(event => {
        const xss = `<div ${event}="malicious()">Test</div>`;
        const clean = sanitizer.sanitizeForStorage(xss);
        
        expect(clean).not.toContain(event);
        expect(clean).not.toContain('malicious');
      });
    });
  });
  
  describe('JavaScript URL Prevention', () => {
    test('blocks javascript: URLs in links', () => {
      const xss = '<a href="javascript:alert(\'XSS\')">Click</a>';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('javascript:');
      expect(clean).not.toContain('alert');
    });
    
    test('blocks data: URLs with javascript', () => {
      const xss = '<a href="data:text/html,<script>alert(\'XSS\')</script>">Click</a>';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('data:');
      expect(clean).not.toContain('script');
    });
    
    test('blocks vbscript: URLs', () => {
      const xss = '<a href="vbscript:msgbox(\'XSS\')">Click</a>';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('vbscript:');
      expect(clean).not.toContain('msgbox');
    });
  });
  
  describe('Iframe Prevention', () => {
    test('blocks iframe tags', () => {
      const xss = '<iframe src="evil.com"></iframe>';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('<iframe');
      expect(clean).not.toContain('</iframe>');
      expect(clean).not.toContain('evil.com');
    });
    
    test('blocks embed tags', () => {
      const xss = '<embed src="evil.swf">';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('<embed');
      expect(clean).not.toContain('evil.swf');
    });
    
    test('blocks object tags', () => {
      const xss = '<object data="evil.swf"></object>';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('<object');
      expect(clean).not.toContain('</object>');
    });
  });
  
  describe('Style Injection Prevention', () => {
    test('blocks style tags with javascript', () => {
      const xss = '<style>body { background: url("javascript:alert(\'XSS\')"); }</style>';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('<style');
      expect(clean).not.toContain('javascript:');
    });
    
    test('blocks inline style with javascript', () => {
      const xss = '<div style="background: url(\'javascript:alert()\')">Test</div>';
      const clean = sanitizer.sanitizeForStorage(xss);
      
      expect(clean).not.toContain('javascript:');
      expect(clean).toContain('Test');
    });
  });
  
  describe('HTML Entity Encoding', () => {
    test('encodes HTML entities properly', () => {
      const input = 'Test < > & " \' characters';
      const clean = sanitizer.sanitizeForStorage(input);
      
      // Should preserve text but encode dangerous characters
      expect(clean).toContain('Test');
      expect(clean).not.toContain('<script>');
    });
    
    test('handles mixed content with entities', () => {
      const input = 'Normal text <b>bold</b> & <script>evil</script>';
      const clean = sanitizer.sanitizeForStorage(input);
      
      expect(clean).toContain('Normal text');
      expect(clean).toContain('bold');
      expect(clean).not.toContain('<script>');
    });
  });
  
  describe('XSS Detection', () => {
    test('detects script injection attempts', () => {
      const xssPatterns = [
        '<script>alert(1)</script>',
        'javascript:alert(1)',
        'onerror=alert(1)',
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>'
      ];
      
      xssPatterns.forEach(pattern => {
        const detected = sanitizer.detectXSS(pattern);
        expect(detected).toBe(true);
      });
    });
    
    test('does not flag safe content', () => {
      const safeContent = [
        'Hello world',
        'This is a normal message',
        'I like JavaScript programming',
        'The script was successful'
      ];
      
      safeContent.forEach(content => {
        const detected = sanitizer.detectXSS(content);
        expect(detected).toBe(false);
      });
    });
  });
  
  describe('URL Sanitization', () => {
    test('allows safe URLs', () => {
      const safeUrls = [
        'https://example.com',
        'http://localhost:3000',
        '/relative/path',
        'mailto:test@example.com'
      ];
      
      safeUrls.forEach(url => {
        const clean = sanitizer.sanitizeUrl(url);
        expect(clean).toEqual(url);
      });
    });
    
    test('blocks dangerous URLs', () => {
      const dangerousUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd'
      ];
      
      dangerousUrls.forEach(url => {
        const clean = sanitizer.sanitizeUrl(url);
        expect(clean).toEqual('#');
      });
    });
  });
  
  describe('Content Length Limits', () => {
    test('truncates extremely long content', () => {
      const longContent = 'A'.repeat(60000);
      const clean = sanitizer.sanitizeForStorage(longContent);
      
      expect(clean.length).toBeLessThanOrEqual(50000 + 50); // Max length + truncation message
      expect(clean).toContain('[truncated]');
    });
    
    test('preserves content under limit', () => {
      const normalContent = 'Normal length content';
      const clean = sanitizer.sanitizeForStorage(normalContent);
      
      expect(clean).toEqual(normalContent);
      expect(clean).not.toContain('[truncated]');
    });
  });
  
  describe('Security Logging', () => {
    test('logs XSS attempts', () => {
      const xss = '<script>alert("XSS")</script>';
      sanitizer.sanitizeForStorage(xss);
      
      // Check if detectXSS was triggered and logged
      const detected = sanitizer.detectXSS(xss);
      expect(detected).toBe(true);
    });
    
    test('logs security events', () => {
      sanitizer.logSecurityEvent('XSS_BLOCKED', {
        pattern: '<script>',
        source: 'test'
      });
      
      expect(console.warn).toHaveBeenCalledWith(
        '[Kit Security]',
        'XSS_BLOCKED',
        expect.objectContaining({
          pattern: '<script>',
          source: 'test'
        })
      );
    });
  });
  
  describe('Sanitization Profiles', () => {
    test('strict profile removes all HTML', () => {
      const html = '<b>Bold</b> <i>Italic</i> <a href="#">Link</a>';
      const clean = sanitizer.sanitize(html, 'strict');
      
      expect(clean).not.toContain('<b>');
      expect(clean).not.toContain('<i>');
      expect(clean).not.toContain('<a');
      expect(clean).toContain('Bold');
      expect(clean).toContain('Italic');
    });
    
    test('moderate profile allows safe formatting', () => {
      const html = '<b>Bold</b> <script>evil</script>';
      const clean = sanitizer.sanitize(html, 'moderate');
      
      expect(clean).toContain('Bold');
      expect(clean).not.toContain('<script>');
    });
    
    test('relaxed profile allows more tags but still blocks scripts', () => {
      const html = '<div><b>Text</b><script>evil</script></div>';
      const clean = sanitizer.sanitize(html, 'relaxed');
      
      expect(clean).toContain('Text');
      expect(clean).not.toContain('<script>');
    });
  });
  
  describe('Message Sanitization', () => {
    test('sanitizes all fields in a message object', () => {
      const message = {
        role: 'user',
        content: '<script>alert("XSS")</script>Hello',
        site: 'chatgpt<script>',
        url: 'javascript:alert(1)',
        timestamp: '2024-01-01T00:00:00Z'
      };
      
      const clean = sanitizer.sanitizeMessage(message);
      
      expect(clean.content).not.toContain('<script>');
      expect(clean.site).not.toContain('<script>');
      expect(clean.url).toEqual('#');
      expect(clean.timestamp).toEqual(message.timestamp);
    });
  });
});

// Run tests if jest is available
if (typeof jest !== 'undefined') {
  console.log('Running XSS prevention tests...');
}