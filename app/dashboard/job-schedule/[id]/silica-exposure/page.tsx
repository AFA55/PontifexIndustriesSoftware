'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import jsPDF from 'jspdf';

interface SilicaFormData {
  // Employee Info
  employeeName: string;
  employeePhone: string;
  employeesOnJob: string[];

  // Job Info
  jobNumber: string;
  jobLocation: string;

  // Exposure Control Plan
  workType: string;
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

// Job data (from your screenshots)
const jobDetails = {
  1: {
    id: '234893',
    title: 'WHITEHAWK (CAM) / PIEDMONT ATH.',
    customer: 'WHITEHAWK (CAM)',
    location: '1199 PRINCE AVE, ATHENS, GA',
    technician: 'ANDRES GUERRERO-C',
    foreman: 'JAMES',
    workType: 'CORE DRILLING'
  }
  // Add more jobs as needed
};

export default function SilicaExposureControlPlan() {
  const router = useRouter();
  const params = useParams();

  // Get job info for auto-fill
  const jobInfo = jobDetails[params.id as keyof typeof jobDetails] || jobDetails[1];

  const [formData, setFormData] = useState<SilicaFormData>({
    employeeName: jobInfo.technician || '',
    employeePhone: '',
    employeesOnJob: [jobInfo.technician || '', jobInfo.foreman || ''].filter(Boolean),
    jobNumber: params.id as string || '',
    jobLocation: jobInfo.location || '',
    workType: jobInfo.workType || '',
    waterDeliveryIntegrated: '',
    workLocation: '',
    cuttingTime: '',
    apf10Required: '',
    otherSafetyConcerns: '',
    signature: '',
    signatureDate: new Date().toISOString().split('T')[0]
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [employees, setEmployees] = useState<string[]>(
    [jobInfo.technician || '', jobInfo.foreman || ''].filter(Boolean).length > 0
      ? [jobInfo.technician || '', jobInfo.foreman || ''].filter(Boolean)
      : ['']
  );
  const [showSuccess, setShowSuccess] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

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
      pdf.text(`Choose Work Type: ${formData.workType}`, 25, yPos + 10);
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

  const sendEmail = () => {
    const email = prompt('Enter email address to send the document:');
    if (email) {
      console.log(`Sending document to ${email}`);
      alert(`Document sent to ${email}`);
    }
  };

  const isStepComplete = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.employeeName && formData.employeePhone && formData.employeesOnJob.length > 0);
      case 2:
        return !!(formData.workType);
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
      <div className="backdrop-blur-xl bg-white/70 border-b border-white/20 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/dashboard/job-schedule/${params.id}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Silica Dust/Exposure Control Plan</h1>
                <p className="text-sm text-gray-500">OSHA Compliant Documentation</p>
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

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Employee Name *</label>
                  <input
                    type="text"
                    value={formData.employeeName}
                    onChange={(e) => handleInputChange('employeeName', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Employee Phone # *</label>
                  <input
                    type="tel"
                    value={formData.employeePhone}
                    onChange={(e) => handleInputChange('employeePhone', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
                    placeholder="(xxx) xxx-xxxx"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Employees Working On This Job *
                </label>
                {employees.map((emp, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={emp}
                      onChange={(e) => updateEmployee(index, e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
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
                  + Add Another Employee
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Choose Work Type */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">2</span>
                Choose Work Type
              </h3>

              <div className="space-y-3">
                {WORK_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => handleInputChange('workType', type)}
                    className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left font-medium ${
                      formData.workType === type
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{type}</span>
                      {formData.workType === type && (
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
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
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
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
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
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
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
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* Other Safety Concerns */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Other Safety Concerns
                </label>
                <textarea
                  value={formData.otherSafetyConcerns}
                  onChange={(e) => handleInputChange('otherSafetyConcerns', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
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
                <h4 className="font-semibold text-gray-800 mb-3">Document Summary</h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">Employee:</span>
                    <span className="font-medium">{formData.employeeName}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">Work Type:</span>
                    <span className="font-medium">{formData.workType}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">Water Delivery:</span>
                    <span className="font-medium">{formData.waterDeliveryIntegrated}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">Location:</span>
                    <span className="font-medium">{formData.workLocation}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">Cutting Time:</span>
                    <span className="font-medium">{formData.cuttingTime}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">APF 10 Required:</span>
                    <span className="font-medium">{formData.apf10Required}</span>
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
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Electronic Signature *
                </label>
                <input
                  type="text"
                  value={formData.signature}
                  onChange={(e) => handleInputChange('signature', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors font-signature text-xl"
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
              className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                currentStep === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              disabled={currentStep === 1}
            >
              Previous
            </button>

            {currentStep < 4 ? (
              <button
                onClick={() => isStepComplete(currentStep) && setCurrentStep(currentStep + 1)}
                className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                  isStepComplete(currentStep)
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!isStepComplete(currentStep)}
              >
                Next Step
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={sendEmail}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium transition-all duration-200 shadow-lg flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email Document
                </button>
                <button
                  onClick={generatePDF}
                  disabled={!isStepComplete(4)}
                  className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${
                    isStepComplete(4)
                      ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generate PDF & Save
                </button>
              </div>
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
                <h3 className="text-xl font-bold text-gray-800 mb-2">Document Completed!</h3>
                <p className="text-gray-600 mb-6">
                  The Silica Exposure Control Plan has been generated as a PDF and attached to Job #{params.id}.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold transition-colors"
                  >
                    Return to Dashboard
                  </button>
                  <button
                    onClick={() => router.push(`/dashboard/job-schedule/${params.id}`)}
                    className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-semibold transition-colors"
                  >
                    Return to Job Details
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