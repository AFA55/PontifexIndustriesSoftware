'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  FileText,
  Save,
  Plus,
  X,
  DollarSign,
  AlertTriangle,
  Wrench
} from 'lucide-react';
import { checkAuth } from '@/lib/auth';
import {
  createJob,
  createCustomer,
  getAllCustomers,
  getAllJobTypes,
  getAllCrewMembers,
  assignCrewToJob,
  assignEquipmentToJob,
  type Job,
  type Customer,
  type JobType,
  type CrewMember
} from '@/lib/jobs-service';
import { getAllEquipment } from '@/lib/supabase-equipment';

export default function CreateJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Data from database
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);

  // Form states
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedCrew, setSelectedCrew] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);

  // Job form data
  const [jobData, setJobData] = useState<Partial<Job>>({
    title: '',
    description: '',
    priority: 'normal',
    status: 'scheduled',
    address: '',
    city: '',
    state: 'WA',
    zip_code: '',
    site_contact_name: '',
    site_contact_phone: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '17:00',
    estimated_duration_hours: 8,
    quoted_price: 0,
    job_notes: '',
    safety_requirements: '',
    access_instructions: '',
    weather_dependent: false,
    no_rain: false
  });

  // New customer data
  const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({
    name: '',
    company_name: '',
    phone: '',
    email: '',
    address: '',
    contact_person: '',
    preferred_contact_method: 'phone'
  });

  useEffect(() => {
    const user = checkAuth();
    if (!user) {
      router.push('/login');
      return;
    }
    loadInitialData();
  }, [router]);

  const loadInitialData = async () => {
    try {
      const [customersResult, jobTypesResult, crewResult, equipmentResult] = await Promise.all([
        getAllCustomers(),
        getAllJobTypes(),
        getAllCrewMembers(),
        getAllEquipment()
      ]);

      if (customersResult.success) setCustomers(customersResult.data);
      if (jobTypesResult.success) setJobTypes(jobTypesResult.data);
      if (crewResult.success) setCrewMembers(crewResult.data);
      if (equipmentResult.success) setEquipment(equipmentResult.data);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const handleJobInputChange = (field: string, value: any) => {
    setJobData(prev => ({ ...prev, [field]: value }));
  };

  const handleCustomerInputChange = (field: string, value: any) => {
    setNewCustomer(prev => ({ ...prev, [field]: value }));
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.name || !newCustomer.phone) {
      setError('Customer name and phone are required');
      return;
    }

    const result = await createCustomer(newCustomer as Customer);
    if (result.success) {
      setCustomers(prev => [...prev, result.data]);
      setSelectedCustomer(result.data.id!);
      setShowNewCustomer(false);
      setNewCustomer({
        name: '', company_name: '', phone: '', email: '', address: '',
        contact_person: '', preferred_contact_method: 'phone'
      });
    } else {
      setError(result.error || 'Failed to create customer');
    }
  };

  const handleJobTypeChange = (jobTypeId: string) => {
    const jobType = jobTypes.find(jt => jt.id === jobTypeId);
    if (jobType) {
      handleJobInputChange('job_type_id', jobTypeId);
      handleJobInputChange('estimated_duration_hours', jobType.estimated_duration_hours || 8);
      // Don't auto-set price - let estimator enter it

      // Auto-suggest equipment types based on job type (but don't pre-select specific equipment)
      if (jobType.required_equipment) {
        // Just reference for estimator to see what's typically needed
        console.log('Typical equipment for this job type:', jobType.required_equipment);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validation
    if (!selectedCustomer || !jobData.title || !jobData.address || !jobData.scheduled_date) {
      setError('Please fill in all required fields');
      setLoading(false);
      return;
    }

    try {
      // Create the job
      const jobResult = await createJob({
        ...jobData,
        customer_id: selectedCustomer,
        created_by: 'Current User' // TODO: Get from auth context
      } as Job);

      if (!jobResult.success) {
        throw new Error(jobResult.error);
      }

      const createdJob = jobResult.data;

      // Assign crew members
      for (const crewId of selectedCrew) {
        await assignCrewToJob(createdJob.id!, crewId);
      }

      // Store required equipment types (not specific equipment)
      // This will be used later when operators scan equipment on-site
      console.log('Required equipment types for job:', selectedEquipment);

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard/schedule');
      }, 2000);

    } catch (err: any) {
      console.error('Error creating job:', err);
      setError(err.message || 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Save className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Job Created Successfully!</h2>
          <p className="text-blue-200">Redirecting to schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950">
      <div className="relative z-10 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => router.push('/dashboard/schedule')}
              className="p-2 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-cyan-400" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-white">Create New Job</h1>
              <p className="text-blue-200 mt-1">Schedule a new concrete cutting job</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-xl text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer Selection */}
            <div className="backdrop-blur-xl bg-white/5 rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-400" />
                Customer Information
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Select Customer *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={selectedCustomer}
                      onChange={(e) => setSelectedCustomer(e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                      required
                    >
                      <option value="">Choose a customer...</option>
                      {customers.map(customer => (
                        <option key={customer.id} value={customer.id} className="bg-slate-900">
                          {customer.name} {customer.company_name && `(${customer.company_name})`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowNewCustomer(!showNewCustomer)}
                      className="px-4 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-xl text-cyan-400 transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* New Customer Form */}
                {showNewCustomer && (
                  <div className="border border-white/10 rounded-xl p-4 bg-white/5">
                    <h3 className="text-white font-medium mb-3">Create New Customer</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        type="text"
                        placeholder="Customer Name *"
                        value={newCustomer.name}
                        onChange={(e) => handleCustomerInputChange('name', e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Company Name"
                        value={newCustomer.company_name}
                        onChange={(e) => handleCustomerInputChange('company_name', e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                      />
                      <input
                        type="tel"
                        placeholder="Phone Number *"
                        value={newCustomer.phone}
                        onChange={(e) => handleCustomerInputChange('phone', e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={newCustomer.email}
                        onChange={(e) => handleCustomerInputChange('email', e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        type="button"
                        onClick={handleCreateCustomer}
                        className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 rounded-lg text-green-400 transition-colors"
                      >
                        Create Customer
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomer(false)}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-400 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Job Details */}
            <div className="backdrop-blur-xl bg-white/5 rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                Job Details
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Job Title *
                  </label>
                  <input
                    type="text"
                    value={jobData.title}
                    onChange={(e) => handleJobInputChange('title', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                    placeholder="e.g., Concrete slab cutting"
                    required
                  />
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Job Type
                  </label>
                  <select
                    value={jobData.job_type_id || ''}
                    onChange={(e) => handleJobTypeChange(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="" className="bg-slate-900">Select job type...</option>
                    {jobTypes.map(type => (
                      <option key={type.id} value={type.id} className="bg-slate-900">
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Priority
                  </label>
                  <select
                    value={jobData.priority}
                    onChange={(e) => handleJobInputChange('priority', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="low" className="bg-slate-900">Low</option>
                    <option value="normal" className="bg-slate-900">Normal</option>
                    <option value="high" className="bg-slate-900">High</option>
                    <option value="urgent" className="bg-slate-900">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Quoted Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={jobData.quoted_price}
                    onChange={(e) => handleJobInputChange('quoted_price', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-blue-100 text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={jobData.description}
                  onChange={(e) => handleJobInputChange('description', e.target.value)}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                  placeholder="Describe the work to be performed..."
                />
              </div>
            </div>

            {/* Location & Schedule */}
            <div className="backdrop-blur-xl bg-white/5 rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-cyan-400" />
                Location & Schedule
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Job Address *
                  </label>
                  <input
                    type="text"
                    value={jobData.address}
                    onChange={(e) => handleJobInputChange('address', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                    placeholder="Street address"
                    required
                  />
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={jobData.city}
                    onChange={(e) => handleJobInputChange('city', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    ZIP Code
                  </label>
                  <input
                    type="text"
                    value={jobData.zip_code}
                    onChange={(e) => handleJobInputChange('zip_code', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Scheduled Date *
                  </label>
                  <input
                    type="date"
                    value={jobData.scheduled_date}
                    onChange={(e) => handleJobInputChange('scheduled_date', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyan-400 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Estimated Duration (hours)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={jobData.estimated_duration_hours}
                    onChange={(e) => handleJobInputChange('estimated_duration_hours', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={jobData.start_time}
                    onChange={(e) => handleJobInputChange('start_time', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={jobData.end_time}
                    onChange={(e) => handleJobInputChange('end_time', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Crew Assignment */}
            <div className="backdrop-blur-xl bg-white/5 rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-400" />
                Assign Crew
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {crewMembers.map(member => (
                  <label key={member.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedCrew.includes(member.id!)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCrew(prev => [...prev, member.id!]);
                        } else {
                          setSelectedCrew(prev => prev.filter(id => id !== member.id));
                        }
                      }}
                      className="rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-400"
                    />
                    <div>
                      <p className="text-white font-medium">{member.name}</p>
                      <p className="text-blue-200/60 text-sm">{member.role}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Equipment Assignment */}
            <div className="backdrop-blur-xl bg-white/5 rounded-2xl p-6 border border-white/10">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-cyan-400" />
                Required Equipment & Tools
              </h2>
              <p className="text-blue-200/60 text-sm mb-4">Check off equipment types needed. Operators will scan specific equipment when starting the job.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Equipment Types */}
                {['Floor Saw', 'Wall Saw', 'Core Drill', 'Hand Saw', 'Chain Saw', 'Generator', 'Vacuum'].map(equipmentType => (
                  <label key={equipmentType} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedEquipment.includes(equipmentType)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEquipment(prev => [...prev, equipmentType]);
                        } else {
                          setSelectedEquipment(prev => prev.filter(id => id !== equipmentType));
                        }
                      }}
                      className="rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-400"
                    />
                    <div>
                      <p className="text-white font-medium">{equipmentType}</p>
                      <p className="text-blue-200/60 text-xs">Type required</p>
                    </div>
                  </label>
                ))}

                {/* PPE & Tools */}
                {['Safety Glasses', 'Hard Hat', 'Steel Toe Boots', 'Hearing Protection', 'Dust Mask', 'Work Gloves'].map(ppe => (
                  <label key={ppe} className="flex items-center gap-3 p-3 bg-orange-500/5 rounded-lg cursor-pointer hover:bg-orange-500/10 transition-colors border border-orange-500/20">
                    <input
                      type="checkbox"
                      checked={selectedEquipment.includes(ppe)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedEquipment(prev => [...prev, ppe]);
                        } else {
                          setSelectedEquipment(prev => prev.filter(id => id !== ppe));
                        }
                      }}
                      className="rounded border-orange-400/20 bg-white/5 text-orange-500 focus:ring-orange-400"
                    />
                    <div>
                      <p className="text-white font-medium">{ppe}</p>
                      <p className="text-orange-200/60 text-xs">PPE Required</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold py-4 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating Job...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Create Job
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => router.push('/dashboard/schedule')}
                className="px-6 py-4 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 text-white font-medium hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}