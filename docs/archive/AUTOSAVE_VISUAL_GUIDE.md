# Auto-Save Visual Guide

## What the User Sees

### 1. Resume Modal (When Returning with Saved Draft)

```
┌─────────────────────────────────────────────────────────────┐
│                    [Blurred Background]                     │
│                                                             │
│    ┌───────────────────────────────────────────────────┐   │
│    │                                                   │   │
│    │                    ┌─────────┐                    │   │
│    │                    │  🗂️     │                    │   │
│    │                    └─────────┘                    │   │
│    │                                                   │   │
│    │           Resume Your Work?                       │   │
│    │                                                   │   │
│    │      We found a saved draft from                 │   │
│    │           25 minutes ago                          │   │
│    │                                                   │   │
│    │    ┌─────────────────────────────────────────┐   │   │
│    │    │  Draft Progress                         │   │
│    │    │                   Step 4 of 8           │   │
│    │    │  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░ 50%            │   │
│    │    └─────────────────────────────────────────┘   │   │
│    │                                                   │   │
│    │    ┌─────────────────────────────────────────┐   │   │
│    │    │        Resume Draft                     │   │   │
│    │    │   [Gradient Orange/Red Button]          │   │
│    │    └─────────────────────────────────────────┘   │   │
│    │                                                   │   │
│    │    ┌─────────────────────────────────────────┐   │   │
│    │    │      Start New Job Order                │   │
│    │    │     [Gray Button]                       │   │
│    │    └─────────────────────────────────────────┘   │   │
│    │                                                   │   │
│    │    Drafts are automatically saved and           │   │
│    │         expire after 24 hours                    │   │
│    │                                                   │   │
│    └───────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**User Actions:**
- Click **"Resume Draft"** → Form loads at Step 4 with all saved data
- Click **"Start New Job Order"** → Form resets to empty Step 1

---

### 2. Form with Auto-Save (Active Editing)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Admin Dashboard    Dispatch & Scheduling                 │
│                 Create and manage job orders                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Create Job Order]  View All Jobs                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Form Progress              Step 3 of 8               │  │
│  │  ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░                              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  🗺️  Step 3: Location Information                     │  │
│  │                                                        │  │
│  │  Full Address *                                       │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │ 123 Main Street, Austin, TX 78701          [🔍] │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  │    [Google Places Autocomplete dropdown]             │  │
│  │                                                        │  │
│  │  Location/Site Name *                                 │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │ Downtown Office Building                         │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  │                                                        │  │
│  │  Estimated Drive Time                                 │  │
│  │  [1] hours  [30] minutes                             │  │
│  │                                                        │  │
│  │  [← Previous]                          [Next →]      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│                                           ┌───────────────┐ │
│                                           │ ✓ Saved      │ │
│                                           │   2m ago     │ │
│                                           └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Auto-Save Behavior:**
- User types in any field → Auto-saves within 1 second
- User clicks "Next" → Auto-saves immediately + moves to Step 4
- Bottom-right shows "✓ Saved 2m ago" (if AutoSaveIndicator enabled)

---

### 3. Step-by-Step Progress with Auto-Save

#### Step 1: Basic Information
```
┌─────────────────────────────────────────────────────────────┐
│  Form Progress              Step 1 of 8                     │
│  ▓▓░░░░░░░░░░░░░░░░░░░░                                    │
└─────────────────────────────────────────────────────────────┘

User fills:
✓ Job Types: [CORE DRILLING] [GPR SCANNING]
✓ Customer: John Smith
✓ Company: ABC Construction

Auto-Save Triggered → Saved to localStorage
```

#### Step 2: Work Details
```
┌─────────────────────────────────────────────────────────────┐
│  Form Progress              Step 2 of 8                     │
│  ▓▓▓▓░░░░░░░░░░░░░░░░░░                                    │
└─────────────────────────────────────────────────────────────┘

User fills job-specific details:
✓ Core Drilling: 5 holes, 12" depth, 4" diameter
✓ GPR Scanning: Pre-scan required

