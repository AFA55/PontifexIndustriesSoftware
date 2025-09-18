# 🚀 Supabase Database Setup for Pontifex Platform

## **Step 1: Run the Database Schema**

1. Go to your Supabase dashboard: https://app.supabase.com/project/thebticaroasspmbhisx
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the entire contents of `database-schema.sql`
5. Click **Run** to create all the new tables

## **Step 2: Verify Tables Created**

After running the schema, you should see these new tables in **Table Editor**:

✅ `equipment_usage_logs` - Track every equipment interaction
✅ `job_sites` - Manage project locations
✅ `equipment_deployments` - Track equipment at job sites
✅ `maintenance_records` - Detailed maintenance history
✅ `user_activity_logs` - All user actions
✅ `equipment_metrics` - Performance data
✅ `automated_alerts` - System notifications
✅ `qr_scan_logs` - QR code scanning history

## **Step 3: Start Collecting Data**

Your software will now automatically collect data when:

### 🔍 **QR Code Scans**
```javascript
// Every QR scan is logged
await logQRScan({
  equipment_id: 'uuid',
  scanned_by: 'Rex Z',
  scan_purpose: 'checkout',
  scan_location: 'Job Site #142'
});
```

### 📱 **Equipment Usage**
```javascript
// When equipment is checked out/in
await logEquipmentUsage({
  equipment_id: 'uuid',
  user_name: 'Skinny H',
  action: 'checked_out',
  location: 'Truck 2',
  duration_minutes: 480 // 8 hours
});
```

### 🔧 **Maintenance Records**
```javascript
// Every maintenance activity
await logMaintenanceRecord({
  equipment_id: 'uuid',
  maintenance_type: 'routine',
  description: 'Oil change and filter replacement',
  technician_name: 'Brandon R',
  cost: 125.50,
  parts_used: [
    {name: 'Oil Filter', cost: 25.99},
    {name: 'Engine Oil', cost: 99.51}
  ]
});
```

## **Step 4: Analytics Dashboard**

Use these functions to show data insights:

### 📊 **Equipment Utilization**
```javascript
const utilization = await getEquipmentUtilization(30); // Last 30 days
// Shows: most used equipment, checkout frequency, usage hours
```

### 💰 **Maintenance Costs**
```javascript
const costs = await getMaintenanceCosts(6); // Last 6 months
// Shows: total costs, cost by equipment, cost by maintenance type
```

### 📈 **Usage Patterns**
```javascript
const patterns = await getUsagePatterns();
// Shows: peak usage hours, busiest days, most active users
```

## **Step 5: Automation Examples**

### 🚨 **Maintenance Alerts**
```javascript
// Run daily to check overdue maintenance
await checkMaintenanceDue();
// Automatically creates alerts for equipment needing service
```

### 📋 **Dashboard Metrics**
```javascript
const metrics = await getDashboardMetrics();
// Gets all key metrics for dashboard display
```

## **Step 6: Integration Points**

### **Add to Equipment Form** (`/equipment/add`)
When adding equipment, also log the activity:
```javascript
// After saving equipment
await logUserActivity(userName, 'add_equipment', {
  equipment_name: formData.name,
  serial_number: formData.serial_number
});
```

### **Add to QR Scanner**
When scanning QR codes:
```javascript
await logQRScan({
  equipment_id: scannedData.id,
  scanned_by: currentUser,
  scan_purpose: 'inspection',
  device_info: navigator.userAgent
});
```

### **Add to Equipment Updates**
When equipment status changes:
```javascript
await logEquipmentUsage({
  equipment_id: equipmentId,
  user_name: currentUser,
  action: newStatus === 'In Use' ? 'checked_out' : 'checked_in',
  location: newLocation
});
```

## **Step 7: Automated Reports**

Create scheduled functions to:

1. **Weekly Equipment Reports**
   - Most used equipment
   - Maintenance costs
   - Usage patterns

2. **Monthly Analytics**
   - Equipment ROI analysis
   - Predictive maintenance suggestions
   - User productivity metrics

3. **Alert Notifications**
   - Equipment overdue for maintenance
   - Unused equipment alerts
   - High-cost maintenance warnings

## **Step 8: Real-time Features**

### **Live Dashboard Updates**
```javascript
// Subscribe to real-time changes
const subscription = supabase
  .channel('equipment_changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'equipment_usage_logs'
  }, (payload) => {
    updateDashboard(payload);
  })
  .subscribe();
```

### **Instant Notifications**
```javascript
// Get notified when alerts are created
supabase
  .channel('alerts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'automated_alerts'
  }, (payload) => {
    showNotification(payload.new);
  })
  .subscribe();
```

## **🎯 Next Steps**

1. **Run the schema** in Supabase SQL Editor
2. **Import analytics functions** in your pages
3. **Add logging calls** to existing forms and actions
4. **Create analytics dashboard** showing the collected data
5. **Set up automation triggers** for maintenance and alerts

Your software will now collect comprehensive data for:
- Equipment utilization optimization
- Predictive maintenance scheduling
- Cost analysis and budgeting
- User productivity tracking
- Automated workflow improvements