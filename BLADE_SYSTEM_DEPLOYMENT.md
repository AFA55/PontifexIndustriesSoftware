# Blade & Bit Inventory System - Deployment Guide

## Overview
This system provides comprehensive blade and bit inventory management with:
- Step-by-step wizard for adding blades/bits to inventory
- QR code generation and scanning for equipment tracking
- Role-based access (Admin vs Operator)
- Automatic usage tracking when operators perform saw work
- Detailed blade profiles with usage history
- Cost analysis (cost per linear foot)

## Database Migration

### Step 1: Run the Migration SQL

1. Go to your Supabase Dashboard: https://app.supabase.com/project/klatddoyncxidgqtcjnu
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the contents of:
   ```
   /supabase/migrations/20260116_create_blade_inventory_system.sql
   ```
5. Click **Run** to execute the migration

This will create:
- Enhanced `equipment` table with blade-specific columns
- `blade_assignments` table for tracking who has what equipment
- `blade_usage_history` table for tracking usage (linear feet cut, etc.)
- `equipment_checkout_sessions` table for logging QR scans
- Triggers for automatic usage calculation
- Functions for equipment checkout and ID generation
- Row Level Security policies

## Features Overview

### 1. Add Blade/Bit Wizard
**Location**: Dashboard → All Equipment → "Add Blade/Bit" button

**Flow**:
1. Select equipment type (Blade or Bit)
2. Choose manufacturer (Husqvarna, Hilti, DDM, or Other)
3. Enter model number
4. Specify size (e.g., "20 inch")
5. Select equipment type (slab saw, hand saw, flush cut, wall saw, chop saw)
6. Enter purchase date and price
7. Set quantity (if adding multiple identical items)
8. Enter serial numbers
9. System automatically generates:
   - Unique identification codes
   - QR codes for each item
   - Database records

### 2. QR Code Scanning
**Location**: Dashboard → Tools → Scan

**Capabilities**:
- Scan QR codes using device camera
- Manual QR code entry
- View equipment details
- Role-based actions:
  - **Admin**: Assign equipment, add inventory
  - **Operator**: View equipment info, request maintenance
- Automatic logging of all scans

### 3. Equipment Assignment
**Location**: Triggered from QR scan (Admin only)

**Process**:
1. Admin scans equipment QR code
2. Selects "Assign to Operator"
3. Chooses operator from dropdown
4. Confirms assignment date
5. Adds optional notes
6. System creates assignment record and marks equipment as checked out

### 4. Automatic Usage Tracking
**Location**: Integrated into Work Performed workflow

**How it works**:
- When operators submit work performed with sawing activities
- System automatically detects:
  - Type of saw used (slab saw, hand saw, etc.)
  - Linear feet cut
  - Cut depth and other details
- Finds blades currently assigned to operator for that saw type
- Creates usage records linking:
  - Equipment (blade)
  - Job order
  - Operator
  - Linear feet cut
- Updates blade's total lifetime usage
- All happens automatically in the background

### 5. Blade Profile & History
**Location**: Accessible from QR scan → "View Full Profile & History"

**Shows**:
- Equipment details (manufacturer, model, size, serial)
- Current status and assignment
- QR code (downloadable)
- Total usage statistics
- Cost per foot analysis
- Complete usage history (date, operator, job, linear feet)
- Assignment history (who had it when)

## API Endpoints Created

- `POST /api/equipment/add-blades` - Add equipment to inventory
- `GET /api/equipment/scan?uniqueId={id}` - Get equipment by QR scan
- `POST /api/equipment/log-scan` - Log QR code scans
- `POST /api/equipment/checkout` - Assign equipment to operator
- `POST /api/equipment/track-usage` - Track blade usage (called automatically)
- `GET /api/equipment/{id}` - Get equipment details
- `GET /api/equipment/{id}/usage-history` - Get usage history
- `GET /api/equipment/{id}/assignments` - Get assignment history

## Components Created

- `AddBladeWizard.tsx` - Step-by-step wizard for adding blades
- `app/dashboard/tools/scan/page.tsx` - QR scanner (enhanced)
- `app/dashboard/tools/scan/assign/page.tsx` - Assignment flow
- `app/dashboard/tools/scan/profile/page.tsx` - Blade profile/history view

## Testing Checklist

### 1. Admin Workflow
- [ ] Log in as admin
- [ ] Go to All Equipment page
- [ ] Click "Add Blade/Bit" button
- [ ] Complete wizard for a blade (e.g., Husqvarna 20" hand saw blade)
- [ ] Verify blade appears in equipment list
- [ ] Download generated QR code
- [ ] Scan QR code
- [ ] Assign blade to an operator

### 2. Operator Workflow
- [ ] Log in as operator
- [ ] Check that operator has blade assigned (visible in their dashboard)
- [ ] Go to a job
- [ ] Complete work performed with hand saw work
- [ ] Enter linear feet cut
- [ ] Submit work
- [ ] Verify usage was tracked (check blade profile)

### 3. Blade Profile
- [ ] Scan blade QR code
- [ ] Click "View Full Profile & History"
- [ ] Verify all details are correct
- [ ] Check usage history shows the work performed
- [ ] Check cost per foot calculation
- [ ] Download QR code

## Key Features

### Smart Form
- Changes questions based on equipment type selected
- Validates input at each step
- Handles bulk additions (multiple identical items)
- Auto-generates unique IDs and QR codes

### QR Code System
- Each blade gets unique QR code
- QR codes contain JSON data with equipment info
- Can be printed and attached to physical equipment
- Scanning logs timestamp and user

### Usage Tracking
- Completely automatic
- No manual input required from operators
- Tracks linear feet cut for each blade
- Links usage to specific jobs and dates
- Calculates cost per foot

### Role-Based Access
- Admins can add inventory and assign equipment
- Operators can view equipment and request maintenance
- Different UI based on role when scanning

## Future Enhancements

1. **Maintenance Scheduling**: Automatic alerts based on usage thresholds
2. **Blade Sharpening Tracking**: Track when blades are sharpened
3. **Inventory Alerts**: Low stock notifications
4. **Mobile App**: Dedicated mobile app for easier QR scanning
5. **Analytics Dashboard**: Usage patterns, cost analysis, equipment lifecycle
6. **Integration with Work Orders**: Auto-suggest equipment based on job type
7. **Damage Reporting**: Photo uploads when returning damaged equipment

## Troubleshooting

### QR Scanner Not Working
- Check camera permissions in browser
- Try using manual QR entry instead
- Ensure lighting is adequate

### Usage Not Being Tracked
- Verify blade is assigned to operator
- Check that equipment_for field matches saw type used
- Ensure work performed is properly submitted

### Assignment Failing
- Verify user has admin role
- Check equipment is not already checked out
- Ensure operator exists in system

## Support

For issues or questions:
1. Check browser console for errors
2. Review Supabase logs for API errors
3. Verify database migration ran successfully
4. Check RLS policies if data access issues occur
