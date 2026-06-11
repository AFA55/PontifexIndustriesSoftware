# Design Theme: Professionalism Modernism

## Overview
This design theme represents the modern, professional aesthetic used throughout the Pontifex Platform application.

## Core Principles

### Color Palette
- **Primary Green:** `from-green-600 to-emerald-500`
- **Hover Green:** `from-green-700 to-emerald-600`
- **Background Gradient:** `from-slate-50 via-white to-green-50`
- **Accent Blues:** Blue-50 backgrounds with blue-200 borders for info sections
- **Neutrals:** Gray-50 for cards, gray-800 for text

### Design Elements

#### Headers
- Backdrop blur with transparency: `backdrop-blur-xl bg-white/90`
- Subtle borders: `border-b border-gray-200`
- Shadow for depth: `shadow-lg`
- Sticky positioning: `sticky top-0 z-50`

#### Cards & Containers
- Rounded corners: `rounded-2xl` or `rounded-3xl` for major cards
- Soft shadows: `shadow-xl` or `shadow-2xl`
- Subtle borders: `border border-gray-100` or `border-2 border-green-200`
- Padding: `p-8` for major cards, `p-6` for sections

#### Buttons

**Primary Action (Green Gradient):**
```css
bg-gradient-to-r from-green-600 to-emerald-500
hover:from-green-700 hover:to-emerald-600
text-white shadow-lg hover:shadow-xl
transform hover:scale-[1.02]
rounded-xl font-bold
```

**Secondary Action (Gray):**
```css
bg-gray-100 hover:bg-gray-200
text-gray-700 rounded-xl
font-semibold
```

#### Status Badges
- Success: `bg-green-100 text-green-700`
- Info: `bg-blue-100 text-blue-700`
- Warning: `bg-yellow-100 text-yellow-700`
- Error: `bg-red-100 text-red-700`
- Rounded: `rounded-full`
- Compact: `px-3 py-1 text-xs font-semibold`

#### Icons & Graphics
- Circular icon containers: `w-20 h-20 bg-green-100 rounded-full`
- Icon size: `w-10 h-10 text-green-600`
- SVG stroke width: `strokeWidth={2}` for most, `{2.5}` for emphasis

#### Progress Indicators
- Numbered steps in green circular badges
- Active: Filled green background
- Inactive: White background with green border
- Labels below each step

### Typography
- **Headings:** Bold, gray-900
  - H1: `text-xl` or `text-2xl font-bold`
  - H2: `text-3xl font-bold`
  - H3: `text-lg font-bold`
- **Body Text:** Gray-600 or gray-700
  - Regular: `text-sm` or `text-base`
  - Small: `text-xs text-gray-500`
- **Emphasis:** `font-semibold` or `font-bold` in darker gray

### Spacing
- Container padding: `px-4 py-6`
- Section spacing: `mb-6` or `mb-8`
- Item spacing: `space-y-2` or `space-y-3`
- Generous whitespace for breathing room

### Interactions
- Smooth transitions: `transition-all duration-200` or `transition-colors`
- Hover effects: Scale slightly (`hover:scale-[1.02]`), darken colors
- Loading states: Spinning border animation
- Disabled states: Gray with cursor-not-allowed

## Example Components Using This Theme

1. **Service Completion Agreement** - Full 4-section progressive form
2. **Job Hazard Analysis** - Multi-step wizard interface
3. **Dispatch Scheduling** - Clean form layout with validation
4. **Customer Signature Page** - Data preview with action buttons

## Usage Guidelines

### When to Use This Theme
- Customer-facing documents and forms
- Legal agreements and contracts
- Professional workflows requiring sign-off
- Admin interfaces requiring trust and authority

### Consistency Checklist
- [ ] Green gradient for primary actions
- [ ] Backdrop blur headers with sticky positioning
- [ ] Rounded-3xl for major cards
- [ ] Shadow-xl or shadow-2xl for elevation
- [ ] Gray-50 for secondary backgrounds
- [ ] Smooth hover transitions
- [ ] Professional icon usage
- [ ] Generous spacing and whitespace

## Future Enhancements
- Consider adding dark mode variant
- Explore animation libraries for smoother transitions
- Add accessibility features (high contrast mode)
- Create reusable component library based on these principles
