'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Ruler,
  Camera,
  Save,
  AlertTriangle,
  CheckCircle,
  Wrench,
  Cloud,
  MapPin,
  User,
  FileText,
  Zap,
  Settings
} from 'lucide-react';
import { checkAuth } from '@/lib/auth';
import {
  createDailyJobTicket,
  getCrewJobsForToday,
  getAllBlades,
  scanEquipmentForJob,
  type DailyJobTicket,
  type BladeUsageRecord
} from '@/lib/daily-tickets-service';

export default function DailyJobTicketPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [currentUser, setCurrentUser] = useState('');

  // Available data
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [availableBlades, setAvailableBlades] = useState<any[]>([]);

  // Form state
  const [selectedJobId, setSelectedJobId] = useState('');
  const [step, setStep] = useState(1); // Multi-step form for mobile

  // Ticket data
  const [ticketData, setTicketData] = useState<Partial<DailyJobTicket>>({
    work_date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    break_duration_minutes: 30,
    cutting_completed: '',
    linear_feet_cut: 0,
    square_feet_cut: 0,
    holes_drilled: 0,
    concrete_thickness_inches: 4,
    rebar_present: false,
    rebar_density: 'none',
    concrete_hardness: 'normal',
    weather_conditions: '',
    site_conditions: '',
    equipment_scanned: [],
    safety_incidents: '',
    delays_encountered: '',
    notes: '',
    work_completed: false,
    ready_for_next_day: true,
    requires_follow_up: false
  });

  // Blade usage tracking
  const [bladeUsage, setBladeUsage] = useState<BladeUsageRecord[]>([]);

  useEffect(() => {
    const user = checkAuth();
    if (!user) {
      router.push('/login');
      return;
    }
    setCurrentUser(user.name);
    loadInitialData(user.id);
  }, [router]);

  const loadInitialData = async (crewMemberId: string) => {
    try {
      const [jobsResult, bladesResult] = await Promise.all([
        getCrewJobsForToday(crewMemberId),
        getAllBlades()
      ]);

      if (jobsResult.success) setAvailableJobs(jobsResult.data);
      if (bladesResult.success) setAvailableBlades(bladesResult.data);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setTicketData(prev => ({ ...prev, [field]: value }));
  };

  const calculateTotalHours = () => {
    if (ticketData.start_time && ticketData.end_time) {
      const start = new Date(`2000-01-01T${ticketData.start_time}`);
      const end = new Date(`2000-01-01T${ticketData.end_time}`);
      const diffMs = end.getTime() - start.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      const breakHours = (ticketData.break_duration_minutes || 0) / 60;
      return Math.max(0, diffHours - breakHours);
    }
    return 0;
  };

  const addBladeUsage = () => {
    const newBladeUsage: BladeUsageRecord = {
      blade_id: '',
      equipment_id: '',
      start_condition: 'good',
      end_condition: 'good',
      linear_feet_cut: 0,
      cutting_time_minutes: 0,
      material_cut: 'concrete',
      material_hardness: 'normal',
      rebar_encountered: false,
      cutting_depth: 4,
      cutting_speed: 0,
      blade_performance: 'good',
      replacement_needed: false
    };
    setBladeUsage(prev => [...prev, newBladeUsage]);
  };

  const updateBladeUsage = (index: number, field: string, value: any) => {
    setBladeUsage(prev => prev.map((blade, i) =>
      i === index ? { ...blade, [field]: value } : blade
    ));
  };

  const removeBladeUsage = (index: number) => {
    setBladeUsage(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    if (!selectedJobId) {
      setError('Please select a job');
      setLoading(false);
      return;
    }

    try {
      const totalHours = calculateTotalHours();

      const completeTicketData: DailyJobTicket = {
        ...ticketData,
        job_id: selectedJobId,
        crew_member_id: currentUser, // TODO: Get proper crew member ID
        total_hours_worked: totalHours,
        blades_used: bladeUsage,
        submitted_by: currentUser
      } as DailyJobTicket;

      const result = await createDailyJobTicket(completeTicketData);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      } else {
        setError(result.error || 'Failed to submit job ticket');
      }
    } catch (err: any) {
      console.error('Error submitting job ticket:', err);
      setError(err.message || 'Failed to submit job ticket');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 flex items-center justify-center p-6">
        <div className="text-center">
          <CheckCircle className="w-20 h-20 text-green-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Job Ticket Submitted!</h2>
          <p className="text-blue-200">Your daily work has been recorded</p>
        </div>
      </div>
    );
  }

  const stepTitles = [
    'Select Job',
    'Time & Work',
    'Cutting Details',
    'Conditions',
    'Equipment & Blades',
    'Review & Submit'
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950">
      <div className="relative z-10 p-4">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => step > 1 ? setStep(step - 1) : router.push('/dashboard')}
              className="p-2 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-cyan-400" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-white">Daily Job Ticket</h1>
              <p className="text-blue-200/70 text-sm">{stepTitles[step - 1]}</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              {stepTitles.map((title, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index + 1 <= step ? 'bg-cyan-400' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
            <div className="w-full bg-white/10 rounded-full h-1">
              <div
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-1 rounded-full transition-all duration-300"
                style={{ width: `${(step / stepTitles.length) * 100}%` }}
              />
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Step Content */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 mb-6">

            {/* Step 1: Select Job */}
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white mb-4">Select Today's Job</h2>
                {availableJobs.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-white/40 mx-auto mb-4" />
                    <p className="text-white/60">No jobs assigned for today</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableJobs.map((job) => (
                      <label
                        key={job.job_id}
                        className={`block p-4 rounded-lg border cursor-pointer transition-all ${
                          selectedJobId === job.job_id
                            ? 'bg-cyan-500/20 border-cyan-500'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        <input
                          type="radio"
                          name="job"
                          value={job.job_id}
                          checked={selectedJobId === job.job_id}
                          onChange={(e) => setSelectedJobId(e.target.value)}
                          className="sr-only"
                        />
                        <div>
                          <h3 className="text-white font-medium">{job.title}</h3>
                          <p className="text-blue-200/70 text-sm">{job.customer_name}</p>
                          <p className="text-blue-200/50 text-xs">{job.address}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Time & Work */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white mb-4">Time & Work Completed</h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-blue-100 text-sm font-medium mb-2">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={ticketData.start_time}
                      onChange={(e) => handleInputChange('start_time', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-blue-100 text-sm font-medium mb-2">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={ticketData.end_time}
                      onChange={(e) => handleInputChange('end_time', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Break Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={ticketData.break_duration_minutes}
                    onChange={(e) => handleInputChange('break_duration_minutes', parseInt(e.target.value) || 0)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                {ticketData.start_time && ticketData.end_time && (
                  <div className="p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
                    <p className="text-cyan-400 text-sm">
                      Total Hours: {calculateTotalHours().toFixed(2)}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Work Completed Today
                  </label>
                  <textarea
                    value={ticketData.cutting_completed}
                    onChange={(e) => handleInputChange('cutting_completed', e.target.value)}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                    placeholder="Describe the cutting work completed..."
                  />
                </div>
              </div>
            )}

            {/* Step 3: Cutting Details */}
            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white mb-4">Cutting Measurements</h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-blue-100 text-sm font-medium mb-2">
                      Linear Feet Cut
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={ticketData.linear_feet_cut}
                      onChange={(e) => handleInputChange('linear_feet_cut', parseFloat(e.target.value) || 0)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-blue-100 text-sm font-medium mb-2">
                      Square Feet Cut
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={ticketData.square_feet_cut}
                      onChange={(e) => handleInputChange('square_feet_cut', parseFloat(e.target.value) || 0)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-blue-100 text-sm font-medium mb-2">
                      Holes Drilled
                    </label>
                    <input
                      type="number"
                      value={ticketData.holes_drilled}
                      onChange={(e) => handleInputChange('holes_drilled', parseInt(e.target.value) || 0)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-blue-100 text-sm font-medium mb-2">
                      Concrete Thickness (inches)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={ticketData.concrete_thickness_inches}
                      onChange={(e) => handleInputChange('concrete_thickness_inches', parseFloat(e.target.value) || 0)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Conditions */}
            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white mb-4">Site Conditions</h2>

                <div>
                  <label className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ticketData.rebar_present}
                      onChange={(e) => handleInputChange('rebar_present', e.target.checked)}
                      className="rounded border-white/20 bg-white/5 text-cyan-500"
                    />
                    <span className="text-white">Rebar Present</span>
                  </label>
                </div>

                {ticketData.rebar_present && (
                  <div>
                    <label className="block text-blue-100 text-sm font-medium mb-2">
                      Rebar Density
                    </label>
                    <select
                      value={ticketData.rebar_density}
                      onChange={(e) => handleInputChange('rebar_density', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="light" className="bg-slate-900">Light</option>
                      <option value="medium" className="bg-slate-900">Medium</option>
                      <option value="heavy" className="bg-slate-900">Heavy</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Concrete Hardness
                  </label>
                  <select
                    value={ticketData.concrete_hardness}
                    onChange={(e) => handleInputChange('concrete_hardness', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="soft" className="bg-slate-900">Soft</option>
                    <option value="normal" className="bg-slate-900">Normal</option>
                    <option value="hard" className="bg-slate-900">Hard</option>
                    <option value="very_hard" className="bg-slate-900">Very Hard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Weather Conditions
                  </label>
                  <input
                    type="text"
                    value={ticketData.weather_conditions}
                    onChange={(e) => handleInputChange('weather_conditions', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                    placeholder="e.g., Sunny, 75°F"
                  />
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Site Conditions
                  </label>
                  <textarea
                    value={ticketData.site_conditions}
                    onChange={(e) => handleInputChange('site_conditions', e.target.value)}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                    placeholder="Access, dust control, etc..."
                  />
                </div>
              </div>
            )}

            {/* Step 5: Equipment & Blades */}
            {step === 5 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white mb-4">Equipment & Blades</h2>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-medium">Blade Usage</h3>
                    <button
                      type="button"
                      onClick={addBladeUsage}
                      className="px-3 py-1 bg-cyan-500/20 border border-cyan-500/50 rounded-lg text-cyan-400 text-sm"
                    >
                      Add Blade
                    </button>
                  </div>

                  {bladeUsage.map((blade, index) => (
                    <div key={index} className="p-3 bg-white/5 rounded-lg border border-white/10 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-white text-sm">Blade {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeBladeUsage(index)}
                          className="text-red-400 text-sm"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <select
                          value={blade.blade_id}
                          onChange={(e) => updateBladeUsage(index, 'blade_id', e.target.value)}
                          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white"
                        >
                          <option value="">Select Blade</option>
                          {availableBlades.map(b => (
                            <option key={b.id} value={b.id} className="bg-slate-900">
                              {b.blade_id} ({b.blade_size})
                            </option>
                          ))}
                        </select>

                        <input
                          type="number"
                          placeholder="Feet Cut"
                          value={blade.linear_feet_cut}
                          onChange={(e) => updateBladeUsage(index, 'linear_feet_cut', parseFloat(e.target.value) || 0)}
                          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-white placeholder-blue-300/50"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-blue-100 text-sm font-medium mb-2">
                    Issues & Notes
                  </label>
                  <textarea
                    value={ticketData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-blue-300/50 focus:border-cyan-400 focus:outline-none"
                    placeholder="Equipment issues, delays, safety incidents..."
                  />
                </div>
              </div>
            )}

            {/* Step 6: Review & Submit */}
            {step === 6 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white mb-4">Review & Submit</h2>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-200">Total Hours:</span>
                    <span className="text-white">{calculateTotalHours().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-200">Linear Feet Cut:</span>
                    <span className="text-white">{ticketData.linear_feet_cut}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-200">Holes Drilled:</span>
                    <span className="text-white">{ticketData.holes_drilled}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-200">Blades Used:</span>
                    <span className="text-white">{bladeUsage.length}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={ticketData.work_completed}
                      onChange={(e) => handleInputChange('work_completed', e.target.checked)}
                      className="rounded border-white/20 bg-white/5 text-green-500"
                    />
                    <span className="text-white">Work completed for today</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={ticketData.ready_for_next_day}
                      onChange={(e) => handleInputChange('ready_for_next_day', e.target.checked)}
                      className="rounded border-white/20 bg-white/5 text-cyan-500"
                    />
                    <span className="text-white">Ready for next day</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={ticketData.requires_follow_up}
                      onChange={(e) => handleInputChange('requires_follow_up', e.target.checked)}
                      className="rounded border-white/20 bg-white/5 text-orange-500"
                    />
                    <span className="text-white">Requires follow-up</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Buttons */}
          <div className="flex gap-4">
            {step < stepTitles.length ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !selectedJobId}
                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-400 hover:to-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Submit Ticket
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}