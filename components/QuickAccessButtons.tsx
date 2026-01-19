'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MapPin, Phone } from 'lucide-react';

interface QuickAccessButtonsProps {
  jobId: string;
}

interface JobData {
  customer_name: string;
  location: string;
  address: string;
  foreman_phone?: string;
  foreman_name?: string;
}

export default function QuickAccessButtons({ jobId }: QuickAccessButtonsProps) {
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

  useEffect(() => {
    fetchJobData();
  }, [jobId]);

  const fetchJobData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/job-orders?id=${jobId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.length > 0) {
          setJobData(result.data[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching job data:', error);
    }
  };

  const getDirectionsUrl = (address: string) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  };

  const makeCall = (phoneNumber: string) => {
    window.location.href = `tel:${phoneNumber}`;
  };

  const sendSMS = (phoneNumber: string) => {
    window.location.href = `sms:${phoneNumber}`;
  };

  if (!jobData) return null;

  return (
    <>
      {/* Quick Access Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setShowLocationModal(true)}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
        >
          <MapPin className="w-5 h-5" />
          View Location
        </button>

        <button
          onClick={() => setShowContactModal(true)}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
        >
          <Phone className="w-5 h-5" />
          Contact On Site
        </button>
      </div>

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                <MapPin className="w-8 h-8 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Job Location</h2>
                <p className="text-sm text-gray-600">Get directions to the job site</p>
              </div>
            </div>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-6">
              <div className="mb-4">
                <p className="text-sm text-blue-700 font-semibold mb-1">Location Name</p>
                <p className="text-lg font-bold text-blue-900">{jobData.location}</p>
              </div>
              <div>
                <p className="text-sm text-blue-700 font-semibold mb-1">Address</p>
                <p className="text-base font-semibold text-blue-900">{jobData.address}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowLocationModal(false)}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-all"
              >
                Close
              </button>
              <a
                href={getDirectionsUrl(jobData.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Get Directions
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Phone className="w-8 h-8 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Contact On Site</h2>
                <p className="text-sm text-gray-600">Call or text the customer</p>
              </div>
            </div>

            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 mb-6">
              <div className="mb-4">
                <p className="text-sm text-green-700 font-semibold mb-1">Contact On Site</p>
                <p className="text-lg font-bold text-green-900">
                  {jobData.foreman_name || jobData.customer_name}
                </p>
              </div>
              {jobData.foreman_phone && (
                <div>
                  <p className="text-sm text-green-700 font-semibold mb-1">Phone Number</p>
                  <p className="text-2xl font-bold text-green-900">{jobData.foreman_phone}</p>
                </div>
              )}
            </div>

            {jobData.foreman_phone ? (
              <div className="space-y-3">
                <button
                  onClick={() => makeCall(jobData.foreman_phone!)}
                  className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 text-lg"
                >
                  <span className="text-2xl">📞</span>
                  Call {jobData.foreman_name || 'Contact'}
                </button>
                <button
                  onClick={() => sendSMS(jobData.foreman_phone!)}
                  className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 text-lg"
                >
                  <span className="text-2xl">💬</span>
                  Text {jobData.foreman_name || 'Contact'}
                </button>
                <button
                  onClick={() => setShowContactModal(false)}
                  className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
                  <p className="text-yellow-800 text-sm font-medium text-center">
                    No contact phone number available for this job
                  </p>
                </div>
                <button
                  onClick={() => setShowContactModal(false)}
                  className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-semibold transition-all"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
