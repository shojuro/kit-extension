# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Kit Memory Extension

A Chrome extension that provides persistent memory for ChatGPT and Claude across sessions. Users experience seamless conversation continuity as if the AI "just remembers" previous interactions.

## Common Development Commands

```bash
# Chrome Extension Development
chrome://extensions/              # Load unpacked extension from project root
Ctrl+R on extensions page         # Reload extension after changes

# Supabase Database
npx supabase init                 # Initialize Supabase project
npx supabase db push              # Push schema changes
npx supabase db reset             # Reset database with schema

# Testing
# Open DevTools Console on ChatGPT/Claude to see:
"Kit Memory: Initialized on [site]"     # Confirms content script loaded
"Kit Memory: Stored [role] message"     # Confirms message capture

# Build & Package (when ready)
npm run build                     # Build for development
npm run build:prod               # Build for production
npm run package                  # Create .zip for Chrome Web Store
```

## High-Level Architecture

### RIEF Pattern (Request-Intercept-Enhance-Forward)
The extension operates as an invisible middleware layer:

1. **REQUEST**: User types in ChatGPT/Claude
2. **INTERCEPT**: Content script captures input before submission
3. **ENHANCE**: Background worker retrieves relevant memories and builds context
4. **FORWARD**: Modified prompt (with injected context) sent to AI

### Core Components & Flow

```
User Input → Content Script (inject.js) → Background Worker (background.js)
    ↓              ↓                              ↓
DOM Monitoring  Site Detection              Supabase Storage
    ↓           (detector.js)                    ↓
Message Capture      ↓                     Memory Management
    ↓           Fallback Selectors         (lib/memory.js)
    ↓                ↓                           ↓
Prompt Enhancement ← Memory Retrieval ← Search & Retrieval
```

### Memory Tiering System

- **HOT (0-3 months)**: `memories` table, full content, <200ms retrieval
- **WARM (3-6 months)**: `memories_warm` table, compressed, 500ms-1s retrieval  
- **COLD (6-12 months)**: `memories_cold` table, summaries only, 2-5s retrieval
- **Automatic migration**: Daily cron moves memories between tiers

### Key Implementation Details

1. **Site Detection**: Multiple fallback selectors for resilience against DOM changes
2. **Message Deduplication**: SHA hash of role+content prevents duplicate storage
3. **Offline Queue**: chrome.storage.local queues messages when offline
4. **Token Budget**: Max 20% of context window for memories (~2000 tokens)
5. **Smart Triggering**: Only enhances on keywords ("remember", "continue", "last time")
6. **Transparent Operation**: User never sees the context injection

## Current Project Status

### Completed (Day 0)
- ✅ Chrome extension manifest v3 structure
- ✅ Background service worker with Supabase integration
- ✅ Content scripts for ChatGPT/Claude capture
- ✅ Site detector with fallback selectors
- ✅ Popup UI for configuration
- ✅ Library modules for memory management
- ✅ Security-first setup (.gitignore, .env pattern)

### Next Steps (Day 1)
1. **Morning**: Make ChatGPT capture bulletproof
   - Test and strengthen selectors
   - Complete message capture pipeline
   - Connect to real Supabase instance
   - Extract conversation IDs

2. **Afternoon**: Claude support & robustness
   - Port to Claude's DOM structure
   - Implement duplicate detection
   - Build offline queue
   - End-to-end testing

### Future (Day 2-5)
- Memory retrieval and prompt enhancement
- Edge case handling
- UI polish and settings
- Testing and launch preparation

## Testing Procedures

### Manual Testing Checklist
```
1. Load extension in Chrome Developer Mode
2. Navigate to chat.openai.com
3. Check console for "Kit Memory: Initialized"
4. Send a message
5. Check console for "Kit Memory: Stored user message"
6. Wait for AI response
7. Check console for "Kit Memory: Stored assistant message"
8. Verify in Supabase dashboard
```

### Critical Verification Points
- Message capture works without duplicates
- Conversation IDs extracted correctly
- Offline queue processes when reconnected
- No memory injection visible to user
- Token budget not exceeded

## File Structure & Key Files

```
kit-extension/
├── manifest.json           # Extension config (host permissions critical)
├── background.js           # Service worker, Supabase operations
├── content/
│   ├── inject.js          # Main capture & enhancement logic
│   ├── detector.js        # Platform detection & selectors
│   └── styles.css         # Memory indicator styles
├── lib/
│   ├── memory.js          # Memory search & tiering
│   ├── supabase.js        # Database client wrapper
│   └── parser.js          # Message parsing logic
├── popup/
│   └── popup.js           # User configuration UI
└── supabase_schema.sql    # Database schema with 3 tiers
```

## Environment Configuration

Required in popup configuration or .env:
```
SUPABASE_URL=https://[project].supabase.co
SUPABASE_ANON_KEY=[your-anon-key]
```

## Common Issues & Solutions

**Extension not loading**: Check manifest.json syntax, ensure Chrome Developer Mode enabled

**No initialization message**: Content scripts may be blocked, check host_permissions in manifest

**Messages not captured**: DOM selectors may have changed, check detector.js fallbacks

**Supabase connection fails**: Verify URL and anon key in popup configuration

**Duplicate messages**: Check message hashing in background.js isDuplicate()

## Development Philosophy

- **Invisible Magic**: User should never know enhancement is happening
- **Fail Gracefully**: Queue offline, use fallback selectors, never break the chat
- **Performance First**: <200ms retrieval, minimal DOM operations
- **Security Always**: No hardcoded secrets, use Chrome storage for credentials

## Quick Iteration Cycle

1. Make changes to files
2. Reload extension in chrome://extensions (Ctrl+R)
3. Refresh ChatGPT/Claude tab
4. Test functionality
5. Check console logs
6. Verify in Supabase dashboard

Remember: The goal is to solve the "Groundhog Day" problem - making AI remember across sessions without any user effort.