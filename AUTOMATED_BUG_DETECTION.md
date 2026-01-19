# Automated Bug Detection Setup

This guide shows you how to **automatically catch bugs before they waste tokens**.

## 🚀 Quick Start (Run Once)

```bash
bash .husky-setup.sh
```

This sets up automatic TypeScript checks on every commit.

## 🔍 Manual Checks (When Needed)

### 1. TypeScript Type Check (Fastest - 5 seconds)
Catches 80% of bugs instantly:
```bash
npx tsc --noEmit
```

### 2. Build Check (Comprehensive - 1-2 minutes)
Catches compilation issues:
```bash
npm run build
```

### 3. Run Tests (If you write them)
```bash
npm test
```

## 🎯 What Gets Caught Automatically

✅ **Type errors** - Wrong property names, missing fields  
✅ **Import errors** - Missing modules  
✅ **Syntax errors** - Invalid TypeScript/JavaScript  
✅ **Component errors** - React component issues  
✅ **Build failures** - Compilation problems  

## ❌ What Today's Bug Would Have Been

The `status: 'assigned'` error would have been caught by:
- TypeScript (if equipment had strict types)
- Build process (compilation error)
- Pre-commit hook (automatic check)

## 🔧 How It Works

1. You write code
2. You run `git commit`
3. Husky automatically runs `npx tsc --noEmit`
4. If errors found → commit blocked ❌
5. If no errors → commit succeeds ✅

## 🚨 Emergency Bypass

If you REALLY need to commit with errors:
```bash
git commit --no-verify -m "WIP: will fix later"
```

## 📊 Token Savings

**Before**: 
- Bug happens → I iterate 3-5 times fixing → 10,000+ tokens wasted

**After**:
- TypeScript catches bug → You fix before asking me → 0 tokens wasted

**Estimated savings**: 50-80% of debugging tokens!

## 🎓 Best Practices

1. **Run `npx tsc --noEmit` before major changes**
2. **Run `npm run build` before releasing features**
3. **Let pre-commit hooks catch bugs automatically**
4. **Fix TypeScript errors immediately (don't accumulate them)**

## 🔄 Integration with Claude

Going forward, when I make changes, I'll proactively run:
```bash
npx tsc --noEmit && npm run build
```

This ensures changes work before you test them.
