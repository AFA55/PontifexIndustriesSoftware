'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface JobOrderForm {
  // Basic Info
  title: string;
  customer: string;
  jobTypes: string[]; // Changed to array for multiple job types

  // Location
  location: string;
  address: string;

  // Status & Priority
  status: 'scheduled' | 'in-route' | 'in-progress' | 'completed';
  priority: 'high' | 'medium' | 'low';

  // Schedule - Updated to support date range
  startDate: string;
  endDate: string;
  arrivalTime: string;
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

  // Job Site Info - Now includes contact on site
  jobSiteNumber: string;
  po: string;
  customerJobNumber: string;
  contactOnSite: string;
  contactPhone: string;
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

const commonEquipment = [
  'Core Drill',
  'Wall Saw',
  'Slab Saw',
  'Hand Saw',
  'Diamond Bits',
  'Diamond Blades',
  'Water Hose (250\')',
  'Pump Can',
  'Vacuum System',
  'Dust Collection System',
  'Safety Gear',
  'Ladder',
  'Lift Access',
  'Generator'
];

const operators = [
  'ANDRES GUERRERO-C',
  'CARLOS MARTINEZ',
  'MIGUEL RODRIGUEZ',
  'JOSE HERNANDEZ',
  'LUIS GARCIA',
  'JUAN LOPEZ'
];

const salesmen = [
  'CAMERON AMOS',
  'SARAH JONES',
  'MICHAEL SMITH',
  'JENNIFER WILSON'
];

// Available documents that can be required for a job
const availableDocuments = [
  'JSA Form (Job Safety Analysis)',
  'Silica Dust/Exposure Control Plan',
  'Permit to Work',
  'Hot Work Permit',
  'Confined Space Entry Permit',
  'Site-Specific Safety Plan'
];

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
  'Asphalt'
];

// Hand sawing options
const handSawingMethods = [
  'Vertical Cutting',
  'Cutting Block or Brick'
];

const handSawingLocations = [
  'Slab on Grade',
  'Elevated Slab'
];

