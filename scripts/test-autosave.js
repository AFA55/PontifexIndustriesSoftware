/**
 * Auto-Save Testing Script
 *
 * Run this in the browser console on the dispatch scheduling page
 * to test auto-save functionality.
 *
 * Usage:
 * 1. Open http://localhost:3000/dashboard/admin/dispatch-scheduling
 * 2. Open browser DevTools console (F12)
 * 3. Copy and paste this entire script
 * 4. Run the test commands
 */

const AutoSaveTest = {
  STORAGE_KEY: 'pontifex_form_dispatch-scheduling',

  // Test 1: Check if saved data exists
  hasSavedData() {
    const data = localStorage.getItem(this.STORAGE_KEY);
    console.log('📦 Saved data exists:', !!data);
    return !!data;
  },

  // Test 2: View saved data
  viewSavedData() {
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (!data) {
      console.log('❌ No saved data found');
      return null;
    }

    const parsed = JSON.parse(data);
    console.log('📄 Saved data:', parsed);
    console.log('📊 Current step:', parsed.currentStep);
    console.log('🕐 Timestamp:', new Date(parsed.timestamp).toLocaleString());
    console.log('📝 Form data preview:', {
      jobTypes: parsed.data.jobTypes,
      customer: parsed.data.customer,
      location: parsed.data.location,
    });
    return parsed;
  },

  // Test 3: Get age of saved data
  getSavedAge() {
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (!data) {
      console.log('❌ No saved data found');
      return null;
    }

    const parsed = JSON.parse(data);
    const ageMs = Date.now() - parsed.timestamp;
    const ageMinutes = Math.floor(ageMs / (1000 * 60));
    const ageHours = Math.floor(ageMinutes / 60);

    console.log('⏰ Saved data age:');
    console.log(`   ${ageMinutes} minutes (${ageHours} hours)`);

    if (ageHours >= 24) {
      console.log('⚠️  Data is expired (>24 hours)');
    } else {
      console.log(`✅ Data is valid (${24 - ageHours} hours until expiry)`);
    }

    return { ageMinutes, ageHours };
  },

  // Test 4: Create mock saved data
  createMockSave(step = 3) {
    const mockData = {
      data: {
        title: 'Test Job Order',
        customer: 'Test Customer',
        companyName: 'Test Company',
        customerEmail: 'test@example.com',
        salespersonEmail: 'sales@example.com',
        jobTypes: ['CORE DRILLING', 'GPR SCANNING'],
        location: 'Austin, TX',
        address: '123 Test Street',
        estimatedDriveHours: 1,
        estimatedDriveMinutes: 30,
        status: 'scheduled',
        priority: 'high',
        difficulty_rating: 7,
        truck_parking: 'close',
        work_environment: 'indoor',
        site_cleanliness: 8,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        arrivalTime: '08:00',
        shopArrivalTime: '07:00',
        estimatedHours: '8.00',
        technicians: [],
        salesman: '',
        description: '',
        additionalInfo: 'Test additional info',
        jobTypeDetails: {
          'CORE DRILLING': {
            quantity: '5',
            depth: '12',
            diameter: '4'
          }
        },
        equipment: ['Core Drill - Electric', 'Vacuum'],
        requiredDocuments: ['silica-dust-control'],
        jobSiteNumber: 'JS-001',
        po: 'PO-12345',
        customerJobNumber: 'CJ-999',
        contactOnSite: 'Site Manager',
        contactPhone: '555-1234',
        jobSiteGC: 'General Contractor Inc',
        jobQuote: 5000
      },
      currentStep: step,
      timestamp: Date.now(),
      version: '1.0'
    };

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(mockData));
    console.log(`✅ Created mock saved data at Step ${step}`);
    console.log('🔄 Refresh the page to see the resume modal');
  },

  // Test 5: Clear saved data
  clearSavedData() {
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('🗑️  Saved data cleared');
    console.log('🔄 Refresh the page to start fresh');
  },

  // Test 6: Make saved data expired
  makeExpired() {
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (!data) {
      console.log('❌ No saved data to expire');
      return;
    }

    const parsed = JSON.parse(data);
    // Set timestamp to 25 hours ago
    parsed.timestamp = Date.now() - (25 * 60 * 60 * 1000);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(parsed));

    console.log('⏰ Set saved data to 25 hours old (expired)');
    console.log('🔄 Refresh the page - should NOT show resume modal');
  },

  // Test 7: Make saved data recent
  makeRecent(minutesAgo = 5) {
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (!data) {
      console.log('❌ No saved data found');
      return;
    }

    const parsed = JSON.parse(data);
    parsed.timestamp = Date.now() - (minutesAgo * 60 * 1000);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(parsed));

    console.log(`✅ Set saved data to ${minutesAgo} minutes ago`);
    console.log('🔄 Refresh the page to see resume modal');
  },

  // Test 8: Simulate version mismatch
  createVersionMismatch() {
    const data = localStorage.getItem(this.STORAGE_KEY);
    if (!data) {
      console.log('❌ No saved data found');
      console.log('💡 Creating mock data with old version...');
      this.createMockSave(2);
    }

    const parsed = JSON.parse(localStorage.getItem(this.STORAGE_KEY));
    parsed.version = '0.9'; // Old version
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(parsed));

    console.log('⚠️  Set version to "0.9" (current is "1.0")');
    console.log('🔄 Refresh the page - should clear old data and start fresh');
  },

  // Test 9: Run all tests
  runAllTests() {
    console.log('\n🧪 Running Auto-Save Tests...\n');

    console.log('═══════════════════════════════════════');
    console.log('TEST 1: Check for saved data');
    console.log('═══════════════════════════════════════');
    this.hasSavedData();

    console.log('\n═══════════════════════════════════════');
    console.log('TEST 2: View saved data details');
    console.log('═══════════════════════════════════════');
    this.viewSavedData();

    console.log('\n═══════════════════════════════════════');
    console.log('TEST 3: Check saved data age');
    console.log('═══════════════════════════════════════');
    this.getSavedAge();

    console.log('\n✅ All tests complete!');
    console.log('\n💡 Available commands:');
    console.log('   AutoSaveTest.createMockSave(step)  - Create test data');
    console.log('   AutoSaveTest.clearSavedData()      - Clear saved data');
    console.log('   AutoSaveTest.makeExpired()         - Make data expired');
    console.log('   AutoSaveTest.makeRecent(minutes)   - Make data recent');
  },

  // Help
  help() {
    console.log('\n📚 Auto-Save Testing Commands:\n');
    console.log('AutoSaveTest.hasSavedData()           - Check if data exists');
    console.log('AutoSaveTest.viewSavedData()          - View saved data');
    console.log('AutoSaveTest.getSavedAge()            - Get age of saved data');
    console.log('AutoSaveTest.createMockSave(step)     - Create mock data (default: step 3)');
    console.log('AutoSaveTest.clearSavedData()         - Clear all saved data');
    console.log('AutoSaveTest.makeExpired()            - Make data expired (>24h)');
    console.log('AutoSaveTest.makeRecent(minutes)      - Make data recent (default: 5 min)');
    console.log('AutoSaveTest.createVersionMismatch()  - Test version incompatibility');
    console.log('AutoSaveTest.runAllTests()            - Run all tests');
    console.log('AutoSaveTest.help()                   - Show this help\n');
  }
};

// Auto-run help on first load
console.log('🚀 Auto-Save Test Suite Loaded!');
AutoSaveTest.help();

// Make available globally
window.AutoSaveTest = AutoSaveTest;
