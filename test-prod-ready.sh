#!/bin/bash

echo "Testing SupaShield Production Readiness"
echo "======================================="

# Test 1: Build works
echo "Testing build..."
npm run build
if [ $? -ne 0 ]; then
    echo "FAIL: Build failed"
    exit 1
fi
echo "PASS: Build successful"

# Test 2: CLI executable exists
echo "Testing CLI executable..."
if [ ! -f "dist/cli.js" ]; then
    echo "FAIL: CLI executable not found"
    exit 1
fi
echo "PASS: CLI executable exists"

# Test 3: CLI runs without crashing
echo "Testing CLI startup..."
node dist/cli.js --help > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "FAIL: CLI crashes on startup"
    exit 1
fi
echo "PASS: CLI starts successfully"

# Test 4: Global install works
echo "Testing global install..."
npm install -g . > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "FAIL: Global install failed"
    exit 1
fi
echo "PASS: Global install successful"

# Test 5: Global command works
echo "Testing global command..."
supashield --help > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "FAIL: Global command not working"
    exit 1
fi
echo "PASS: Global command works"

# Test 6: Database connection handling (without actual DB)
echo "Testing database error handling..."
unset DATABASE_URL
supashield test 2>&1 | grep -q "Database URL is required"
if [ $? -ne 0 ]; then
    echo "FAIL: Database error handling broken"
    exit 1
fi
echo "PASS: Database error handling works"

echo ""
echo "ALL TESTS PASSED - PRODUCTION READY!"
echo "Ready to ship: npm publish"