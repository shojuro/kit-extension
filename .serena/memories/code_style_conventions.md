# Code Style and Conventions

## JavaScript Conventions
- **No framework dependencies** - Vanilla JavaScript only
- **ES6+ syntax** - Modern JavaScript features
- **Async/await** - For asynchronous operations
- **Module pattern** - Chrome extension module system

## Naming Conventions
- **camelCase** for variables and functions (e.g., `storeMemory`, `userId`)
- **PascalCase** for classes (e.g., `MemoryCapture`, `SiteDetector`)
- **UPPER_SNAKE_CASE** for constants (implied but not explicitly used)
- **Descriptive names** - Clear function names like `extractConversationId`, `processOfflineQueue`

## Code Organization
- **Service worker pattern** - background.js handles all Supabase operations
- **Content scripts** - Modular separation (detector.js, inject.js)
- **Library modules** - Reusable logic in lib/ directory
- **Configuration** - Chrome storage API for user settings

## Security Patterns
- **No hardcoded secrets** - Uses Chrome storage for API keys
- **Environment variables** - .env for local development only
- **Content Security Policy** - Strict CSP in manifest.json

## Error Handling
- **Try-catch blocks** - For async operations
- **Graceful degradation** - Queue offline, fallback selectors
- **Console logging** - Prefixed with "Kit Memory:" for debugging

## Chrome Extension Specific
- **Manifest V3** - Modern extension architecture
- **Service workers** - Instead of background pages
- **Message passing** - chrome.runtime.sendMessage for communication
- **Host permissions** - Explicit permissions in manifest.json