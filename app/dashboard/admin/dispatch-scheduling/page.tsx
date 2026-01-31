'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminProtection from '@/components/AdminProtection';
import { supabase } from '@/lib/supabase';
import { documentTemplates } from '@/lib/document-types';

interface JobOrderForm {
  // Basic Info
  title: string;
  customer: string;
  companyName: string; // Company name
  customerEmail: string; // Customer email for completion agreements
  salespersonEmail: string; // Salesperson email for notifications
  jobTypes: string[]; // Changed to array for multiple job types

  // Location
  location: string;
  address: string;
  estimatedDriveHours: number;
  estimatedDriveMinutes: number;

  // Status & Priority
  status: 'scheduled' | 'in-route' | 'in-progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
  difficulty_rating: number;

  // Job Site Conditions
  truck_parking: 'close' | 'far';
  work_environment: 'outdoor' | 'indoor';
  site_cleanliness: number;

  // Schedule - Updated to support date range
  startDate: string;
  endDate: string;
  arrivalTime: string;
  shopArrivalTime: string;
  estimatedHours: string;

  // Team - Updated to support multiple operators
  technicians: string[];
  salesman: string;

  // Job Details
  description: string;
  additionalInfo: string; // Separate field for additional info

  // Job Type Specific Details
  jobTypeDetails: {
    [key: string]: {
      linearFeet?: string;
      thickness?: string;
      quantity?: string;
      depth?: string;
      diameter?: string;
      locations?: string[]; // For core drilling locations
      material?: string;
      materialOther?: string;
      methods?: string[];
      removal?: string;
      areas?: Array<{
        areaVolume: string;
        thickness: string;
        material: string;
        materialOther?: string;
      }>;
      [key: string]: string | string[] | Array<any> | undefined;
    };
  };

  // Equipment & Documents
  equipment: string[];
  requiredDocuments: string[]; // Array of document names that are required

  // Job Site Info - Now includes contact on site and GC
  jobSiteNumber: string;
  po: string;
  customerJobNumber: string;
  contactOnSite: string;
  contactPhone: string;
  jobSiteGC: string; // General Contractor

  // Financial - Admin Only
  jobQuote?: number; // Price quoted for the job (admin only)
}

const jobTypes = [
  'CORE DRILLING',
  'WALL CUTTING',
  'SLAB SAWING',
  'WIRE SAWING',
  'CONCRETE DEMOLITION',
  'HAND SAWING',
  'GPR SCANNING'
];

// Core Drilling Equipment - Organized by category
const CORE_DRILLING_EQUIPMENT = {
  drills: [
    'Hilti DD250CA',
    'Hilti DD500CA',
    'Hilti DD160',
  ],
  bitSizes: [
    '1/2" Bit',
    '3/4" Bit',
    '1" Bit',
    '1-1/4" Bit',
    '1-1/2" Bit',
    '2" Bit',
    '2-1/2" Bit',
    '3" Bit',
    '4" Bit',
    '5" Bit',
    '6" Bit',
    '8" Bit',
    '10" Bit',
    '12" Bit',
  ],
  ladders: [
    '6ft Ladder',
    '8ft Ladder',
    '10ft Ladder',
    '12ft Ladder',
  ],
  lifts: [
    'Scissor Lift',
  ],
  accessories: [
    'Plastic',
    'Vacuum Base',
    'Drill Extensions',
    'Tape',
    'Sticky Spray',
  ],
  cords: [
    '50ft Extension Cord',
    '100ft Extension Cord',
    '150ft Extension Cord',
  ],
  vacuums: [
    'Hilti Vacuum',
    'Regular Vacuum',
  ],
  power: [
    'Portable Generator',
  ],
};

// Wall Sawing Equipment - Organized by category
const WALL_SAWING_EQUIPMENT = {
  saws: [
    'Pentruder Wall Saw',
  ],
  hydraulics: [
    '100ft 480 Cord',
    '200ft 480 Cord',
    '250ft 480 Hose',
  ],
  barsAndChains: [
    '10\' Bar and Chain',
    '15\' Bar and Chain',
    '24" Bar and Chain',
  ],
  accessories: [
    'Slurry Drums',
    'Plastic',
  ],
};

// Slab Sawing Equipment - Organized by category
const SLAB_SAWING_EQUIPMENT = {
  blades: [
    '20" Blade',
    '26" Blade',
    '30" Blade',
    '36" Blade',
    '42" Blade',
    '54" Blade',
  ],
  guards: [
    '20" Guard',
    '26" Guard',
    '30" Guard',
    '36" Guard',
    '42" Guard',
    '54" Guard',
  ],
  saws: [
    '5000 Slab Saw',
    '7000 Slab Saw',
    'Electric Slab Saw',
  ],
  hydraulics: [
    '100ft 480 Cord',
    '200ft 480 Cord',
  ],
  accessories: [
    'Slurry Drums',
    'Plastic',
  ],
};

// Hand Sawing Equipment - Organized by category
const HAND_SAWING_EQUIPMENT = {
  saws: [
    '20" Handsaw',
    '24" Handsaw',
    '30" Handsaw',
  ],
  blades: [
    'Specialty Blade',
  ],
  accessories: [
    'Anchor Bolts',
    'Clear Spray',
    'Plastic',
    'Slurry Drum',
    'Dolly',
  ],
  powerUnits: [
    'Electric Unit',
    'Gas Unit',
  ],
  hydraulics: [
    'Hydraulic Hose (50ft)',
    'Hydraulic Hose (100ft)',
    'Hydraulic Hose (150ft)',
    'Hydraulic Hose (200ft)',
  ],
};

// Flatten all equipment into a single searchable array
const commonEquipment = [
  ...CORE_DRILLING_EQUIPMENT.drills,
  ...CORE_DRILLING_EQUIPMENT.bitSizes,
  ...CORE_DRILLING_EQUIPMENT.ladders,
  ...CORE_DRILLING_EQUIPMENT.lifts,
  ...CORE_DRILLING_EQUIPMENT.accessories,
  ...CORE_DRILLING_EQUIPMENT.cords,
  ...CORE_DRILLING_EQUIPMENT.vacuums,
  ...CORE_DRILLING_EQUIPMENT.power,
  ...WALL_SAWING_EQUIPMENT.saws,
  ...WALL_SAWING_EQUIPMENT.hydraulics,
  ...WALL_SAWING_EQUIPMENT.barsAndChains,
  ...WALL_SAWING_EQUIPMENT.accessories,
  ...SLAB_SAWING_EQUIPMENT.blades,
  ...SLAB_SAWING_EQUIPMENT.guards,
  ...SLAB_SAWING_EQUIPMENT.saws,
  ...SLAB_SAWING_EQUIPMENT.hydraulics,
  ...SLAB_SAWING_EQUIPMENT.accessories,
  ...HAND_SAWING_EQUIPMENT.saws,
  ...HAND_SAWING_EQUIPMENT.blades,
  ...HAND_SAWING_EQUIPMENT.accessories,
  ...HAND_SAWING_EQUIPMENT.powerUnits,
  ...HAND_SAWING_EQUIPMENT.hydraulics,
  // General equipment
  'Wall Saw',
  'Slab Saw',
  'Hand Saw',
  'Diamond Blades',
  'Water Hose (250\')',
  'Pump Can',
  'Safety Gear',
];

// Operators and salesmen will be fetched from database
// const operators and salesmen removed - now fetched dynamically

// Available core drilling locations
const coreDrillingLocations = [
  'Columns',
  'Block Wall',
  'Concrete Wall',
  'Precast Wall',
  'Slab on Grade',
  'Elevated Slab'
];

// Wall sawing materials
const wallSawingMaterials = [
  'Reinforced Concrete',
  'Duct Bank',
  'Precast Concrete',
  'Block/Brick',
  'Other'
];

// Slab sawing materials
const slabSawingMaterials = [
  'Reinforced Concrete',
  'Asphalt',
  'Green Concrete'
];

// Hand sawing options
const handSawingLocations = [
  'Slab on Grade',
  'Elevated Slab',
  'Vertical Cutting'
];

const handSawingMaterialTypes = [
  'Concrete',
  'Block',
  'Brick',
  'Rock'
];

// Concrete demolition methods
const concreteDemolitionMethods = [
  'Brokk Demo',
  'Jackhammering'
];

// Demolition materials
const demolitionMaterials = [
  'Reinforced Concrete',
  'Block/Brick',
  'Other'
];

// Job type descriptions and field configurations
const jobTypeConfig: { [key: string]: {
  description: string;
  fields: {
    name: string;
    label: string;
    placeholder: string;
    type?: string;
    options?: string[];
    condition?: string;
    conditionValue?: string;
  }[]
}} = {
  'CORE DRILLING': {
    description: 'CORE DRILLING',
    fields: [
      { name: 'accessibility', label: 'Accessibility Ranking', placeholder: 'Select accessibility level', type: 'material-buttons', options: ['1 - Very Hard (Tight Area)', '2 - Hard', '3 - Moderate', '4 - Easy', '5 - Wide Open'] },
      { name: 'locations', label: 'Drilling Locations', placeholder: 'Select locations', type: 'multiselect', options: coreDrillingLocations },
      { name: 'holes', label: 'Hole Configurations', placeholder: 'Add holes', type: 'core-drilling-holes' }
    ]
  },
  'WALL CUTTING': {
    description: 'WALL SAWING - CUTTING OPENINGS IN WALLS',
    fields: [
      { name: 'material', label: 'Material Type', placeholder: 'Select material', type: 'material-buttons', options: wallSawingMaterials },
      { name: 'materialOther', label: 'Other Material (if selected)', placeholder: 'Specify material...', type: 'conditional', condition: 'material', conditionValue: 'Other' },
      { name: 'overcutsAllowed', label: 'Overcuts Allowed', placeholder: 'Select option', type: 'yes-no-buttons' },
      { name: 'cuts', label: 'Cut Specifications', placeholder: 'Add cuts', type: 'wall-cutting-cuts' }
    ]
  },
  'SLAB SAWING': {
    description: 'SLAB SAWING - CUTTING CONCRETE FLOORS/SLABS',
    fields: [
      { name: 'material', label: 'Material', placeholder: 'Select material', type: 'material-buttons', options: slabSawingMaterials },
      { name: 'overcutsAllowed', label: 'Overcuts Allowed', placeholder: 'Select option', type: 'yes-no-buttons' },
      { name: 'cuts', label: 'Cut Specifications', placeholder: 'Add cuts', type: 'slab-sawing-cuts' }
    ]
  },
  'HAND SAWING': {
    description: 'HAND SAWING - MANUAL CUTTING OPERATIONS',
    fields: [
      { name: 'material', label: 'Material Type', placeholder: 'Select material type', type: 'material-buttons', options: handSawingMaterialTypes },
      { name: 'locations', label: 'Location Type', placeholder: 'Select location', type: 'multiselect', options: handSawingLocations },
      { name: 'overcutsAllowed', label: 'Overcuts Allowed', placeholder: 'Select option', type: 'yes-no-buttons' },
      { name: 'cuts', label: 'Cut Specifications', placeholder: 'Add cuts', type: 'hand-sawing-cuts' }
    ]
  },
  'WIRE SAWING': {
    description: 'WIRE SAWING - CUTTING LARGE STRUCTURES',
    fields: [
      { name: 'cuts', label: 'Cut Specifications', placeholder: 'Add cuts', type: 'wire-sawing-cuts' }
    ]
  },
  'CONCRETE DEMOLITION': {
    description: 'CONCRETE DEMOLITION - BREAKING AND REMOVING CONCRETE',
    fields: [
      { name: 'methods', label: 'Demolition Methods', placeholder: 'Select methods', type: 'multiselect', options: concreteDemolitionMethods },
      { name: 'removal', label: 'Removal Required?', placeholder: 'Select', type: 'select', options: ['Yes', 'No'] },
      { name: 'areas', label: 'Areas/Volumes', placeholder: 'Add areas', type: 'demolition-areas' }
    ]
  },
  'GPR SCANNING': {
    description: 'GPR SCANNING - GROUND PENETRATING RADAR SURVEY',
    fields: [
      { name: 'quantity', label: 'Scan Area', placeholder: 'e.g., 500 sq ft' }
    ]
  }
};