const handSawingMaterials = [
  'Reinforced Concrete',
  'Block/Brick',
  'Other'
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
      { name: 'locations', label: 'Drilling Locations', placeholder: 'Select locations', type: 'multiselect', options: coreDrillingLocations },
      { name: 'quantity', label: 'Number of Holes', placeholder: 'e.g., 6' },
      { name: 'diameter', label: 'Hole Diameter (inches)', placeholder: 'e.g., 4"' },
      { name: 'depth', label: 'Depth (inches)', placeholder: 'e.g., 12"' }
    ]
  },
  'WALL CUTTING': {
    description: 'WALL SAWING - CUTTING OPENINGS IN WALLS',
    fields: [
      { name: 'material', label: 'Material', placeholder: 'Select material', type: 'select', options: wallSawingMaterials },
      { name: 'materialOther', label: 'Other Material (if selected)', placeholder: 'Specify material...', type: 'conditional', condition: 'material', conditionValue: 'Other' },
      { name: 'quantity', label: 'Number of Cuts', placeholder: 'e.g., 2' },
      { name: 'depth', label: 'Wall Thickness (inches)', placeholder: 'e.g., 8"' }
    ]
  },
  'SLAB SAWING': {
    description: 'SLAB SAWING - CUTTING CONCRETE FLOORS/SLABS',
    fields: [
      { name: 'material', label: 'Material', placeholder: 'Select material', type: 'select', options: slabSawingMaterials },
      { name: 'linearFeet', label: 'Linear Feet', placeholder: 'e.g., 100' },
      { name: 'thickness', label: 'Slab Thickness (inches)', placeholder: 'e.g., 6"' }
    ]
  },
  'HAND SAWING': {
    description: 'HAND SAWING - MANUAL CUTTING OPERATIONS',
    fields: [
      { name: 'methods', label: 'Cutting Method', placeholder: 'Select method', type: 'multiselect', options: handSawingMethods },
      { name: 'material', label: 'Material', placeholder: 'Select material', type: 'select', options: handSawingMaterials },
      { name: 'materialOther', label: 'Other Material (if selected)', placeholder: 'Specify material...', type: 'conditional', condition: 'material', conditionValue: 'Other' },
      { name: 'locations', label: 'Location Type', placeholder: 'Select location', type: 'multiselect', options: handSawingLocations },
      { name: 'linearFeet', label: 'Linear Feet', placeholder: 'e.g., 50' },
      { name: 'thickness', label: 'Depth of Cut (inches)', placeholder: 'e.g., 3"' }
    ]
  },
  'WIRE SAWING': {
    description: 'WIRE SAWING - CUTTING LARGE STRUCTURES',
    fields: [
      { name: 'quantity', label: 'Number of Cuts', placeholder: 'e.g., 1' }
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

  const [formData, setFormData] = useState<JobOrderForm>({
    title: '',
    customer: '',
    jobTypes: [],
    location: '',
    address: '',
    status: 'scheduled',
    priority: 'medium',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    arrivalTime: '08:00',
    estimatedHours: '8.00',
    technicians: [],
    salesman: '',
    description: '',
    additionalInfo: '',
    jobTypeDetails: {},
    equipment: [],
    requiredDocuments: [], // Empty by default, user will select
    jobSiteNumber: '',
    po: '',
    customerJobNumber: '',
    contactOnSite: '',
    contactPhone: ''
  });

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
                if (Array.isArray(value)) {
                  desc += `${field.label}: ${value.join(', ')}\n`;
                } else {
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
  const isBasicInfoComplete = formData.title && formData.customer && formData.jobTypes.length > 0 && formData.priority;

  const handleInputChange = (field: keyof JobOrderForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Generate final description
    const finalDescription = generateDescription();
    const fullDescription = finalDescription + (formData.additionalInfo ? `\n\nADDITIONAL INFO:\n${formData.additionalInfo}` : '');

    // Generate job ID
    const jobId = Math.floor(100000 + Math.random() * 900000).toString();

    // In production, this would save to database
    console.log('Creating job order:', { ...formData, description: fullDescription, id: jobId });

    alert(`Job Order #${jobId} created successfully!\n\nJob Types: ${formData.jobTypes.join(', ')}\nAssigned to: ${formData.technicians.join(', ')}`);

    // Reset form
    setFormData({
      title: '',
      customer: '',
      jobTypes: [],
      location: '',
      address: '',
      status: 'scheduled',
      priority: 'medium',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      arrivalTime: '08:00',
      estimatedHours: '8.00',
      technicians: [],
      salesman: '',
      description: '',
      additionalInfo: '',
      jobTypeDetails: {},
      equipment: [],
      requiredDocuments: [],
      jobSiteNumber: '',
      po: '',
      customerJobNumber: '',
      contactOnSite: '',
      contactPhone: ''
    });
  };

  const filteredEquipment = commonEquipment.filter(item =>
    item.toLowerCase().includes(equipmentSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
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
          <button
            onClick={() => setActiveTab('list')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
              activeTab === 'list'
                ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            View All Jobs
          </button>
        </div>

        {activeTab === 'create' ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                Basic Information
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Job Title / Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 font-medium"
                    placeholder="e.g., WHITEHAWK (CAM) / PIEDMONT ATH."
                  />
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
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 font-medium"
                    placeholder="e.g., WHITEHAWK (CAM)"
                  />
                </div>

                <div className="md:col-span-2">
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
                    <p className="text-sm text-green-600 mt-2 font-medium">
                      Selected: {formData.jobTypes.join(', ')}
                    </p>
                  )}
                </div>

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
                              : 'bg-green-500 text-white border-green-600'
                            : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Job Type Details - Only show if job types are selected */}
            {formData.jobTypes.length > 0 && (
              <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  Work Details (Estimate Style)
                </h2>

                <div className="space-y-8">
                  {formData.jobTypes.map((jobType, idx) => {
                    const config = jobTypeConfig[jobType];
                    if (!config) return null;

                    return (
                      <div key={jobType} className="border-2 border-orange-200 rounded-2xl p-6 bg-orange-50/50">
                        <h3 className="text-lg font-bold text-orange-800 mb-4 flex items-center gap-2">
                          <span className="w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center text-sm">
                            {idx + 1}
                          </span>
                          {jobType}
                        </h3>

                        <div className="space-y-4">
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
                              ) : field.type === 'select' && field.options ? (
                                /* Single select dropdown */
                                <select
                                  value={formData.jobTypeDetails[jobType]?.[field.name] || ''}
                                  onChange={(e) => handleJobTypeDetailChange(jobType, field.name, e.target.value)}
                                  className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-orange-500 focus:outline-none transition-colors text-gray-900 font-medium"
                                >
                                  <option value="">{field.placeholder}</option>
                                  {field.options.map(option => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
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
                                          <label className="block text-xs font-semibold text-gray-700 mb-1">Material</label>
                                          <select
                                            value={area.material || ''}
                                            onChange={(e) => {
                                              const currentAreas = [...((formData.jobTypeDetails[jobType]?.areas || []) as any[])];
                                              currentAreas[idx] = { ...currentAreas[idx], material: e.target.value };
                                              handleJobTypeDetailChange(jobType, 'areas', currentAreas);
                                            }}
                                            className="w-full px-3 py-2 bg-white border-2 border-gray-300 rounded-lg text-sm text-gray-900"
                                          >
                                            <option value="">Select material...</option>
                                            {demolitionMaterials.map(mat => (
                                              <option key={mat} value={mat}>{mat}</option>
                                            ))}
                                          </select>
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
                                  if (Array.isArray(value)) {
                                    return `${field.label}: ${value.join(', ')}\n`;
                                  }
                                  return `${field.label}: ${value}\n`;
                                }).join('')}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Location Information - Only show if basic info is complete */}
            {isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                Location Information
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Location Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none transition-colors"
                    placeholder="e.g., Downtown Construction Site"
                  />
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
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none transition-colors"
                    placeholder="e.g., 1199 PRINCE AVE, ATHENS, GA"
                  />
                </div>
              </div>
            </div>
            )}

            {/* Schedule Information - Only show if basic info is complete */}
            {isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                Schedule Information
              </h2>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) => handleInputChange('endDate', e.target.value)}
                    min={formData.startDate}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Arrival Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.arrivalTime}
                    onChange={(e) => handleInputChange('arrivalTime', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Estimated Hours Per Day *
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
            </div>
            )}

            {/* Team Assignment - Only show if basic info is complete */}
            {isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                Team Assignment
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Assign Operator/Technician(s) * <span className="text-gray-500 text-xs">(Select all that apply)</span>
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {operators.map(op => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => toggleOperator(op)}
                        className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200 border-2 ${
                          formData.technicians.includes(op)
                            ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white border-purple-600 shadow-lg'
                            : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                  {formData.technicians.length > 0 && (
                    <p className="text-sm text-green-600 mt-2 font-medium">
                      Selected: {formData.technicians.join(', ')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Salesman *
                  </label>
                  <select
                    required
                    value={formData.salesman}
                    onChange={(e) => handleInputChange('salesman', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none transition-colors"
                  >
                    <option value="">Select salesman...</option>
                    {salesmen.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            )}

            {/* Job Description - Auto-generated with additional info */}
            {isBasicInfoComplete && formData.jobTypes.length > 0 && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                Job Description
              </h2>

              <div className="space-y-6">
                {/* Auto-generated description preview */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Work to be Performed (Auto-generated)
                  </label>
                  <div className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-300 rounded-xl font-mono text-sm text-gray-900 whitespace-pre-wrap min-h-[120px]">
                    {generateDescription() || 'Fill in job type details above to see work description...'}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    This is automatically generated from your job type selections and details above.
                  </p>
                </div>

                {/* Additional info section */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Additional Information (Optional)
                  </label>
                  <textarea
                    value={formData.additionalInfo}
                    onChange={(e) => handleInputChange('additionalInfo', e.target.value)}
                    rows={6}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-yellow-500 focus:outline-none transition-colors font-mono text-sm"
                    placeholder="Enter any additional information, special instructions, or notes...&#10;&#10;Example:&#10;- COLUMNS HAVE BEEN SCANNED&#10;- TWO SEPARATE LOCATIONS&#10;- CONTACT FOREMAN BEFORE STARTING"
                  />
                  <p className="text-sm text-gray-500 mt-2">
                    Use this field for any extra details not covered above. Use ALL CAPS and line breaks for clarity.
                  </p>
                </div>

                {/* Full preview */}
                <div className="border-2 border-blue-200 bg-blue-50/50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-blue-600 mb-2 uppercase">Full Job Description Preview:</p>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap font-mono bg-white p-4 rounded-lg border border-blue-200">
                    {generateDescription() || '(No work details yet)'}
                    {formData.additionalInfo && (
                      <>
                        {'\n\n'}
                        {'ADDITIONAL INFO:\n'}
                        {formData.additionalInfo}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Equipment - Only show if basic info is complete */}
            {isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                Required Equipment
              </h2>

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
            </div>
            )}

            {/* Job Site Information - Only show if basic info is complete */}
            {isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                Jobsite Information
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
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
                    Job Site Number
                  </label>
                  <input
                    type="text"
                    value={formData.jobSiteNumber}
                    onChange={(e) => handleInputChange('jobSiteNumber', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                    placeholder="Optional"
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
                    Customer Job Number
                  </label>
                  <input
                    type="text"
                    value={formData.customerJobNumber}
                    onChange={(e) => handleInputChange('customerJobNumber', e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>
            )}

            {/* Required Documents - Only show if basic info is complete */}
            {isBasicInfoComplete && (
            <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                Required Documents
              </h2>

              <p className="text-sm text-gray-600 mb-4">
                Select all documents that must be completed for this job. Operators and team members will be required to fill these out.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                {availableDocuments.map(doc => (
                  <button
                    key={doc}
                    type="button"
                    onClick={() => toggleDocument(doc)}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                      formData.requiredDocuments.includes(doc)
                        ? 'bg-emerald-50 border-emerald-400 shadow-lg shadow-emerald-200'
                        : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                        formData.requiredDocuments.includes(doc)
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'bg-white border-gray-300'
                      }`}>
                        {formData.requiredDocuments.includes(doc) && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className={`font-bold text-sm ${
                          formData.requiredDocuments.includes(doc) ? 'text-emerald-800' : 'text-gray-800'
                        }`}>
                          {doc}
                        </h4>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {formData.requiredDocuments.length > 0 && (
                <div className="mt-4 p-4 bg-emerald-50 rounded-xl border-2 border-emerald-200">
                  <p className="text-sm font-semibold text-emerald-800 mb-2">
                    {formData.requiredDocuments.length} document(s) required:
                  </p>
                  <ul className="text-sm text-emerald-700 space-y-1">
                    {formData.requiredDocuments.map(doc => (
                      <li key={doc}>• {doc}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <Link
                href="/dashboard/admin"
                className="px-8 py-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-2xl font-bold transition-all duration-300 shadow-lg"
              >
                Cancel
              </Link>
              <button
                type="submit"
                className="px-8 py-4 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-2xl font-bold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
              >
                Create Job Order
              </button>
            </div>
          </form>
        ) : (
          // Job List View
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 p-8">
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
          </div>
        )}
      </div>
    </div>
  );
}
