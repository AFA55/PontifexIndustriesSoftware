/**
 * Document Types and Templates for Pontifex Industries
 * Comprehensive list of required documents for concrete cutting and construction jobs
 */

export interface DocumentField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'checkbox' | 'date' | 'time' | 'select' | 'multiselect' | 'signature' | 'photo' | 'number';
  required: boolean;
  options?: string[];
  placeholder?: string;
  description?: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  category: 'safety' | 'compliance' | 'operational' | 'quality' | 'administrative';
  description: string;
  fields: DocumentField[];
  requiresSignature: boolean;
  requiresPhoto?: boolean;
}

// Comprehensive list of document templates
export const documentTemplates: DocumentTemplate[] = [
  // ========================================
  // SAFETY DOCUMENTS
  // ========================================
  {
    id: 'jsa-form',
    name: 'JSA Form (Job Safety Analysis)',
    category: 'safety',
    description: 'Identifies job hazards and establishes safe work procedures',
    requiresSignature: true,
    fields: [
      { name: 'jobSteps', label: 'Job Steps', type: 'textarea', required: true, placeholder: 'List each step of the job' },
      { name: 'hazards', label: 'Potential Hazards', type: 'textarea', required: true, placeholder: 'Identify hazards for each step' },
      { name: 'controls', label: 'Hazard Controls', type: 'textarea', required: true, placeholder: 'List controls/PPE needed' },
      { name: 'ppeRequired', label: 'PPE Required', type: 'multiselect', required: true, options: ['Hard Hat', 'Safety Glasses', 'Gloves', 'Steel Toe Boots', 'Hearing Protection', 'Respirator', 'Fall Protection'] },
      { name: 'emergencyProcedures', label: 'Emergency Procedures', type: 'textarea', required: true },
      { name: 'reviewedBy', label: 'Reviewed By', type: 'text', required: true },
      { name: 'reviewDate', label: 'Review Date', type: 'date', required: true }
    ]
  },
  {
    id: 'silica-dust-control',
    name: 'Silica Dust/Exposure Control Plan',
    category: 'safety',
    description: 'OSHA required plan for controlling silica dust exposure',
    requiresSignature: true,
    fields: [
      { name: 'workActivity', label: 'Work Activity', type: 'select', required: true, options: ['Cutting', 'Drilling', 'Grinding', 'Sawing', 'Demolition'] },
      { name: 'dustControls', label: 'Dust Control Methods', type: 'multiselect', required: true, options: ['Water Suppression', 'Vacuum/HEPA', 'Wet Methods', 'Ventilation', 'Enclosure'] },
      { name: 'respiratorType', label: 'Respirator Type', type: 'select', required: true, options: ['N95', 'P100', 'Half-Face APR', 'Full-Face APR', 'PAPR', 'Not Required'] },
      { name: 'fitTestDate', label: 'Fit Test Date', type: 'date', required: false },
      { name: 'medicalClearance', label: 'Medical Clearance Current', type: 'checkbox', required: true },
      { name: 'trainingDate', label: 'Training Completed Date', type: 'date', required: true },
      { name: 'equipmentChecked', label: 'Equipment Checked', type: 'checkbox', required: true },
      { name: 'notes', label: 'Additional Notes', type: 'textarea', required: false }
    ]
  },
  {
    id: 'confined-space-entry',
    name: 'Confined Space Entry Permit',
    category: 'safety',
    description: 'Required for any work in confined spaces',
    requiresSignature: true,
    fields: [
      { name: 'spaceLocation', label: 'Confined Space Location', type: 'text', required: true },
      { name: 'spaceType', label: 'Space Type', type: 'select', required: true, options: ['Permit Required', 'Non-Permit'] },
      { name: 'atmosphereTested', label: 'Atmosphere Tested', type: 'checkbox', required: true },
      { name: 'oxygenLevel', label: 'Oxygen Level (%)', type: 'number', required: true, placeholder: '19.5-23.5%' },
      { name: 'combustibleGas', label: 'Combustible Gas (% LEL)', type: 'number', required: true },
      { name: 'toxicGas', label: 'Toxic Gas (PPM)', type: 'number', required: true },
      { name: 'ventilation', label: 'Ventilation Method', type: 'select', required: true, options: ['Natural', 'Forced Air', 'Not Required'] },
      { name: 'entryAttendant', label: 'Entry Attendant Name', type: 'text', required: true },
      { name: 'rescuePlan', label: 'Rescue Plan', type: 'textarea', required: true },
      { name: 'communicationMethod', label: 'Communication Method', type: 'text', required: true },
      { name: 'entryTime', label: 'Entry Time', type: 'time', required: true },
      { name: 'exitTime', label: 'Exit Time', type: 'time', required: false }
    ]
  },
  {
    id: 'hot-work-permit',
    name: 'Hot Work Permit',
    category: 'safety',
    description: 'Required for any work involving flames, sparks, or heat',
    requiresSignature: true,
    requiresPhoto: true,
    fields: [
      { name: 'workLocation', label: 'Work Location', type: 'text', required: true },
      { name: 'workType', label: 'Type of Hot Work', type: 'select', required: true, options: ['Cutting', 'Welding', 'Grinding', 'Torch Work'] },
      { name: 'fireWatch', label: 'Fire Watch Assigned', type: 'text', required: true },
      { name: 'fireExtinguisher', label: 'Fire Extinguisher Present', type: 'checkbox', required: true },
      { name: 'combustiblesRemoved', label: 'Combustibles Removed (30ft)', type: 'checkbox', required: true },
      { name: 'sprinklersActive', label: 'Sprinkler System Active', type: 'checkbox', required: false },
      { name: 'ventilationAdequate', label: 'Adequate Ventilation', type: 'checkbox', required: true },
      { name: 'fireWatchDuration', label: 'Fire Watch Duration (after work)', type: 'select', required: true, options: ['30 minutes', '60 minutes', '2 hours'] },
      { name: 'startTime', label: 'Work Start Time', type: 'time', required: true },
      { name: 'endTime', label: 'Work End Time', type: 'time', required: false },
      { name: 'beforePhoto', label: 'Before Work Photo', type: 'photo', required: true },
      { name: 'afterPhoto', label: 'After Work Photo', type: 'photo', required: true }
    ]
  },
  {
    id: 'site-safety-plan',
    name: 'Site-Specific Safety Plan',
    category: 'safety',
    description: 'Comprehensive safety plan for the job site',
    requiresSignature: true,
    fields: [
      { name: 'siteHazards', label: 'Site Hazards Identified', type: 'multiselect', required: true, options: ['Fall Hazards', 'Electrical', 'Moving Equipment', 'Confined Spaces', 'Chemical Exposure', 'Noise', 'Silica Dust'] },
      { name: 'accessRoutes', label: 'Emergency Access Routes', type: 'textarea', required: true },
      { name: 'assemblyPoint', label: 'Emergency Assembly Point', type: 'text', required: true },
      { name: 'hospitalLocation', label: 'Nearest Hospital', type: 'text', required: true },
      { name: 'emergencyContacts', label: 'Emergency Contacts', type: 'textarea', required: true },
      { name: 'firstAidKit', label: 'First Aid Kit Location', type: 'text', required: true },
      { name: 'dailyToolboxTalk', label: 'Daily Toolbox Talk Completed', type: 'checkbox', required: true }
    ]
  },
  {
    id: 'fall-protection-plan',
    name: 'Fall Protection Plan',
    category: 'safety',
    description: 'Required for work at heights over 6 feet',
    requiresSignature: true,
    fields: [
      { name: 'workHeight', label: 'Work Height (feet)', type: 'number', required: true },
      { name: 'fallProtectionType', label: 'Fall Protection Type', type: 'select', required: true, options: ['Guardrails', 'Safety Net', 'Personal Fall Arrest System', 'Positioning Device'] },
      { name: 'anchorPoint', label: 'Anchor Point Inspected', type: 'checkbox', required: true },
      { name: 'harness Inspected', label: 'Harness Inspected', type: 'checkbox', required: true },
      { name: 'lanyard Type', label: 'Lanyard Type', type: 'select', required: true, options: ['Shock-Absorbing', 'Self-Retracting', 'Positioning'] },
      { name: 'rescuePlan', label: 'Rescue Plan', type: 'textarea', required: true },
      { name: 'trainingCurrent', label: 'Fall Protection Training Current', type: 'checkbox', required: true }
    ]
  },

  // ========================================
  // COMPLIANCE DOCUMENTS
  // ========================================
  {
    id: 'permit-to-work',
    name: 'Permit to Work',
    category: 'compliance',
    description: 'General work permit for controlled environments',
    requiresSignature: true,
    fields: [
      { name: 'permitNumber', label: 'Permit Number', type: 'text', required: true },
      { name: 'workDescription', label: 'Work Description', type: 'textarea', required: true },
      { name: 'workArea', label: 'Work Area/Location', type: 'text', required: true },
      { name: 'validFrom', label: 'Valid From', type: 'date', required: true },
      { name: 'validTo', label: 'Valid To', type: 'date', required: true },
      { name: 'authorizedBy', label: 'Authorized By', type: 'text', required: true },
      { name: 'specialConditions', label: 'Special Conditions', type: 'textarea', required: false },
      { name: 'isolations', label: 'Isolations Required', type: 'multiselect', required: false, options: ['Electrical', 'Mechanical', 'Hydraulic', 'Pneumatic', 'Water'] }
    ]
  },
  {
    id: 'loto-procedure',
    name: 'LOTO (Lockout/Tagout) Procedure',
    category: 'compliance',
    description: 'Lockout/Tagout procedure for equipment isolation',
    requiresSignature: true,
    requiresPhoto: true,
    fields: [
      { name: 'equipmentDescription', label: 'Equipment Description', type: 'text', required: true },
      { name: 'energySources', label: 'Energy Sources', type: 'multiselect', required: true, options: ['Electrical', 'Mechanical', 'Hydraulic', 'Pneumatic', 'Chemical', 'Thermal'] },
      { name: 'lockoutPoints', label: 'Lockout Points', type: 'textarea', required: true },
      { name: 'lockNumbers', label: 'Lock Numbers Applied', type: 'text', required: true },
      { name: 'verificationTest', label: 'Zero Energy Verified', type: 'checkbox', required: true },
      { name: 'tagNumber', label: 'Tag Number', type: 'text', required: true },
      { name: 'lockedOutBy', label: 'Locked Out By', type: 'text', required: true },
      { name: 'lockoutPhoto', label: 'Lockout Photo', type: 'photo', required: true },
      { name: 'removalDate', label: 'Removal Date/Time', type: 'date', required: false }
    ]
  },

  // ========================================
  // OPERATIONAL DOCUMENTS
  // ========================================
  {
    id: 'pre-work-inspection',
    name: 'Pre-Work Site Inspection',
    category: 'operational',
    description: 'Site inspection before beginning work',
    requiresSignature: true,
    requiresPhoto: true,
    fields: [
      { name: 'utilitiesLocated', label: 'Utilities Located/Marked', type: 'checkbox', required: true },
      { name: 'gprScanning', label: 'GPR Scanning Completed', type: 'checkbox', required: false },
      { name: 'accessClear', label: 'Access/Egress Clear', type: 'checkbox', required: true },
      { name: 'workAreaClean', label: 'Work Area Clean', type: 'checkbox', required: true },
      { name: 'equipmentFunctional', label: 'Equipment Functional', type: 'checkbox', required: true },
      { name: 'materialsOnSite', label: 'All Materials On Site', type: 'checkbox', required: true },
      { name: 'weatherConditions', label: 'Weather Conditions Acceptable', type: 'checkbox', required: true },
      { name: 'sitePhotos', label: 'Site Photos', type: 'photo', required: true },
      { name: 'concerns', label: 'Concerns/Issues', type: 'textarea', required: false }
    ]
  },
  {
    id: 'equipment-inspection',
    name: 'Equipment Daily Inspection',
    category: 'operational',
    description: 'Daily inspection of equipment before use',
    requiresSignature: true,
    fields: [
      { name: 'equipmentType', label: 'Equipment Type', type: 'select', required: true, options: ['Core Drill', 'Wall Saw', 'Slab Saw', 'Hand Saw', 'Chainsaw', 'Demo Equipment'] },
      { name: 'equipmentId', label: 'Equipment ID/Serial', type: 'text', required: true },
      { name: 'visualInspection', label: 'Visual Inspection Passed', type: 'checkbox', required: true },
      { name: 'powerCordCondition', label: 'Power Cord Condition Good', type: 'checkbox', required: true },
      { name: 'bladeBitCondition', label: 'Blade/Bit Condition Good', type: 'checkbox', required: true },
      { name: 'guardsInPlace', label: 'Guards In Place', type: 'checkbox', required: true },
      { name: 'coolantWater', label: 'Coolant/Water System OK', type: 'checkbox', required: true },
      { name: 'defectsNoted', label: 'Defects Noted', type: 'textarea', required: false },
      { name: 'outOfService', label: 'Equipment Out of Service', type: 'checkbox', required: false }
    ]
  },
  {
    id: 'daily-production-report',
    name: 'Daily Production Report',
    category: 'operational',
    description: 'Daily report of work completed',
    requiresSignature: true,
    fields: [
      { name: 'workCompleted', label: 'Work Completed', type: 'textarea', required: true },
      { name: 'linearFeet', label: 'Linear Feet Cut', type: 'number', required: false },
      { name: 'holesCompleted', label: 'Holes Completed', type: 'number', required: false },
      { name: 'squareFeet', label: 'Square Feet', type: 'number', required: false },
      { name: 'laborHours', label: 'Labor Hours', type: 'number', required: true },
      { name: 'equipmentUsed', label: 'Equipment Used', type: 'textarea', required: true },
      { name: 'materialsUsed', label: 'Materials Used', type: 'textarea', required: true },
      { name: 'issues', label: 'Issues/Delays', type: 'textarea', required: false },
      { name: 'weatherImpact', label: 'Weather Impact', type: 'textarea', required: false }
    ]
  },
  {
    id: 'tool-inventory',
    name: 'Tool/Equipment Inventory Checklist',
    category: 'operational',
    description: 'Inventory check of tools and equipment',
    requiresSignature: true,
    fields: [
      { name: 'allToolsPresent', label: 'All Tools Present', type: 'checkbox', required: true },
      { name: 'toolsCondition', label: 'Tools Condition Good', type: 'checkbox', required: true },
      { name: 'missingItems', label: 'Missing Items', type: 'textarea', required: false },
      { name: 'damagedItems', label: 'Damaged Items', type: 'textarea', required: false },
      { name: 'returnedToShop', label: 'All Items Returned to Shop', type: 'checkbox', required: true }
    ]
  },

  // ========================================
  // QUALITY DOCUMENTS
  // ========================================
  {
    id: 'quality-control',
    name: 'Quality Control Checklist',
    category: 'quality',
    description: 'Quality verification of completed work',
    requiresSignature: true,
    requiresPhoto: true,
    fields: [
      { name: 'workToSpec', label: 'Work Meets Specifications', type: 'checkbox', required: true },
      { name: 'measurementsAccurate', label: 'Measurements Accurate', type: 'checkbox', required: true },
      { name: 'cutsClean', label: 'Cuts Clean/Smooth', type: 'checkbox', required: true },
      { name: 'depthCorrect', label: 'Depth/Thickness Correct', type: 'checkbox', required: true },
      { name: 'noOvercuts', label: 'No Overcuts/Damage', type: 'checkbox', required: true },
      { name: 'cleanupComplete', label: 'Cleanup Complete', type: 'checkbox', required: true },
      { name: 'workPhotos', label: 'Completed Work Photos', type: 'photo', required: true },
      { name: 'deficiencies', label: 'Deficiencies Noted', type: 'textarea', required: false }
    ]
  },
  {
    id: 'final-inspection',
    name: 'Final Job Inspection',
    category: 'quality',
    description: 'Final inspection before job closeout',
    requiresSignature: true,
    requiresPhoto: true,
    fields: [
      { name: 'scopeComplete', label: 'Scope of Work Complete', type: 'checkbox', required: true },
      { name: 'cleanupVerified', label: 'Cleanup Verified', type: 'checkbox', required: true },
      { name: 'debrisRemoved', label: 'Debris Removed', type: 'checkbox', required: true },
      { name: 'areaSafe', label: 'Area Left Safe', type: 'checkbox', required: true },
      { name: 'customerSatisfied', label: 'Customer Satisfied', type: 'checkbox', required: true },
      { name: 'punchList', label: 'Punch List Items', type: 'textarea', required: false },
      { name: 'finalPhotos', label: 'Final Photos', type: 'photo', required: true }
    ]
  },

  // ========================================
  // ADMINISTRATIVE DOCUMENTS
  // ========================================
  {
    id: 'time-card',
    name: 'Time Card',
    category: 'administrative',
    description: 'Daily time tracking',
    requiresSignature: true,
    fields: [
      { name: 'startTime', label: 'Start Time', type: 'time', required: true },
      { name: 'lunchOut', label: 'Lunch Out', type: 'time', required: false },
      { name: 'lunchIn', label: 'Lunch In', type: 'time', required: false },
      { name: 'endTime', label: 'End Time', type: 'time', required: true },
      { name: 'totalHours', label: 'Total Hours', type: 'number', required: true },
      { name: 'overtimeHours', label: 'Overtime Hours', type: 'number', required: false },
      { name: 'travelTime', label: 'Travel Time (hours)', type: 'number', required: false }
    ]
  },
  {
    id: 'customer-signoff',
    name: 'Customer Sign-Off',
    category: 'administrative',
    description: 'Customer acceptance of completed work',
    requiresSignature: true,
    fields: [
      { name: 'workCompleted', label: 'Work Completed Description', type: 'textarea', required: true },
      { name: 'customerSatisfied', label: 'Customer Satisfied', type: 'checkbox', required: true },
      { name: 'additionalWork', label: 'Additional Work Requested', type: 'textarea', required: false },
      { name: 'customerName', label: 'Customer Name', type: 'text', required: true },
      { name: 'customerTitle', label: 'Customer Title', type: 'text', required: false },
      { name: 'customerPhone', label: 'Customer Phone', type: 'text', required: false },
      { name: 'customerEmail', label: 'Customer Email', type: 'text', required: false },
      { name: 'signoffDate', label: 'Sign-Off Date', type: 'date', required: true }
    ]
  },
  {
    id: 'incident-report',
    name: 'Incident/Accident Report',
    category: 'administrative',
    description: 'Report of any incidents or accidents',
    requiresSignature: true,
    requiresPhoto: true,
    fields: [
      { name: 'incidentType', label: 'Incident Type', type: 'select', required: true, options: ['Injury', 'Near Miss', 'Property Damage', 'Equipment Damage', 'Environmental'] },
      { name: 'incidentDate', label: 'Incident Date', type: 'date', required: true },
      { name: 'incidentTime', label: 'Incident Time', type: 'time', required: true },
      { name: 'location', label: 'Location', type: 'text', required: true },
      { name: 'personsInvolved', label: 'Persons Involved', type: 'textarea', required: true },
      { name: 'witnesses', label: 'Witnesses', type: 'textarea', required: false },
      { name: 'description', label: 'Incident Description', type: 'textarea', required: true },
      { name: 'rootCause', label: 'Root Cause', type: 'textarea', required: true },
      { name: 'correctiveActions', label: 'Corrective Actions', type: 'textarea', required: true },
      { name: 'injuryTreatment', label: 'Injury Treatment', type: 'textarea', required: false },
      { name: 'photos', label: 'Incident Photos', type: 'photo', required: false }
    ]
  },
  {
    id: 'material-receipt',
    name: 'Material Receipt/Delivery',
    category: 'administrative',
    description: 'Verification of materials received',
    requiresSignature: true,
    fields: [
      { name: 'deliveryDate', label: 'Delivery Date', type: 'date', required: true },
      { name: 'supplier', label: 'Supplier', type: 'text', required: true },
      { name: 'poNumber', label: 'PO Number', type: 'text', required: false },
      { name: 'itemsReceived', label: 'Items Received', type: 'textarea', required: true },
      { name: 'quantityCorrect', label: 'Quantity Correct', type: 'checkbox', required: true },
      { name: 'conditionGood', label: 'Condition Good', type: 'checkbox', required: true },
      { name: 'discrepancies', label: 'Discrepancies', type: 'textarea', required: false }
    ]
  }
];

// Helper function to get documents by category
export function getDocumentsByCategory(category: DocumentTemplate['category']): DocumentTemplate[] {
  return documentTemplates.filter(doc => doc.category === category);
}

// Helper function to get document by ID
export function getDocumentTemplate(id: string): DocumentTemplate | undefined {
  return documentTemplates.find(doc => doc.id === id);
}

// Export document categories for UI
export const documentCategories = [
  { id: 'safety', name: 'Safety Documents', color: 'red' },
  { id: 'compliance', name: 'Compliance Documents', color: 'blue' },
  { id: 'operational', name: 'Operational Documents', color: 'yellow' },
  { id: 'quality', name: 'Quality Documents', color: 'green' },
  { id: 'administrative', name: 'Administrative Documents', color: 'purple' }
] as const;
