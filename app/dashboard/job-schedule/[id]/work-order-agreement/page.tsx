'use client';

import { useRouter, useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import WorkOrderContract from '@/components/WorkOrderContract';
import { pdfGenerator } from '@/lib/pdf-generator';

export default function WorkOrderAgreementPage() {
  const router = useRouter();
  const params = useParams();
  const [jobData, setJobData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJobData();
  }, []);

  const fetchJobData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const response = await fetch(`/api/job-orders?id=${params.id}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) throw new Error('Failed to load job data');

      const result = await response.json();
      if (!result.success || !result.data?.length) throw new Error('Job not found');

      const job = result.data[0];

      setJobData({
        orderId: job.job_number,
        date: job.job_date || job.scheduled_date,
        customer: job.customer_name,
        jobLocation: job.location || job.address,
        poNumber: job.po_number,
        workDescription: job.job_description || job.scope_of_work || job.description || 'Core drilling and concrete cutting services',
        scopeOfWork: job.scope_of_work_items || []
      });
    } catch (error) {
      console.error('Error fetching job data:', error);
      alert('Error loading job data');
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async (signatureData: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        return;
      }

      // Save the contract signature to database via API (avoids RLS issues)
      const saveResponse = await fetch(`/api/job-orders/${params.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          status: 'assigned',
          work_order_signed: true,
          work_order_signature: signatureData.signature,
          work_order_signer_name: signatureData.name,
          work_order_signer_title: signatureData.title,
          work_order_signed_at: signatureData.date,
          cut_through_authorized: signatureData.cutThroughAuthorized || false,
          cut_through_signature: signatureData.cutThroughSignature || null
        })
      });

      if (!saveResponse.ok) {
        const errData = await saveResponse.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save work order agreement');
      }

      // Generate PDF and save to job ticket (async, don't wait for it)
      fetch('/api/work-order-agreement/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: params.id,
          jobNumber: jobData.orderId,
          jobDate: jobData.date,
          customerName: jobData.customer,
          jobLocation: jobData.jobLocation,
          poNumber: jobData.poNumber,
          workDescription: jobData.workDescription,
          scopeOfWork: jobData.scopeOfWork,
          signerName: signatureData.name,
          signerTitle: signatureData.title,
          signedAt: signatureData.date,
          cutThroughAuthorized: signatureData.cutThroughAuthorized,
          cutThroughSignature: signatureData.cutThroughSignature
        })
      }).then(response => response.json())
        .then(data => {
          console.log('[AGREEMENT] PDF generation result:', data);
        })
        .catch(err => {
          console.error('[AGREEMENT] PDF generation error:', err);
        });

      // Navigate to equipment checklist or next step
      router.push(`/dashboard/job-schedule/${params.id}/equipment-checklist`);
    } catch (error) {
      console.error('Error saving signature:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading work order...</p>
        </div>
      </div>
    );
  }

  if (!jobData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Error loading job data</p>
          <button
            onClick={() => router.back()}
            className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>

        <WorkOrderContract
          jobData={jobData}
          mode="start"
          onSign={handleSign}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}
