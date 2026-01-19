# Automated Testing Guide

This project now has a comprehensive automated testing setup to catch bugs without manual testing.

## Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## What Gets Tested Automatically

### 1. On Every Git Push
When you push code to GitHub, the CI/CD pipeline automatically:
- Runs all tests
- Runs the linter
- Builds the application
- Checks for TypeScript errors
- Generates coverage reports

### 2. Test Types

#### API Route Tests
Located in: `app/api/**/*.test.ts`

Example: `app/api/timecard/current/route.test.ts`
- Tests authentication
- Tests database queries
- Tests error handling
- Tests response formats

#### Utility Function Tests
Located in: `lib/**/*.test.ts`

Example: `lib/geolocation.test.ts`
- Tests distance calculations
- Tests location validation
- Tests formatting functions

## Writing New Tests

### API Route Test Template

```typescript
import { GET, POST } from './route';
import { NextRequest } from 'next/server';

jest.mock('@/lib/supabase-admin');

describe('API: /api/your-route', () => {
  it('should handle successful request', async () => {
    const request = new NextRequest('http://localhost/api/your-route');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('success', true);
  });

  it('should handle errors', async () => {
    // Test error scenarios
  });
});
```

### Utility Function Test Template

```typescript
import { yourFunction } from './your-file';

describe('Utility: yourFunction', () => {
  it('should return expected result', () => {
    const result = yourFunction(input);
    expect(result).toBe(expectedOutput);
  });

  it('should handle edge cases', () => {
    // Test edge cases
  });
});
```

## Test Coverage

After running `npm run test:coverage`, check the `coverage/` directory for detailed reports.

Open `coverage/lcov-report/index.html` in your browser to see:
- Which files are tested
- Which lines are covered
- Which branches are tested

## CI/CD Pipeline

The pipeline runs on:
- Every push to `backend-development` or `main`
- Every pull request

### GitHub Actions Workflow
Location: `.github/workflows/ci.yml`

The workflow:
1. Installs dependencies
2. Runs ESLint
3. Runs all tests with coverage
4. Builds the application
5. Checks TypeScript compilation

### Setup Required

Add these secrets to your GitHub repository:
1. Go to Settings > Secrets and variables > Actions
2. Add these secrets:
   - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key
   - `CODECOV_TOKEN` (optional) - For coverage reports

## Best Practices

1. **Write tests for new features**
   - Add tests when you create new API routes
   - Add tests for utility functions

2. **Run tests before committing**
   ```bash
   npm test
   ```

3. **Fix failing tests immediately**
   - Don't commit code with failing tests
   - Tests catch bugs early

4. **Keep tests simple and focused**
   - One test should test one thing
   - Use descriptive test names

5. **Mock external dependencies**
   - Mock Supabase calls
   - Mock API calls
   - Mock file system operations

## Common Testing Patterns

### Mocking Supabase

```typescript
jest.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnValue({ data: [], error: null }),
    }),
  },
}));
```

### Testing Error Cases

```typescript
it('should handle database errors', async () => {
  mockSupabase.from().select.mockResolvedValue({
    data: null,
    error: { message: 'Database error' }
  });

  const response = await GET(request);
  expect(response.status).toBe(500);
});
```

### Testing Authentication

```typescript
it('should reject unauthorized requests', async () => {
  const request = new NextRequest('http://localhost/api/route');
  // No authorization header

  const response = await GET(request);
  expect(response.status).toBe(401);
});
```

## Benefits of Automated Testing

1. **Catch bugs early** - Before they reach production
2. **Confidence in changes** - Know your changes don't break existing features
3. **Faster development** - No manual testing needed
4. **Documentation** - Tests show how code should work
5. **Refactoring safety** - Change code knowing tests will catch issues

## Troubleshooting

### Tests fail with "Cannot find module"
Run: `npm install`

### Tests timeout
Increase timeout in jest.config.js:
```javascript
testTimeout: 10000
```

### Coverage is low
Add more tests! Aim for:
- 80%+ coverage for critical paths
- 100% for utility functions

## Next Steps

1. Run `npm test` to verify tests work
2. Run `npm run test:coverage` to see coverage
3. Write tests for new features as you build them
4. Push to GitHub to see CI/CD in action
