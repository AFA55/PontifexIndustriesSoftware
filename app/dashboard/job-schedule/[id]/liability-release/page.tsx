'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { getLiabilityReleaseText } from '@/lib/legal/standby-policy';
import Notification from '@/components/Notification';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  location: string;
  address: string;
  description: string;
  foreman_name: string;
  foreman_phone: string;
  status: string;
  arrival_time?: string;
  contact_on_site?: string;
  contact_phone?: string;
}

export default function LiabilityReleasePage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [job, setJob] = useState<JobOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  useEffect(() => {
    fetchJobDetails();
  }, [jobId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size for high DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    // Scale context to match DPI
    ctx.scale(dpr, dpr);

    // Set drawing style
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const fetchJobDetails = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch(`/api/job-orders?id=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.length > 0) {
          setJob(result.data[0]);

          // Autofill operator name from profile
          const operatorProfile = result.operator_profile;
          if (operatorProfile?.full_name) {
            setOperatorName(operatorProfile.full_name);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching job:', error);
    } finally {
      setLoading(false);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = ('touches' in e) ? e.touches[0].clientX : e.clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : e.clientY;

    // Calculate position relative to canvas (no need to scale, ctx is already scaled)
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = ('touches' in e) ? e.touches[0].clientX : e.clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : e.clientY;

    // Calculate position relative to canvas (no need to scale, ctx is already scaled)
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSubmit = async () => {
    if (!customerName) {
      setNotification({ type: 'error', message: 'Please enter customer name' });
      return;
    }

    if (!customerEmail) {
      setNotification({ type: 'error', message: 'Please enter customer email' });
      return;
    }

    if (!operatorName) {
      setNotification({ type: 'error', message: 'Please enter your name' });
      return;
    }

    if (!hasSignature) {
      setNotification({ type: 'error', message: 'Please sign in the signature box' });
      return;
    }

    if (!accepted) {
      setNotification({ type: 'error', message: 'You must accept the terms to proceed' });
      return;
    }

    // Get signature as base64 image
    const canvas = canvasRef.current;
    if (!canvas) return;

    const signatureDataURL = canvas.toDataURL('image/png');

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setNotification({ type: 'error', message: 'Session expired. Please log in again.' });
        router.push('/login');
        return;
      }

      // Save liability release to database
      const { error } = await supabase
        .from('job_orders')
        .update({
          liability_release_signed_by: operatorName,
          liability_release_signature: signatureDataURL,
          liability_release_signed_at: new Date().toISOString(),
          liability_release_customer_name: customerName,
          liability_release_customer_email: customerEmail
        })
        .eq('id', jobId);

      if (error) {
        setNotification({ type: 'error', message: 'Error saving liability release: ' + error.message });
        throw error;
      }

      // Update workflow - mark liability_release as complete
      await fetch('/api/workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          completedStep: 'liability_release',
          currentStep: 'silica_form'
        })
      });

      // Generate PDF and send email (async, don't wait for it)
      fetch('/api/liability-release/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId,
          customerName,
          customerEmail,
          operatorName,
          signatureDataURL,
          jobNumber: job?.job_number,
          jobAddress: job?.address || job?.location
        })
      }).then(response => response.json())
        .then(data => {
          console.log('[LIABILITY] PDF generation result:', data);
        })
        .catch(err => {
          console.error('[LIABILITY] PDF generation error:', err);
        });

      setNotification({ type: 'success', message: 'Liability release signed successfully. You will receive a PDF copy via email. Proceeding to next step...' });

      // Redirect to silica exposure form after a brief delay
      setTimeout(() => {
        router.push(`/dashboard/job-schedule/${jobId}/silica-exposure`);
      }, 2000);
    } catch (error) {
      console.error('Error submitting signature:', error);
      setNotification({ type: 'error', message: 'Error submitting. Please try again.' });
      setSubmitting(false);
    }
  };

  const liabilityText = getLiabilityReleaseText();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Job not found</h1>
        </div>
      </div>
    );
  }

  return (
    <>
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
        <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white sticky top-0 z-50 shadow-lg">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Liability Release & Indemnification</h1>
                <p className="text-red-100 text-sm">Required before starting work</p>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 p-8">
            {/* Job Details */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="font-semibold text-gray-600">Job Order:</span>
                  <p className="text-gray-900">{job.job_number}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Customer:</span>
                  <p className="text-gray-900">{job.customer_name}</p>
                </div>
                <div className="col-span-2">
                  <span className="font-semibold text-gray-600">Location:</span>
                  <p className="text-gray-900">{job.location}</p>
                </div>
              </div>
            </div>

            {/* Liability Terms */}
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-orange-900 mb-4 text-lg">Liability Release & Indemnification</h3>
              <div className="space-y-4 text-sm text-orange-900 leading-relaxed max-h-64 overflow-y-auto">
                <div dangerouslySetInnerHTML={{ __html: liabilityText }} />
              </div>
            </div>

            {/* Customer & Operator Details */}
            <div className="space-y-6">
              <div>
                <label htmlFor="customer-name" className="block text-sm font-bold text-gray-700 mb-2">
                  Customer Name *
                </label>
                <input
                  id="customer-name"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-red-500 focus:outline-none text-gray-900 font-medium"
                  placeholder="Enter customer full name"
                  required
                />
              </div>

              <div>
                <label htmlFor="customer-email" className="block text-sm font-bold text-gray-700 mb-2">
                  Customer Email *
                </label>
                <input
                  id="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-red-500 focus:outline-none text-gray-900 font-medium"
                  placeholder="Enter customer email address"
                  required
                />
              </div>

              <div>
                <label htmlFor="operator-name" className="block text-sm font-bold text-gray-700 mb-2">
                  Operator Name (Print) *
                </label>
                <input
                  id="operator-name"
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-red-500 focus:outline-none text-gray-900 font-medium"
                  placeholder="Enter your full name"
                  required
                />
              </div>

              <div>
                <div className="block text-sm font-bold text-gray-700 mb-2">
                  Electronic Signature *
                </div>
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      startDrawing(e);
                    }}
                    onTouchMove={(e) => {
                      e.preventDefault();
                      draw(e);
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      stopDrawing();
                    }}
                    className="w-full h-40 border-2 border-gray-300 rounded-xl bg-white cursor-crosshair touch-none"
                    style={{ touchAction: 'none' }}
                    role="img"
                    aria-label="Electronic signature canvas - draw your signature here"
                  />
                  {!hasSignature && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-gray-400 text-sm">Sign here with your finger or mouse</p>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500">
                    By signing above, you are creating a legally binding electronic signature.
                  </p>
                  {hasSignature && (
                    <button
                      type="button"
                      onClick={clearSignature}
                      className="text-xs text-red-600 hover:text-red-700 font-semibold px-3 py-1 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Acceptance Checkbox */}
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                <label htmlFor="acceptance-checkbox" className="flex items-start gap-3 cursor-pointer">
                  <input
                    id="acceptance-checkbox"
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-1 w-5 h-5 text-red-600 rounded focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-900">
                    <strong>I have read and accept</strong> all terms and conditions stated above, including the liability release and indemnification provisions. I understand that I am signing this agreement on behalf of Pontifex Industries before beginning work.
                  </span>
                </label>
              </div>

              {/* Timestamp */}
              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600">
                <p><strong>Date/Time:</strong> {new Date().toLocaleString()}</p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-6">
              <button
                onClick={handleSubmit}
                disabled={submitting || !customerName || !customerEmail || !operatorName || !hasSignature || !accepted}
                className={`w-full px-6 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-xl ${
                  submitting || !customerName || !customerEmail || !operatorName || !hasSignature || !accepted
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 text-white'
                }`}
              >
                {submitting ? 'Signing...' : 'Accept & Continue'}
              </button>
            </div>

            {/* Back Button */}
            <div className="mt-4">
              <button
                onClick={() => router.push('/dashboard/job-schedule')}
                className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-semibold flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Job Schedule
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
