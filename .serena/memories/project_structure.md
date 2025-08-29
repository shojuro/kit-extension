# Kit Memory Extension - Project Structure

## Directory Layout
```
kit-extension/
├── manifest.json           # Chrome extension configuration (Manifest V3)
├── background.js           # Service worker - handles Supabase operations
├── content/               # Content scripts injected into ChatGPT/Claude
│   ├── inject.js          # Main capture & enhancement logic
│   ├── detector.js        # Platform detection & selectors
│   └── styles.css         # Memory indicator styles
├── lib/                   # Shared library modules
│   ├── memory.js          # Memory search & tiering logic
│   ├── supabase.js        # Database client wrapper
│   └── parser.js          # Message parsing logic
├── popup/                 # Extension popup UI
│   ├── popup.html         # Configuration interface
│   ├── popup.js           # Popup logic
│   └── popup.css          # Popup styles
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── supabase_schema.sql    # Database schema with 3-tier system
├── .env.example           # Template for environment variables
├── .env                   # Actual credentials (git-ignored)
├── .gitignore            # Security-first ignore rules
├── CLAUDE.md             # Project-specific instructions
├── ARCHITECTURE.md       # System design documentation
└── README.md             # Basic project info
```

## Key Components

### Background Service Worker (background.js)
- Message handling from content scripts
- Supabase database operations
- Offline queue management
- Memory deduplication
- Configuration management

### Content Scripts
- **inject.js**: MemoryCapture class for DOM monitoring
- **detector.js**: SiteDetector class with fallback selectors
- **styles.css**: Visual indicators for memory status

### Library Modules
- **memory.js**: Search, retrieval, tiering logic
- **supabase.js**: Database client configuration
- **parser.js**: Message extraction and parsing

### Database Schema
- **memories** table: HOT tier (0-3 months)
- **memories_warm** table: WARM tier (3-6 months)
- **memories_cold** table: COLD tier (6-12 months)
- **conversations** table: Session tracking
- **users** table: Anonymous user management
- **user_settings** table: Preferences

## Data Flow
1. Content script captures messages from DOM
2. Sends to background service worker
3. Background worker stores in Supabase
4. Retrieval happens on trigger keywords
5. Context injected transparently into prompts

## Current Implementation Status
- Core structure: ✅ Complete
- Message capture: ✅ Framework ready
- Supabase integration: ✅ Schema and connection ready
- Offline queue: ✅ Structure in place
- Memory retrieval: ⏳ To be implemented
- Prompt enhancement: ⏳ To be implemented