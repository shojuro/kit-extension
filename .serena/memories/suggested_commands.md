# Development Commands for Kit Memory Extension

## Chrome Extension Development
```bash
# Load extension in Chrome
chrome://extensions/              # Navigate to extensions page
# Enable Developer Mode (toggle in top right)
# Click "Load unpacked" and select project root directory
Ctrl+R                           # Reload extension after changes (on extensions page)
```

## Testing & Debugging
```bash
# In Chrome DevTools Console on ChatGPT/Claude pages:
"Kit Memory: Initialized on [site]"     # Confirms content script loaded
"Kit Memory: Stored [role] message"     # Confirms message capture
"Kit Memory: Retrieved X memories"      # Confirms memory retrieval

# View extension logs
chrome://extensions/ -> Details -> Inspect service worker
```

## Supabase Database
```bash
npx supabase init                 # Initialize Supabase project
npx supabase db push              # Push schema changes
npx supabase db reset             # Reset database with schema
```

## Build & Package (when package.json is added)
```bash
npm run build                     # Build for development
npm run build:prod               # Build for production  
npm run package                  # Create .zip for Chrome Web Store
```

## System Commands (Linux/WSL)
```bash
git status                        # Check git status
git add -A                        # Stage all changes
git commit -m "message"           # Commit changes
git log --oneline -5              # View recent commits

ls -la                           # List files with details
find . -name "*.js"              # Find JavaScript files
grep -r "pattern" .              # Search for pattern in files
```

## Quick Iteration Cycle
1. Make changes to files
2. Reload extension in chrome://extensions (Ctrl+R)
3. Refresh ChatGPT/Claude tab
4. Test functionality
5. Check console logs
6. Verify in Supabase dashboard