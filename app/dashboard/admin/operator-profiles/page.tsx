'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { User, DollarSign, Briefcase, Wrench, Upload, File, X as XIcon } from 'lucide-react';

interface OperatorProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  phone_number: string | null;
  role: string;
  hourly_rate: number | null;
  skill_levels: Record<string, { level: string; proficiency: number }>;
  tasks_qualified_for: string[];
  equipment_qualified_for: Record<string, { qualified: boolean; proficiency: number }>;
  certifications: Array<{
    name: string;
    issued_date: string;
    expiry_date?: string;
  }>;
  certification_documents: Array<{
    cert_name: string;
    file_url: string;
    file_name: string;
    uploaded_at: string;
  }>;
  years_experience: number | null;
  hire_date: string | null;
  notes: string | null;
  performance: {
    total_jobs_completed: number;
    total_revenue_generated: number;
    total_hours_worked: number;
    avg_production_rate: number;
    revenue_per_hour: number;
    on_time_completion_rate: number;
  };
  cleanliness_rating_avg: number | null;
  cleanliness_rating_count: number;
  communication_rating_avg: number | null;
  communication_rating_count: number;
  overall_rating_avg: number | null;
  overall_rating_count: number;
  total_ratings_received: number;
  last_rating_received_at: string | null;
}

const AVAILABLE_TASKS = [
  { id: 'core_drilling', label: 'Core Drilling', icon: '🔵', gradient: 'from-blue-500 via-cyan-500 to-teal-500' },
  { id: 'slab_sawing', label: 'Slab Sawing', icon: '🔷', gradient: 'from-purple-500 via-pink-500 to-rose-500' },
  { id: 'wall_sawing', label: 'Wall Sawing', icon: '🔶', gradient: 'from-orange-500 via-amber-500 to-yellow-500' },
  { id: 'hand_sawing', label: 'Hand Sawing', icon: '✋', gradient: 'from-green-500 via-emerald-500 to-teal-500' },
  { id: 'demolition', label: 'Demolition', icon: '💥', gradient: 'from-red-500 via-orange-500 to-amber-500' },
  { id: 'flat_sawing', label: 'Flat Sawing', icon: '⬜', gradient: 'from-indigo-500 via-purple-500 to-pink-500' },
  { id: 'wire_sawing', label: 'Wire Sawing', icon: '🔗', gradient: 'from-cyan-500 via-blue-500 to-indigo-500' },
];

const AVAILABLE_EQUIPMENT = [
  { id: 'mini_x', label: 'Mini X', gradient: 'from-blue-400 to-cyan-500' },
  { id: 'brokk', label: 'Brokk', gradient: 'from-purple-400 to-pink-500' },
  { id: 'skid_steer', label: 'Skid Steer', gradient: 'from-orange-400 to-red-500' },
  { id: 'sherpa', label: 'Sherpa', gradient: 'from-green-400 to-emerald-500' },
  { id: 'forklift', label: 'Forklift', gradient: 'from-yellow-400 to-orange-500' },
  { id: 'scissorlift', label: 'Scissorlift', gradient: 'from-pink-400 to-rose-500' },
  { id: 'lull', label: 'Lull', gradient: 'from-indigo-400 to-purple-500' },
];

const SKILL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const EQUIPMENT_PROFICIENCY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const CARD_GRADIENTS = [
  'from-purple-500 via-pink-500 to-rose-500',
  'from-blue-500 via-cyan-500 to-teal-500',
  'from-orange-500 via-red-500 to-pink-500',
  'from-green-500 via-emerald-500 to-cyan-500',
  'from-indigo-500 via-purple-500 to-pink-500',
  'from-cyan-500 via-blue-500 to-indigo-500',
];

