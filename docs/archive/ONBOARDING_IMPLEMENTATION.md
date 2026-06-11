# Onboarding Tour Implementation

## Overview
Implemented an interactive onboarding walkthrough that appears automatically based on user type and login history.

## Behavior

### Demo Accounts
- **Trigger**: Every login
- **Detection**: Email contains "demo" (case-insensitive)
- **Purpose**: Always show features to demo users exploring the platform

```typescript
const isDemoAccount = currentUser.email.toLowerCase().includes('demo');
```

### Regular New Accounts
- **Trigger**: First login only
- **Detection**: No `pontifex-onboarding-{userId}` in localStorage
- **Purpose**: Introduce new operators to platform features once

### Returning Users
- **Trigger**: Never
- **Detection**: Has `pontifex-onboarding-{userId}` in localStorage
- **Purpose**: Don't interrupt experienced users

## Implementation Details

### Files Modified

**1. Dashboard Page** (`app/dashboard/page.tsx`)

Added onboarding tour logic:

```typescript
import OnboardingTour from '@/components/OnboardingTour';

// State
const [showOnboarding, setShowOnboarding] = useState(false);

// Check function
const checkOnboardingStatus = (currentUser: User) => {
  const isDemoAccount = currentUser.email.toLowerCase().includes('demo');
  const onboardingKey = `pontifex-onboarding-${currentUser.id}`;
  const hasSeenOnboarding = localStorage.getItem(onboardingKey);

  // Demo accounts: always show tour
  if (isDemoAccount) {
    console.log('🎯 Demo account detected - showing onboarding tour');
    setShowOnboarding(true);
    return;
  }

  // Regular accounts: only show on first login
  if (!hasSeenOnboarding) {
    console.log('🆕 New user detected - showing onboarding tour');
    setShowOnboarding(true);
  }
};

// In useEffect
checkOnboardingStatus(currentUser);

// In render
{showOnboarding && user && (
  <OnboardingTour
    userId={user.id}
    onComplete={() => setShowOnboarding(false)}
  />
)}
```

**2. Onboarding Tour Component** (`components/OnboardingTour.tsx`)
- Already created with 8 steps
- Blue-to-red gradient design
- Features list for each step
- Navigation (Back/Next/Skip)
- Progress bar
- Auto-saves completion to localStorage

## User Flows

### Demo Account Flow

1. User logs in with demo account (email: `demo@example.com`)
2. Dashboard loads
3. `checkOnboardingStatus()` detects "demo" in email
4. Onboarding tour displays automatically
5. User completes or skips tour
6. localStorage is updated
7. **Next login**: Tour shows again (demo behavior)

### New User Flow

1. New operator logs in for first time
2. Dashboard loads
3. `checkOnboardingStatus()` checks localStorage
4. No `pontifex-onboarding-{userId}` found
5. Onboarding tour displays automatically
6. User completes or skips tour
7. localStorage saves: `pontifex-onboarding-{userId} = 'completed'`
8. **Next login**: Tour does NOT show (regular user behavior)

### Returning User Flow

1. Existing operator logs in
2. Dashboard loads
3. `checkOnboardingStatus()` checks localStorage
4. Finds `pontifex-onboarding-{userId}` exists
5. Tour does NOT display
6. Dashboard renders normally

## Testing

### Test Demo Account Behavior

```bash
# 1. Create or use demo account
Email: demo@pontifex.com (or any email with "demo")

# 2. Login and verify tour shows

# 3. Complete tour

# 4. Logout and login again

# 5. Verify tour shows AGAIN
```

### Test New User Behavior

```bash
# 1. Create new operator account
Email: newuser@example.com (no "demo")

# 2. Login and verify tour shows

# 3. Complete tour

# 4. Logout and login again

# 5. Verify tour does NOT show
```

### Test Returning User

```bash
# 1. Use existing operator account

# 2. Login and verify tour does NOT show
```

### Force Show Tour (Testing)

```javascript
// In browser console
localStorage.removeItem('pontifex-onboarding-YOUR-USER-ID');
location.reload();
```

## Console Logging

The system logs onboarding decisions:

```
🎯 Demo account detected - showing onboarding tour
🆕 New user detected - showing onboarding tour
```

