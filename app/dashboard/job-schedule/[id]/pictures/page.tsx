'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Camera, ArrowRight } from 'lucide-react';
import WorkflowNavigation from '@/components/WorkflowNavigation';

export default function PicturesPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const [uploading, setUploading] = useState(false);

  const handleSkip = async () => {
    try {
      // Update workflow to mark pictures as "completed" (skipped) and move to signature
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
            completedStep: 'pictures',
            currentStep: 'customer_signature',
          })
        });
      }

      // Navigate to customer signature
      router.push(`/dashboard/job-schedule/${jobId}/customer-signature`);
    } catch (error) {
      console.error('Error skipping pictures:', error);
      alert('Error updating workflow');
    }
  };

  const handleContinue = async () => {
    // If they added pictures, mark as complete and continue
    try {
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
            completedStep: 'pictures',
            currentStep: 'customer_signature',
          })
        });
      }

      router.push(`/dashboard/job-schedule/${jobId}/customer-signature`);
    } catch (error) {
      console.error('Error continuing:', error);
      alert('Error updating workflow');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-500 text-white sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Job Photos</h1>
              <p className="text-purple-100 text-sm">Document Completed Work</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Workflow Navigation */}
        <WorkflowNavigation jobId={jobId} currentStepId="pictures" />

        {/* Main Content */}
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl border border-gray-200/50 p-8">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Camera className="w-10 h-10 text-purple-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Job Site Photos</h2>
            <p className="text-gray-600">
              Take photos of completed work, equipment, or site conditions
            </p>
          </div>

          {/* Photo Upload Placeholder */}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-12 border-2 border-dashed border-purple-300 text-center mb-8">
            <Camera className="w-16 h-16 text-purple-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Photo Upload Coming Soon</h3>
            <p className="text-gray-600 mb-4">
              This feature will allow you to upload photos from your device
            </p>
            <p className="text-sm text-purple-600 font-medium">
              For now, you can skip this step and continue to customer signature
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleSkip}
              className="flex-1 px-8 py-4 bg-gray-100 text-gray-700 rounded-2xl hover:bg-gray-200 transition-all font-bold text-lg flex items-center justify-center gap-2"
            >
              Skip Photos
              <ArrowRight className="w-5 h-5" />
            </button>

            <button
              onClick={handleContinue}
              className="flex-1 px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white rounded-2xl transition-all font-bold text-lg shadow-2xl flex items-center justify-center gap-2"
            >
              Continue to Signature
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <p className="text-center text-sm text-gray-500 mt-4">
            Both options will proceed to customer signature
          </p>
        </div>
      </div>
    </div>
  );
}