export default function OperatorProfilesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [operators, setOperators] = useState<OperatorProfile[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<OperatorProfile | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'skills' | 'equipment' | 'certs'>('basic');
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    setLoading(false);
    fetchOperators();
  };

  const fetchOperators = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/admin/operator-profiles', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      const result = await response.json();
      if (result.success) {
        setOperators(result.data);
      }
    } catch (error) {
      console.error('Error fetching operators:', error);
    }
  };

  const handleEditOperator = (operator: OperatorProfile) => {
    setSelectedOperator({
      ...operator,
      skill_levels: operator.skill_levels || {},
      equipment_qualified_for: operator.equipment_qualified_for || {},
      certification_documents: operator.certification_documents || [],
    });
    setActiveTab('basic');
    setShowEditModal(true);
  };

  const handleSaveOperator = async () => {
    if (!selectedOperator) return;

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/admin/operator-profiles/${selectedOperator.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          full_name: selectedOperator.full_name,
          phone_number: selectedOperator.phone_number,
          email: selectedOperator.email,
          hourly_rate: selectedOperator.hourly_rate,
          skill_levels: selectedOperator.skill_levels,
          tasks_qualified_for: selectedOperator.tasks_qualified_for,
          equipment_qualified_for: selectedOperator.equipment_qualified_for,
          certifications: selectedOperator.certifications,
          certification_documents: selectedOperator.certification_documents,
          years_experience: selectedOperator.years_experience,
          hire_date: selectedOperator.hire_date,
          notes: selectedOperator.notes,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setShowEditModal(false);
        fetchOperators();
      } else {
        alert('Failed to update: ' + result.error);
      }
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateTaskSkillLevel = (taskId: string, proficiency: number) => {
    if (!selectedOperator) return;
    setSelectedOperator({
      ...selectedOperator,
      skill_levels: {
        ...selectedOperator.skill_levels,
        [taskId]: {
          level: `level_${proficiency}`,
          proficiency
        }
      }
    });
  };

  const updateEquipmentProficiency = (equipId: string, proficiency: number) => {
    if (!selectedOperator) return;
    setSelectedOperator({
      ...selectedOperator,
      equipment_qualified_for: {
        ...selectedOperator.equipment_qualified_for,
        [equipId]: {
          qualified: true,
          proficiency
        }
      }
    });
  };

  const toggleTask = (taskId: string) => {
    if (!selectedOperator) return;
    const tasks = selectedOperator.tasks_qualified_for || [];
    const newTasks = tasks.includes(taskId)
      ? tasks.filter(t => t !== taskId)
      : [...tasks, taskId];
    setSelectedOperator({
      ...selectedOperator,
      tasks_qualified_for: newTasks
    });
  };

  const toggleEquipment = (equipId: string) => {
    if (!selectedOperator) return;
    const equipment = selectedOperator.equipment_qualified_for || {};
    const isQualified = equipment[equipId]?.qualified;

    if (isQualified) {
      // Remove
      const newEquip = { ...equipment };
      delete newEquip[equipId];
      setSelectedOperator({
        ...selectedOperator,
        equipment_qualified_for: newEquip
      });
    } else {
      // Add with default proficiency
      setSelectedOperator({
        ...selectedOperator,
        equipment_qualified_for: {
          ...equipment,
          [equipId]: { qualified: true, proficiency: 5 }
        }
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedOperator) return;

    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    setUploadingPdf(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Upload to Supabase Storage
      const fileExt = 'pdf';
      const fileName = `${selectedOperator.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('certification-documents')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('certification-documents')
        .getPublicUrl(fileName);

      // Add to certification documents
      const newDoc = {
        cert_name: file.name.replace('.pdf', ''),
        file_url: urlData.publicUrl,
        file_name: file.name,
        uploaded_at: new Date().toISOString()
      };

      setSelectedOperator({
        ...selectedOperator,
        certification_documents: [
          ...(selectedOperator.certification_documents || []),
          newDoc
        ]
      });

      alert('File uploaded successfully!');
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file. Make sure the storage bucket exists.');
    } finally {
      setUploadingPdf(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeCertDocument = (index: number) => {
    if (!selectedOperator) return;
    const newDocs = [...selectedOperator.certification_documents];
    newDocs.splice(index, 1);
    setSelectedOperator({
      ...selectedOperator,
      certification_documents: newDocs
    });
  };

  const addCertification = () => {
    if (!selectedOperator) return;
    setSelectedOperator({
      ...selectedOperator,
      certifications: [
        ...(selectedOperator.certifications || []),
        { name: '', issued_date: '' }
      ]
    });
  };

  const removeCertification = (index: number) => {
    if (!selectedOperator) return;
    const newCerts = [...selectedOperator.certifications];
    newCerts.splice(index, 1);
    setSelectedOperator({
      ...selectedOperator,
      certifications: newCerts
    });
  };

  const updateCertification = (index: number, field: string, value: string) => {
    if (!selectedOperator) return;
    const newCerts = [...selectedOperator.certifications];
    newCerts[index] = { ...newCerts[index], [field]: value };
    setSelectedOperator({
      ...selectedOperator,
      certifications: newCerts
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading operator profiles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/95 border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/admin" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Operator Profiles</h1>
                <p className="text-sm text-gray-500">Manage skills, costs, and certifications</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl text-sm font-semibold shadow-lg">
                <User size={16} />
                {operators.length} Operators
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-8">
        {/* Operators Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {operators.map((operator, index) => {
            const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
            return (
              <div
                key={operator.id}
                className="bg-white rounded-2xl shadow-sm hover:shadow-xl border border-gray-100 overflow-hidden transition-all duration-300 hover:scale-[1.02]"
              >
                {/* Card Header with Vibrant Gradient */}
                <div className={`bg-gradient-to-br ${gradient} p-6`}>
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-white/30 backdrop-blur-md rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-xl border-2 border-white/40">
                      {operator.full_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-white truncate drop-shadow-md">{operator.full_name}</h3>
                      <p className="text-white/95 text-sm truncate drop-shadow">{operator.email}</p>
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-6 space-y-4">
                  {/* Quick Stats with Colorful Gradients */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 rounded-xl p-3 border-2 border-green-200">
                      <div className="flex items-center gap-2 text-green-700 mb-1">
                        <DollarSign size={14} className="flex-shrink-0" />
                        <span className="text-xs font-medium">Rate</span>
                      </div>
                      <p className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                        {operator.hourly_rate ? `$${operator.hourly_rate}/hr` : 'Not set'}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-xl p-3 border-2 border-blue-200">
                      <div className="flex items-center gap-2 text-blue-700 mb-1">
                        <Briefcase size={14} className="flex-shrink-0" />
                        <span className="text-xs font-medium">Jobs</span>
                      </div>
                      <p className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        {operator.performance.total_jobs_completed || 0}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 rounded-xl p-3 border-2 border-amber-200">
                      <div className="flex items-center gap-2 text-amber-700 mb-1">
                        <DollarSign size={14} className="flex-shrink-0" />
                        <span className="text-xs font-medium">Revenue</span>
                      </div>
                      <p className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                        ${(operator.performance.total_revenue_generated || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 rounded-xl p-3 border-2 border-rose-200">
                      <div className="flex items-center gap-2 text-rose-700 mb-1">
                        <DollarSign size={14} className="flex-shrink-0" />
                        <span className="text-xs font-medium">Labor Cost</span>
                      </div>
                      <p className="text-lg font-bold bg-gradient-to-r from-rose-600 to-red-600 bg-clip-text text-transparent">
                        ${((operator.performance.total_hours_worked || 0) * (operator.hourly_rate || 0)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>

                  {/* Customer Ratings Section */}
                  {operator.total_ratings_received > 0 && (
                    <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 rounded-xl p-4 border-2 border-green-200">
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        <p className="text-xs font-bold text-green-900 uppercase">Customer Ratings</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="text-center bg-white rounded-lg p-2">
                          <div className="text-lg font-bold text-green-600">
                            {operator.cleanliness_rating_avg?.toFixed(1) || 'N/A'}
                          </div>
                          <div className="text-xs text-gray-600">Cleanliness</div>
                        </div>
                        <div className="text-center bg-white rounded-lg p-2">
                          <div className="text-lg font-bold text-blue-600">
                            {operator.communication_rating_avg?.toFixed(1) || 'N/A'}
                          </div>
                          <div className="text-xs text-gray-600">Communication</div>
                        </div>
                        <div className="text-center bg-white rounded-lg p-2">
                          <div className="text-lg font-bold text-purple-600">
                            {operator.overall_rating_avg?.toFixed(1) || 'N/A'}
                          </div>
                          <div className="text-xs text-gray-600">Overall</div>
                        </div>
                      </div>
                      <div className="text-xs text-center text-gray-500">
                        Based on {operator.total_ratings_received} customer {operator.total_ratings_received === 1 ? 'review' : 'reviews'}
                      </div>
                      {operator.last_rating_received_at && (
                        <div className="text-xs text-center text-gray-400 mt-1">
                          Last review: {new Date(operator.last_rating_received_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Skills Overview */}
                  {Object.keys(operator.skill_levels || {}).length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">Top Skills</p>
                      <div className="space-y-2">
                        {Object.entries(operator.skill_levels || {}).slice(0, 3).map(([taskId, skill]) => {
                          const task = AVAILABLE_TASKS.find(t => t.id === taskId);
                          return (
                            <div key={taskId} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 w-24 truncate">{task?.label}</span>
                              <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                  className={`h-2.5 rounded-full bg-gradient-to-r ${task?.gradient || 'from-blue-400 to-blue-600'}`}
                                  style={{ width: `${skill.proficiency * 10}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => handleEditOperator(operator)}
                      className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md hover:shadow-lg"
                    >
                      Edit Profile
                    </button>
                    <Link
                      href={`/dashboard/admin/operator-profiles/${operator.id}/equipment`}
                      className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
                    >
                      <Wrench size={16} />
                      Equipment
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {operators.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <User size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-600 text-lg font-medium">No operators found</p>
            <p className="text-gray-400 text-sm mt-2">Operators will appear here once they're added</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedOperator && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header with Vibrant Gradient */}
            <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 px-6 py-5 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-white drop-shadow-md">{selectedOperator.full_name}</h2>
                <p className="text-white/95 text-sm drop-shadow">{selectedOperator.email}</p>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-colors backdrop-blur-sm"
              >
                <XIcon size={20} className="text-white" />
              </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 px-6 flex gap-1 bg-gradient-to-r from-gray-50 to-gray-100 flex-shrink-0">
              <button
                onClick={() => setActiveTab('basic')}
                className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                  activeTab === 'basic'
                    ? 'border-purple-600 text-purple-600 bg-white rounded-t-lg'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Basic Info
              </button>
              <button
                onClick={() => setActiveTab('skills')}
                className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                  activeTab === 'skills'
                    ? 'border-purple-600 text-purple-600 bg-white rounded-t-lg'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Skills & Tasks
              </button>
              <button
                onClick={() => setActiveTab('equipment')}
                className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                  activeTab === 'equipment'
                    ? 'border-purple-600 text-purple-600 bg-white rounded-t-lg'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Equipment (1-10)
              </button>
              <button
                onClick={() => setActiveTab('certs')}
                className={`px-6 py-3 font-semibold text-sm transition-all border-b-2 ${
                  activeTab === 'certs'
                    ? 'border-purple-600 text-purple-600 bg-white rounded-t-lg'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Certifications & Docs
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1">
              {/* Basic Info Tab */}
              {activeTab === 'basic' && (
                <div className="space-y-6">
                  {/* Contact Information Section */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200">
                    <h3 className="font-bold text-gray-900 text-lg mb-4">Contact Information</h3>
                    <p className="text-xs text-gray-600 mb-4">This information will autofill silica exposure forms</p>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={selectedOperator.full_name || ''}
                          onChange={(e) => setSelectedOperator({
                            ...selectedOperator,
                            full_name: e.target.value
                          })}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none text-lg font-semibold text-gray-900 bg-white"
                          placeholder="John Doe"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={selectedOperator.phone_number || ''}
                          onChange={(e) => setSelectedOperator({
                            ...selectedOperator,
                            phone_number: e.target.value || null
                          })}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none text-lg font-semibold text-gray-900 bg-white"
                          placeholder="5555551234"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          Email
                        </label>
                        <input
                          type="email"
                          value={selectedOperator.email || ''}
                          onChange={(e) => setSelectedOperator({
                            ...selectedOperator,
                            email: e.target.value
                          })}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:outline-none text-lg font-semibold text-gray-900 bg-white"
                          placeholder="operator@pontifexindustries.com"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Employment Information Section */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        Hourly Rate (Labor Cost)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={selectedOperator.hourly_rate || ''}
                          onChange={(e) => setSelectedOperator({
                            ...selectedOperator,
                            hourly_rate: parseFloat(e.target.value) || null
                          })}
                          className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-lg font-semibold"
                          placeholder="25.00"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        Years Experience
                      </label>
                      <input
                        type="number"
                        value={selectedOperator.years_experience || ''}
                        onChange={(e) => setSelectedOperator({
                          ...selectedOperator,
                          years_experience: parseInt(e.target.value) || null
                        })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-lg font-semibold"
                        placeholder="5"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        Hire Date
                      </label>
                      <input
                        type="date"
                        value={selectedOperator.hire_date || ''}
                        onChange={(e) => setSelectedOperator({
                          ...selectedOperator,
                          hire_date: e.target.value || null
                        })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none text-lg font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Admin Notes
                    </label>
                    <textarea
                      value={selectedOperator.notes || ''}
                      onChange={(e) => setSelectedOperator({
                        ...selectedOperator,
                        notes: e.target.value || null
                      })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none"
                      rows={4}
                      placeholder="Internal notes about this operator..."
                    />
                  </div>
                </div>
              )}

              {/* Skills Tab */}
              {activeTab === 'skills' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500 mb-4">Rate skill level for each task (1-10 scale, 10 = Expert)</p>
                  {AVAILABLE_TASKS.map((task) => {
                    const isQualified = (selectedOperator.tasks_qualified_for || []).includes(task.id);
                    const skillLevel = selectedOperator.skill_levels?.[task.id]?.proficiency || 0;

                    return (
                      <div key={task.id} className="bg-gradient-to-r from-gray-50 to-white rounded-xl p-5 border-2 border-gray-200 hover:border-gray-300 transition-all">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{task.icon}</span>
                            <div>
                              <h3 className="font-bold text-gray-900">{task.label}</h3>
                              <p className="text-xs text-gray-500">
                                {isQualified ? `Skill Level: ${skillLevel}/10` : 'Not qualified'}
                              </p>
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isQualified}
                              onChange={() => toggleTask(task.id)}
                              className="w-5 h-5 text-purple-600 rounded"
                            />
                            <span className="text-sm font-medium text-gray-700">Qualified</span>
                          </label>
                        </div>

                        {isQualified && (
                          <div className="grid grid-cols-10 gap-2">
                            {SKILL_LEVELS.map((level) => (
                              <button
                                key={level}
                                onClick={() => updateTaskSkillLevel(task.id, level)}
                                className={`aspect-square rounded-lg text-xs font-bold transition-all ${
                                  skillLevel === level
                                    ? `bg-gradient-to-br ${task.gradient} text-white shadow-lg scale-110`
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border-2 border-gray-200'
                                }`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Equipment Tab with 1-10 Rating */}
              {activeTab === 'equipment' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500 mb-4">Rate proficiency for each equipment (1-10 scale, 10 = Master)</p>
                  {AVAILABLE_EQUIPMENT.map((equip) => {
                    const equipData = selectedOperator.equipment_qualified_for?.[equip.id];
                    const isQualified = equipData?.qualified || false;
                    const proficiency = equipData?.proficiency || 0;

                    return (
                      <div key={equip.id} className="bg-gradient-to-r from-gray-50 to-white rounded-xl p-5 border-2 border-gray-200 hover:border-gray-300 transition-all">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <Wrench size={24} className={isQualified ? `text-${equip.gradient.split('-')[1]}-500` : 'text-gray-400'} />
                            <div>
                              <h3 className="font-bold text-gray-900">{equip.label}</h3>
                              <p className="text-xs text-gray-500">
                                {isQualified ? `Proficiency: ${proficiency}/10` : 'Not qualified'}
                              </p>
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isQualified}
                              onChange={() => toggleEquipment(equip.id)}
                              className="w-5 h-5 text-purple-600 rounded"
                            />
                            <span className="text-sm font-medium text-gray-700">Qualified</span>
                          </label>
                        </div>

                        {isQualified && (
                          <div className="grid grid-cols-10 gap-2">
                            {EQUIPMENT_PROFICIENCY.map((level) => (
                              <button
                                key={level}
                                onClick={() => updateEquipmentProficiency(equip.id, level)}
                                className={`aspect-square rounded-lg text-xs font-bold transition-all ${
                                  proficiency === level
                                    ? `bg-gradient-to-br ${equip.gradient} text-white shadow-lg scale-110`
                                    : 'bg-white text-gray-600 hover:bg-gray-50 border-2 border-gray-200'
                                }`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Certifications Tab with PDF Upload */}
              {activeTab === 'certs' && (
                <div className="space-y-6">
                  {/* PDF Upload Section */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">Certification Documents</h3>
                        <p className="text-sm text-gray-600">Upload PDF files (OSHA cards, licenses, etc.)</p>
                      </div>
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="application/pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingPdf}
                          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-semibold text-sm transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                          <Upload size={16} />
                          {uploadingPdf ? 'Uploading...' : 'Upload PDF'}
                        </button>
                      </div>
                    </div>

                    {/* List of uploaded documents */}
                    <div className="space-y-2">
                      {(selectedOperator.certification_documents || []).map((doc, index) => (
                        <div key={index} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                          <div className="flex items-center gap-3">
                            <File size={20} className="text-red-500" />
                            <div>
                              <p className="font-medium text-gray-900">{doc.cert_name}</p>
                              <p className="text-xs text-gray-500">{doc.file_name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                            >
                              View
                            </a>
                            <button
                              onClick={() => removeCertDocument(index)}
                              className="w-8 h-8 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors flex items-center justify-center"
                            >
                              <XIcon size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {(!selectedOperator.certification_documents || selectedOperator.certification_documents.length === 0) && (
                        <p className="text-gray-400 text-center py-4">No documents uploaded yet</p>
                      )}
                    </div>
                  </div>

                  {/* Certification Details */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-gray-900 text-lg">Certification Details</h3>
                      <button
                        onClick={addCertification}
                        className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-semibold text-sm transition-all"
                      >
                        + Add Certification
                      </button>
                    </div>
                    <div className="space-y-3">
                      {(selectedOperator.certifications || []).map((cert, index) => (
                        <div key={index} className="flex gap-3 items-start bg-gray-50 p-4 rounded-xl border-2 border-gray-200">
                          <div className="flex-1 grid grid-cols-3 gap-3">
                            <input
                              type="text"
                              value={cert.name || ''}
                              onChange={(e) => updateCertification(index, 'name', e.target.value)}
                              className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none font-medium"
                              placeholder="Certification Name"
                            />
                            <input
                              type="date"
                              value={cert.issued_date || ''}
                              onChange={(e) => updateCertification(index, 'issued_date', e.target.value)}
                              className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
                            />
                            <input
                              type="date"
                              value={cert.expiry_date || ''}
                              onChange={(e) => updateCertification(index, 'expiry_date', e.target.value)}
                              className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
                              placeholder="Expiry (Optional)"
                            />
                          </div>
                          <button
                            onClick={() => removeCertification(index)}
                            className="w-10 h-10 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors flex items-center justify-center font-bold"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {(!selectedOperator.certifications || selectedOperator.certifications.length === 0) && (
                        <p className="text-gray-400 text-center py-8">No certifications added yet</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-gray-200 px-6 py-4 flex gap-3 bg-gradient-to-r from-gray-50 to-gray-100 flex-shrink-0">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-300 rounded-xl font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOperator}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-700 hover:via-pink-700 hover:to-rose-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