Auto-Save Triggered → Updated localStorage
```

#### User Leaves & Returns
```
Browser closed/navigated away
↓
Returns to dispatch scheduling page
↓
Resume Modal Appears:
"We found a saved draft from 15 minutes ago"
"Step 2 of 8"
```

---

### 4. Successful Job Creation (Draft Cleared)

```
┌─────────────────────────────────────────────────────────────┐
│                    [Blurred Background]                     │
│                                                             │
│    ┌───────────────────────────────────────────────────┐   │
│    │                                                   │   │
│    │                    ┌─────────┐                    │   │
│    │                    │  ✓      │                    │   │
│    │                    │ [Bounce]│                    │   │
│    │                    └─────────┘                    │   │
│    │                                                   │   │
│    │        Job Created Successfully!                  │   │
│    │                                                   │   │
│    │         Job Order Number                          │   │
│    │      ┌─────────────────────┐                      │   │
│    │      │  #JOB-2026-3847     │                      │   │
│    │      └─────────────────────┘                      │   │
│    │                                                   │   │
│    │      ✓ Job ticket created                         │   │
│    │      ✓ Operators assigned                         │   │
│    │      ✓ Documents assigned                         │   │
│    │                                                   │   │
│    │   Redirecting to dashboard in 3 seconds...       │   │
│    │                                                   │   │
│    │  [View Job]         [Create Another]             │   │
│    │                                                   │   │
│    └───────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

localStorage.getItem('pontifex_form_dispatch-scheduling')
→ null (cleared on success)
```

---

### 5. Expired Draft (No Modal)

```
User's Timeline:
─────────────────────────────────────────────────────────────
Day 1, 10:00 AM  →  Fills Steps 1-3
                     Auto-saved to localStorage
                     timestamp: 1704456000000

Day 1, 10:05 AM  →  Leaves page

⏰ 25 hours pass...

Day 2, 11:05 AM  →  Returns to page
                     Checks localStorage
                     Age: 25 hours > 24 hours (EXPIRED)
                     Auto-clears expired data
                     Shows fresh empty form
                     NO resume modal
```

---

### 6. Browser DevTools View

#### localStorage Contents
```javascript
Key: "pontifex_form_dispatch-scheduling"

Value: {
  "data": {
    "title": "Downtown Core Drilling Project",
    "customer": "John Smith",
    "companyName": "ABC Construction Co.",
    "customerEmail": "john@abc.com",
    "salespersonEmail": "sales@pontifex.com",
    "jobTypes": ["CORE DRILLING", "GPR SCANNING"],
    "location": "Austin, TX",
    "address": "123 Main Street, Austin, TX 78701",
    "estimatedDriveHours": 1,
    "estimatedDriveMinutes": 30,
    "status": "scheduled",
    "priority": "high",
    "difficulty_rating": 7,
    "truck_parking": "close",
    "work_environment": "indoor",
    "site_cleanliness": 8,
    "startDate": "2026-02-15",
    "endDate": "2026-02-15",
    "arrivalTime": "08:00",
    "shopArrivalTime": "07:00",
    "estimatedHours": "8.00",
    "technicians": [],
    "salesman": "",
    "description": "",
    "additionalInfo": "",
    "jobTypeDetails": {
      "CORE DRILLING": {
        "quantity": "5",
        "depth": "12",
        "diameter": "4"
      },
      "GPR SCANNING": {}
    },
    "equipment": ["Core Drill - Electric", "Vacuum"],
    "requiredDocuments": ["silica-dust-control"],
    "jobSiteNumber": "JS-001",
    "po": "PO-12345",
    "customerJobNumber": "",
    "contactOnSite": "",
    "contactPhone": "",
    "jobSiteGC": "",
    "jobQuote": null
  },
  "currentStep": 3,
  "timestamp": 1704456000000,
  "version": "1.0"
}
```

---

### 7. Auto-Save Indicator (Optional Enhancement)

#### When Saving
```
                                           ┌───────────────┐
                                           │ ⟳ Saving     │
                                           │   draft...   │
                                           └───────────────┘
```

#### When Saved
```
                                           ┌───────────────┐
                                           │ ✓ Saved      │
                                           │   just now   │
                                           └───────────────┘

After 5 minutes:
                                           ┌───────────────┐
                                           │ ✓ Saved      │
                                           │   5m ago     │
                                           └───────────────┘