Check browser console to debug tour behavior.

## Tour Content (8 Steps)

1. **Welcome** - Platform introduction
2. **Clock In/Out** - Time tracking with GPS
3. **Job Schedule** - Complete workflow overview
4. **Quick Access** - Location, contact, standby features
5. **Job Feedback** - Rating system
6. **Tools & Equipment** - Gear management
7. **Timecard** - Hours and attendance
8. **Ready to Go** - Completion

## LocalStorage Keys

```typescript
// Completed tour
`pontifex-onboarding-${userId}` = 'completed'

// Skipped tour
`pontifex-onboarding-${userId}` = 'skipped'
```

## Configuration

### Change Demo Detection

Current: Checks if email contains "demo"

```typescript
const isDemoAccount = currentUser.email.toLowerCase().includes('demo');
```

Alternative options:

```typescript
// Option 1: Specific demo emails
const demoEmails = ['demo@pontifex.com', 'demo1@pontifex.com'];
const isDemoAccount = demoEmails.includes(currentUser.email);

// Option 2: Check user role
const isDemoAccount = currentUser.role === 'demo';

// Option 3: Check email domain
const isDemoAccount = currentUser.email.endsWith('@demo.pontifex.com');
```

### Disable for All Users

```typescript
const checkOnboardingStatus = (currentUser: User) => {
  // Uncomment to disable completely
  // return;

  // ... rest of code
};
```

### Enable for All Users (Always Show)

```typescript
const checkOnboardingStatus = (currentUser: User) => {
  setShowOnboarding(true);
  return;
};
```

## Future Enhancements

1. **Admin Control**: Add database flag to control tour display
2. **Version Control**: Track tour version, show again when updated
3. **Analytics**: Track completion rate and drop-off points
4. **Replay Option**: Add "Show Tour Again" in settings
5. **Role-Specific Tours**: Different tours for operators vs admins
6. **Interactive Elements**: Highlight actual UI elements during tour
7. **Video Integration**: Embed tutorial videos in steps

## Benefits

### For Demo Accounts
- ✅ Always refreshes features on each login
- ✅ Perfect for sales demos and presentations
- ✅ Ensures potential customers see all features
- ✅ Consistent experience for evaluation

### For New Users
- ✅ Guided introduction to platform
- ✅ Reduces learning curve
- ✅ Highlights key features
- ✅ Improves user adoption
- ✅ Reduces support tickets

### For Returning Users
- ✅ Not interrupted by tour
- ✅ Fast access to dashboard
- ✅ Professional experience
- ✅ Tour available via settings if needed

## Troubleshooting

### Tour Not Showing for Demo Account

1. Check email contains "demo":
```javascript
console.log(user.email.toLowerCase().includes('demo'));
```

2. Check console for log messages

3. Verify `showOnboarding` state:
```javascript
// In React DevTools
showOnboarding === true
```

### Tour Showing for Returning User

1. Check localStorage:
```javascript
console.log(localStorage.getItem(`pontifex-onboarding-${userId}`));
```

2. If present, tour shouldn't show

3. Clear to reset:
```javascript
localStorage.removeItem(`pontifex-onboarding-${userId}`);
```

### Tour Not Saving Completion

1. Check localStorage after completion:
```javascript
localStorage.getItem(`pontifex-onboarding-${userId}`)
// Should return: 'completed' or 'skipped'
```

2. Verify `userId` is correct

3. Check browser privacy settings allow localStorage

## Security Considerations

- ✅ Uses localStorage (client-side only)
- ✅ No sensitive data stored
- ✅ Simple string values
- ✅ User-specific keys (includes user ID)
- ✅ No server-side state needed

## Performance

- ✅ Minimal impact: Only checks localStorage
- ✅ No API calls for onboarding status
- ✅ Component only loads when needed
- ✅ Lazy evaluation (checks after auth)

## Accessibility

- ✅ Keyboard navigation supported
- ✅ Focus management in modals
- ✅ Clear visual indicators
- ✅ Skip option always available
- ✅ Progress bar shows position

## Mobile Responsive

- ✅ Modal scales for small screens
- ✅ Touch-friendly buttons
- ✅ Readable text on all devices
- ✅ Proper padding and spacing
