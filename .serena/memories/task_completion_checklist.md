# Task Completion Checklist

When completing any task in the Kit Memory Extension project, ensure:

## Before Marking Complete

### 1. Code Verification
- [ ] All JavaScript files have no syntax errors
- [ ] Chrome extension loads without errors in chrome://extensions/
- [ ] Console shows expected "Kit Memory:" log messages
- [ ] No hardcoded API keys or secrets in code

### 2. Testing
- [ ] Manual testing in Chrome Developer Mode
- [ ] Test on both ChatGPT and Claude sites
- [ ] Verify message capture works
- [ ] Check offline queue functionality
- [ ] Confirm no duplicate messages stored

### 3. Security Check
- [ ] Run: `grep -r -i "password\|api_key\|secret\|token" . --exclude-dir=.git --exclude="*.md" --exclude=".gitignore"`
- [ ] Verify .env is not tracked in git
- [ ] Ensure all secrets use Chrome storage or environment variables
- [ ] Check .gitignore covers all sensitive files

### 4. Documentation
- [ ] Update CLAUDE.md with actual progress (not planned features)
- [ ] Mark completed items in project status
- [ ] Document any new selectors or DOM changes discovered

### 5. Git Checkpoint
- [ ] Stage only non-sensitive files: `git add -A`
- [ ] Review staged files: `git diff --cached --name-only`
- [ ] Commit with descriptive message about what ACTUALLY works
- [ ] Never commit if tests are failing or code is broken

## Chrome Extension Specific

### Load & Test
1. Open chrome://extensions/
2. Enable Developer Mode
3. Load unpacked from project root
4. Check for errors in extension card
5. Click "Inspect service worker" for background logs

### Verify Functionality
1. Navigate to chat.openai.com or claude.ai
2. Open DevTools Console (F12)
3. Look for "Kit Memory: Initialized on [site]"
4. Send a test message
5. Verify "Kit Memory: Stored user message" appears
6. Check Supabase dashboard for stored data

## Common Commands
```bash
# Check extension errors
chrome://extensions/ -> Details -> Errors

# View service worker logs
chrome://extensions/ -> Inspect service worker

# Reload extension after changes
Ctrl+R on extensions page

# Check for secrets
grep -r -i "password\|api_key\|secret\|token" . --exclude-dir=.git

# Verify git status
git status --porcelain
```