After 2 hours:
                                           ┌───────────────┐
                                           │ ✓ Saved      │
                                           │   2h ago     │
                                           └───────────────┘
```

---

## Color Scheme

### Resume Modal
- **Background**: White with backdrop blur
- **Icon**: Orange-red gradient circle (from-orange-500 to-red-600)
- **Progress Bar Fill**: Orange-red gradient
- **Progress Bar Background**: Light gray (bg-white)
- **Resume Button**: Orange-red gradient with hover effect
- **Start New Button**: Gray (bg-gray-100)
- **Text**: Dark gray (text-gray-900 for headings, text-gray-600 for body)

### Auto-Save Indicator
- **Background**: White/90 with backdrop blur
- **Border**: Light gray/50
- **Saving Spinner**: Orange (border-orange-600)
- **Saved Checkmark**: Green gradient (from-green-500 to-green-600)
- **Text**: Dark gray (text-gray-700)

---

## Animations

### Resume Modal
- **Entrance**: fadeIn (0.2s) + slideUp (0.3s)
- **Backdrop**: fadeIn (0.2s)
- **Icon**: Static (no animation)

### Auto-Save Indicator
- **Entrance**: fadeIn (0.2s)
- **Saving Spinner**: Continuous spin
- **Checkmark**: Fade in when switching from saving to saved

### CSS Keyframes (Already in page)
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## Responsive Behavior

### Desktop (>768px)
- Modal: max-w-md (448px) centered
- Auto-save indicator: bottom-right corner
- Full form width

### Mobile (<768px)
- Modal: Full width with 16px padding
- Auto-save indicator: bottom-right with smaller padding
- Form stacks vertically
- Buttons stack vertically

---

## Accessibility

### Keyboard Navigation
- **Tab**: Move through buttons
- **Enter/Space**: Activate button
- **Escape**: Close modal (optional enhancement)

### Screen Readers
- Modal has proper `role="dialog"`
- Icon has `aria-label`
- Progress bar has `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Buttons have descriptive text

### Focus Management
- Focus trapped in modal when open
- Clear focus indicators on buttons
- Logical tab order

---

## User Journey Timeline

```
TIME    ACTION                              AUTO-SAVE STATE
═════   ═══════════════════════════════     ═══════════════════
10:00   Opens page                          No saved data
        Sees empty form

10:02   Fills Step 1                        ✓ Saved
        Selects job types                   timestamp: 10:02
        Enters customer info

10:05   Clicks Next to Step 2               ✓ Saved
                                            currentStep: 2
                                            timestamp: 10:05

10:08   Fills job details                   ✓ Saved
                                            timestamp: 10:08

10:10   Phone rings, closes browser         Data still saved
                                            in localStorage

───────────────── User away ─────────────────

10:25   Returns to page                     Resume modal shows
        "15 minutes ago"                    "Step 2 of 8"

10:26   Clicks "Resume Draft"               Data loaded
        Form shows Step 2                   currentStep: 2
        All data preserved                  All formData intact

10:30   Continues to Step 3                 ✓ Saved
                                            currentStep: 3

10:35   Completes all steps                 ✓ Saved
        Submits job order                   currentStep: 8

10:36   Success! Job created                localStorage CLEARED
        Shows #JOB-2026-3847               No more saved data

10:39   Redirected to dashboard             Clean state
```

---

## Common Questions

### Q: When does auto-save trigger?
**A:** On every form change and step navigation (debounced to prevent excessive saves)

### Q: What if I refresh the page?
**A:** Resume modal appears if you have saved data

### Q: Can I have multiple drafts?
**A:** Currently no, only one draft per user (latest overwrites previous)

### Q: What if my internet is down?
**A:** Auto-save works offline (localStorage is local-only)

### Q: How do I delete a draft?
**A:** Click "Start New Job Order" in resume modal, or submit the job successfully

### Q: What happens after 24 hours?
**A:** Draft automatically expires and is cleared

### Q: Can I resume on a different computer?
**A:** No, drafts are saved locally per browser/device

### Q: Does it work in incognito mode?
**A:** Yes, but draft is lost when you close all incognito windows

---

**This visual guide shows exactly what users will experience with the new auto-save feature!** 🎨
