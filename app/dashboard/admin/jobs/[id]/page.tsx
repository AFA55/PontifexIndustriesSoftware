'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft,
  MapPin,
  Clock,
  User,
  Phone,
  Wrench,
  FileText,
  CheckCircle,
  Circle,
  Navigation,
  Camera,
  PenTool,
  ClipboardCheck,
  AlertTriangle,
  Calendar,
  DollarSign,
  Building
} from 'lucide-react';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  job_type: string;
  location: string;
  address: string;
  description: string;
  status: string;
  priority: string;
  scheduled_date: string;
  arrival_time: string;
  shop_arrival_time?: string;
  estimated_hours: number;
  foreman_name: string;
  foreman_phone: string;
  salesman_name: string;
  equipment_needed: string[];
  assigned_operators: string[];
  quote_amount?: number;
  po_number?: string;
  customer_job_number?: string;
  created_at: string;
}

interface WorkflowStatus {
  id: string;
  job_order_id: string;
  operator_id: string;
  current_step: string;
  equipment_checklist_completed: boolean;
  sms_sent: boolean;
  silica_form_completed: boolean;
  work_performed_completed: boolean;
  pictures_submitted: boolean;
  customer_signature_received: boolean;
  created_at: string;
  updated_at: string;
}

interface OperatorProfile {
  id: string;
  full_name: string;
  email: string;
}

interface WorkflowWithOperator extends WorkflowStatus {
  operator?: OperatorProfile;
}

