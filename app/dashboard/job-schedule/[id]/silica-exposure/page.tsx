'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import jsPDF from 'jspdf';
import { supabase } from '@/lib/supabase';
import WorkflowNavigation from '@/components/WorkflowNavigation';
import QuickAccessButtons from '@/components/QuickAccessButtons';

interface SilicaFormData {
  // Employee Info
  employeeName: string;
  employeePhone: string;
  employeesOnJob: string[];

  // Job Info
  jobNumber: string;
  jobLocation: string;

  // Exposure Control Plan
  workType: string[];  // Changed to array to allow multiple selections
  waterDeliveryIntegrated: string;
  workLocation: string;
  cuttingTime: string;
  apf10Required: string;

  // Additional Safety
  otherSafetyConcerns: string;

  // Signature
  signature: string;
  signatureDate: string;
}

const WORK_TYPES = [
  'Hand Saw or Chain Saw',
  'Core Drilling',
  'Wall Sawing or Wire Sawing',
  'Slab Sawing',
  'Jack Hammer'
];

// Removed hardcoded jobDetails - now fetching from job order assigned_to field

export default function SilicaExposureControlPlan() {
  const router = useRouter();
  const params = useParams();

  const [formData, setFormData] = useState<SilicaFormData>({
    employeeName: '',
    employeePhone: '',
    employeesOnJob: [],
    jobNumber: params.id as string || '',
    jobLocation: '',
    workType: [],
    waterDeliveryIntegrated: '',
    workLocation: '',
    cuttingTime: '',
    apf10Required: '',
    otherSafetyConcerns: '',
    signature: '',
    signatureDate: new Date().toISOString().split('T')[0]
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [employees, setEmployees] = useState<string[]>(['']);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [checkingSubmission, setCheckingSubmission] = useState(true);
  const [isOnStandby, setIsOnStandby] = useState(false);

  // Check if silica plan already exists for this job
  useEffect(() => {
    checkExistingSilicaPlan();
  }, [params.id]);

  const checkExistingSilicaPlan = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setCheckingSubmission(false);
        return;
      }

      // Check if silica plan exists for this job
      const { data, error } = await supabase
        .from('silica_plans')
        .select('id')
        .eq('job_order_id', params.id)
        .maybeSingle();

      if (data) {
        // Silica plan already exists
        setAlreadySubmitted(true);
        setIsCompleted(true);
      }

      setCheckingSubmission(false);
    } catch (error) {
      console.error('Error checking existing silica plan:', error);
      setCheckingSubmission(false);
    }
  };

  // Fetch job order and assigned operator info on mount
  useEffect(() => {
    const fetchJobAndOperator = async () => {
      try {
        console.log('[SILICA FORM] Starting data fetch...');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('[SILICA FORM] No session found');
          return;
        }
        console.log('[SILICA FORM] Session user ID:', session.user.id);

        // Fetch job order data with operator profiles from API
        const response = await fetch(`/api/job-orders?id=${params.id}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const jobData = await response.json();
        console.log('[SILICA FORM] Full API response:', jobData);

        if (jobData.success && jobData.data && jobData.data.length > 0) {
          const job = jobData.data[0];
          const operatorProfile = jobData.operator_profile;
          const assignedOperatorProfile = jobData.assigned_operator_profile;

          console.log('[SILICA FORM] Job:', job);
          console.log('[SILICA FORM] Operator profile:', operatorProfile);
          console.log('[SILICA FORM] Assigned operator profile:', assignedOperatorProfile);

          // Get assigned operator name for employees list
          const assignedOperatorName = assignedOperatorProfile?.full_name || '';

          // Autofill operator information from API response
          const newFormData = {
            employeeName: operatorProfile?.full_name || '',
            employeePhone: operatorProfile?.phone_number || '',
            employeesOnJob: assignedOperatorName ? [assignedOperatorName] : [],
            jobNumber: job.job_number || params.id as string,
            jobLocation: job.address || job.location || ''
          };
          console.log('[SILICA FORM] Setting form data:', newFormData);

          setFormData(prev => {
            const updated = {
              ...prev,
              ...newFormData
            };
            console.log('[SILICA FORM] Form data after update:', updated);
            return updated;
          });

          // Set employees state for the UI
          if (assignedOperatorName) {
            console.log('[SILICA FORM] Setting employees:', [assignedOperatorName]);
            setEmployees([assignedOperatorName]);
          } else {
            console.log('[SILICA FORM] No assigned operator, employees will be empty');
          }
        }
      } catch (error) {
        console.error('[SILICA FORM] Error fetching job and operator data:', error);
      }
    };

    fetchJobAndOperator();
  }, [params.id]);

  const handleInputChange = (field: keyof SilicaFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addEmployee = () => {
    setEmployees([...employees, '']);
  };

  const updateEmployee = (index: number, value: string) => {
    const newEmployees = [...employees];
    newEmployees[index] = value;
    setEmployees(newEmployees);
    setFormData(prev => ({ ...prev, employeesOnJob: newEmployees.filter(e => e) }));
  };

  const removeEmployee = (index: number) => {
    const newEmployees = employees.filter((_, i) => i !== index);
    setEmployees(newEmployees);
    setFormData(prev => ({ ...prev, employeesOnJob: newEmployees.filter(e => e) }));
  };

  const toggleWorkType = (type: string) => {
    setFormData(prev => {
      const currentTypes = prev.workType;
      if (currentTypes.includes(type)) {
        // Remove if already selected
        return { ...prev, workType: currentTypes.filter(t => t !== type) };
      } else {
        // Add if not selected
        return { ...prev, workType: [...currentTypes, type] };
      }
    });
  };

  const generatePDF = async () => {
    try {
      const pdf = new jsPDF();

      // Add company header
      pdf.setFontSize(16);
      pdf.text('B&D CONCRETE CUTTING, INC.', 105, 20, { align: 'center' });
      pdf.setFontSize(12);
      pdf.text('6215 PURDUE DRIVE SW', 105, 30, { align: 'center' });
      pdf.text('ATLANTA, GA 30336', 105, 38, { align: 'center' });
      pdf.text('404-696-0404 • Fax: 404-696-3249', 105, 46, { align: 'center' });

      // Title
      pdf.setFontSize(14);
      pdf.text('B&D Silica Dust/Exposure Control Plan', 105, 60, { align: 'center' });

      // Page number
      pdf.setFontSize(10);
      pdf.text('Page: 1 / 1', 170, 60);

      // Employee Info section
      pdf.setFontSize(12);
      pdf.text('Employee Info', 20, 80);
      pdf.setFontSize(10);
      pdf.text(`Employee Name: ${formData.employeeName}`, 25, 90);
      pdf.text(`Employee Phone #: ${formData.employeePhone}`, 25, 98);
      pdf.text('Employees Working On This Job:', 25, 106);
      formData.employeesOnJob.forEach((emp, index) => {
        pdf.text(`  • ${emp}`, 30, 114 + (index * 8));
      });

      // Exposure Control Plan section
      const yPos = 130 + (formData.employeesOnJob.length * 8);
      pdf.text('Exposure Control Plan', 20, yPos);
      pdf.text(`Work Type(s): ${formData.workType.join(', ')}`, 25, yPos + 10);
      pdf.text(`Water Delivery System Integrated in Equipment?: ${formData.waterDeliveryIntegrated}`, 25, yPos + 18);
      pdf.text(`Where is your work located?: ${formData.workLocation}`, 25, yPos + 26);
      pdf.text(`For TODAY, Is your cutting time: ${formData.cuttingTime}`, 25, yPos + 34);
      pdf.text(`APF 10 Respiratory Protection Required?: ${formData.apf10Required}`, 25, yPos + 42);

      if (formData.otherSafetyConcerns) {
        pdf.text('Other Safety Concerns:', 25, yPos + 50);
        // Split long text into multiple lines
        const lines = pdf.splitTextToSize(formData.otherSafetyConcerns, 160);
        pdf.text(lines, 25, yPos + 58);
      }

      // OSHA Compliance statement
      const complianceY = yPos + 80;
      pdf.text('B&D uses "Specified Exposure Control Methods" as outlined in "Table 1" of the OSHA Silica', 25, complianceY);
      pdf.text('standard 1926.1153.', 25, complianceY + 8);
      pdf.text('Employees must refer to the Table 1 guidance provided by B&D and kept in the crew\'s Safety', 25, complianceY + 16);
      pdf.text('Manual.', 25, complianceY + 24);
      pdf.text('If you are unsure, contact your General Superintendent or Safety Director.', 25, complianceY + 32);

      // Signature section
      pdf.text('I have implemented exposure controls as required above', 25, complianceY + 48);
      pdf.text('and in Table 1 of the silica standard.', 25, complianceY + 56);

      // Signature line and date
      pdf.line(25, complianceY + 70, 100, complianceY + 70);
      pdf.text(formData.signature, 25, complianceY + 68);
      pdf.text(`${formData.signatureDate} 11:02am`, 150, complianceY + 75);

      // Save the PDF
      const fileName = `Silica_Exposure_Control_Plan_Job_${params.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

      // Mark as completed and show success
      setIsCompleted(true);
      setShowSuccess(true);

      // Store completion status in localStorage
      localStorage.setItem(`silica-plan-${params.id}`, 'completed');

      console.log('PDF generated successfully:', fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  const submitDocument = async () => {
    // Check if on standby before submitting
    if (isOnStandby) {
      alert('Please end standby time before submitting the silica exposure plan');
      return;
    }

    try {
      // Generate PDF blob
      const pdf = new jsPDF();

      // Add company header
      pdf.setFontSize(16);
      pdf.text('B&D CONCRETE CUTTING, INC.', 105, 20, { align: 'center' });
      pdf.setFontSize(12);
      pdf.text('6215 PURDUE DRIVE SW', 105, 30, { align: 'center' });
      pdf.text('ATLANTA, GA 30336', 105, 38, { align: 'center' });
      pdf.text('404-696-0404 • Fax: 404-696-3249', 105, 46, { align: 'center' });

      // Title
      pdf.setFontSize(14);
      pdf.text('B&D Silica Dust/Exposure Control Plan', 105, 60, { align: 'center' });

      // Employee Info section
      pdf.setFontSize(12);
      pdf.text('Employee Info', 20, 80);
      pdf.setFontSize(10);
      pdf.text(`Employee Name: ${formData.employeeName}`, 25, 90);
      pdf.text(`Employee Phone #: ${formData.employeePhone}`, 25, 98);
      pdf.text('Employees Working On This Job:', 25, 106);
      formData.employeesOnJob.forEach((emp, index) => {
        pdf.text(`  • ${emp}`, 30, 114 + (index * 8));
      });

      // Exposure Control Plan section
      const yPos = 130 + (formData.employeesOnJob.length * 8);
      pdf.text('Exposure Control Plan', 20, yPos);
      pdf.text(`Work Type(s): ${formData.workType.join(', ')}`, 25, yPos + 10);
      pdf.text(`Water Delivery System Integrated in Equipment?: ${formData.waterDeliveryIntegrated}`, 25, yPos + 18);
      pdf.text(`Where is your work located?: ${formData.workLocation}`, 25, yPos + 26);
      pdf.text(`For TODAY, Is your cutting time: ${formData.cuttingTime}`, 25, yPos + 34);
      pdf.text(`APF 10 Respiratory Protection Required?: ${formData.apf10Required}`, 25, yPos + 42);

      if (formData.otherSafetyConcerns) {
        pdf.text('Other Safety Concerns:', 25, yPos + 50);
        const lines = pdf.splitTextToSize(formData.otherSafetyConcerns, 160);
        pdf.text(lines, 25, yPos + 58);
      }

      // OSHA Compliance statement
      const complianceY = yPos + 80;
      pdf.text('B&D uses "Specified Exposure Control Methods" as outlined in "Table 1" of the OSHA Silica', 25, complianceY);
      pdf.text('standard 1926.1153.', 25, complianceY + 8);

      // Signature section
      pdf.text('I have implemented exposure controls as required above', 25, complianceY + 48);
      pdf.line(25, complianceY + 70, 100, complianceY + 70);
      pdf.text(formData.signature, 25, complianceY + 68);
      pdf.text(`${formData.signatureDate}`, 150, complianceY + 75);

      // Convert PDF to base64
      const pdfBase64 = pdf.output('dataurlstring').split(',')[1];

      // Get session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        return;
      }

      // Save to database only (don't send email yet - admin will send all documents together)
      const response = await fetch('/api/silica-plan/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId: params.id,
          formData: formData,
          pdfBase64: pdfBase64,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Mark as completed and show success
        setIsCompleted(true);
        setShowSuccess(true);
        setAlreadySubmitted(true);

        // Store completion status in localStorage
        localStorage.setItem(`silica-plan-${params.id}`, 'completed');

        // Update workflow progress
        await fetch('/api/workflow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            jobId: params.id,
            completedStep: 'silica_form',
            currentStep: 'work_performed'
          })
        });

        console.log('Document saved successfully');
      } else {
        alert(result.error || 'Failed to save document');
      }
    } catch (error) {
      console.error('Error saving document:', error);
      alert('Error saving document. Please try again.');
    }
  };

  const isStepComplete = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.employeeName && formData.employeePhone && formData.employeesOnJob.length > 0);
      case 2:
        return !!(formData.workType.length > 0);  // At least one work type selected
      case 3:
        return !!(formData.waterDeliveryIntegrated && formData.workLocation && formData.cuttingTime && formData.apf10Required);
      case 4:
        return !!(formData.signature);
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Modern Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/job-schedule"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors bg-gray-100"
              >
                <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Silica Dust/Exposure Control Plan</h1>
                <p className="text-sm text-gray-600">OSHA Compliant Documentation</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                Job #{params.id}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Workflow Navigation */}
        <WorkflowNavigation jobId={params.id as string} currentStepId="silica_form" />

        {/* Quick Access Buttons */}
        <QuickAccessButtons
          jobId={params.id as string}
          onStandbyChange={(standbyStatus) => setIsOnStandby(standbyStatus)}
        />

        {/* Loading State */}
        {checkingSubmission && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600 font-medium">Checking document status...</p>
            </div>
          </div>
        )}

        {/* Already Submitted State */}
        {!checkingSubmission && alreadySubmitted && (
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-green-400 p-8">
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Document Already Submitted</h2>
              <p className="text-gray-600 text-lg">
                The Silica Dust/Exposure Control Plan has already been completed for this job.
              </p>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-2xl p-6 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-green-600 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="font-bold text-green-900 mb-1">Why can't I submit another form?</h3>
                  <p className="text-green-800 text-sm leading-relaxed">
                    Each job can only have one Silica Exposure Control Plan to prevent duplicate records in the system.
                    The document for this job has been saved and sent to the customer. If you need to make changes,
                    please contact your supervisor.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => router.push(`/dashboard/job-schedule/${params.id}/work-performed`)}
              className="w-full px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-3 font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Continue to Work Performed
            </button>

            <button
              onClick={() => router.push('/dashboard/job-schedule')}
              className="w-full mt-3 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-all duration-200 font-medium"
            >
              Return to Job Schedule
            </button>
          </div>
        )}

        {/* Form Content - Only show if not submitted */}
        {!checkingSubmission && !alreadySubmitted && (
          <>

        {/* Company Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-gray-100">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">B&D CONCRETE CUTTING, INC.</h2>
            <p className="text-gray-600">6215 PURDUE DRIVE SW</p>
            <p className="text-gray-600">ATLANTA, GA 30336</p>
            <p className="text-gray-600">404-696-0404 • Fax: 404-696-3249</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex-1">
              <div className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                    currentStep === step
                      ? 'bg-blue-600 text-white shadow-lg scale-110'
                      : isStepComplete(step)
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isStepComplete(step) && currentStep !== step ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    step
                  )}
                </div>
                {step < 4 && (
                  <div
                    className={`flex-1 h-1 transition-all duration-300 ${
                      isStepComplete(step) ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
              <p className="text-xs mt-2 font-medium text-gray-600">
                {step === 1 && 'Employee Info'}
                {step === 2 && 'Work Type'}
                {step === 3 && 'Exposure Control'}
                {step === 4 && 'Review & Sign'}
              </p>
            </div>
          ))}
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {/* Step 1: Employee Information */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fade-in">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">1</span>
                Employee Information
              </h3>

              {/* Info Banner */}
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-blue-800">
                    Your contact information has been autofilled from your profile. You can edit these fields if needed (e.g., use a nickname or different phone number).
                  </p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="employeeName" className="block text-sm font-semibold text-gray-700 mb-2">
                    Employee Name *
                    <span className="text-xs font-normal text-gray-500 ml-2">(Autofilled from profile)</span>
                  </label>
                  <input
                    type="text"
                    id="employeeName"
                    name="employeeName"
                    value={formData.employeeName}
                    onChange={(e) => handleInputChange('employeeName', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-blue-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium bg-blue-50"
                    placeholder="Enter your full name"
                  />
                  <p className="text-xs text-gray-500 mt-1">You can use a nickname if preferred</p>
                </div>

                <div>
                  <label htmlFor="employeePhone" className="block text-sm font-semibold text-gray-700 mb-2">
                    Employee Phone # *
                    <span className="text-xs font-normal text-gray-500 ml-2">(Autofilled from profile)</span>
                  </label>
                  <input
                    type="tel"
                    id="employeePhone"
                    name="employeePhone"
                    value={formData.employeePhone}
                    onChange={(e) => handleInputChange('employeePhone', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-blue-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium bg-blue-50"
                    placeholder="(xxx) xxx-xxxx"
                  />
                  <p className="text-xs text-gray-500 mt-1">Edit if you prefer a different contact number</p>
                </div>
              </div>

              <div>
                <label htmlFor="employeeOnJob-0" className="block text-sm font-semibold text-gray-700 mb-2">
                  Employees Working On This Job *
                </label>
                {employees.map((emp, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      id={`employeeOnJob-${index}`}
                      name={`employeeOnJob-${index}`}
                      value={emp}
                      onChange={(e) => updateEmployee(index, e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium"
                      placeholder="Employee name"
                    />
                    {employees.length > 1 && (
                      <button
                        onClick={() => removeEmployee(index)}
                        className="px-3 py-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addEmployee}
                  className="mt-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-colors font-medium"
                >
                  + Add Another Crew Member
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Choose Work Type */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">2</span>
                Choose Work Type(s)
              </h3>
              <p className="text-sm text-gray-600 mb-4">Select all work types that apply to this job</p>

              <div className="space-y-3">
                {WORK_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => toggleWorkType(type)}
                    className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left font-medium ${
                      formData.workType.includes(type)
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-900 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{type}</span>
                      {formData.workType.includes(type) && (
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Exposure Control Plan */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fade-in">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">3</span>
                Exposure Control Plan
              </h3>

              {/* Water Delivery System */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Water Delivery System Integrated In Equipment? *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {['Yes', 'No'].map((option) => (
                    <button
                      key={option}
                      onClick={() => handleInputChange('waterDeliveryIntegrated', option)}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 font-medium ${
                        formData.waterDeliveryIntegrated === option
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-900 bg-white'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* Work Location */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Where is your work located? *
                </label>
                <div className="space-y-3">
                  {['Outdoors or well-ventilated area', 'Indoors or Enclosed area'].map((option) => (
                    <button
                      key={option}
                      onClick={() => handleInputChange('workLocation', option)}
                      className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left font-medium ${
                        formData.workLocation === option
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-900 bg-white'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cutting Time */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  For TODAY, Is your cutting time: *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {['Less than 4 Hours', 'More than 4 Hours'].map((option) => (
                    <button
                      key={option}
                      onClick={() => handleInputChange('cuttingTime', option)}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 font-medium ${
                        formData.cuttingTime === option
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-900 bg-white'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* APF 10 Protection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  APF 10 Respiratory Protection Required? *
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {['Yes', 'No', 'N/A'].map((option) => (
                    <button
                      key={option}
                      onClick={() => handleInputChange('apf10Required', option)}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 font-medium ${
                        formData.apf10Required === option
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-900 bg-white'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* Other Safety Concerns */}
              <div>
                <label htmlFor="otherSafetyConcerns" className="block text-sm font-semibold text-gray-700 mb-2">
                  Other Safety Concerns
                </label>
                <textarea
                  id="otherSafetyConcerns"
                  name="otherSafetyConcerns"
                  value={formData.otherSafetyConcerns}
                  onChange={(e) => handleInputChange('otherSafetyConcerns', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors text-gray-900 font-medium bg-white"
                  rows={4}
                  placeholder="Enter any additional safety concerns..."
                />
              </div>
            </div>
          )}

          {/* Step 4: Review & Sign */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fade-in">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">4</span>
                Review & Sign Document
              </h3>

              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-6 space-y-3">
                <h4 className="font-bold text-gray-900 mb-3 text-lg">Document Summary</h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-800 font-semibold">Employee:</span>
                    <span className="font-bold text-gray-900">{formData.employeeName}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-800 font-semibold">Work Type(s):</span>
                    <span className="font-bold text-gray-900">{formData.workType.join(', ')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-800 font-semibold">Water Delivery:</span>
                    <span className="font-bold text-gray-900">{formData.waterDeliveryIntegrated}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-800 font-semibold">Location:</span>
                    <span className="font-bold text-gray-900">{formData.workLocation}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-800 font-semibold">Cutting Time:</span>
                    <span className="font-bold text-gray-900">{formData.cuttingTime}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-800 font-semibold">APF 10 Required:</span>
                    <span className="font-bold text-gray-900">{formData.apf10Required}</span>
                  </div>
                </div>
              </div>

              {/* OSHA Compliance Statement */}
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
                <p className="text-sm text-gray-700">
                  <strong>OSHA Compliance:</strong> B&D uses "Specified Exposure Control Methods" as outlined in "Table 1" of the OSHA Silica standard 1926.1153.
                </p>
                <p className="text-sm text-gray-700 mt-2">
                  Employees must refer to the Table 1 guidance provided by B&D and kept in the crew's Safety Manual.
                </p>
                <p className="text-sm text-gray-700 mt-2">
                  If you are unsure, contact your General Superintendent or Safety Director.
                </p>
              </div>

              {/* Signature */}
              <div>
                <label htmlFor="signature" className="block text-sm font-semibold text-gray-700 mb-2">
                  Electronic Signature *
                </label>
                <input
                  type="text"
                  id="signature"
                  name="signature"
                  value={formData.signature}
                  onChange={(e) => handleInputChange('signature', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors font-signature text-xl text-gray-900 bg-white"
                  placeholder="Type your full name to sign"
                />
                <p className="text-xs text-gray-500 mt-1">
                  By typing your name, you acknowledge that this constitutes a legal signature.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            <button
              onClick={() => currentStep > 1 && setCurrentStep(currentStep - 1)}
              className={`px-6 py-3 rounded-xl font-bold transition-all duration-200 ${
                currentStep === 1
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-2 border-gray-300'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-2 border-gray-300'
              }`}
              disabled={currentStep === 1}
            >
              Previous
            </button>

            {currentStep < 4 ? (
              <button
                onClick={() => isStepComplete(currentStep) && setCurrentStep(currentStep + 1)}
                className={`px-6 py-3 rounded-xl font-bold transition-all duration-200 ${
                  isStepComplete(currentStep)
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed border-2 border-gray-300'
                }`}
                disabled={!isStepComplete(currentStep)}
              >
                Next Step
              </button>
            ) : (
              <button
                onClick={submitDocument}
                disabled={!isStepComplete(4)}
                className={`px-8 py-4 rounded-xl font-bold transition-all duration-200 flex items-center gap-3 ${
                  isStepComplete(4)
                    ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl transform hover:scale-105'
                    : 'bg-gray-200 text-gray-500 cursor-not-allowed border-2 border-gray-300'
                }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Save Document
              </button>
            )}
          </div>
        </div>

        {/* Completion Modal */}
        {isCompleted && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Document Saved!</h3>
                <p className="text-gray-600 mb-6">
                  The Silica Exposure Control Plan has been saved and attached to Job #{params.id}. Admin will send all documents to the customer when the job is complete.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => router.push(`/dashboard/job-schedule/${params.id}/work-performed`)}
                    className="w-full px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white rounded-xl font-bold transition-all shadow-lg"
                  >
                    Continue to Work Performed →
                  </button>
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-semibold transition-colors"
                  >
                    Return to Dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Message */}
        {showSuccess && !isCompleted && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 animate-slide-up">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div>
              <p className="font-semibold">Document Saved Successfully!</p>
              <p className="text-sm">The Silica Exposure Control Plan has been attached to the job.</p>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Custom Styles */}
      <style jsx>{`
        .font-signature {
          font-family: 'Brush Script MT', cursive;
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }

        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}