'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  location: string;
  address: string;
  equipment_needed: string[];
  scheduled_date: string;
  arrival_time: string;
  shop_arrival_time?: string;
}

export default function EquipmentChecklistPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [job, setJob] = useState<JobOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
    }
  }, [jobId]);

  const fetchJobDetails = async () => {
    try {
      console.log('🔍 EQUIPMENT PAGE - Fetching job with ID:', jobId);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      // Force fresh data with cache busting
      const timestamp = new Date().getTime();
      console.log('📡 EQUIPMENT PAGE - Making API call to:', `/api/job-orders?id=${jobId}&t=${timestamp}`);
      const response = await fetch(`/api/job-orders?id=${jobId}&t=${timestamp}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ EQUIPMENT PAGE - API Response:', result);
        if (result.success && result.data.length > 0) {
          console.log('📋 EQUIPMENT PAGE - Setting job data:', result.data[0].job_number, result.data[0].title);
          setJob(result.data[0]);
          // Initialize checked items
          const initialChecked: {[key: string]: boolean} = {};
          result.data[0].equipment_needed?.forEach((item: string) => {
            initialChecked[item] = false;
          });
          setCheckedItems(initialChecked);
        } else {
          console.error('❌ EQUIPMENT PAGE - No job data returned');
        }
      } else {
        console.error('❌ EQUIPMENT PAGE - API call failed:', response.status);
      }
    } catch (error) {
      console.error('Error fetching job:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEquipment = (item: string) => {
    setCheckedItems(prev => ({
      ...prev,
      [item]: !prev[item]
    }));
  };

  const allChecked = job?.equipment_needed ?
    job.equipment_needed.every(item => checkedItems[item]) : false;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading equipment list...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Job Not Found</h1>
          <Link href="/dashboard/job-schedule" className="text-blue-600 hover:underline">
            Return to Job Schedule
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-500 text-white sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <Link
              href="/dashboard/job-schedule"
              className="flex items-center gap-2 px-4 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-2xl transition-all duration-300 font-medium backdrop-blur-sm"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </Link>
            <h1 className="text-2xl font-bold">Equipment Checklist</h1>
            <div className="w-24"></div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3">
            <p className="text-sm text-green-100">Job: {job.job_number}</p>
            <p className="font-semibold text-lg">{job.title}</p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Job Info Card */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Job Information</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Customer</p>
              <p className="font-semibold text-gray-900">{job.customer_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Location</p>
              <p className="font-semibold text-gray-900">{job.location}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-gray-600">Address</p>
              <p className="font-semibold text-gray-900">{job.address}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Arrival Time</p>
              <p className="font-semibold text-gray-900">{job.arrival_time || 'TBD'}</p>
            </div>
            {job.shop_arrival_time && (
              <div>
                <p className="text-sm text-gray-600">Shop Arrival</p>
                <p className="font-semibold text-gray-900">{job.shop_arrival_time}</p>
              </div>
            )}
          </div>
        </div>

        {/* Equipment Checklist */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Required Equipment</h2>

          {job.equipment_needed && job.equipment_needed.length > 0 ? (
            <div className="space-y-3">
              {job.equipment_needed.map((item, index) => (
                <button
                  key={index}
                  onClick={() => toggleEquipment(item)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                    checkedItems[item]
                      ? 'bg-green-50 border-green-500 hover:bg-green-100'
                      : 'bg-white border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {checkedItems[item] ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                  ) : (
                    <Circle className="w-6 h-6 text-gray-400 flex-shrink-0" />
                  )}
                  <span className={`text-left font-medium ${
                    checkedItems[item] ? 'text-green-900' : 'text-gray-900'
                  }`}>
                    {item}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-center py-8">No equipment specified for this job</p>
          )}

          {/* Progress */}
          {job.equipment_needed && job.equipment_needed.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Progress</span>
                <span className="text-sm font-semibold text-green-600">
                  {Object.values(checkedItems).filter(Boolean).length} / {job.equipment_needed.length}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-300"
                  style={{
                    width: `${(Object.values(checkedItems).filter(Boolean).length / job.equipment_needed.length) * 100}%`
                  }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        {allChecked && job.equipment_needed && job.equipment_needed.length > 0 && (
          <button
            onClick={async () => {
              // Mark equipment checklist as complete
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                await fetch('/api/workflow', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                  },
                  body: JSON.stringify({
                    jobId: jobId,
                    completedStep: 'equipment_checklist'
                  })
                });
              }
              // Redirect to in-route page to show location
              router.push(`/dashboard/job-schedule/${jobId}/in-route`);
            }}
            className="w-full px-8 py-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white rounded-2xl font-bold text-lg shadow-2xl transition-all"
          >
            ✓ Continue to In Route
          </button>
        )}
      </div>
    </div>
  );
}
