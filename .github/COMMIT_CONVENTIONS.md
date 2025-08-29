# Commit Conventions & Version Control Best Practices

## Commit Message Format

We follow the Conventional Commits specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, missing semicolons, etc.)
- **refactor**: Code refactoring without changing functionality
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Maintenance tasks, dependency updates
- **build**: Build system or external dependency changes
- **ci**: CI/CD configuration changes

### Examples
```bash
feat(content): add message capture for Claude.ai
fix(background): resolve duplicate message storage issue
docs: update README with setup instructions
refactor(memory): optimize tier migration logic
```

## Branching Strategy

### Main Branches
- `main` - Production-ready code
- `develop` - Integration branch for features

### Feature Branches
- Format: `feature/<description>`
- Example: `feature/prompt-enhancement`

### Fix Branches
- Format: `fix/<description>`
- Example: `fix/memory-leak`

## Version Control Workflow

### 1. Before Starting Work
```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature
```

### 2. During Development (Commit Often!)
```bash
# After each logical change
git add <files>
git commit -m "type: descriptive message"

# Every 30-60 minutes or after significant progress
git push origin feature/your-feature
```

### 3. Before Finalizing
```bash
# Update from main
git checkout main
git pull origin main
git checkout feature/your-feature
git rebase main

# Push final changes
git push origin feature/your-feature
```

### 4. Create Pull Request
- Go to: https://github.com/shojuro/kit-extension
- Click "Compare & pull request"
- Add description of changes
- Request review if needed

## Automated Commit Checklist

Before EVERY commit:
1. ✅ Run security check: `grep -r -i "password\|api_key\|secret\|token" . --exclude-dir=.git`
2. ✅ Verify .env not staged: `git status`
3. ✅ Test extension loads: chrome://extensions/
4. ✅ Check console for errors
5. ✅ Write descriptive commit message

## Quick Commands

```bash
# Status check
git status

# View changes
git diff

# Stage all changes (except ignored)
git add -A

# Commit with message
git commit -m "type: description"

# Push to remote
git push

# View commit history
git log --oneline -10

# Create and switch to new branch
git checkout -b feature/new-feature

# Switch branches
git checkout branch-name

# Update from remote
git pull origin main
```

## Commit Frequency Guidelines

### Commit After:
- ✅ Implementing a new function/feature
- ✅ Fixing a bug
- ✅ Updating documentation
- ✅ Refactoring code
- ✅ Adding/modifying tests
- ✅ Changing configuration

### Don't Commit:
- ❌ Broken code
- ❌ Code with syntax errors
- ❌ Sensitive data (.env files)
- ❌ Large binary files
- ❌ Generated files (node_modules, build artifacts)

## Emergency Rollback

If something goes wrong:
```bash
# Undo last commit (keep changes)
git reset --soft HEAD~1

# Undo last commit (discard changes)
git reset --hard HEAD~1

# Revert a pushed commit
git revert <commit-hash>
```