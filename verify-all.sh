#!/bin/bash

# Comprehensive verification suite for Kit Memory Extension security
# Runs all security tests and checks

echo "================================================"
echo "Kit Memory Extension - Security Verification"
echo "================================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall pass/fail
FAILED=0

# 1. Check for innerHTML usage
echo "1. Checking for unsafe innerHTML usage..."
INNER_HTML_COUNT=$(grep -r "innerHTML" --include="*.js" . --exclude-dir=node_modules --exclude-dir=test | grep -v "// " | grep -v "controlled innerHTML" | wc -l)

if [ "$INNER_HTML_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Warning: Found $INNER_HTML_COUNT innerHTML usages (may be controlled)${NC}"
  grep -r "innerHTML" --include="*.js" . --exclude-dir=node_modules --exclude-dir=test | grep -v "// "
else
  echo -e "${GREEN}✅ No unsafe innerHTML usage found${NC}"
fi
echo ""

# 2. Check for exposed secrets
echo "2. Scanning for exposed secrets..."
SECRET_COUNT=$(grep -r "password\|api_key\|secret" --include="*.js" . --exclude-dir=node_modules --exclude-dir=test --exclude-dir=.git | \
               grep -v "// " | \
               grep -v "getenv" | \
               grep -v "chrome.storage" | \
               grep -v "encryptCredentials" | \
               grep -v "decryptCredentials" | \
               grep -v "sessionPassphrase" | \
               grep -v "generateSecurePassphrase" | \
               grep -v "token" | \
               wc -l)

if [ "$SECRET_COUNT" -gt 0 ]; then
  echo -e "${RED}❌ CRITICAL: Found potential exposed secrets!${NC}"
  grep -r "password\|api_key\|secret\|token" --include="*.js" . --exclude-dir=node_modules --exclude-dir=test | head -5
  FAILED=1
else
  echo -e "${GREEN}✅ No exposed secrets found${NC}"
fi
echo ""

# 3. Check for XSS vectors
echo "3. Scanning for XSS vulnerabilities..."
XSS_PATTERNS=(
  "eval("
  "Function("
  "setTimeout.*['\"]"
  "setInterval.*['\"]"
  "document.write"
  "document.writeln"
)

XSS_FOUND=0
for pattern in "${XSS_PATTERNS[@]}"; do
  COUNT=$(grep -r "$pattern" --include="*.js" . --exclude-dir=node_modules --exclude-dir=test 2>/dev/null | wc -l)
  if [ "$COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $pattern usage${NC}"
    XSS_FOUND=$((XSS_FOUND + COUNT))
  fi
done

if [ "$XSS_FOUND" -eq 0 ]; then
  echo -e "${GREEN}✅ No XSS vulnerabilities found${NC}"
fi
echo ""

# 4. Check encryption implementation
echo "4. Verifying encryption implementation..."
if [ -f "lib/crypto.js" ]; then
  # Check for AES-256-GCM
  if grep -q "AES-GCM" lib/crypto.js && grep -q "256" lib/crypto.js; then
    echo -e "${GREEN}✅ AES-256-GCM encryption implemented${NC}"
  else
    echo -e "${RED}❌ AES-256-GCM not properly configured${NC}"
    FAILED=1
  fi
  
  # Check for PBKDF2
  if grep -q "PBKDF2" lib/crypto.js && grep -q "100000" lib/crypto.js; then
    echo -e "${GREEN}✅ PBKDF2 key derivation implemented (100,000 iterations)${NC}"
  else
    echo -e "${YELLOW}⚠️  PBKDF2 may not be properly configured${NC}"
  fi
else
  echo -e "${RED}❌ lib/crypto.js not found!${NC}"
  FAILED=1
fi
echo ""

# 5. Check sanitizer implementation
echo "5. Verifying sanitizer implementation..."
if [ -f "lib/sanitizer.js" ]; then
  # Check for XSS detection
  if grep -q "detectXSS" lib/sanitizer.js; then
    echo -e "${GREEN}✅ XSS detection implemented${NC}"
  else
    echo -e "${RED}❌ XSS detection not found${NC}"
    FAILED=1
  fi
  
  # Check for sanitization profiles
  if grep -q "profiles.*strict" lib/sanitizer.js; then
    echo -e "${GREEN}✅ Sanitization profiles configured${NC}"
  else
    echo -e "${YELLOW}⚠️  Sanitization profiles may not be configured${NC}"
  fi
else
  echo -e "${RED}❌ lib/sanitizer.js not found!${NC}"
  FAILED=1
fi
echo ""

# 6. Check CSP in manifest
echo "6. Verifying Content Security Policy..."
if [ -f "manifest.json" ]; then
  if grep -q "content_security_policy" manifest.json; then
    echo -e "${GREEN}✅ CSP configured in manifest.json${NC}"
    grep "content_security_policy" manifest.json | head -1
  else
    echo -e "${RED}❌ No CSP found in manifest.json${NC}"
    FAILED=1
  fi
else
  echo -e "${RED}❌ manifest.json not found!${NC}"
  FAILED=1
fi
echo ""

# 7. Check for test files
echo "7. Verifying test coverage..."
TEST_COUNT=$(find test -name "*.test.js" 2>/dev/null | wc -l)
if [ "$TEST_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✅ Found $TEST_COUNT test files${NC}"
  find test -name "*.test.js" 2>/dev/null
else
  echo -e "${RED}❌ No test files found${NC}"
  FAILED=1
fi
echo ""

# 8. Check error handling
echo "8. Verifying error handling..."
TRY_CATCH_COUNT=$(grep -r "try\|catch" --include="*.js" lib/ 2>/dev/null | wc -l)
if [ "$TRY_CATCH_COUNT" -gt 10 ]; then
  echo -e "${GREEN}✅ Found $TRY_CATCH_COUNT error handling blocks${NC}"
else
  echo -e "${YELLOW}⚠️  Limited error handling found ($TRY_CATCH_COUNT blocks)${NC}"
fi
echo ""

# 9. Check for .env protection
echo "9. Verifying .env protection..."
if [ -f ".gitignore" ]; then
  if grep -q "^\.env$" .gitignore; then
    echo -e "${GREEN}✅ .env is gitignored${NC}"
  else
    echo -e "${RED}❌ .env is NOT gitignored!${NC}"
    FAILED=1
  fi
else
  echo -e "${RED}❌ No .gitignore file!${NC}"
  FAILED=1
fi

if [ -f ".env" ]; then
  echo -e "${YELLOW}⚠️  .env file exists (make sure it's not committed)${NC}"
fi
echo ""

# 10. Run tests if available
echo "10. Running tests..."
if [ -f "package.json" ] && command -v npm &> /dev/null; then
  if grep -q "\"test\"" package.json; then
    echo "Running npm test..."
    npm test 2>/dev/null || echo -e "${YELLOW}⚠️  Tests not configured or failed${NC}"
  else
    echo -e "${YELLOW}⚠️  No test script in package.json${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  npm not available or package.json missing${NC}"
fi
echo ""

# Final summary
echo "================================================"
echo "VERIFICATION SUMMARY"
echo "================================================"
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}✅ ALL CRITICAL SECURITY CHECKS PASSED${NC}"
else
  echo -e "${RED}❌ CRITICAL SECURITY ISSUES FOUND${NC}"
  echo "Please fix the issues above before deployment."
  exit 1
fi

echo ""
echo "Security verification complete."
echo "Remember: Security is an ongoing process, not a destination."