export default function DispatchScheduling() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [equipmentSearch, setEquipmentSearch] = useState('');
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [showSalesmanDropdown, setShowSalesmanDropdown] = useState(false);

  // Progressive disclosure - show one section at a time
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 8;

  // Job list state
  const [jobsList, setJobsList] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdJobId, setCreatedJobId] = useState('');

  // Team members from database
  const [operators, setOperators] = useState<Array<{ id: string; full_name: string }>>([]);
  const [admins, setAdmins] = useState<Array<{ id: string; full_name: string }>>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);

  // Autocomplete suggestions
  const [jobTitleSuggestions, setJobTitleSuggestions] = useState<string[]>([]);
  const [companyNameSuggestions, setCompanyNameSuggestions] = useState<string[]>([]);
  const [gcSuggestions, setGcSuggestions] = useState<string[]>([]);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);

  const [formData, setFormData] = useState<JobOrderForm>({
    title: '',
    customer: '',
    companyName: '',
    customerEmail: '',
    salespersonEmail: '',
    jobTypes: [],
    location: '',
    address: '',
    estimatedDriveHours: 0,
    estimatedDriveMinutes: 0,
    status: 'scheduled',
    priority: 'medium',
    difficulty_rating: 5,
    truck_parking: 'close',
    work_environment: 'outdoor',
    site_cleanliness: 5,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    arrivalTime: '08:00',
    shopArrivalTime: '',
    estimatedHours: '8.00',
    technicians: [],
    salesman: '',
    description: '',
    additionalInfo: '',
    jobTypeDetails: {},
    equipment: [],
    requiredDocuments: ['silica-dust-control'], // Silica Dust Control always required
    jobSiteNumber: '',
    po: '',
    customerJobNumber: '',
    contactOnSite: '',
    contactPhone: '',
    jobSiteGC: '',
    jobQuote: undefined // Admin only field
  });

  // Fetch team members and autocomplete suggestions from database
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get session token - try to refresh if needed
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          console.error('Session error, trying to refresh...', sessionError);

          // Try to refresh the session
          const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

          if (refreshError || !refreshedSession) {
            console.error('Session refresh failed, redirecting to login');
            alert('Your session has expired. Please log in again.');
            window.location.href = '/login';
            return;
          }

          // Use refreshed session
          const token = refreshedSession.access_token;
          await fetchWithToken(token);
          return;
        }

        const token = session.access_token;
        if (!token) {
          console.error('No authentication token found');
          setLoadingTeam(false);
          return;
        }

        await fetchWithToken(token);
      } catch (error: any) {
        console.error('Error fetching data:', error);
        setLoadingTeam(false);
      }
    };

    const fetchWithToken = async (token: string) => {
      try {

        // Fetch operators using API
        const operatorsResponse = await fetch('/api/admin/users?role=operator', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (operatorsResponse.ok) {
          const operatorsResult = await operatorsResponse.json();
          console.log('📋 Operators API Response:', operatorsResult);
          if (operatorsResult.success) {
            console.log(`✅ Found ${operatorsResult.data?.length || 0} operators`);
            setOperators(operatorsResult.data || []);
          } else {
            console.warn('⚠️ Operators API returned success:false');
          }
        } else {
          console.error('❌ Error fetching operators:', await operatorsResponse.text());
        }

        // Fetch admins using API
        const adminsResponse = await fetch('/api/admin/users?role=admin', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (adminsResponse.ok) {
          const adminsResult = await adminsResponse.json();
          console.log('📋 Admins/Salesmen API Response:', adminsResult);
          if (adminsResult.success) {
            console.log(`✅ Found ${adminsResult.data?.length || 0} admins/salesmen`);
            setAdmins(adminsResult.data || []);
          } else {
            console.warn('⚠️ Admins API returned success:false');
          }
        } else {
          console.error('❌ Error fetching admins:', await adminsResponse.text());
        }

        setLoadingTeam(false);

        // Fetch customer job titles using API
        const titlesResponse = await fetch('/api/admin/suggestions?type=job_titles', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (titlesResponse.ok) {
          const titlesResult = await titlesResponse.json();
          if (titlesResult.success && titlesResult.data) {
            setJobTitleSuggestions(titlesResult.data.map((t: any) => t.title));
          }
        }

        // Fetch company names using API
        const companiesResponse = await fetch('/api/admin/suggestions?type=company_names', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (companiesResponse.ok) {
          const companiesResult = await companiesResponse.json();
          if (companiesResult.success && companiesResult.data) {
            setCompanyNameSuggestions(companiesResult.data.map((c: any) => c.name));
          }
        }

        // Fetch general contractors using API
        const gcsResponse = await fetch('/api/admin/suggestions?type=general_contractors', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (gcsResponse.ok) {
          const gcsResult = await gcsResponse.json();
          if (gcsResult.success && gcsResult.data) {
            setGcSuggestions(gcsResult.data.map((g: any) => g.name));
          }
        }

        // Fetch location suggestions using API
        const locationsResponse = await fetch('/api/admin/suggestions?type=locations', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (locationsResponse.ok) {
          const locationsResult = await locationsResponse.json();
          if (locationsResult.success && locationsResult.data) {
            setLocationSuggestions(locationsResult.data.map((l: any) => l.location));
          }
        }

        setLoadingTeam(false);
      } catch (error) {
        console.error('Error in fetchWithToken:', error);
        setLoadingTeam(false);
      }
    };

    fetchData();
  }, []);

  // Note: Silica Dust Exposure Plan is included in initial state as always required

  // Function to save a new suggestion to the database
  const saveSuggestion = async (table: string, field: string, value: string) => {
    if (!value.trim()) return;

    try {
      // Map table name to API type
      const tableTypeMap: Record<string, string> = {
        'customer_job_titles': 'job_titles',
        'company_names': 'company_names',
        'general_contractors': 'general_contractors',
      };

      const type = tableTypeMap[table];
      if (!type) {
        console.error(`Unknown table type: ${table}`);
        return;
      }

      // Get session token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        console.error('No authentication token found');
        return;
      }

      // Call API to save suggestion
      const response = await fetch('/api/admin/suggestions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, value }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error saving ${table} suggestion:`, errorText);
      }
    } catch (error) {
      console.error(`Error saving ${table} suggestion:`, error);
    }
  };

  // Generate description based on selected job types and their details
  const generateDescription = () => {
    let desc = '';
    formData.jobTypes.forEach((jobType, idx) => {
      const config = jobTypeConfig[jobType];
      if (config) {
        // For core drilling, add locations to description
        if (jobType === 'CORE DRILLING') {
          const details = formData.jobTypeDetails[jobType];
          const locations = details?.locations;
          if (locations && Array.isArray(locations) && locations.length > 0) {
            desc += `CORE DRILLING ON ${locations.join('/')}`;
          } else {
            desc += config.description;
          }
        } else {
          desc += config.description;
        }

        const details = formData.jobTypeDetails[jobType];
        if (details) {
          desc += '\n';
          Object.entries(details).forEach(([key, value]) => {
            if (value && key !== 'locations') { // Skip locations as it's already in description
              const field = config.fields.find(f => f.name === key);
              if (field) {
                // Handle structured arrays (holes, cuts, areas)
                if (key === 'holes' && Array.isArray(value)) {
                  value.forEach((hole: any, idx: number) => {
                    if (hole.quantity || hole.diameter || hole.depth) {
                      desc += `${hole.quantity || '?'} holes @ ${hole.diameter || '?'}" diameter x ${hole.depth || '?'}" deep`;
                      if (hole.aboveFiveFeet) {
                        desc += ` (Above 5ft - Ladder/Lift Required)`;
                      }
                      desc += `\n`;
                    }
                  });
                } else if (key === 'cuts' && Array.isArray(value)) {
                  if (jobType === 'WALL CUTTING') {
                    value.forEach((cut: any, idx: number) => {
                      if (cut.quantity || cut.dimensions || cut.thickness) {
                        desc += `${cut.quantity || '?'} cuts @ ${cut.dimensions || '?'} x ${cut.thickness || '?'}" thick\n`;
                      }
                    });
                  } else if (jobType === 'SLAB SAWING' || jobType === 'HAND SAWING') {
                    value.forEach((cut: any, idx: number) => {
                      if ((jobType === 'SLAB SAWING' || jobType === 'HAND SAWING') && cut.cutType === 'Areas') {
                        // Areas mode
                        if (cut.length || cut.width || cut.thickness) {
                          const quantity = cut.quantity || '1';
                          const areaText = quantity === '1' ? '1 area' : `${quantity} areas`;
                          let cutDesc = `${areaText} - ${cut.length || '?'}' L x ${cut.width || '?'}' W x ${cut.thickness || '?'}" thick`;
                          if (cut.removing) {
                            cutDesc += ` | REMOVING MATERIAL`;
                            if (cut.equipment) {
                              const equipmentList = Array.isArray(cut.equipment) ? cut.equipment.join(', ') : cut.equipment;
                              cutDesc += ` - Equipment: ${equipmentList}`;
                            }
                          }
                          desc += cutDesc + '\n';
                        }
                      } else if (cut.linearFeet || cut.thickness) {
                        // Linear Feet mode (default)
                        let cutDesc = `${cut.linearFeet || '?'} LF x ${cut.thickness || '?'}" ${jobType === 'SLAB SAWING' ? 'thick' : 'deep'}`;
                        if ((jobType === 'SLAB SAWING' || jobType === 'HAND SAWING') && cut.removing) {
                          cutDesc += ` | REMOVING MATERIAL`;
                          if (cut.equipment) {
                            const equipmentList = Array.isArray(cut.equipment) ? cut.equipment.join(', ') : cut.equipment;
                            cutDesc += ` - Equipment: ${equipmentList}`;
                          }
                        }
                        desc += cutDesc + '\n';
                      }
                    });
                  } else if (jobType === 'WIRE SAWING') {
                    value.forEach((cut: any, idx: number) => {
                      if (cut.description) {
                        desc += `${cut.description}\n`;
                      }
                    });
                  }
                } else if (key === 'areas' && Array.isArray(value)) {
                  value.forEach((area: any, idx: number) => {
                    if (area.areaVolume || area.thickness || area.material) {
                      desc += `Area ${idx + 1}: ${area.areaVolume || '?'} @ ${area.thickness || '?'}" - ${area.material || '?'}${area.materialOther ? ` (${area.materialOther})` : ''}\n`;
                    }
                  });
                } else if (Array.isArray(value) && typeof value[0] === 'string') {
                  // Simple string arrays (methods, locations, etc.)
                  desc += `${field.label}: ${value.join(', ')}\n`;
                } else if (!Array.isArray(value)) {
                  // Simple values
                  desc += `${field.label}: ${value}\n`;
                }
              }
            }
          });
        }
        if (idx < formData.jobTypes.length - 1) {
          desc += '\n---\n\n';
        }
      }
    });
    return desc;
  };

  // Check if basic info is complete
  const isBasicInfoComplete = formData.jobTypes.length > 0 && formData.priority;

  const handleInputChange = (field: keyof JobOrderForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Calendar helper functions
  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const selectDate = (day: number, isStart: boolean) => {
    const selectedDate = new Date(calendarYear, calendarMonth, day);
    const dateString = selectedDate.toISOString().split('T')[0];

    if (isStart) {
      handleInputChange('startDate', dateString);
      setShowStartCalendar(false);
    } else {
      handleInputChange('endDate', dateString);
      setShowEndCalendar(false);
    }
  };

  const previousMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const nextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const renderCalendar = (isStart: boolean) => {
    const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
    const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const days = [];

    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-10"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = new Date(calendarYear, calendarMonth, day).toISOString().split('T')[0];
      const isSelected = isStart ? dateStr === formData.startDate : dateStr === formData.endDate;
      const isToday = dateStr === new Date().toISOString().split('T')[0];

      days.push(
        <button
          key={day}
          type="button"
          onClick={() => selectDate(day, isStart)}
          className={`h-10 rounded-lg font-semibold transition-all ${
            isSelected
              ? isStart
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-purple-600 text-white shadow-lg'
              : isToday
                ? 'bg-blue-100 text-blue-900 border-2 border-blue-400'
                : 'hover:bg-gray-100 text-gray-700'
          }`}
        >
          {day}
        </button>
      );
    }

    return (
      <div className={`absolute top-full mt-2 z-50 ${isStart ? 'bg-indigo-50' : 'bg-purple-50'} border-2 ${isStart ? 'border-indigo-300' : 'border-purple-300'} rounded-2xl shadow-2xl p-4 min-w-[320px]`}>
        {/* Month/Year Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={previousMonth}
            className={`p-2 ${isStart ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-purple-600 hover:bg-purple-700'} text-white rounded-lg`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="font-bold text-lg text-gray-800">
            {monthNames[calendarMonth]} {calendarYear}
          </div>
          <button
            type="button"
            onClick={nextMonth}
            className={`p-2 ${isStart ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-purple-600 hover:bg-purple-700'} text-white rounded-lg`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day Names */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(day => (
            <div key={day} className="text-center text-xs font-bold text-gray-600 h-8 flex items-center justify-center">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1">
          {days}
        </div>
      </div>
    );
  };

  const selectSalesman = (salesmanName: string) => {
    handleInputChange('salesman', salesmanName);
    setShowSalesmanDropdown(false);
  };

  const renderSalesmanDropdown = () => {
    if (!showSalesmanDropdown) return null;

    return (
      <div className="absolute top-full mt-2 z-50 bg-purple-50 border-2 border-purple-300 rounded-2xl shadow-2xl w-full max-h-64 overflow-y-auto">
        <div className="p-2">
          {admins.length === 0 ? (
            <div className="text-center py-4 px-3">
              <p className="text-sm text-yellow-700 font-medium">No admins/salesmen found</p>
              <p className="text-xs text-yellow-600 mt-1">Please add users with "admin" role in Team Management</p>
            </div>
          ) : (
            admins.map(admin => {
              const isSelected = formData.salesman === admin.full_name;
              return (
                <button
                  key={admin.id}
                  type="button"
                  onClick={() => selectSalesman(admin.full_name)}
                  className={`w-full text-left px-4 py-3 rounded-xl mb-1 font-semibold transition-all ${
                    isSelected
                      ? 'bg-purple-600 text-white shadow-lg'
                      : 'bg-white text-gray-800 hover:bg-purple-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {isSelected && (
                      <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span>{admin.full_name}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // Calculate shop arrival time based on job arrival time minus offset
  const calculateShopArrival = (minutesBefore: number) => {
    if (!formData.arrivalTime) {
      alert('Please set the job arrival time first');
      return;
    }

    const [hours, minutes] = formData.arrivalTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes - minutesBefore;

    // Handle negative times (wrap to previous day)
    const shopHours = Math.floor((totalMinutes + 1440) % 1440 / 60);
    const shopMinutes = (totalMinutes + 1440) % 60;

    const shopArrivalTime = `${String(shopHours).padStart(2, '0')}:${String(shopMinutes).padStart(2, '0')}`;
    handleInputChange('shopArrivalTime', shopArrivalTime);
  };

  const toggleOperator = (operatorName: string) => {
    setFormData(prev => ({
      ...prev,
      technicians: prev.technicians.includes(operatorName)
        ? prev.technicians.filter(t => t !== operatorName)
        : [...prev.technicians, operatorName]
    }));
  };

  const toggleJobType = (jobType: string) => {
    setFormData(prev => {
      const newJobTypes = prev.jobTypes.includes(jobType)
        ? prev.jobTypes.filter(t => t !== jobType)
        : [...prev.jobTypes, jobType];

      // Initialize job type details if new type is added
      const newJobTypeDetails = { ...prev.jobTypeDetails };
      if (!prev.jobTypes.includes(jobType)) {
        newJobTypeDetails[jobType] = {};
      } else {
        // Remove details if job type is removed
        delete newJobTypeDetails[jobType];
      }

      return {
        ...prev,
        jobTypes: newJobTypes,
        jobTypeDetails: newJobTypeDetails
      };
    });
  };

  const handleJobTypeDetailChange = (jobType: string, field: string, value: string | string[]) => {
    setFormData(prev => ({
      ...prev,
      jobTypeDetails: {
        ...prev.jobTypeDetails,
        [jobType]: {
          ...(prev.jobTypeDetails[jobType] || {}),
          [field]: value
        }
      }
    }));
  };

  const addEquipment = (item: string) => {
    if (!formData.equipment.includes(item)) {
      setFormData(prev => ({
        ...prev,
        equipment: [...prev.equipment, item]
      }));
    }
    setEquipmentSearch('');
    setShowEquipmentDropdown(false);
  };

  const removeEquipment = (item: string) => {
    setFormData(prev => ({
      ...prev,
      equipment: prev.equipment.filter(e => e !== item)
    }));
  };

  const toggleDocument = (docName: string) => {
    setFormData(prev => ({
      ...prev,
      requiredDocuments: prev.requiredDocuments.includes(docName)
        ? prev.requiredDocuments.filter(d => d !== docName)
        : [...prev.requiredDocuments, docName]
    }));
  };

  // Fetch jobs from database
  const fetchJobs = async () => {
    try {
      setJobsLoading(true);

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.warn('⚠️ No active session found - session may have expired. Redirecting to login...');
        // Clear localStorage and redirect to login
        localStorage.removeItem('supabase-user');
        localStorage.removeItem('pontifex-user');
        window.location.href = '/login';
        return;
      }

      const response = await fetch('/api/admin/job-orders', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch jobs');
        setJobsLoading(false);
        return;
      }

      const result = await response.json();

      if (result.success && result.data?.jobOrders) {
        setJobsList(result.data.jobOrders);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setJobsLoading(false);
    }
  };

  // Fetch jobs when switching to list tab
  useEffect(() => {
    if (activeTab === 'list') {
      fetchJobs();
    }
  }, [activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Generate final description
      const finalDescription = generateDescription();
      const fullDescription = finalDescription + (formData.additionalInfo ? `\n\nADDITIONAL INFO:\n${formData.additionalInfo}` : '');

      // Generate job number
      const jobNumber = `JOB-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Get Supabase session token
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert('Session expired. Please log in again.');
        return;
      }

      // Prepare job order data for API
      const jobOrderData = {
        job_number: jobNumber,
        title: formData.title,
        customer_name: formData.companyName || formData.customer,
        customer_contact: formData.customer,
        customer_email: formData.customerEmail || null,
        salesperson_email: formData.salespersonEmail || null,
        job_type: formData.jobTypes.join(', '),
        location: formData.location,
        address: formData.address,
        description: fullDescription,
        assigned_to: formData.technicians.length > 0 ? formData.technicians[0] : null,
        foreman_name: formData.contactOnSite || null,
        foreman_phone: formData.contactPhone || null,
        salesman_name: formData.salesman || null,
        priority: formData.priority,
        scheduled_date: formData.startDate,
        arrival_time: formData.arrivalTime,
        shop_arrival_time: formData.shopArrivalTime,
        estimated_hours: parseFloat(formData.estimatedHours) || 8,
        required_documents: formData.requiredDocuments,
        equipment_needed: formData.equipment,
        job_site_number: formData.jobSiteNumber || null,
        po_number: formData.po || null,
        customer_job_number: formData.customerJobNumber || null,
        job_quote: formData.jobQuote || null,
        difficulty_rating: formData.difficulty_rating,
        truck_parking: formData.truck_parking,
        work_environment: formData.work_environment,
        site_cleanliness: formData.site_cleanliness,
      };

      // Save to database via API
      const response = await fetch('/api/admin/job-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(jobOrderData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create job order');
      }

      console.log('Job order created successfully:', result.data);

      // Show success modal
      setCreatedJobId(jobNumber);
      setShowSuccessModal(true);

      // Auto-redirect to dashboard after 3 seconds
      setTimeout(() => {
        router.push('/dashboard/admin');
      }, 3000);

      // Reset form
      setFormData({
      title: '',
      customer: '',
      companyName: '',
      customerEmail: '',
      salespersonEmail: '',
      jobTypes: [],
      location: '',
      address: '',
      estimatedDriveHours: 0,
      estimatedDriveMinutes: 0,
      status: 'scheduled',
      priority: 'medium',
      difficulty_rating: 5,
      truck_parking: 'close',
      work_environment: 'outdoor',
      site_cleanliness: 5,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      arrivalTime: '08:00',
      shopArrivalTime: '',
      estimatedHours: '8.00',
      technicians: [],
      salesman: '',
      description: '',
      additionalInfo: '',
      jobTypeDetails: {},
      equipment: [],
      requiredDocuments: ['silica-dust-control'], // Silica Dust Control always required
      jobSiteNumber: '',
      po: '',
      customerJobNumber: '',
      contactOnSite: '',
      contactPhone: '',
      jobSiteGC: '',
      jobQuote: undefined
    });
    } catch (error: any) {
      console.error('Error creating job order:', error);
      alert(`Failed to create job order: ${error.message}`);
    }
  };

  const filteredEquipment = commonEquipment.filter(item =>
    item.toLowerCase().includes(equipmentSearch.toLowerCase())
  );

  return (
    <AdminProtection>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50">
      {/* Global input text color fix */}
      <style jsx global>{`
        input[type="text"],
        input[type="tel"],
        input[type="date"],
        input[type="time"],
        input[type="number"],
        textarea,
        select,
        option {
          color: #111827 !important;
        }
        input::placeholder,
        textarea::placeholder {
          color: #9ca3af !important;
        }
        /* Ensure disabled inputs are also visible */
        input:disabled,
        select:disabled {
          color: #6b7280 !important;
          background-color: #f3f4f6 !important;
        }
        /* Modal animations */
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
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>

      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Header */}
      <div className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard/admin"
              className="group flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-2xl transition-all duration-300 font-medium shadow-lg hover:scale-105"
            >
              <svg className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Admin Dashboard</span>
            </Link>

            <div className="text-center">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-600 via-red-600 to-orange-600 bg-clip-text text-transparent">
                Dispatch & Scheduling
              </h1>
              <p className="text-sm text-gray-600 font-medium">Create and manage job orders</p>
            </div>

            <div className="w-40"></div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 relative">
        {/* Tab Navigation */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-gray-200/50 mb-6 p-2 inline-flex">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
              activeTab === 'create'
                ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Create Job Order
          </button>
          <Link
            href="/dashboard/admin/schedule-board"
            className="px-6 py-3 rounded-xl font-semibold transition-all duration-300 text-gray-600 hover:text-gray-800 hover:bg-gray-50"
          >
            View All Jobs
          </Link>
        </div>

        {activeTab === 'create' ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Progress Indicator */}
            <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Form Progress</span>
                <span className="text-sm font-semibold text-orange-600">Step {currentStep} of {totalSteps}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-orange-500 to-red-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Step 1: Basic Information */}
            {currentStep === 1 && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 overflow-visible">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                Step 1: Basic Information
              </h2>

              <div className="space-y-6">
                {/* Job Types */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Job Type(s) * <span className="text-gray-500 text-xs">(Select all that apply)</span>
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {jobTypes.map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleJobType(type)}
                        className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 border-2 ${
                          formData.jobTypes.includes(type)
                            ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white border-orange-600 shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                  {formData.jobTypes.length > 0 && (
                    <p className="text-sm text-orange-600 mt-2 font-medium">
                      Selected: {formData.jobTypes.join(', ')}
                    </p>
                  )}
                </div>

                {/* Job Difficulty Rating */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Job Difficulty Rating (1-10) *
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => handleInputChange('difficulty_rating', rating)}
                        className={`flex-1 py-3 px-2 rounded-xl font-bold text-sm transition-all ${
                          formData.difficulty_rating === rating
                            ? rating <= 3
                              ? 'bg-orange-500 text-white shadow-lg scale-105'
                              : rating <= 6
                              ? 'bg-yellow-500 text-white shadow-lg scale-105'
                              : rating <= 8
                              ? 'bg-orange-500 text-white shadow-lg scale-105'
                              : 'bg-red-500 text-white shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-2 px-1">
                    <span>Easy</span>
                    <span>Moderate</span>
                    <span>Hard</span>
                    <span>Very Hard</span>
                  </div>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Priority *
                  </label>
                  <div className="flex gap-3">
                    {(['high', 'medium', 'low'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleInputChange('priority', p)}
                        className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-200 border-2 ${
                          formData.priority === p
                            ? p === 'high'
                              ? 'bg-red-500 text-white border-red-600'
                              : p === 'medium'
                              ? 'bg-yellow-500 text-white border-yellow-600'
                              : 'bg-orange-500 text-white border-orange-600'
                            : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* How close can truck park to work area */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    How close can truck park to work area? *
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleInputChange('truck_parking', 'close')}
                      className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-200 border-2 ${
                        formData.truck_parking === 'close'
                          ? 'bg-green-500 text-white border-green-600'
                          : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      Close (Under 300 ft)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInputChange('truck_parking', 'far')}
                      className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-200 border-2 ${
                        formData.truck_parking === 'far'
                          ? 'bg-orange-500 text-white border-orange-600'
                          : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      Far (Unload & Carry Equipment)
                    </button>
                  </div>
                </div>

                {/* Work Environment */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Work Environment *
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleInputChange('work_environment', 'outdoor')}
                      className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-200 border-2 ${
                        formData.work_environment === 'outdoor'
                          ? 'bg-blue-500 text-white border-blue-600'
                          : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      Outdoor
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInputChange('work_environment', 'indoor')}
                      className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all duration-200 border-2 ${
                        formData.work_environment === 'indoor'
                          ? 'bg-purple-500 text-white border-purple-600'
                          : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                      }`}
                    >
                      Indoor
                    </button>
                  </div>
                </div>

                {/* Site Cleanliness */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Site Cleanliness (1-10) *
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => handleInputChange('site_cleanliness', rating)}
                        className={`flex-1 py-3 px-2 rounded-xl font-bold text-sm transition-all ${
                          formData.site_cleanliness === rating
                            ? rating <= 3
                              ? 'bg-red-500 text-white shadow-lg scale-105'
                              : rating <= 6
                              ? 'bg-yellow-500 text-white shadow-lg scale-105'
                              : 'bg-green-500 text-white shadow-lg scale-105'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-2 px-1">
                    <span>Dirty</span>
                    <span>Moderate</span>
                    <span>Clean</span>
                    <span>Very Clean</span>
                  </div>
                </div>
              </div>

              {/* Job Site Conditions Summary - Live Preview */}
              <div className="mt-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border-2 border-blue-200">
                <h3 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  JOB SITE CONDITIONS SUMMARY
                </h3>
                <div className="bg-white rounded-xl p-4 font-mono text-sm text-gray-700 whitespace-pre-wrap">
                  {`Activity: ${formData.jobTypes.length > 0 ? formData.jobTypes.join(', ') : 'None selected'}\n`}
                  {`Job Difficulty: ${formData.difficulty_rating}/10\n`}
                  {`Priority: ${formData.priority.toUpperCase()}\n`}
                  {`Truck Parking: ${formData.truck_parking === 'close' ? 'Close (Under 300 ft)' : 'Far (Unload & Carry Equipment)'}\n`}
                  {`Work Environment: ${formData.work_environment === 'indoor' ? 'Indoor' : 'Outdoor'}\n`}
                  {`Site Cleanliness: ${formData.site_cleanliness}/10`}
                </div>
                <p className="text-xs text-blue-600 mt-2">This summary will be shown to operators on their job tickets.</p>
              </div>

              {/* Navigation Buttons */}
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  disabled={formData.jobTypes.length === 0}
                  className={`px-8 py-3 rounded-xl font-semibold transition-all ${
                    formData.jobTypes.length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-orange-500 to-red-600 text-white hover:shadow-lg hover:scale-[1.02]'
                  }`}
                >
                  Next →
                </button>
              </div>
            </div>
            )}

            {/* Step 2: Job Type Details - Only show if job types are selected */}
            {currentStep === 2 && formData.jobTypes.length > 0 && (
              <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 overflow-visible">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  Step 2: Work Details (Estimate Style)
                </h2>

                <div className="space-y-8">
                  {formData.jobTypes.map((jobType, idx) => {
                    const config = jobTypeConfig[jobType];
                    if (!config) return null;

                    return (
                      <div key={jobType} className="border-2 border-orange-200 rounded-2xl p-6 bg-orange-50/50 overflow-visible">
                        <h3 className="text-lg font-bold text-orange-800 mb-4 flex items-center gap-2">
                          <span className="w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center text-sm">
                            {idx + 1}
                          </span>
                          {jobType}
                        </h3>

                        <div className="space-y-4 overflow-visible">
                          {config.fields.map(field => {
                            // Skip conditional fields if condition not met
                            if (field.type === 'conditional') {
                              const conditionField = field.condition;
                              const conditionValue = field.conditionValue;
                              if (conditionField && formData.jobTypeDetails[jobType]?.[conditionField] !== conditionValue) {
                                return null;
                              }
                            }

                            return (
                            <div key={field.name} className={field.type === 'multiselect' ? 'md:col-span-2' : ''}>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">
                                {field.label}
                              </label>

                              {/* Multi-select field */}
                              {field.type === 'multiselect' && field.options ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                  {field.options.map(option => {
                                    const currentValues = formData.jobTypeDetails[jobType]?.[field.name] || [];
                                    const isSelected = Array.isArray(currentValues) && currentValues.includes(option);

                                    return (
                                      <button
                                        key={option}
                                        type="button"
                                        onClick={() => {
                                          const currentVals = formData.jobTypeDetails[jobType]?.[field.name] || [];
                                          const newVals = Array.isArray(currentVals)
                                            ? currentVals.includes(option)
                                              ? currentVals.filter((v: string) => v !== option)
                                              : [...currentVals, option]
                                            : [option];
                                          handleJobTypeDetailChange(jobType, field.name, newVals);
                                        }}
                                        className={`p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                                          isSelected
                                            ? 'bg-orange-100 border-orange-400 shadow-lg shadow-orange-200'
                                            : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                                            isSelected
                                              ? 'bg-orange-500 border-orange-500'
                                              : 'bg-white border-gray-300'
                                          }`}>
                                            {isSelected && (
                                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                              </svg>
                                            )}
                                          </div>
                                          <span className={`font-semibold text-sm ${
                                            isSelected ? 'text-orange-800' : 'text-gray-700'
                                          }`}>
                                            {option}
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : field.type === 'yes-no-buttons' ? (
                                /* Yes/No button selection */
                                <div className="grid grid-cols-2 gap-3">
                                  {['Yes', 'No'].map(option => {
                                    const currentValue = formData.jobTypeDetails[jobType]?.[field.name] || '';
                                    const isSelected = currentValue === option;

                                    return (
                                      <button
                                        key={option}
                                        type="button"
                                        onClick={() => {
                                          handleJobTypeDetailChange(jobType, field.name, option);
                                        }}
                                        className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                                          isSelected
                                            ? option === 'Yes'
                                              ? 'bg-orange-100 border-orange-500 shadow-lg shadow-orange-200'
                                              : 'bg-red-100 border-red-500 shadow-lg shadow-red-200'
                                            : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                                        }`}
                                      >
                                        <div className="flex items-center justify-center gap-3">
                                          <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                            isSelected
                                              ? option === 'Yes'
                                                ? 'bg-orange-500 border-orange-500'
                                                : 'bg-red-500 border-red-500'
                                              : 'bg-white border-gray-400'
                                          }`}>
                                            {isSelected && (
                                              <div className="w-3 h-3 bg-white rounded-full"></div>
                                            )}
                                          </div>
                                          <span className={`font-bold text-lg ${
                                            isSelected
                                              ? option === 'Yes'
                                                ? 'text-orange-800'
                                                : 'text-red-800'
                                              : 'text-gray-800'
                                          }`}>
                                            {option}
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : field.type === 'material-buttons' && field.options ? (
                                /* Material selection with buttons - single select */
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                  {field.options.map(option => {
                                    const currentValue = formData.jobTypeDetails[jobType]?.[field.name] || '';
                                    const isSelected = currentValue === option;

                                    return (
                                      <button
                                        key={option}
                                        type="button"
                                        onClick={() => {
                                          handleJobTypeDetailChange(jobType, field.name, option);
                                        }}
                                        className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                                          isSelected
                                            ? 'bg-blue-100 border-blue-500 shadow-lg shadow-blue-200'
                                            : 'bg-white border-gray-300 hover:bg-orange-50 hover:border-orange-300'
                                        }`}
                                      >
                                        <div className="flex items-center gap-3">
                                          <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                            isSelected
                                              ? 'bg-orange-500 border-orange-500'
                                              : 'bg-white border-gray-400'
                                          }`}>
                                            {isSelected && (
                                              <div className="w-3 h-3 bg-white rounded-full"></div>
                                            )}
                                          </div>
                                          <span className={`font-bold text-base ${
                                            isSelected ? 'text-blue-800' : 'text-gray-800'
                                          }`}>
                                            {option}
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : field.type === 'select' && field.options ? (
                                /* Single select dropdown */
                                <select
                                  value={formData.jobTypeDetails[jobType]?.[field.name] || ''}
                                  onChange={(e) => handleJobTypeDetailChange(jobType, field.name, e.target.value)}
                                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 text-gray-900 font-medium cursor-pointer relative z-10"
                                >
                                  <option value="">{field.placeholder}</option>
                                  {field.options.map(option => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              ) : field.type === 'core-drilling-holes' ? (
                                /* Core drilling holes */
                                <div className="space-y-4">
                                  {((formData.jobTypeDetails[jobType]?.holes as any[]) || []).map((hole, idx) => (
                                    <div key={idx} className="border-2 border-orange-200 rounded-xl p-4 bg-orange-50/50">
                                      <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-bold text-orange-800">Hole Set {idx + 1}</h4>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const currentHoles = formData.jobTypeDetails[jobType]?.holes || [];
                                            const newHoles = (currentHoles as any[]).filter((_, i) => i !== idx);
                                            handleJobTypeDetailChange(jobType, 'holes', newHoles);
                                          }}
                                          className="p-1 hover:bg-orange-200 rounded-lg transition-colors"
                                        >
                                          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                      <div className="grid md:grid-cols-3 gap-3">
                                        <div>
                                          <label className="block text-xs font-semibold text-gray-700 mb-1">Number of Holes</label>
                                          <input
                                            type="text"
                                            value={hole.quantity || ''}
                                            onChange={(e) => {
                                              const currentHoles = [...((formData.jobTypeDetails[jobType]?.holes || []) as any[])];
                                              currentHoles[idx] = { ...currentHoles[idx], quantity: e.target.value };
                                              handleJobTypeDetailChange(jobType, 'holes', currentHoles);
                                            }}
                                            className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                            placeholder="e.g., 6"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-semibold text-gray-700 mb-1">Diameter (inches)</label>
                                          <input
                                            type="text"
                                            value={hole.diameter || ''}
                                            onChange={(e) => {
                                              const currentHoles = [...((formData.jobTypeDetails[jobType]?.holes || []) as any[])];
                                              currentHoles[idx] = { ...currentHoles[idx], diameter: e.target.value };
                                              handleJobTypeDetailChange(jobType, 'holes', currentHoles);
                                            }}
                                            className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                            placeholder="e.g., 4&quot;"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-semibold text-gray-700 mb-1">Depth (inches)</label>
                                          <input
                                            type="text"
                                            value={hole.depth || ''}
                                            onChange={(e) => {
                                              const currentHoles = [...((formData.jobTypeDetails[jobType]?.holes || []) as any[])];
                                              currentHoles[idx] = { ...currentHoles[idx], depth: e.target.value };
                                              handleJobTypeDetailChange(jobType, 'holes', currentHoles);
                                            }}
                                            className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                            placeholder="e.g., 12&quot;"
                                          />
                                        </div>
                                      </div>
                                      <div className="mt-3 flex items-center gap-2 bg-orange-50 border-2 border-orange-200 rounded-lg p-3">
                                        <input
                                          type="checkbox"
                                          id={`above-5ft-${idx}`}
                                          checked={hole.aboveFiveFeet || false}
                                          onChange={(e) => {
                                            const currentHoles = [...((formData.jobTypeDetails[jobType]?.holes || []) as any[])];
                                            currentHoles[idx] = { ...currentHoles[idx], aboveFiveFeet: e.target.checked };
                                            handleJobTypeDetailChange(jobType, 'holes', currentHoles);
                                          }}
                                          className="w-4 h-4 text-orange-600 bg-white border-gray-300 rounded focus:ring-orange-500"
                                        />
                                        <label htmlFor={`above-5ft-${idx}`} className="text-sm font-semibold text-blue-900">
                                          Above 5 feet? (Ladder/Lift needed)
                                        </label>
                                      </div>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentHoles = formData.jobTypeDetails[jobType]?.holes || [];
                                      const newHoles = [...(currentHoles as any[]), { quantity: '', diameter: '', depth: '', aboveFiveFeet: false }];
                                      handleJobTypeDetailChange(jobType, 'holes', newHoles);
                                    }}
                                    className="w-full py-3 bg-gradient-to-r from-orange-100 to-orange-200 hover:from-orange-200 hover:to-orange-300 border-2 border-orange-300 text-orange-800 rounded-xl font-bold transition-all"
                                  >
                                    + Add Another Hole Configuration
                                  </button>
                                </div>
                              ) : field.type === 'wall-cutting-cuts' ? (
                                /* Wall cutting cuts */
                                <div className="space-y-4">
                                  {((formData.jobTypeDetails[jobType]?.cuts as any[]) || []).map((cut, idx) => (
                                    <div key={idx} className="border-2 border-orange-200 rounded-xl p-4 bg-orange-50/50">
                                      <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-bold text-orange-800">Cut Set {idx + 1}</h4>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const currentCuts = formData.jobTypeDetails[jobType]?.cuts || [];
                                            const newCuts = (currentCuts as any[]).filter((_, i) => i !== idx);
                                            handleJobTypeDetailChange(jobType, 'cuts', newCuts);
                                          }}
                                          className="p-1 hover:bg-orange-200 rounded-lg transition-colors"
                                        >
                                          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                      <div className="space-y-3">
                                        {/* Quantity Field */}
                                        <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-3">
                                          <label className="block text-xs font-semibold text-blue-800 mb-1">How Many Areas (Quantity)</label>
                                          <input
                                            type="number"
                                            min="1"
                                            value={cut.quantity || '1'}
                                            onChange={(e) => {
                                              const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                              currentCuts[idx] = { ...currentCuts[idx], quantity: e.target.value };
                                              handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                            }}
                                            className="w-full px-3 py-2 bg-white border-2 border-blue-300 rounded-lg text-sm text-gray-900 font-bold"
                                            placeholder="e.g., 10"
                                          />
                                          <p className="text-xs text-blue-700 mt-1">Enter the number of identical openings (e.g., 10 for ten 10x10 openings)</p>
                                        </div>

                                        {/* Opening Size and Dimensions */}
                                        <div className="grid md:grid-cols-4 gap-3">
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Opening Size</label>
                                            <input
                                              type="text"
                                              value={cut.openingSize || ''}
                                              onChange={(e) => {
                                                const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                currentCuts[idx] = { ...currentCuts[idx], openingSize: e.target.value };
                                                handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                              }}
                                              className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                              placeholder="e.g., Standard"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Length (feet)</label>
                                            <input
                                              type="text"
                                              value={cut.length || ''}
                                              onChange={(e) => {
                                                const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                currentCuts[idx] = { ...currentCuts[idx], length: e.target.value };
                                                handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                              }}
                                              className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                              placeholder="e.g., 3"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Width (feet)</label>
                                            <input
                                              type="text"
                                              value={cut.width || ''}
                                              onChange={(e) => {
                                                const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                currentCuts[idx] = { ...currentCuts[idx], width: e.target.value };
                                                handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                              }}
                                              className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                              placeholder="e.g., 4"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Thickness (inches)</label>
                                            <input
                                              type="text"
                                              value={cut.thickness || ''}
                                              onChange={(e) => {
                                                const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                currentCuts[idx] = { ...currentCuts[idx], thickness: e.target.value };
                                                handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                              }}
                                              className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                              placeholder="e.g., 8"
                                            />
                                          </div>
                                        </div>

                                        {/* Removing Material Checkbox */}
                                        <div className="flex items-center gap-3 pt-2">
                                          <input
                                            type="checkbox"
                                            id={`removing-${idx}`}
                                            checked={cut.removing || false}
                                            onChange={(e) => {
                                              const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                              currentCuts[idx] = { ...currentCuts[idx], removing: e.target.checked };
                                              handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                            }}
                                            className="w-5 h-5 text-orange-600 bg-white border-2 border-gray-300 rounded focus:ring-orange-500 focus:ring-2"
                                          />
                                          <label htmlFor={`removing-${idx}`} className="text-sm font-semibold text-gray-700">
                                            Removing Material
                                          </label>
                                        </div>

                                        {/* Equipment Selection (conditional) */}
                                        {cut.removing && (
                                          <div className="mt-3 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                                            <label className="block text-sm font-bold text-yellow-900 mb-3">Equipment On Site</label>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                              {['Forklift', '6k lull', '8k lull', '10k lull', 'Other'].map(equipmentOption => {
                                                const isSelected = cut.equipment === equipmentOption;
                                                return (
                                                  <button
                                                    key={equipmentOption}
                                                    type="button"
                                                    onClick={() => {
                                                      const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                      currentCuts[idx] = { ...currentCuts[idx], equipment: equipmentOption };
                                                      handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                                    }}
                                                    className={`p-3 rounded-lg border-2 transition-all duration-200 ${
                                                      isSelected
                                                        ? 'bg-yellow-500 border-yellow-600 shadow-lg'
                                                        : 'bg-white border-yellow-400 hover:bg-yellow-100 hover:border-yellow-500'
                                                    }`}
                                                  >
                                                    <div className="flex items-center gap-2">
                                                      <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                        isSelected
                                                          ? 'bg-white border-white'
                                                          : 'bg-white border-yellow-600'
                                                      }`}>
                                                        {isSelected && (
                                                          <div className="w-3 h-3 bg-yellow-600 rounded-full"></div>
                                                        )}
                                                      </div>
                                                      <span className={`font-bold text-sm ${
                                                        isSelected ? 'text-white' : 'text-yellow-900'
                                                      }`}>
                                                        {equipmentOption}
                                                      </span>
                                                    </div>
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentCuts = formData.jobTypeDetails[jobType]?.cuts || [];
                                      const newCuts = [...(currentCuts as any[]), { quantity: '1', openingSize: '', length: '', width: '', thickness: '', removing: false, equipment: '' }];
                                      handleJobTypeDetailChange(jobType, 'cuts', newCuts);
                                    }}
                                    className="w-full py-3 bg-gradient-to-r from-orange-100 to-orange-200 hover:from-orange-200 hover:to-orange-300 border-2 border-orange-300 text-orange-800 rounded-xl font-bold transition-all"
                                  >
                                    + Add Another Cut Configuration
                                  </button>
                                </div>
                              ) : field.type === 'slab-sawing-cuts' || field.type === 'hand-sawing-cuts' ? (
                                /* Slab sawing and hand sawing cuts */
                                <div className="space-y-4">
                                  {((formData.jobTypeDetails[jobType]?.cuts as any[]) || []).map((cut, idx) => (
                                    <div key={idx} className="border-2 border-orange-200 rounded-xl p-4 bg-orange-50/50">
                                      <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-bold text-orange-800">Cut Set {idx + 1}</h4>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const currentCuts = formData.jobTypeDetails[jobType]?.cuts || [];
                                            const newCuts = (currentCuts as any[]).filter((_, i) => i !== idx);
                                            handleJobTypeDetailChange(jobType, 'cuts', newCuts);
                                          }}
                                          className="p-1 hover:bg-orange-200 rounded-lg transition-colors"
                                        >
                                          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>

                                      {/* Show type selection for slab sawing and hand sawing */}
                                      {(field.type === 'slab-sawing-cuts' || field.type === 'hand-sawing-cuts') && (
                                        <div className="mb-4">
                                          <label className="block text-xs font-bold text-gray-800 mb-2">Cut Type</label>
                                          <div className="grid grid-cols-2 gap-2">
                                            {['Linear Feet', 'Areas'].map(cutType => {
                                              const isSelected = (cut.cutType || 'Linear Feet') === cutType;
                                              return (
                                                <button
                                                  key={cutType}
                                                  type="button"
                                                  onClick={() => {
                                                    const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                    currentCuts[idx] = { ...currentCuts[idx], cutType: cutType };
                                                    handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                                  }}
                                                  className={`p-3 rounded-lg border-2 transition-all duration-200 ${
                                                    isSelected
                                                      ? 'bg-orange-100 border-orange-500 shadow-lg shadow-orange-200'
                                                      : 'bg-white border-gray-300 hover:bg-orange-50 hover:border-orange-300'
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-2 justify-center">
                                                    <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                      isSelected
                                                        ? 'bg-orange-500 border-orange-500'
                                                        : 'bg-white border-gray-400'
                                                    }`}>
                                                      {isSelected && (
                                                        <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                                                      )}
                                                    </div>
                                                    <span className={`font-bold text-sm ${
                                                      isSelected ? 'text-orange-800' : 'text-gray-800'
                                                    }`}>
                                                      {cutType}
                                                    </span>
                                                  </div>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      {/* Conditional fields based on cut type */}
                                      {(field.type === 'slab-sawing-cuts' || field.type === 'hand-sawing-cuts') && (cut.cutType === 'Areas' || cut.cutType === undefined) ? (
                                        // Areas mode: Quantity, Length, Width, Thickness
                                        (cut.cutType === 'Areas') && (
                                          <>
                                            {/* Quantity */}
                                            <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-3 mb-3">
                                              <label className="block text-xs font-semibold text-blue-800 mb-1">How Many Areas (Quantity)</label>
                                              <input
                                                type="number"
                                                min="1"
                                                value={cut.quantity || '1'}
                                                onChange={(e) => {
                                                  const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                  currentCuts[idx] = { ...currentCuts[idx], quantity: e.target.value };
                                                  handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                                }}
                                                className="w-full px-3 py-2 bg-white border-2 border-blue-300 rounded-lg text-sm text-gray-900 font-bold"
                                                placeholder="e.g., 10"
                                              />
                                              <p className="text-xs text-blue-700 mt-1">Enter the number of identical areas (e.g., 10 for ten 10x8 areas)</p>
                                            </div>

                                            {/* Dimensions */}
                                            <div className="grid md:grid-cols-3 gap-3">
                                              <div>
                                                <label className="block text-xs font-semibold text-gray-700 mb-1">Length (feet)</label>
                                                <input
                                                  type="text"
                                                  value={cut.length || ''}
                                                  onChange={(e) => {
                                                    const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                    currentCuts[idx] = { ...currentCuts[idx], length: e.target.value };
                                                    handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                                  }}
                                                  className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                                  placeholder="e.g., 10"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-xs font-semibold text-gray-700 mb-1">Width (feet)</label>
                                                <input
                                                  type="text"
                                                  value={cut.width || ''}
                                                  onChange={(e) => {
                                                    const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                    currentCuts[idx] = { ...currentCuts[idx], width: e.target.value };
                                                    handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                                  }}
                                                  className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                                  placeholder="e.g., 8"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-xs font-semibold text-gray-700 mb-1">Thickness (inches)</label>
                                                <input
                                                  type="text"
                                                  value={cut.thickness || ''}
                                                  onChange={(e) => {
                                                    const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                    currentCuts[idx] = { ...currentCuts[idx], thickness: e.target.value };
                                                    handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                                  }}
                                                  className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                                  placeholder="e.g., 6"
                                                />
                                              </div>
                                            </div>
                                          </>
                                        )
                                      ) : (
                                        // Linear Feet mode (default for hand sawing and slab sawing)
                                        <div className="grid md:grid-cols-2 gap-3">
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Linear Feet</label>
                                            <input
                                              type="text"
                                              value={cut.linearFeet || ''}
                                              onChange={(e) => {
                                                const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                currentCuts[idx] = { ...currentCuts[idx], linearFeet: e.target.value };
                                                handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                              }}
                                              className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                              placeholder="e.g., 100"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">{field.type === 'slab-sawing-cuts' ? 'Thickness (inches)' : 'Depth of Cut (inches)'}</label>
                                            <input
                                              type="text"
                                              value={cut.thickness || ''}
                                              onChange={(e) => {
                                                const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                currentCuts[idx] = { ...currentCuts[idx], thickness: e.target.value };
                                                handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                              }}
                                              className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                              placeholder="e.g., 6&quot;"
                                            />
                                          </div>
                                        </div>
                                      )}

                                      {/* Removing Material Checkbox - For Slab Sawing and Hand Sawing */}
                                      {(field.type === 'slab-sawing-cuts' || field.type === 'hand-sawing-cuts') && (
                                        <>
                                          <div className="flex items-center gap-3 pt-3">
                                            <input
                                              type="checkbox"
                                              id={`removing-${idx}`}
                                              checked={cut.removing || false}
                                              onChange={(e) => {
                                                const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                currentCuts[idx] = { ...currentCuts[idx], removing: e.target.checked };
                                                handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                              }}
                                              className="w-5 h-5 text-orange-600 bg-white border-2 border-gray-300 rounded focus:ring-orange-500 focus:ring-2"
                                            />
                                            <label htmlFor={`removing-${idx}`} className="text-sm font-semibold text-gray-700">
                                              Removing Material
                                            </label>
                                          </div>

                                          {/* Equipment Selection (conditional) - Allow Multiple Selections */}
                                          {cut.removing && (
                                            <div className="mt-3 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                                              <label className="block text-sm font-bold text-yellow-900 mb-3">Equipment On Site (Select All That Apply)</label>
                                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {['Dolly Hand Removal', 'Sherpa', 'Skidsteer', 'Forklift', 'A Frame'].map(equipmentOption => {
                                                  const equipmentArray = cut.equipment || [];
                                                  const isSelected = Array.isArray(equipmentArray)
                                                    ? equipmentArray.includes(equipmentOption)
                                                    : equipmentArray === equipmentOption; // Backward compatibility
                                                  return (
                                                    <button
                                                      key={equipmentOption}
                                                      type="button"
                                                      onClick={() => {
                                                        const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                                        let currentEquipment = currentCuts[idx].equipment || [];

                                                        // Convert to array if it's a string (backward compatibility)
                                                        if (typeof currentEquipment === 'string') {
                                                          currentEquipment = currentEquipment ? [currentEquipment] : [];
                                                        }

                                                        // Toggle selection
                                                        if (currentEquipment.includes(equipmentOption)) {
                                                          currentEquipment = currentEquipment.filter((eq: string) => eq !== equipmentOption);
                                                        } else {
                                                          currentEquipment = [...currentEquipment, equipmentOption];
                                                        }

                                                        currentCuts[idx] = { ...currentCuts[idx], equipment: currentEquipment };
                                                        handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                                      }}
                                                      className={`p-3 rounded-lg border-2 transition-all duration-200 ${
                                                        isSelected
                                                          ? 'bg-yellow-500 border-yellow-600 shadow-lg'
                                                          : 'bg-white border-yellow-400 hover:bg-yellow-100 hover:border-yellow-500'
                                                      }`}
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                                                          isSelected
                                                            ? 'bg-white border-white'
                                                            : 'bg-white border-yellow-600'
                                                        }`}>
                                                          {isSelected && (
                                                            <svg className="w-3.5 h-3.5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                          )}
                                                        </div>
                                                        <span className={`font-bold text-sm ${
                                                          isSelected ? 'text-white' : 'text-yellow-900'
                                                        }`}>
                                                          {equipmentOption}
                                                        </span>
                                                      </div>
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentCuts = formData.jobTypeDetails[jobType]?.cuts || [];
                                      const newCuts = [...(currentCuts as any[]), { linearFeet: '', thickness: '' }];
                                      handleJobTypeDetailChange(jobType, 'cuts', newCuts);
                                    }}
                                    className="w-full py-3 bg-gradient-to-r from-orange-100 to-orange-200 hover:from-orange-200 hover:to-orange-300 border-2 border-orange-300 text-orange-800 rounded-xl font-bold transition-all"
                                  >
                                    + Add Another Cut Configuration
                                  </button>
                                </div>
                              ) : field.type === 'wire-sawing-cuts' ? (
                                /* Wire sawing cuts */
                                <div className="space-y-4">
                                  {((formData.jobTypeDetails[jobType]?.cuts as any[]) || []).map((cut, idx) => (
                                    <div key={idx} className="border-2 border-orange-200 rounded-xl p-4 bg-orange-50/50">
                                      <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-bold text-orange-800">Cut {idx + 1}</h4>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const currentCuts = formData.jobTypeDetails[jobType]?.cuts || [];
                                            const newCuts = (currentCuts as any[]).filter((_, i) => i !== idx);
                                            handleJobTypeDetailChange(jobType, 'cuts', newCuts);
                                          }}
                                          className="p-1 hover:bg-orange-200 rounded-lg transition-colors"
                                        >
                                          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                      <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Cut Description/Dimensions</label>
                                        <input
                                          type="text"
                                          value={cut.description || ''}
                                          onChange={(e) => {
                                            const currentCuts = [...((formData.jobTypeDetails[jobType]?.cuts || []) as any[])];
                                            currentCuts[idx] = { ...currentCuts[idx], description: e.target.value };
                                            handleJobTypeDetailChange(jobType, 'cuts', currentCuts);
                                          }}
                                          className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                          placeholder="e.g., Beam section 10&apos;x12&apos;"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentCuts = formData.jobTypeDetails[jobType]?.cuts || [];
                                      const newCuts = [...(currentCuts as any[]), { description: '' }];
                                      handleJobTypeDetailChange(jobType, 'cuts', newCuts);
                                    }}
                                    className="w-full py-3 bg-gradient-to-r from-orange-100 to-orange-200 hover:from-orange-200 hover:to-orange-300 border-2 border-orange-300 text-orange-800 rounded-xl font-bold transition-all"
                                  >
                                    + Add Another Cut
                                  </button>
                                </div>
                              ) : field.type === 'demolition-areas' ? (
                                /* Demolition areas special field */
                                <div className="space-y-4">
                                  {((formData.jobTypeDetails[jobType]?.areas as any[]) || []).map((area, idx) => (
                                    <div key={idx} className="border-2 border-orange-200 rounded-xl p-4 bg-orange-50/50">
                                      <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-bold text-orange-800">Area {idx + 1}</h4>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const currentAreas = formData.jobTypeDetails[jobType]?.areas || [];
                                            const newAreas = (currentAreas as any[]).filter((_, i) => i !== idx);
                                            handleJobTypeDetailChange(jobType, 'areas', newAreas);
                                          }}
                                          className="p-1 hover:bg-orange-200 rounded-lg transition-colors"
                                        >
                                          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                      <div className="grid md:grid-cols-2 gap-3">
                                        <div>
                                          <label className="block text-xs font-semibold text-gray-700 mb-1">Area/Volume</label>
                                          <input
                                            type="text"
                                            value={area.areaVolume || ''}
                                            onChange={(e) => {
                                              const currentAreas = [...((formData.jobTypeDetails[jobType]?.areas || []) as any[])];
                                              currentAreas[idx] = { ...currentAreas[idx], areaVolume: e.target.value };
                                              handleJobTypeDetailChange(jobType, 'areas', currentAreas);
                                            }}
                                            className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                            placeholder="e.g., 100 sq ft"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-semibold text-gray-700 mb-1">Thickness (inches)</label>
                                          <input
                                            type="text"
                                            value={area.thickness || ''}
                                            onChange={(e) => {
                                              const currentAreas = [...((formData.jobTypeDetails[jobType]?.areas || []) as any[])];
                                              currentAreas[idx] = { ...currentAreas[idx], thickness: e.target.value };
                                              handleJobTypeDetailChange(jobType, 'areas', currentAreas);
                                            }}
                                            className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                            placeholder="e.g., 6"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-bold text-gray-800 mb-2">Material</label>
                                          <div className="grid grid-cols-3 gap-2">
                                            {demolitionMaterials.map(mat => {
                                              const isSelected = area.material === mat;
                                              return (
                                                <button
                                                  key={mat}
                                                  type="button"
                                                  onClick={() => {
                                                    const currentAreas = [...((formData.jobTypeDetails[jobType]?.areas || []) as any[])];
                                                    currentAreas[idx] = { ...currentAreas[idx], material: mat };
                                                    handleJobTypeDetailChange(jobType, 'areas', currentAreas);
                                                  }}
                                                  className={`p-3 rounded-lg border-2 transition-all duration-200 text-left ${
                                                    isSelected
                                                      ? 'bg-blue-100 border-blue-500 shadow-lg shadow-blue-200'
                                                      : 'bg-white border-gray-300 hover:bg-orange-50 hover:border-orange-300'
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                      isSelected
                                                        ? 'bg-orange-500 border-orange-500'
                                                        : 'bg-white border-gray-400'
                                                    }`}>
                                                      {isSelected && (
                                                        <div className="w-2.5 h-2.5 bg-white rounded-full"></div>
                                                      )}
                                                    </div>
                                                    <span className={`font-bold text-sm ${
                                                      isSelected ? 'text-blue-800' : 'text-gray-800'
                                                    }`}>
                                                      {mat}
                                                    </span>
                                                  </div>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>
                                        {area.material === 'Other' && (
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Other Material</label>
                                            <input
                                              type="text"
                                              value={area.materialOther || ''}
                                              onChange={(e) => {
                                                const currentAreas = [...((formData.jobTypeDetails[jobType]?.areas || []) as any[])];
                                                currentAreas[idx] = { ...currentAreas[idx], materialOther: e.target.value };
                                                handleJobTypeDetailChange(jobType, 'areas', currentAreas);
                                              }}
                                              className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                              placeholder="Specify material..."
                                            />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentAreas = formData.jobTypeDetails[jobType]?.areas || [];
                                      const newAreas = [...(currentAreas as any[]), { areaVolume: '', thickness: '', material: '', materialOther: '' }];
                                      handleJobTypeDetailChange(jobType, 'areas', newAreas);
                                    }}
                                    className="w-full py-3 bg-gradient-to-r from-orange-100 to-orange-200 hover:from-orange-200 hover:to-orange-300 border-2 border-orange-300 text-orange-800 rounded-xl font-bold transition-all"
                                  >
                                    + Add Another Area/Volume
                                  </button>
                                </div>
                              ) : (
                                /* Regular text input */
                                <input
                                  type="text"
                                  value={formData.jobTypeDetails[jobType]?.[field.name] || ''}
                                  onChange={(e) => handleJobTypeDetailChange(jobType, field.name, e.target.value)}
                                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 font-medium"
                                  placeholder={field.placeholder}
                                />
                              )}
                            </div>
                          )})}
                        </div>

                        {/* Live Preview of what will be in description */}
                        <div className="mt-4 p-4 bg-white rounded-xl border-2 border-gray-200">
                          <p className="text-xs font-semibold text-gray-500 mb-2">PREVIEW:</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                            {/* Job Site Conditions - shown first */}
                            {`JOB SITE CONDITIONS:\n`}
                            {`• Truck Parking: ${formData.truck_parking === 'close' ? 'Close (Under 300 ft)' : 'Far (Unload & Carry Equipment)'}\n`}
                            {`• Work Environment: ${formData.work_environment === 'indoor' ? 'Indoor' : 'Outdoor'}\n`}
                            {`• Site Cleanliness: ${formData.site_cleanliness}/10\n`}
                            {`• Job Difficulty: ${formData.difficulty_rating}/10\n`}
                            {`---\n`}
                            {jobType === 'CORE DRILLING' ? (
                              <>
                                {(() => {
                                  const details = formData.jobTypeDetails[jobType];
                                  const locations = details?.locations;
                                  if (locations && Array.isArray(locations) && locations.length > 0) {
                                    return `CORE DRILLING ON ${locations.join('/')}`;
                                  }
                                  return config.description;
                                })()}
                              </>
                            ) : (
                              config.description
                            )}
                            {Object.entries(formData.jobTypeDetails[jobType] || {}).some(([k, v]) => v && k !== 'locations') && (
                              <>
                                {'\n'}
                                {Object.entries(formData.jobTypeDetails[jobType] || {}).map(([key, value]) => {
                                  if (!value || key === 'locations') return null;
                                  const field = config.fields.find(f => f.name === key);
                                  if (!field) return null;

                                  // Handle structured arrays (holes, cuts, areas)
                                  if (key === 'holes' && Array.isArray(value)) {
                                    return value.map((hole: any, idx: number) => {
                                      if (hole.quantity || hole.diameter || hole.depth) {
                                        let holeDesc = `${hole.quantity || '?'} holes @ ${hole.diameter || '?'}" diameter x ${hole.depth || '?'}" deep`;
                                        if (hole.aboveFiveFeet) {
                                          holeDesc += ` (Above 5ft - Ladder/Lift Required)`;
                                        }
                                        return holeDesc + '\n';
                                      }
                                      return '';
                                    }).join('');
                                  } else if (key === 'cuts' && Array.isArray(value)) {
                                    if (jobType === 'WALL CUTTING') {
                                      return value.map((cut: any, idx: number) => {
                                        if (cut.openingSize || cut.length || cut.width || cut.thickness) {
                                          const quantity = cut.quantity || '1';
                                          const areaText = quantity === '1' ? '1 area' : `${quantity} areas`;
                                          let cutDesc = `${areaText} - Opening: ${cut.openingSize || '?'} - ${cut.length || '?'}' L x ${cut.width || '?'}' W x ${cut.thickness || '?'}" thick`;
                                          if (cut.removing) {
                                            cutDesc += ` | REMOVING MATERIAL`;
                                            if (cut.equipment) {
                                              cutDesc += ` - Equipment: ${cut.equipment}`;
                                            }
                                          }
                                          return cutDesc + '\n';
                                        }
                                        return '';
                                      }).join('');
                                    } else if (jobType === 'SLAB SAWING' || jobType === 'HAND SAWING') {
                                      return value.map((cut: any, idx: number) => {
                                        if ((jobType === 'SLAB SAWING' || jobType === 'HAND SAWING') && cut.cutType === 'Areas') {
                                          // Areas mode
                                          if (cut.length || cut.width || cut.thickness) {
                                            const quantity = cut.quantity || '1';
                                            const areaText = quantity === '1' ? '1 area' : `${quantity} areas`;
                                            let cutDesc = `${areaText} - ${cut.length || '?'}' L x ${cut.width || '?'}' W x ${cut.thickness || '?'}" thick`;
                                            if (cut.removing) {
                                              cutDesc += ` | REMOVING MATERIAL`;
                                              if (cut.equipment) {
                                                const equipmentList = Array.isArray(cut.equipment) ? cut.equipment.join(', ') : cut.equipment;
                                                cutDesc += ` - Equipment: ${equipmentList}`;
                                              }
                                            }
                                            return cutDesc + '\n';
                                          }
                                        } else if (cut.linearFeet || cut.thickness) {
                                          // Linear Feet mode (default)
                                          let cutDesc = `${cut.linearFeet || '?'} LF x ${cut.thickness || '?'}" ${jobType === 'SLAB SAWING' ? 'thick' : 'deep'}`;
                                          if ((jobType === 'SLAB SAWING' || jobType === 'HAND SAWING') && cut.removing) {
                                            cutDesc += ` | REMOVING MATERIAL`;
                                            if (cut.equipment) {
                                              const equipmentList = Array.isArray(cut.equipment) ? cut.equipment.join(', ') : cut.equipment;
                                              cutDesc += ` - Equipment: ${equipmentList}`;
                                            }
                                          }
                                          return cutDesc + '\n';
                                        }
                                        return '';
                                      }).join('');
                                    } else if (jobType === 'WIRE SAWING') {
                                      return value.map((cut: any, idx: number) => {
                                        if (cut.description) {
                                          return `${cut.description}\n`;
                                        }
                                        return '';
                                      }).join('');
                                    }
                                  } else if (key === 'areas' && Array.isArray(value)) {
                                    return value.map((area: any, idx: number) => {
                                      if (area.areaVolume || area.thickness || area.material) {
                                        return `Area ${idx + 1}: ${area.areaVolume || '?'} @ ${area.thickness || '?'}" - ${area.material || '?'}${area.materialOther ? ` (${area.materialOther})` : ''}\n`;
                                      }
                                      return '';
                                    }).join('');
                                  } else if (Array.isArray(value) && typeof value[0] === 'string') {
                                    // Simple string arrays (methods, locations, etc.)
                                    return `${field.label}: ${value.join(', ')}\n`;
                                  } else if (!Array.isArray(value)) {
                                    // Simple values
                                    return `${field.label}: ${value}\n`;
                                  }
                                  return '';
                                }).join('')}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Navigation Buttons */}
                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="px-8 py-3 rounded-xl font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-orange-500 to-red-600 text-white hover:shadow-lg transition-all"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Location Information */}
            {currentStep === 3 && isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 overflow-visible">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                Step 3: Location Information
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="relative">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Location Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.location}
                    onChange={(e) => {
                      handleInputChange('location', e.target.value);
                      setShowLocationDropdown(true);
                    }}
                    onFocus={() => setShowLocationDropdown(true)}
                    onBlur={() => setTimeout(() => setShowLocationDropdown(false), 200)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors"
                    placeholder="e.g., Downtown Construction Site"
                    autoComplete="off"
                  />
                  {showLocationDropdown && formData.location && locationSuggestions.filter(loc =>
                    loc.toLowerCase().includes(formData.location.toLowerCase())
                  ).length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-300 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {locationSuggestions
                        .filter(loc => loc.toLowerCase().includes(formData.location.toLowerCase()))
                        .map((loc, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              handleInputChange('location', loc);
                              setShowLocationDropdown(false);
                            }}
                            className="px-4 py-2 hover:bg-orange-50 cursor-pointer text-gray-800 border-b border-gray-100 last:border-b-0"
                          >
                            {loc}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Full Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors"
                    placeholder="e.g., 1199 PRINCE AVE, ATHENS, GA"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Estimated Drive Time
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Hours</label>
                      <input
                        type="number"
                        min="0"
                        max="24"
                        value={formData.estimatedDriveHours}
                        onChange={(e) => handleInputChange('estimatedDriveHours', parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-center font-semibold text-lg"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Minutes</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={formData.estimatedDriveMinutes}
                        onChange={(e) => handleInputChange('estimatedDriveMinutes', parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-center font-semibold text-lg"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Total: {formData.estimatedDriveHours}h {formData.estimatedDriveMinutes}m
                  </p>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-orange-500 to-red-600 text-white hover:shadow-lg transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
            )}

            {/* Step 4: Schedule Information */}
            {currentStep === 4 && isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 overflow-visible">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                Step 4: Schedule Information
              </h2>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                {/* START DATE with Calendar */}
                <div>
                  <label className="block text-sm font-bold text-indigo-800 mb-2">Start Date *</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={formData.startDate ? new Date(formData.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                      readOnly
                      onClick={() => setShowStartCalendar(!showStartCalendar)}
                      className="w-full px-4 py-4 bg-white border-2 border-indigo-300 rounded-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 font-semibold text-lg text-indigo-900 cursor-pointer"
                      placeholder="Click to select date"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStartCalendar(!showStartCalendar)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </button>

                    {/* Custom Calendar Popup */}
                    {showStartCalendar && renderCalendar(true)}
                  </div>
                  <p className="text-xs text-indigo-600 mt-1">📅 Click the calendar button to select date</p>
                </div>

                {/* END DATE with Calendar */}
                <div>
                  <label className="block text-sm font-bold text-purple-800 mb-2">End Date *</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={formData.endDate ? new Date(formData.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''}
                      readOnly
                      onClick={() => setShowEndCalendar(!showEndCalendar)}
                      className="w-full px-4 py-4 bg-white border-2 border-purple-300 rounded-xl focus:border-purple-600 focus:ring-4 focus:ring-purple-100 font-semibold text-lg text-purple-900 cursor-pointer"
                      placeholder="Click to select date"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEndCalendar(!showEndCalendar)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </button>

                    {/* Custom Calendar Popup */}
                    {showEndCalendar && renderCalendar(false)}
                  </div>
                  <p className="text-xs text-purple-600 mt-1">📅 Click the calendar button to select date</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Job Site Arrival Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.arrivalTime}
                    onChange={(e) => handleInputChange('arrivalTime', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                  <p className="text-xs text-gray-500 mt-1">When operator should arrive at job site</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Shop Arrival Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.shopArrivalTime}
                    onChange={(e) => handleInputChange('shopArrivalTime', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                  <p className="text-xs text-gray-500 mt-1 mb-2">When operator should be at shop</p>

                  {/* Quick Choose Buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => calculateShopArrival(30)}
                      className="px-3 py-1.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                    >
                      30 min before
                    </button>
                    <button
                      type="button"
                      onClick={() => calculateShopArrival(45)}
                      className="px-3 py-1.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                    >
                      45 min before
                    </button>
                    <button
                      type="button"
                      onClick={() => calculateShopArrival(60)}
                      className="px-3 py-1.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                    >
                      1 hr before
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Estimated Hours *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={formData.estimatedHours}
                    onChange={(e) => handleInputChange('estimatedHours', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                    placeholder="8.00"
                  />
                </div>
              </div>
              {/* Navigation Buttons */}
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(5)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-orange-500 to-red-600 text-white hover:shadow-lg transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
            )}

            {/* Step 5: Team Assignment */}
            {currentStep === 5 && isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 overflow-visible">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                Step 5: Team Assignment
              </h2>

              {/* Smart Operator Feature Card */}
              <div className="mb-6 p-5 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl border-2 border-indigo-200 shadow-lg">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-md">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-800">Smart Operator Assignment</h3>
                      <span className="px-2.5 py-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-bold rounded-full shadow">
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2 leading-relaxed">
                      Once operator profiles are configured, this system will intelligently recommend the best operators for each job based on:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                      <div className="flex items-center gap-2 bg-white/70 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-indigo-200">
                        <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs font-semibold text-gray-700">Operator Skillset</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/70 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-purple-200">
                        <svg className="w-4 h-4 text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-xs font-semibold text-gray-700">Job Difficulty</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/70 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-pink-200">
                        <svg className="w-4 h-4 text-pink-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs font-semibold text-gray-700">Priority Level</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 italic">
                      The system will only show operators qualified for the selected job type, ensuring optimal assignment every time.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Assign Operator/Technician(s) <span className="text-gray-500 text-xs">(Optional - Leave blank to assign later)</span>
                  </label>
                  {loadingTeam ? (
                    <div className="text-center py-8">
                      <div className="inline-block w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                      <p className="text-sm text-gray-500 mt-2">Loading operators...</p>
                    </div>
                  ) : operators.length === 0 ? (
                    <div className="text-center py-8 bg-yellow-50 rounded-xl border-2 border-yellow-200">
                      <p className="text-sm text-yellow-700 font-medium">No operators found</p>
                      <p className="text-xs text-yellow-600 mt-1">Please add operators with the "operator" role in the system</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {operators.map(op => (
                          <button
                            key={op.id}
                            type="button"
                            onClick={() => toggleOperator(op.id)}
                            className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 border-2 ${
                              formData.technicians.includes(op.id)
                                ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white border-purple-600 shadow-lg'
                                : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400'
                            }`}
                          >
                            {op.full_name}
                          </button>
                        ))}
                      </div>
                      {formData.technicians.length > 0 ? (
                        <div className="flex items-center justify-between mt-3 p-3 bg-orange-50 rounded-xl border-2 border-orange-200">
                          <p className="text-sm text-orange-700 font-medium">
                            ✓ Selected: {formData.technicians.map(id => operators.find(o => o.id === id)?.full_name).filter(Boolean).join(', ')}
                          </p>
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, technicians: [] }))}
                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-all shadow-md hover:shadow-lg flex items-center gap-1.5"
                            title="Clear selection and assign later"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Assign Later
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 p-3 bg-orange-50 rounded-xl border-2 border-orange-200">
                          <p className="text-sm text-orange-700 font-medium flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            No operator assigned - Job will appear as "Unassigned" on schedule board
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-purple-800 mb-2">
                    Salesman/Admin *
                  </label>
                  {loadingTeam ? (
                    <div className="text-center py-4">
                      <div className="inline-block w-6 h-6 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={formData.salesman || ''}
                        readOnly
                        onClick={() => setShowSalesmanDropdown(!showSalesmanDropdown)}
                        className="w-full px-4 py-4 bg-white border-2 border-purple-300 rounded-xl focus:border-purple-600 focus:ring-4 focus:ring-purple-100 font-semibold text-lg text-purple-900 cursor-pointer"
                        placeholder="Click to select salesman/admin"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSalesmanDropdown(!showSalesmanDropdown)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Custom Dropdown */}
                      {renderSalesmanDropdown()}
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(6)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-orange-500 to-red-600 text-white hover:shadow-lg transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
            )}

            {/* Step 6: Equipment */}
            {currentStep === 6 && isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 overflow-visible">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                Step 6: Required Equipment
              </h2>

              {/* Smart Recommendations */}
              {(() => {
                const recommendations: string[] = [];

                // Core Drilling Recommendations
                if (formData.jobTypes.includes('CORE DRILLING')) {
                  recommendations.push(
                    'Small Drill',
                    'Hilti DD 250',
                    'Hilti DD 480 with Generator',
                    'Spacers',
                    'Hand Drill',
                    'Plastic Sheeting',
                    'Sticky Spray',
                    '200+ ft Water Hose',
                    'Extra Pump Can',
                    'Scissor Lift',
                    '6ft Ladder',
                    '8ft Ladder',
                    '10ft Ladder'
                  );

                  // Add bit sizes based on hole configurations
                  const coreDrillingDetails = formData.jobTypeDetails['CORE DRILLING'];
                  if (coreDrillingDetails?.holes && Array.isArray(coreDrillingDetails.holes)) {
                    const uniqueDiameters = [...new Set(
                      coreDrillingDetails.holes
                        .map((hole: any) => hole.diameter)
                        .filter((d: any) => d && d.trim())
                    )];
                    uniqueDiameters.forEach((diameter: any) => {
                      recommendations.push(`${diameter}" Core Bit`);
                    });
                  }
                }

                // Wall Cutting/Sawing Recommendations
                if (formData.jobTypes.includes('WALL CUTTING')) {
                  recommendations.push(
                    'Pentruder Wall Saw',
                    '100ft 480 Cord',
                    '200ft 480 Cord',
                    '250ft 480 Hose',
                    '10\' Bar and Chain',
                    '15\' Bar and Chain',
                    '24" Bar and Chain',
                    'Slurry Drums',
                    'Plastic'
                  );
                }

                // Slab Sawing Recommendations
                if (formData.jobTypes.includes('SLAB SAWING')) {
                  recommendations.push(
                    '20" Blade',
                    '26" Blade',
                    '30" Blade',
                    '36" Blade',
                    '42" Blade',
                    '54" Blade',
                    '20" Guard',
                    '26" Guard',
                    '30" Guard',
                    '36" Guard',
                    '42" Guard',
                    '54" Guard',
                    '5000 Slab Saw',
                    '7000 Slab Saw',
                    'Electric Slab Saw',
                    '100ft 480 Cord',
                    '200ft 480 Cord',
                    'Slurry Drums',
                    'Plastic'
                  );
                }

                // Hand Sawing Recommendations
                if (formData.jobTypes.includes('HAND SAWING')) {
                  recommendations.push(
                    '20" Handsaw',
                    '24" Handsaw',
                    '30" Handsaw',
                    'Specialty Blade',
                    'Anchor Bolts',
                    'Clear Spray',
                    'Plastic',
                    'Slurry Drum',
                    'Dolly',
                    'Electric Unit',
                    'Gas Unit',
                    'Hydraulic Hose (50ft)',
                    'Hydraulic Hose (100ft)',
                    'Hydraulic Hose (150ft)',
                    'Hydraulic Hose (200ft)'
                  );
                }

                // Only show recommendations if we have any
                if (recommendations.length > 0) {
                  return (
                    <div className="mb-6 bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-5 border-2 border-orange-200">
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <h3 className="text-sm font-bold text-gray-800">Recommended Equipment</h3>
                        <span className="text-xs text-gray-600 ml-auto">Click to add</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recommendations.map((item, idx) => {
                          const isAdded = formData.equipment.includes(item);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                if (isAdded) {
                                  // Remove item if already added
                                  handleInputChange('equipment', formData.equipment.filter(e => e !== item));
                                } else {
                                  // Add item if not added
                                  handleInputChange('equipment', [...formData.equipment, item]);
                                }
                              }}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                                isAdded
                                  ? 'bg-orange-100 text-orange-700 border-2 border-orange-300 hover:bg-orange-200 cursor-pointer'
                                  : 'bg-white text-blue-700 border-2 border-blue-300 hover:bg-blue-100 hover:border-blue-400 cursor-pointer'
                              }`}
                            >
                              {isAdded && '✓ '}
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="mb-4 relative">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Add Equipment
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={equipmentSearch}
                    onChange={(e) => {
                      setEquipmentSearch(e.target.value);
                      setShowEquipmentDropdown(true);
                    }}
                    onFocus={() => setShowEquipmentDropdown(true)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900"
                    placeholder="Search equipment or type custom item..."
                  />

                  {showEquipmentDropdown && equipmentSearch && (
                    <div className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      {filteredEquipment.length > 0 ? (
                        filteredEquipment.map(item => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => addEquipment(item)}
                            className="w-full px-4 py-3 text-left hover:bg-orange-50 transition-colors border-b border-gray-100 last:border-0 text-gray-900 font-medium"
                          >
                            {item}
                          </button>
                        ))
                      ) : (
                        <button
                          type="button"
                          onClick={() => addEquipment(equipmentSearch)}
                          className="w-full px-4 py-3 text-left hover:bg-orange-50 transition-colors text-orange-600 font-medium"
                        >
                          + Add "{equipmentSearch}" as custom equipment
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {formData.equipment.length > 0 ? (
                  formData.equipment.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-orange-50 rounded-xl border-2 border-orange-200">
                      <span className="font-medium text-orange-800">{item}</span>
                      <button
                        type="button"
                        onClick={() => removeEquipment(item)}
                        className="p-1 hover:bg-orange-200 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">No equipment added yet</p>
                )}
              </div>

              {/* Navigation Buttons */}
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(5)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(7)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-orange-500 to-red-600 text-white hover:shadow-lg transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
            )}

            {/* Step 7: Job Site Information */}
            {currentStep === 7 && isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 overflow-visible">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                Step 7: Job Information
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Customer Job Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    onBlur={(e) => saveSuggestion('customer_job_titles', 'title', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors text-gray-900 font-medium"
                    placeholder="e.g., PIEDMONT ATH."
                    list="job-title-suggestions"
                  />
                  <datalist id="job-title-suggestions">
                    {jobTitleSuggestions.map((suggestion, idx) => (
                      <option key={idx} value={suggestion} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.customer}
                    onChange={(e) => handleInputChange('customer', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors text-gray-900 font-medium"
                    placeholder="e.g., WHITEHAWK (CAM)"
                    list="customer-names"
                  />
                  <datalist id="customer-names">
                    {/* Customers will be populated here from database later */}
                  </datalist>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Customer Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.customerJobNumber}
                    onChange={(e) => handleInputChange('customerJobNumber', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                    placeholder="Enter customer phone..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Contact On Site *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.contactOnSite}
                    onChange={(e) => handleInputChange('contactOnSite', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                    placeholder="Enter contact name..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.contactPhone}
                    onChange={(e) => handleInputChange('contactPhone', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                    placeholder="Enter phone number..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    PO Number
                  </label>
                  <input
                    type="text"
                    value={formData.po}
                    onChange={(e) => handleInputChange('po', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    onBlur={(e) => saveSuggestion('company_names', 'name', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                    placeholder="e.g., ABC Construction"
                    list="company-name-suggestions"
                  />
                  <datalist id="company-name-suggestions">
                    {companyNameSuggestions.map((suggestion, idx) => (
                      <option key={idx} value={suggestion} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Customer Email
                  </label>
                  <input
                    type="email"
                    value={formData.customerEmail}
                    onChange={(e) => handleInputChange('customerEmail', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors text-gray-900"
                    placeholder="customer@company.com (for completion agreements)"
                  />
                  <p className="text-xs text-gray-500 mt-1">Email to send signed completion agreements</p>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Salesperson Email
                  </label>
                  <input
                    type="email"
                    value={formData.salespersonEmail}
                    onChange={(e) => handleInputChange('salespersonEmail', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors text-gray-900"
                    placeholder="salesperson@company.com (for job notifications)"
                  />
                  <p className="text-xs text-gray-500 mt-1">Email to notify when job is completed/signed</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Job Site GC (General Contractor)
                  </label>
                  <input
                    type="text"
                    value={formData.jobSiteGC}
                    onChange={(e) => handleInputChange('jobSiteGC', e.target.value)}
                    onBlur={(e) => saveSuggestion('general_contractors', 'name', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                    placeholder="e.g., XYZ Contractors"
                    list="gc-suggestions"
                  />
                  <datalist id="gc-suggestions">
                    {gcSuggestions.map((suggestion, idx) => (
                      <option key={idx} value={suggestion} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Job Quote / Ticket Value */}
              <div className="mt-6 p-6 bg-gradient-to-br from-orange-50 to-red-50 rounded-xl border-2 border-orange-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">Job Quote / Ticket Value</h3>
                    <p className="text-sm text-gray-600">Enter the quoted price for profitability tracking</p>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                    <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Quoted Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-bold text-lg">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.jobQuote || ''}
                      onChange={(e) => handleInputChange('jobQuote', e.target.value ? parseFloat(e.target.value) : undefined)}
                      className="w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-lg font-semibold"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    💡 This value is used to calculate job profitability and track revenue vs. costs
                  </p>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(6)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(8)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gradient-to-r from-orange-500 to-red-600 text-white hover:shadow-lg transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
            )}

            {/* Step 8: Required Documents */}
            {currentStep === 8 && isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6 overflow-visible">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                Step 8: Required Documents
              </h2>

              <p className="text-sm text-gray-600 mb-6">
                Select all documents that must be completed for this job. Operators will be required to fill these out.
              </p>

              {/* Safety Documents - Only JSA and Silica Plan */}
              {(() => {
                // Filter to only show JSA Form and Silica Dust Exposure Plan
                const allowedDocuments = documentTemplates.filter(doc =>
                  doc.id === 'jsa-form' || doc.id === 'silica-dust-control'
                );

                return (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      Safety Documents
                    </h3>
                    <div className="grid md:grid-cols-2 gap-3">
                      {allowedDocuments.map(doc => {
                        const isRequired = doc.id === 'silica-dust-control'; // Silica Dust Control is always required
                        const isChecked = formData.requiredDocuments.includes(doc.id);

                        return (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => {
                              // Don't allow toggling silica-plan (it's always required)
                              if (!isRequired) {
                                toggleDocument(doc.id);
                              }
                            }}
                            className={`p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                              isChecked
                                ? 'bg-purple-50 border-purple-400 shadow-md'
                                : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                            } ${isRequired ? 'cursor-default' : 'cursor-pointer'}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                                isChecked
                                  ? 'bg-purple-500 border-purple-500'
                                  : 'bg-white border-gray-300'
                              }`}>
                                {isChecked && (
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1">
                                <h4 className={`font-semibold text-xs ${
                                  isChecked ? 'text-purple-800' : 'text-gray-800'
                                }`}>
                                  {doc.name}
                                  {isRequired && (
                                    <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">
                                      REQUIRED
                                    </span>
                                  )}
                                </h4>
                                <p className="text-xs text-gray-500 mt-0.5">{doc.description}</p>
                                {doc.requiresSignature && (
                                  <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                    Signature Required
                                  </span>
                                )}
                                {doc.requiresPhoto && (
                                  <span className="inline-block mt-1 ml-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                    Photo Required
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {formData.requiredDocuments.length > 0 && (
                <div className="mt-4 p-4 bg-purple-50 rounded-xl border-2 border-purple-200">
                  <p className="text-sm font-semibold text-purple-800 mb-2">
                    {formData.requiredDocuments.length} document(s) required:
                  </p>
                  <ul className="text-sm text-purple-700 space-y-1">
                    {formData.requiredDocuments.map(docId => {
                      const doc = documentTemplates.find(t => t.id === docId);
                      return doc ? <li key={docId}>• {doc.name}</li> : null;
                    })}
                  </ul>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentStep(7)}
                  className="px-8 py-3 rounded-xl font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-all"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="px-8 py-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-2xl font-bold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
                >
                  Create Job Order →
                </button>
              </div>
            </div>
            )}
          </form>
        ) : (
          // Job List View
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-8">
            {jobsLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin w-12 h-12 border-4 border-orange-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-600">Loading jobs...</p>
              </div>
            ) : jobsList.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-700 mb-2">No Jobs Created Yet</h3>
                <p className="text-gray-500 mb-6">Create your first job order to get started</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:scale-105 transition-transform shadow-lg"
                >
                  Create Job Order
                </button>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">All Job Orders ({jobsList.length})</h2>
                <div className="space-y-4">
                  {jobsList.map((job) => (
                    <Link
                      key={job.id}
                      href={`/dashboard/admin/schedule-board?date=${job.scheduled_date}`}
                      className="block border-2 border-gray-200 rounded-2xl p-6 hover:border-orange-500 hover:shadow-lg transition-all duration-200 cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-sm font-bold text-gray-500">#{job.job_number}</span>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              job.status === 'completed' ? 'bg-green-100 text-orange-700' :
                              job.status === 'in_progress' ? 'bg-orange-100 text-orange-700' :
                              job.status === 'in_route' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {job.status.replace('_', ' ').toUpperCase()}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              job.priority === 'high' ? 'bg-red-100 text-red-700' :
                              job.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-orange-700'
                            }`}>
                              {job.priority.toUpperCase()}
                            </span>
                          </div>
                          <h3 className="text-xl font-bold text-gray-800 mb-1">{job.title}</h3>
                          <p className="text-gray-600">{job.customer_name}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 font-medium">Job Type</p>
                          <p className="font-bold text-gray-800">{job.job_type}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 font-medium">Location</p>
                          <p className="font-bold text-gray-800">{job.location}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 font-medium">Scheduled Date</p>
                          <p className="font-bold text-gray-800">
                            {new Date(job.scheduled_date).toLocaleDateString()}
                            {job.arrival_time && <span className="text-gray-600"> at {job.arrival_time}</span>}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 font-medium">Assigned To</p>
                          <p className="font-bold text-gray-800">{job.operator_name || 'Unassigned'}</p>
                        </div>
                      </div>

                      {job.description && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                          <p className="text-sm text-gray-700 line-clamp-2">{job.description}</p>
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modern Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 animate-slideUp">
            {/* Success Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center animate-bounce">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            {/* Success Message */}
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-3">
              Job Created Successfully!
            </h2>

            <div className="bg-gradient-to-r from-orange-50 to-red-50 rounded-2xl p-4 mb-6 border-2 border-orange-200">
              <p className="text-center text-sm text-gray-600 mb-2">Job Order Number</p>
              <p className="text-center text-3xl font-bold text-orange-600">
                #{createdJobId}
              </p>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-2 text-gray-700">
                <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm">Job ticket created</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm">Operators assigned</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm">Documents assigned</span>
              </div>
            </div>

            <p className="text-center text-sm text-gray-500 mb-6">
              Redirecting to dashboard in 3 seconds...
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => router.push('/dashboard/admin')}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  setActiveTab('create');
                }}
                className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all duration-300"
              >
                Create Another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AdminProtection>
  );
}