export default function AdminJobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [job, setJob] = useState<JobOrder | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowWithOperator[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminAndFetchData();
  }, [jobId]);

  const checkAdminAndFetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Check if user is admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profile?.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setIsAdmin(true);
      await Promise.all([
        fetchJobDetails(session.access_token),
        fetchWorkflowProgress(session.access_token)
      ]);
    } catch (error) {
      console.error('Error checking admin:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchJobDetails = async (token: string) => {
    try {
      const response = await fetch(`/api/job-orders?id=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.length > 0) {
          setJob(result.data[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching job:', error);
    }
  };

  const fetchWorkflowProgress = async (token: string) => {
    try {
      // Fetch all workflow records for this job (from all operators)
      const response = await fetch(`/api/admin/job-workflow?jobId=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setWorkflows(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching workflow:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'in_route': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'in_progress': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'completed': return 'bg-green-100 text-green-800 border-green-300';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'urgent': return 'bg-red-200 text-red-900';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const workflowSteps = [
    { key: 'equipment_checklist_completed', label: 'Equipment Checklist', icon: ClipboardCheck, description: 'Verified all equipment loaded' },
    { key: 'sms_sent', label: 'In Route', icon: Navigation, description: 'Started traveling to job site' },
    { key: 'silica_form_completed', label: 'Silica Form', icon: FileText, description: 'OSHA compliance form completed' },
    { key: 'work_performed_completed', label: 'Work Performed', icon: Wrench, description: 'Job work details recorded' },
    { key: 'pictures_submitted', label: 'Pictures', icon: Camera, description: 'Job photos uploaded' },
    { key: 'customer_signature_received', label: 'Customer Signature', icon: PenTool, description: 'Customer signed off on work' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-300 font-medium">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Job Not Found</h1>
          <Link href="/dashboard/admin" className="text-red-400 hover:text-red-300">
            Return to Admin Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard/admin/schedule-board"
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-all font-medium"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Schedule</span>
            </Link>

            <h1 className="text-xl font-bold text-white">
              Job #{job.job_number}
            </h1>

            <div className={`px-4 py-2 rounded-xl font-bold border-2 ${getStatusColor(job.status)}`}>
              {job.status?.replace('_', ' ').toUpperCase() || 'SCHEDULED'}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Job Header Card */}
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-3xl border border-slate-700/50 overflow-hidden mb-6">
          <div className="bg-gradient-to-r from-red-600 to-red-500 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">{job.title}</h2>
                <div className="flex items-center gap-4 text-red-100">
                  <div className="flex items-center gap-2">
                    <Building className="w-5 h-5" />
                    <span>{job.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wrench className="w-5 h-5" />
                    <span>{job.job_type}</span>
                  </div>
                </div>
              </div>
              <div className={`px-4 py-2 rounded-xl font-bold ${getPriorityColor(job.priority)}`}>
                {job.priority?.toUpperCase()} PRIORITY
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Location */}
              <div className="bg-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="font-semibold text-white">Location</h3>
                </div>
                <p className="text-gray-300 font-medium">{job.location}</p>
                <p className="text-gray-400 text-sm mt-1">{job.address}</p>
              </div>

              {/* Schedule */}
              <div className="bg-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-green-400" />
                  </div>
                  <h3 className="font-semibold text-white">Schedule</h3>
                </div>
                <p className="text-gray-300 font-medium">
                  {job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : 'Not scheduled'}
                </p>
                <div className="flex gap-4 mt-2 text-sm">
                  {job.shop_arrival_time && (
                    <span className="text-gray-400">Shop: <span className="text-green-400">{job.shop_arrival_time}</span></span>
                  )}
                  {job.arrival_time && (
                    <span className="text-gray-400">Site: <span className="text-blue-400">{job.arrival_time}</span></span>
                  )}
                </div>
              </div>

              {/* Contact */}
              <div className="bg-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                    <User className="w-5 h-5 text-purple-400" />
                  </div>
                  <h3 className="font-semibold text-white">On-Site Contact</h3>
                </div>
                <p className="text-gray-300 font-medium">{job.foreman_name || 'N/A'}</p>
                {job.foreman_phone && (
                  <a href={`tel:${job.foreman_phone}`} className="flex items-center gap-2 text-blue-400 hover:text-blue-300 mt-1">
                    <Phone className="w-4 h-4" />
                    {job.foreman_phone}
                  </a>
                )}
              </div>

              {/* Estimated Hours */}
              <div className="bg-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-orange-400" />
                  </div>
                  <h3 className="font-semibold text-white">Estimated Time</h3>
                </div>
                <p className="text-3xl font-bold text-orange-400">{job.estimated_hours || 0} hrs</p>
              </div>

              {/* Quote */}
              {job.quote_amount && (
                <div className="bg-slate-700/50 rounded-2xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-green-400" />
                    </div>
                    <h3 className="font-semibold text-white">Quote Amount</h3>
                  </div>
                  <p className="text-3xl font-bold text-green-400">${job.quote_amount.toLocaleString()}</p>
                </div>
              )}

              {/* Salesman */}
              <div className="bg-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                    <User className="w-5 h-5 text-yellow-400" />
                  </div>
                  <h3 className="font-semibold text-white">Salesman</h3>
                </div>
                <p className="text-gray-300 font-medium">{job.salesman_name || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Job Description */}
        {job.description && (
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-3xl border border-slate-700/50 p-6 mb-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-400" />
              Job Description
            </h3>
            <div className="bg-slate-700/50 rounded-2xl p-4">
              <pre className="whitespace-pre-wrap text-gray-300 font-medium leading-relaxed">
                {job.description}
              </pre>
            </div>
          </div>
        )}

        {/* Equipment Checklist */}
        {job.equipment_needed && job.equipment_needed.length > 0 && (
          <div className="bg-slate-800/50 backdrop-blur-lg rounded-3xl border border-slate-700/50 p-6 mb-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Wrench className="w-6 h-6 text-green-400" />
              Equipment Required
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {job.equipment_needed.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl">
                  <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <span className="text-gray-300 font-medium">{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Operator Workflow Progress */}
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-3xl border border-slate-700/50 p-6">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-red-400" />
            Operator Workflow Progress
          </h3>

          {workflows.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-yellow-400" />
              </div>
              <h4 className="text-xl font-semibold text-white mb-2">No Workflow Started</h4>
              <p className="text-gray-400">No operator has started working on this job yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {workflows.map((workflow) => (
                <div key={workflow.id} className="bg-slate-700/30 rounded-2xl p-6">
                  {/* Operator Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center">
                        <span className="text-white font-bold text-lg">
                          {workflow.operator?.full_name?.charAt(0) || 'O'}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-lg">
                          {workflow.operator?.full_name || 'Unknown Operator'}
                        </h4>
                        <p className="text-gray-400 text-sm">{workflow.operator?.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-sm">Current Step</p>
                      <p className="text-white font-semibold">{workflow.current_step?.replace('_', ' ').toUpperCase()}</p>
                    </div>
                  </div>

                  {/* Workflow Steps */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {workflowSteps.map((step, idx) => {
                      const isCompleted = workflow[step.key as keyof WorkflowStatus] === true;
                      const StepIcon = step.icon;

                      return (
                        <div
                          key={step.key}
                          className={`relative p-4 rounded-xl border-2 transition-all ${
                            isCompleted
                              ? 'bg-green-500/20 border-green-500/50'
                              : 'bg-slate-700/50 border-slate-600/50'
                          }`}
                        >
                          <div className="flex flex-col items-center text-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                              isCompleted ? 'bg-green-500' : 'bg-slate-600'
                            }`}>
                              {isCompleted ? (
                                <CheckCircle className="w-5 h-5 text-white" />
                              ) : (
                                <StepIcon className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                            <span className={`text-xs font-semibold ${
                              isCompleted ? 'text-green-400' : 'text-gray-400'
                            }`}>
                              {step.label}
                            </span>
                          </div>
                          {/* Step Number Badge */}
                          <div className={`absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            isCompleted ? 'bg-green-500 text-white' : 'bg-slate-600 text-gray-300'
                          }`}>
                            {idx + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Timestamps */}
                  <div className="mt-4 pt-4 border-t border-slate-600/50 flex justify-between text-sm text-gray-400">
                    <span>Started: {new Date(workflow.created_at).toLocaleString()}</span>
                    <span>Last Update: {new Date(workflow.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
