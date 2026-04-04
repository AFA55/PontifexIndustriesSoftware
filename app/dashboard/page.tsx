'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, logout, isAdmin, type User } from '@/lib/auth';
import { verifyShopLocation } from '@/lib/geolocation';
import { supabase } from '@/lib/supabase';
import OnboardingTour from '@/components/OnboardingTour';
import NfcClockInModal from '@/components/NfcClockInModal';
import NotificationBell from '@/components/NotificationBell';
import { useBranding } from '@/lib/branding-context';

// Dynamic Logo Component — uses branding if available
function BrandedLogo({ className = "h-8", logoUrl, companyName }: { className?: string; logoUrl?: string | null; companyName?: string }) {
  if (logoUrl) {
    return <img src={logoUrl} alt={companyName || 'Company Logo'} className={`${className} w-auto object-contain`} />;
  }
  return (
    <svg
      className={className}
      viewBox="0 0 250 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        <path
          d="M20 15L35 5L50 15L50 35L35 45L20 35L20 25L35 25L35 35L42 30L42 20L35 15L28 20L28 30L20 25V15Z"
          fill="url(#op-patriot-gradient)"
        />
        <path
          d="M25 20L30 17L35 20L35 25L30 28L25 25V20Z"
          fill="currentColor"
          opacity="0.3"
        />
      </g>
      <g fill="currentColor">
        <text x="65" y="25" className="text-lg font-bold" style={{fontSize: '18px', fontFamily: 'Inter, sans-serif'}}>
          {(companyName || 'PONTIFEX').toUpperCase().split(' ')[0]}
        </text>
        <text x="65" y="45" className="text-sm" style={{fontSize: '12px', fontFamily: 'Inter, sans-serif', opacity: '0.8'}}>
          {(companyName || 'PONTIFEX INDUSTRIES').toUpperCase().split(' ').slice(1).join(' ') || 'INDUSTRIES'}
        </text>
      </g>
      <defs>
        <linearGradient id="op-patriot-gradient" x1="20" y1="5" x2="50" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dc2626" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1e40af" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface Timecard {
  id: string;
  clockInTime: string;
  currentHours: number;
}

type OperatorStatus = 'clocked_in' | 'en_route' | 'in_progress' | 'job_completed' | 'clocked_out';

export default function Dashboard() {
  const { branding } = useBranding();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [currentTimecard, setCurrentTimecard] = useState<Timecard | null>(null);
  const [currentHours, setCurrentHours] = useState(0);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockMessage, setClockMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [currentStatus, setCurrentStatus] = useState<OperatorStatus>('clocked_out');
  const [statusLoading, setStatusLoading] = useState(false);
  const [activeJobsCount, setActiveJobsCount] = useState(0);
  const [weeklyHours, setWeeklyHours] = useState(0);
  const [operatorAvatarUrl, setOperatorAvatarUrl] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isDemoOperator, setIsDemoOperator] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [isShopHours, setIsShopHours] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showNfcClockInModal, setShowNfcClockInModal] = useState(false);
  const [clockOutBlock, setClockOutBlock] = useState<{
    show: boolean;
    blockType: string;
    incompleteJobs: { id: string; job_number: string; customer_name: string }[];
  }>({ show: false, blockType: '', incompleteJobs: [] });
  const [debugInfo, setDebugInfo] = useState<{
    gpsStatus: string;
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    distanceFromShop: string;
    lastError: string;
    apiResponse: string;
    timestamp: string;
  }>({
    gpsStatus: 'idle',
    latitude: null,
    longitude: null,
    accuracy: null,
    distanceFromShop: '-',
    lastError: '',
    apiResponse: '',
    timestamp: '',
  });
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();

    if (!currentUser) {
      router.push('/login');
      return;
    }

    // Redirect based on role
    if (currentUser.role === 'admin') {
      router.push('/dashboard/admin');
      return;
    }

    // For operator or default, stay on this dashboard
    setUser(currentUser);

    // Fetch avatar non-blocking
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      fetch('/api/my-profile', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(json => { if (json?.data?.profile_picture_url) setOperatorAvatarUrl(json.data.profile_picture_url); })
        .catch(() => {});
    });

    // Check if this is demo operator account
    const isDemo = currentUser.email?.toLowerCase().includes('demo') ||
                   currentUser.email === 'operator@demo.com';
    setIsDemoOperator(isDemo);

    // Show walkthrough for demo operator on first visit
    if (isDemo) {
      const hasSeenWalkthrough = localStorage.getItem('demo-operator-walkthrough-seen');
      if (!hasSeenWalkthrough) {
        setShowWalkthrough(true);
      }
    }

    checkClockStatus();
    fetchActiveJobs();
    fetchWeeklyHours();

    // Check if user should see onboarding tour
    checkOnboardingStatus(currentUser);

    setLoading(false);

    // Refresh active jobs count every 30 seconds to stay in sync with admin changes
    const refreshInterval = setInterval(() => {
      fetchActiveJobs();
    }, 30000); // 30 seconds

    return () => clearInterval(refreshInterval);
  }, [router]);

  // Check if user should see onboarding tour
  const checkOnboardingStatus = (currentUser: User) => {
    const completed = localStorage.getItem('pontifex_tour_completed');
    if (!completed) {
      setShowOnboarding(true);
    }
  };

  // Fetch weekly hours
  const fetchWeeklyHours = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get current week bounds (Monday to Sunday)
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(monday.getDate() - monday.getDay() + 1);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const response = await fetch(
        `/api/timecard/history?startDate=${monday.toISOString().split('T')[0]}&endDate=${sunday.toISOString().split('T')[0]}&limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );
      const result = await response.json();

      if (result.success) {
        const totalHours = result.data.timecards.reduce((sum: number, entry: any) => {
          return sum + (entry.total_hours || 0);
        }, 0);
        setWeeklyHours(totalHours);
      }
    } catch (error) {
      console.error('Error fetching weekly hours:', error);
    }
  };

  // Check if user is currently clocked in
  const checkClockStatus = async () => {
    try {
      // Get Supabase session token
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.warn('⚠️ No active session found - session may have expired. Redirecting to login...');
        localStorage.removeItem('supabase-user');
        localStorage.removeItem('patriot-user');
        window.location.href = '/login';
        return;
      }

      const response = await fetch('/api/timecard/current', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const result = await response.json();

      if (result.success && result.isClockedIn) {
        setIsClockedIn(true);
        setCurrentTimecard(result.data);
        setCurrentHours(result.data.currentHours);
        // Fetch current status
        fetchCurrentStatus();
      } else {
        setIsClockedIn(false);
        setCurrentTimecard(null);
        setCurrentStatus('clocked_out');
      }
    } catch (error) {
      console.error('Error checking clock status:', error);
    }
  };

  // Fetch current operator status
  const fetchCurrentStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/operator/status', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const result = await response.json();

      if (result.success && result.data) {
        setCurrentStatus(result.data.status);
      }
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  };

  // Fetch active jobs count
  const fetchActiveJobs = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/job-orders', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      const result = await response.json();

      if (result.success && result.data) {
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Count only active jobs scheduled for TODAY (not completed/cancelled)
        const activeCount = result.data.filter((job: any) => {
          const jobDate = job.scheduled_date ? new Date(job.scheduled_date).toISOString().split('T')[0] : null;
          return (
            jobDate === today && // Only jobs scheduled for today
            job.status !== 'completed' &&
            job.status !== 'cancelled'
          );
        }).length;
        setActiveJobsCount(activeCount);
      }
    } catch (error) {
      console.error('Error fetching active jobs:', error);
    }
  };

  // Update operator status
  const updateStatus = async (newStatus: OperatorStatus) => {
    setStatusLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setClockMessage({
          type: 'error',
          text: 'Session expired. Please log in again.',
        });
        setStatusLoading(false);
        return;
      }

      // Get current location
      const verification = await verifyShopLocation();

      const response = await fetch('/api/operator/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: newStatus,
          latitude: verification.location?.latitude,
          longitude: verification.location?.longitude,
          accuracy: verification.location?.accuracy,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setClockMessage({
          type: 'error',
          text: result.error || 'Failed to update status',
        });
        setStatusLoading(false);
        return;
      }

      setCurrentStatus(newStatus);
      setClockMessage({
        type: 'success',
        text: result.message,
      });

      // If clocking out, also update the clock status
      if (newStatus === 'clocked_out') {
        setIsClockedIn(false);
        setCurrentTimecard(null);
        setCurrentHours(0);
      }

      setTimeout(() => setClockMessage(null), 3000);
    } catch (error: any) {
      console.error('Error updating status:', error);
      setClockMessage({
        type: 'error',
        text: error.message || 'An error occurred while updating status',
      });
    } finally {
      setStatusLoading(false);
    }
  };

  // Update current hours every minute when clocked in
  useEffect(() => {
    if (!isClockedIn || !currentTimecard) return;

    const interval = setInterval(() => {
      const clockInTime = new Date(currentTimecard.clockInTime);
      const now = new Date();
      const hours = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
      setCurrentHours(parseFloat(hours.toFixed(2)));
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [isClockedIn, currentTimecard]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  // Lock all cards except Clock In/Out and View Timecard for ALL operators
  // Building one feature at a time — everything else stays blurred
  const isCardAccessible = (cardName: string) => {
    const accessibleCards = [
      'View Timecard',
    ];
    return accessibleCards.includes(cardName);
  };

  // Open the NFC clock-in modal instead of directly clocking in
  const handleClockIn = () => {
    setShowNfcClockInModal(true);
  };

  // Called by NfcClockInModal when a method is chosen and verified
  const performClockIn = async (data: {
    method: string;
    nfc_tag_id?: string;
    nfc_tag_uid?: string;
    remote_photo_url?: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
  }) => {
    setClockLoading(true);
    setClockMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setClockMessage({ type: 'error', text: 'Session expired. Please log in again.' });
        setClockLoading(false);
        throw new Error('Session expired');
      }

      setDebugInfo(prev => ({
        ...prev,
        gpsStatus: `${data.method} verified ✅`,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy || null,
        timestamp: new Date().toISOString(),
      }));

      const response = await fetch('/api/timecard/clock-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          is_shop_hours: isShopHours,
          clock_in_method: data.method,
          nfc_tag_id: data.nfc_tag_id,
          nfc_tag_uid: data.nfc_tag_uid,
          remote_photo_url: data.remote_photo_url,
        }),
      });

      const result = await response.json();

      setDebugInfo(prev => ({
        ...prev,
        apiResponse: JSON.stringify(result, null, 2).substring(0, 500),
      }));

      if (!response.ok) {
        const errorDetail = result.details ? `\n${result.details}` : '';
        const errorText = (result.error || 'Failed to clock in') + errorDetail;
        setClockMessage({ type: 'error', text: errorText });
        setClockLoading(false);
        throw new Error(errorText);
      }

      setIsClockedIn(true);
      setCurrentTimecard({
        id: result.data.id,
        clockInTime: result.data.clockInTime,
        currentHours: 0,
      });
      setCurrentStatus('clocked_in');
      setShowNfcClockInModal(false);

      const flags = [];
      if (isShopHours) flags.push('🏭 Shop Hours');
      if (result.data.isNightShift) flags.push('🌙 Night Shift');
      if (result.data.hourType === 'mandatory_overtime') flags.push('⚠️ Weekend OT');
      if (data.method === 'nfc') flags.push('📱 NFC Verified');
      if (data.method === 'remote') flags.push('📷 Remote (Pending Approval)');

      setClockMessage({
        type: 'success',
        text: result.message + (flags.length > 0 ? ` (${flags.join(', ')})` : ''),
      });

      setIsShopHours(false);

      // Create initial status entry (fire-and-forget)
      fetch('/api/operator/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: 'clocked_in',
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
        }),
      }).catch(() => {});

      setTimeout(() => setClockMessage(null), 5000);
    } catch (error: unknown) {
      console.error('Error clocking in:', error);
      const msg = error instanceof Error ? error.message : 'An error occurred';
      setDebugInfo(prev => ({ ...prev, lastError: msg, gpsStatus: 'error' }));
      if (!clockMessage) {
        setClockMessage({ type: 'error', text: msg });
      }
      throw error; // Re-throw so modal knows it failed
    } finally {
      setClockLoading(false);
    }
  };

  const handleClockOut = async () => {
    setClockLoading(true);
    setClockMessage(null);

    try {
      setDebugInfo(prev => ({ ...prev, gpsStatus: 'requesting...', timestamp: new Date().toISOString() }));

      // Get Supabase session token
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setClockMessage({ type: 'error', text: 'Session expired. Please log in again.' });
        setDebugInfo(prev => ({ ...prev, lastError: 'No session found', gpsStatus: 'error' }));
        setClockLoading(false);
        return;
      }

      // Verify location
      const verification = await verifyShopLocation();

      setDebugInfo(prev => ({
        ...prev,
        gpsStatus: verification.verified ? 'verified ✅' : 'rejected ❌',
        latitude: verification.location?.latitude || null,
        longitude: verification.location?.longitude || null,
        accuracy: verification.location?.accuracy || null,
        distanceFromShop: verification.distanceFormatted || '-',
        lastError: verification.error || '',
      }));

      if (!verification.verified) {
        setClockMessage({
          type: 'error',
          text: verification.error || 'Location verification failed',
        });
        setClockLoading(false);
        return;
      }

      // Call clock-out API with auth token
      const response = await fetch('/api/timecard/clock-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          latitude: verification.location.latitude,
          longitude: verification.location.longitude,
          accuracy: verification.location.accuracy,
        }),
      });

      const result = await response.json();

      setDebugInfo(prev => ({
        ...prev,
        apiResponse: JSON.stringify(result, null, 2).substring(0, 500),
      }));

      if (!response.ok) {
        // Check for work-performed block
        if (response.status === 403 && result.block_type) {
          setClockOutBlock({
            show: true,
            blockType: result.block_type,
            incompleteJobs: result.incomplete_jobs || [],
          });
          setClockLoading(false);
          return;
        }

        const errorDetail = result.details ? `\n${result.details}` : '';
        setClockMessage({
          type: 'error',
          text: (result.error || 'Failed to clock out') + errorDetail,
        });
        setClockLoading(false);
        return;
      }

      setIsClockedIn(false);
      setCurrentTimecard(null);
      setCurrentHours(0);
      setClockMessage({
        type: 'success',
        text: `${result.message} — Total hours this entry: ${result.data.totalHours}`,
      });

      // Refresh weekly hours
      fetchWeeklyHours();

      // Hide success message after 5 seconds
      setTimeout(() => setClockMessage(null), 5000);
    } catch (error: any) {
      console.error('Error clocking out:', error);
      setDebugInfo(prev => ({ ...prev, lastError: error.message, gpsStatus: 'error' }));
      setClockMessage({
        type: 'error',
        text: error.message || 'An error occurred while clocking out',
      });
    } finally {
      setClockLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Onboarding Tour */}
      {showOnboarding && user && (
        <OnboardingTour
          userId={user.id}
          onComplete={() => setShowOnboarding(false)}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

      {/* Clock-Out Block Modal */}
      {clockOutBlock.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Cannot Clock Out</h3>
              <p className="text-gray-600 text-sm">
                {clockOutBlock.blockType === 'work_performed_required'
                  ? 'You must complete work performed for all dispatched jobs before clocking out.'
                  : 'You must submit a work log for all dispatched jobs before clocking out.'}
              </p>
            </div>

            <div className="space-y-2 mb-6">
              <p className="text-sm font-semibold text-gray-700">Incomplete jobs:</p>
              {clockOutBlock.incompleteJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => {
                    setClockOutBlock({ show: false, blockType: '', incompleteJobs: [] });
                    if (clockOutBlock.blockType === 'work_performed_required') {
                      router.push(`/dashboard/job-schedule/${job.id}/work-performed`);
                    } else {
                      router.push('/dashboard/my-jobs');
                    }
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all text-left"
                >
                  <div>
                    <span className="text-sm font-bold text-gray-900">#{job.job_number}</span>
                    <span className="text-sm text-gray-600 ml-2">{job.customer_name}</span>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            <button
              onClick={() => setClockOutBlock({ show: false, blockType: '', incompleteJobs: [] })}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Demo Operator Walkthrough */}
      {showWalkthrough && isDemoOperator && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fade-in-up">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 rounded-t-3xl text-white">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-3xl font-bold">Welcome to {branding.company_short_name || 'Patriot'}!</h2>
                  <p className="text-blue-100 mt-1">Demo Operator Dashboard Tour</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-8 space-y-6">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-blue-900 text-lg mb-2">This is a Demo Account</h3>
                    <p className="text-blue-800 text-sm leading-relaxed">
                      You&apos;re exploring a limited demonstration of the {branding.company_short_name || 'Patriot'} operator platform.
                      Some features are restricted to showcase the full platform capabilities.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-gray-900 text-xl mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Available Features
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl border-2 border-green-200">
                    <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900 mb-1">Job Schedule</h4>
                      <p className="text-sm text-gray-700">View assigned jobs, navigate to job sites, and track your daily work</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl border-2 border-green-200">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-pink-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900 mb-1">View Timecard</h4>
                      <p className="text-sm text-gray-700">Track your hours, view attendance history, and manage clock in/out</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-6">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-orange-900 text-lg mb-2">Restricted Features</h3>
                    <p className="text-orange-800 text-sm leading-relaxed mb-3">
                      The following features are blurred in demo mode. In the full version, operators can:
                    </p>
                    <ul className="text-orange-800 text-sm space-y-1 list-disc list-inside">
                      <li>Request time off and vacation</li>
                      <li>And much more...</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">Ready to Explore?</h3>
                  <p className="text-gray-700 text-sm mb-4">
                    Start by clocking in and checking out the Job Schedule to see how operators manage their daily work!
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-gray-50 rounded-b-3xl border-t-2 border-gray-200">
              <button
                onClick={() => {
                  localStorage.setItem('demo-operator-walkthrough-seen', 'true');
                  setShowWalkthrough(false);
                }}
                className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transform hover:scale-[1.02] transition-all duration-200"
              >
                Start Exploring! 🎯
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full opacity-5 blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Modern Header with Professional Gradient */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 border-b border-blue-800 sticky top-0 z-10 shadow-2xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Company Logo with Animation */}
            <div className="transform hover:scale-105 transition-transform duration-200">
              <BrandedLogo className="h-10 text-white" logoUrl={branding.logo_dark_url || branding.logo_url} companyName={branding.company_name} />
            </div>

            {/* Modern Profile Section */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-3 bg-white/10 backdrop-blur-lg px-4 py-2 rounded-xl border border-white/20">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg ring-2 ring-white/30 overflow-hidden flex-shrink-0">
                  {operatorAvatarUrl ? (
                    <img src={operatorAvatarUrl} alt={user?.name || ''} className="w-full h-full object-cover" />
                  ) : (
                    user?.name?.charAt(0) || 'D'
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{user?.name || 'Demo Operator'}</p>
                  <p className="text-xs text-blue-200 capitalize font-medium">{user?.role || 'Operator'}</p>
                </div>
              </div>

              {/* Notification Bell */}
              <NotificationBell variant="dark" />

              {/* Premium Logout Button */}
              <button
                onClick={handleLogout}
                className="group flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-gradient-to-r from-red-500 via-red-600 to-pink-600 hover:from-red-600 hover:via-red-700 hover:to-pink-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 font-medium"
              >
                <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 sm:py-8 relative">
        {/* Modern Animated Greeting */}
        <div className="text-center mb-8 sm:mb-10 animate-fade-in">
          <div className="w-full">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3 animate-gradient drop-shadow-sm">
              Welcome back, {user?.name?.split(' ')[0] || 'Demo'}!
            </h1>
            <p className="text-gray-700 text-base sm:text-lg font-medium">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {/* Quick Stats Bar with Professional Gradients */}
          <div className="flex justify-center gap-4 mt-8">
            <div className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-2xl p-5 sm:p-6 shadow-xl flex-1 max-w-[160px] transform hover:scale-105 transition-all">
              <p className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">{activeJobsCount}</p>
              <p className="text-sm text-white/90 font-semibold mt-1">Active Jobs</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 rounded-2xl p-5 sm:p-6 shadow-xl flex-1 max-w-[160px] transform hover:scale-105 transition-all">
              <p className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">{currentHours.toFixed(1)}</p>
              <p className="text-sm text-white/90 font-semibold mt-1">Hours Today</p>
            </div>
          </div>
        </div>

        {/* Clock Message */}
        {clockMessage && (
          <div className="max-w-5xl mx-auto mb-6 animate-fade-in">
            <div className={`${
              clockMessage.type === 'success'
                ? 'bg-green-50 border-green-300'
                : 'bg-red-50 border-red-300'
            } border-2 rounded-2xl p-6 shadow-lg`}>
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 ${
                  clockMessage.type === 'success' ? 'bg-green-200' : 'bg-red-200'
                } rounded-full flex items-center justify-center`}>
                  {clockMessage.type === 'success' ? (
                    <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className={`${
                    clockMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
                  } font-bold text-lg`}>
                    {clockMessage.type === 'success' ? 'Success!' : 'Error'}
                  </p>
                  <p className={`${
                    clockMessage.type === 'success' ? 'text-green-700' : 'text-red-700'
                  } font-medium`}>
                    {clockMessage.text}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
            HERO CLOCK IN/OUT CARD — Primary Feature
            ═══════════════════════════════════════════════════════ */}
        <div className="max-w-5xl mx-auto mb-10 animate-fade-in">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border-2 border-white/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center space-x-5">
                <div className={`w-20 h-20 bg-gradient-to-br ${
                  isClockedIn
                    ? 'from-rose-500 via-red-500 to-pink-600'
                    : 'from-emerald-500 via-green-500 to-teal-600'
                } rounded-3xl flex items-center justify-center shadow-2xl ring-4 ring-white`}>
                  <svg className="w-10 h-10 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-1">
                    {isClockedIn ? 'Ready to Clock Out?' : 'Start Your Shift'}
                  </h3>
                  <p className="text-gray-700 font-semibold text-base">
                    {isClockedIn
                      ? `You've been working for ${currentHours.toFixed(1)} hours`
                      : 'Clock in when you arrive at the shop'
                    }
                  </p>
                  {isClockedIn && currentTimecard && (
                    <p className="text-sm text-gray-600 mt-1.5 font-medium">
                      Clocked in at {new Date(currentTimecard.clockInTime).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-3 w-full sm:w-auto">
                {/* Shop Hours Checkbox — only visible when NOT clocked in (for re-clock-in) */}
                {!isClockedIn && (
                  <label className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-2 border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors w-full sm:w-auto">
                    <input
                      type="checkbox"
                      checked={isShopHours}
                      onChange={(e) => setIsShopHours(e.target.checked)}
                      className="w-5 h-5 rounded border-2 border-amber-400 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-sm font-bold text-amber-900">🏭 Shop Hours</span>
                      <p className="text-xs text-amber-700">Check if working at the shop</p>
                    </div>
                  </label>
                )}

                <button
                  onClick={isClockedIn ? handleClockOut : handleClockIn}
                  disabled={clockLoading}
                  className={`group flex items-center justify-center space-x-3 w-full sm:w-auto ${
                    isClockedIn
                      ? 'bg-gradient-to-r from-rose-600 via-red-600 to-pink-600 hover:from-rose-700 hover:via-red-700 hover:to-pink-700'
                      : 'bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:from-emerald-700 hover:via-green-700 hover:to-teal-700'
                  } text-white font-bold py-5 px-10 rounded-2xl transition-all duration-300 hover:scale-105 shadow-xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
                >
                  {clockLoading ? (
                    <>
                      <div className="animate-spin w-6 h-6 border-3 border-white border-t-transparent rounded-full"></div>
                      <span className="text-lg">Verifying Location...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {isClockedIn ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        )}
                      </svg>
                      <span className="text-lg">{isClockedIn ? 'Clock Out' : 'Clock In'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Debug Info Toggle */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className="text-xs text-gray-400 hover:text-gray-600 font-mono transition-colors"
              >
                {showDebugPanel ? '▼ Hide Debug Info' : '▶ Show Debug Info (GPS & Errors)'}
              </button>

              {showDebugPanel && (
                <div className="mt-3 bg-gray-900 text-green-400 rounded-xl p-4 font-mono text-xs overflow-x-auto">
                  <div className="grid grid-cols-2 gap-2">
                    <div>GPS Status:</div><div className="text-white">{debugInfo.gpsStatus}</div>
                    <div>Your Lat:</div><div className="text-white">{debugInfo.latitude?.toFixed(8) || 'N/A'}</div>
                    <div>Your Lng:</div><div className="text-white">{debugInfo.longitude?.toFixed(8) || 'N/A'}</div>
                    <div>GPS Accuracy:</div><div className="text-white">{debugInfo.accuracy ? `${debugInfo.accuracy.toFixed(1)}m` : 'N/A'}</div>
                    <div>Distance from Shop:</div><div className="text-yellow-300 font-bold">{debugInfo.distanceFromShop}</div>
                    <div>Shop Lat:</div><div className="text-white">34.76866502</div>
                    <div>Shop Lng:</div><div className="text-white">-82.43563614</div>
                    <div>Max Allowed:</div><div className="text-white">6.1m (20 feet)</div>
                    <div>Timestamp:</div><div className="text-white">{debugInfo.timestamp || 'N/A'}</div>
                  </div>
                  {debugInfo.lastError && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="text-red-400 font-bold mb-1">Last Error:</div>
                      <div className="text-red-300 whitespace-pre-wrap">{debugInfo.lastError}</div>
                    </div>
                  )}
                  {debugInfo.apiResponse && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="text-blue-400 font-bold mb-1">API Response:</div>
                      <pre className="text-blue-300 whitespace-pre-wrap text-[10px]">{debugInfo.apiResponse}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Ultra Modern Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">

          {/* My Schedule - ACTIVE */}
          <Link href="/dashboard/my-jobs" className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-red-50 p-1.5 shadow-2xl animate-fade-in-up hover:shadow-3xl transition-all duration-300 hover:scale-[1.02] text-left">
            <div className="relative bg-white/95 backdrop-blur-sm rounded-[22px] p-7">
              <div className="flex items-start justify-between mb-5">
                <div className="w-16 h-16 bg-gradient-to-br from-red-500 via-rose-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-xl ring-4 ring-red-100 group-hover:ring-red-200 transition-all">
                  <svg className="w-8 h-8 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                {activeJobsCount > 0 && (
                  <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold border border-red-200">
                    {activeJobsCount} Active
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-red-700 transition-colors">My Schedule</h3>
              <p className="text-gray-700 font-semibold">View today&apos;s dispatched job tickets</p>
              <p className="text-sm text-gray-500 mt-1">Equipment checklists, routes, work logs</p>
            </div>
          </Link>

          {/* View Timecard - Premium Indigo Card */}
          <Link
            href="/dashboard/timecard"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-indigo-50 p-1.5 shadow-2xl hover:shadow-3xl transition-all duration-500 hover:scale-[1.03] text-left animate-fade-in-up delay-200"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative bg-white/95 backdrop-blur-sm rounded-[22px] p-7 group-hover:bg-transparent transition-colors duration-500">
              <div className="flex items-start justify-between mb-5">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-xl group-hover:shadow-2xl transform group-hover:rotate-6 transition-all duration-300 ring-4 ring-indigo-100 group-hover:ring-white/30">
                  <svg className="w-8 h-8 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="px-4 py-2 bg-gradient-to-r from-indigo-100 to-purple-100 group-hover:bg-white/20 text-indigo-700 group-hover:text-white text-xs font-bold rounded-full transition-all duration-300 shadow-md">
                  {weeklyHours.toFixed(1)} HRS
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 group-hover:text-white mb-2 transition-colors duration-300">
                View Timecard
              </h3>
              <p className="text-gray-700 group-hover:text-white/95 font-semibold transition-colors duration-300">
                Check hours and attendance
              </p>
              <div className="mt-5 flex items-center text-indigo-600 group-hover:text-white font-bold transition-colors duration-300">
                <span>View Hours</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Request Time Off - Premium Purple Card */}
          <div
            onClick={() => {
              if (isCardAccessible('Request Time Off')) {
                router.push('/dashboard/request-time-off');
              }
            }}
            className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-purple-50 p-1.5 shadow-2xl hover:shadow-3xl transition-all duration-500 text-left animate-fade-in-up delay-300 ${
              isCardAccessible('Request Time Off')
                ? 'hover:scale-[1.03] cursor-pointer'
                : 'blur-sm opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative bg-white/95 backdrop-blur-sm rounded-[22px] p-7 group-hover:bg-transparent transition-colors duration-500">
              <div className="flex items-start justify-between mb-5">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-xl group-hover:shadow-2xl transform group-hover:rotate-6 transition-all duration-300 ring-4 ring-purple-100 group-hover:ring-white/30">
                  <svg className="w-8 h-8 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="px-4 py-2 bg-gradient-to-r from-purple-100 to-fuchsia-100 group-hover:bg-white/20 text-purple-700 group-hover:text-white text-xs font-bold rounded-full transition-all duration-300 shadow-md">
                  AVAILABLE
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 group-hover:text-white mb-2 transition-colors duration-300">
                Request Time Off
              </h3>
              <p className="text-gray-700 group-hover:text-white/95 font-semibold transition-colors duration-300">
                Submit vacation and PTO requests
              </p>
              <div className="mt-5 flex items-center text-purple-600 group-hover:text-white font-bold transition-colors duration-300">
                <span>Request Leave</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
            {!isCardAccessible('Request Time Off') && (
              <div className="absolute inset-0 bg-black/5 backdrop-blur-[1px] rounded-3xl flex items-center justify-center pointer-events-none">
                <div className="bg-white/95 px-6 py-3 rounded-xl shadow-lg">
                  <p className="text-sm font-bold text-gray-900">Available in Full Version</p>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Quick Actions Bar */}
        <div className="mt-10 max-w-5xl mx-auto">
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border-2 border-white/50">
            <p className="text-sm font-bold text-gray-600 mb-4 uppercase tracking-wide">QUICK ACTIONS</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              <button
                onClick={isClockedIn ? handleClockOut : handleClockIn}
                disabled={clockLoading}
                className={`flex items-center gap-2 px-5 py-3 ${
                  isClockedIn
                    ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white'
                    : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white'
                } rounded-xl font-bold whitespace-nowrap transition-all shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {isClockedIn ? 'Clock Out' : 'Clock In'}
              </button>
              <Link
                href="/dashboard/timecard"
                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-bold whitespace-nowrap transition-all shadow-lg hover:shadow-xl hover:scale-105"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                View Timecard
              </Link>
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 rounded-xl text-gray-400 font-medium whitespace-nowrap text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                More actions coming soon
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add custom animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.6s ease-out;
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
          opacity: 0;
        }

        .delay-100 {
          animation-delay: 100ms;
        }

        .delay-200 {
          animation-delay: 200ms;
        }

        .delay-300 {
          animation-delay: 300ms;
        }

        .delay-1000 {
          animation-delay: 1s;
        }

        .delay-2000 {
          animation-delay: 2s;
        }

        @keyframes gradient {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }

        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>

      {/* NFC Clock-In Modal */}
      {showNfcClockInModal && (
        <NfcClockInModal
          isShopHours={isShopHours}
          onClockIn={performClockIn}
          onClose={() => setShowNfcClockInModal(false)}
        />
      )}
    </div>
  );
}
