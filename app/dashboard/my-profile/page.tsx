'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface OperatorMetrics {
  total_jobs_completed: number;
  total_linear_feet_cut: number;
  total_hours_worked: number;
  avg_linear_feet_per_hour: number;
  safety_score: number;
  customer_satisfaction_avg: number;
  total_customer_ratings: number;
  jobs_on_budget: number;
  jobs_over_budget: number;
}

interface OperatorSkill {
  work_type: string;
  proficiency_level: number;
  jobs_completed: number;
  avg_productivity: number;
  avg_customer_rating: number;
}

interface JobHistory {
  id: string;
  job_date: string;
  work_type: string;
  linear_feet_cut: number;
  hours_worked: number;
  productivity_rate: number;
  customer_rating: number;
}

export default function MyProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [operatorName, setOperatorName] = useState('');
  const [metrics, setMetrics] = useState<OperatorMetrics | null>(null);
  const [skills, setSkills] = useState<OperatorSkill[]>([]);
  const [recentJobs, setRecentJobs] = useState<JobHistory[]>([]);

  useEffect(() => {
    loadOperatorData();
  }, []);

  const loadOperatorData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Get operator profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        setOperatorName(`${profile.first_name} ${profile.last_name}`);
      }

      // Get performance metrics
      const { data: metricsData } = await supabase
        .from('operator_performance_metrics')
        .select('*')
        .eq('operator_id', session.user.id)
        .single();

      if (metricsData) {
        setMetrics(metricsData);
      }

      // Get skills
      const { data: skillsData } = await supabase
        .from('operator_skills')
        .select('*')
        .eq('operator_id', session.user.id)
        .order('avg_productivity', { ascending: false });

      if (skillsData) {
        setSkills(skillsData);
      }

      // Get recent job history
      const { data: jobsData } = await supabase
        .from('operator_job_history')
        .select('*')
        .eq('operator_id', session.user.id)
        .order('job_date', { ascending: false })
        .limit(10);

      if (jobsData) {
        setRecentJobs(jobsData);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading operator data:', error);
      setLoading(false);
    }
  };

  const getProficiencyLabel = (level: number) => {
    switch (level) {
      case 1: return 'Beginner';
      case 2: return 'Intermediate';
      case 3: return 'Advanced';
      case 4: return 'Expert';
      case 5: return 'Master';
      default: return 'Unknown';
    }
  };

  const formatWorkType = (workType: string) => {
    return workType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">My Performance Profile</h1>
                <p className="text-sm text-gray-600">{operatorName}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Overall Performance Stats */}
        {metrics ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {/* Jobs Completed */}
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-gray-900">{metrics.total_jobs_completed}</h3>
                <p className="text-sm text-gray-600 font-medium">Jobs Completed</p>
              </div>

              {/* Productivity Rate */}
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-gray-900">{metrics.avg_linear_feet_per_hour.toFixed(1)}</h3>
                <p className="text-sm text-gray-600 font-medium">LF/Hour Avg</p>
              </div>

              {/* Safety Score */}
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-gray-900">{metrics.safety_score.toFixed(0)}</h3>
                <p className="text-sm text-gray-600 font-medium">Safety Score</p>
              </div>

              {/* Customer Rating */}
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-gray-900">
                  {metrics.total_customer_ratings > 0 ? metrics.customer_satisfaction_avg.toFixed(1) : 'N/A'}
                </h3>
                <p className="text-sm text-gray-600 font-medium">
                  Customer Rating {metrics.total_customer_ratings > 0 && `(${metrics.total_customer_ratings})`}
                </p>
              </div>
            </div>

            {/* Additional Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <h4 className="text-sm font-semibold text-gray-600 mb-2">Total Production</h4>
                <p className="text-2xl font-bold text-gray-900">{metrics.total_linear_feet_cut.toFixed(0)} LF</p>
                <p className="text-xs text-gray-500 mt-1">Linear feet cut total</p>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <h4 className="text-sm font-semibold text-gray-600 mb-2">Total Hours</h4>
                <p className="text-2xl font-bold text-gray-900">{metrics.total_hours_worked.toFixed(1)} hrs</p>
                <p className="text-xs text-gray-500 mt-1">Hours worked total</p>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <h4 className="text-sm font-semibold text-gray-600 mb-2">Budget Performance</h4>
                <p className="text-2xl font-bold text-gray-900">
                  {metrics.total_jobs_completed > 0
                    ? ((metrics.jobs_on_budget / metrics.total_jobs_completed) * 100).toFixed(0)
                    : 0}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {metrics.jobs_on_budget} on budget, {metrics.jobs_over_budget} over
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-8 mb-6 text-center">
            <svg className="w-16 h-16 text-blue-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No Performance Data Yet</h3>
            <p className="text-gray-600">
              Complete your first job to start tracking your performance metrics!
            </p>
          </div>
        )}

        {/* Skills by Work Type */}
        {skills.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Skills by Work Type</h2>
            <div className="space-y-4">
              {skills.map((skill) => (
                <div key={skill.work_type} className="border-2 border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{formatWorkType(skill.work_type)}</h3>
                      <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold mt-1">
                        {getProficiencyLabel(skill.proficiency_level)}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">{skill.avg_productivity.toFixed(1)}</p>
                      <p className="text-xs text-gray-600">LF/Hour</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Jobs</p>
                      <p className="font-bold text-gray-900">{skill.jobs_completed}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Avg Rating</p>
                      <p className="font-bold text-gray-900">
                        {skill.avg_customer_rating > 0 ? skill.avg_customer_rating.toFixed(1) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Productivity</p>
                      <p className="font-bold text-gray-900">{skill.avg_productivity.toFixed(1)} LF/hr</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Job History */}
        {recentJobs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Recent Jobs</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Date</th>
                    <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Work Type</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Linear Feet</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Hours</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">LF/Hour</th>
                    <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((job) => (
                    <tr key={job.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-2 text-sm text-gray-900">
                        {new Date(job.job_date).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-900">
                        {job.work_type ? formatWorkType(job.work_type) : 'N/A'}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-900 text-right">
                        {job.linear_feet_cut?.toFixed(1) || '0.0'}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-900 text-right">
                        {job.hours_worked?.toFixed(1) || '0.0'}
                      </td>
                      <td className="py-3 px-2 text-sm font-bold text-gray-900 text-right">
                        {job.productivity_rate?.toFixed(1) || '0.0'}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-900 text-right">
                        {job.customer_rating ? (
                          <span className="inline-flex items-center">
                            {job.customer_rating}
                            <svg className="w-4 h-4 text-yellow-500 ml-1" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </span>
                        ) : (
                          'N/A'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
