'use client';

import { useState } from 'react';

interface ServiceCompletionAgreementProps {
  jobData: {
    orderId: string;
    customer: string;
    jobLocation: string;
    workDescription: string;
    workPerformed: string[];
    workPerformedDetails?: Array<{
      name: string;
      quantity: number;
      notes?: string;
    }>;
    estimatedTotal?: number;
  };
  onSign: (signatureData: {
    customerName: string;
    customerTitle: string;
    signature: string;
    acceptedTerms: boolean;
    workSatisfactory: boolean;
    contactNotOnSite: boolean;
    acknowledgedPayment: boolean;
    additionalNotes?: string;
    cleanlinessRating?: number;
    communicationRating?: number;
    overallRating?: number;
    feedbackComments?: string;
  }) => Promise<void>;
  onCancel?: () => void;
}

export default function ServiceCompletionAgreement({
  jobData,
  onSign,
  onCancel
}: ServiceCompletionAgreementProps) {
  const [currentSection, setCurrentSection] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerTitle, setCustomerTitle] = useState('');
  const [signature, setSignature] = useState('');
  const [workSatisfactory, setWorkSatisfactory] = useState<boolean | null>(null);
  const [contactNotOnSite, setContactNotOnSite] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acknowledgedPayment, setAcknowledgedPayment] = useState(false);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Customer feedback survey fields
  const [cleanlinessRating, setCleanlinessRating] = useState<number>(0);
  const [communicationRating, setCommunicationRating] = useState<number>(0);
  const [overallRating, setOverallRating] = useState<number>(0);
  const [feedbackComments, setFeedbackComments] = useState('');

  const sections = [
    { id: 1, title: 'Work Summary' },
    { id: 2, title: 'Completion Terms' },
    { id: 3, title: 'Payment & Liability' },
    { id: 4, title: 'Final Signature' }
  ];

  const handleNext = () => {
    if (currentSection < 4) {
      // Skip section 3 (Payment & Liability) if contact not on site
      if (currentSection === 2 && contactNotOnSite) {
        setCurrentSection(4);
      } else {
        setCurrentSection(currentSection + 1);
      }
    }
  };

  const handleBack = () => {
    if (currentSection > 1) {
      // Skip section 3 (Payment & Liability) if contact not on site
      if (currentSection === 4 && contactNotOnSite) {
        setCurrentSection(2);
      } else {
        setCurrentSection(currentSection - 1);
      }
    }
  };

  const handleSubmit = async () => {
    // If contact not on site, skip signature and terms validation
    if (contactNotOnSite) {
      if (workSatisfactory === null) {
        alert('Please select contact status');
        return;
      }
      // No need to validate terms when contact not on site
    } else {
      // Normal validation with signature required
      if (!customerName || !signature || workSatisfactory === null) {
        alert('Please complete all required fields');
        return;
      }

      if (!acceptedTerms || !acknowledgedPayment) {
        alert('You must accept all terms to proceed');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSign({
        customerName,
        customerTitle,
        signature,
        acceptedTerms,
        workSatisfactory,
        contactNotOnSite,
        acknowledgedPayment,
        additionalNotes,
        cleanlinessRating: contactNotOnSite ? undefined : cleanlinessRating,
        communicationRating: contactNotOnSite ? undefined : communicationRating,
        overallRating: contactNotOnSite ? undefined : overallRating,
        feedbackComments: contactNotOnSite ? undefined : feedbackComments
      });
    } catch (error) {
      console.error('Error submitting signature:', error);
      alert('Error submitting. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSectionComplete = (section: number): boolean => {
    switch (section) {
      case 1:
        return true; // Review only
      case 2:
        return workSatisfactory !== null;
      case 3:
        return acceptedTerms && acknowledgedPayment;
      case 4:
        // If contact not on site, section 4 is complete without signature
        return contactNotOnSite || !!(customerName && signature);
      default:
        return false;
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-4xl mx-auto">
      {/* Progress Bar */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-500 px-8 py-6">
        <h2 className="text-2xl font-bold text-white mb-4">Service Completion Agreement</h2>
        <div className="flex items-center justify-between">
          {sections
            .filter(section => !(contactNotOnSite && section.id === 3))
            .map((section, index) => (
            <div key={section.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                    currentSection === section.id
                      ? 'bg-white text-green-600 scale-110'
                      : isSectionComplete(section.id)
                      ? 'bg-green-300 text-green-800'
                      : 'bg-green-700 text-green-200'
                  }`}
                >
                  {isSectionComplete(section.id) && currentSection !== section.id ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    section.id
                  )}
                </div>
                <span className="text-xs text-white mt-2 text-center">{section.title}</span>
              </div>
              {index < sections.length - 1 && (
                <div className={`h-1 flex-1 mx-2 rounded ${isSectionComplete(section.id) ? 'bg-green-300' : 'bg-green-700'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {/* Section 1: Work Summary */}
        {currentSection === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Work Summary Review</h3>
                <p className="text-sm text-gray-600">Review the completed work before signing</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-600">Job Order #</label>
                  <p className="text-lg font-bold text-gray-900">{jobData.orderId}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600">Customer</label>
                  <p className="text-lg font-bold text-gray-900">{jobData.customer}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">Location</label>
                <p className="text-gray-900">{jobData.jobLocation}</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600">Original Scope of Work</label>
                <p className="text-gray-900">{jobData.workDescription}</p>
              </div>

              {(jobData.workPerformedDetails && jobData.workPerformedDetails.length > 0) ? (
                <div>
                  <label className="text-sm font-semibold text-gray-600 mb-3 block">Work Completed</label>
                  <div className="space-y-3">
                    {jobData.workPerformedDetails.map((item, index) => (
                      <div key={index} className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="flex items-start gap-2">
                          <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <div className="flex-1">
                            <div className="font-bold text-gray-900 mb-2">
                              {item.name}
                              {item.quantity > 1 && <span className="ml-2 text-sm text-gray-600">(Quantity: {item.quantity})</span>}
                            </div>

                            {/* Core Drilling Details */}
                            {(item as any).details?.holes && (
                              <div className="mt-2 space-y-2">
                                <div className="text-sm font-semibold text-gray-700">Core Drilling Specifications:</div>
                                {(item as any).details.holes.map((hole: any, holeIndex: number) => (
                                  <div key={holeIndex} className="pl-4 text-sm text-gray-700 border-l-2 border-green-200">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div><span className="font-semibold">Bit Size:</span> {hole.bitSize} inches</div>
                                      <div><span className="font-semibold">Depth:</span> {hole.depthInches} inches</div>
                                      <div><span className="font-semibold">Holes:</span> {hole.quantity}</div>
                                      {hole.plasticSetup && <div className="col-span-2"><span className="font-semibold">Setup:</span> Plastic/Handheld</div>}
                                      {hole.cutSteel && <div className="col-span-2"><span className="font-semibold">Steel Cut:</span> Yes{hole.steelEncountered ? ` (${hole.steelEncountered})` : ''}</div>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Sawing Details */}
                            {(item as any).details?.cuts && (
                              <div className="mt-2 space-y-2">
                                <div className="text-sm font-semibold text-gray-700">Sawing Specifications:</div>
                                {(item as any).details.cuts.map((cut: any, cutIndex: number) => (
                                  <div key={cutIndex} className="pl-4 text-sm text-gray-700 border-l-2 border-green-200">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div><span className="font-semibold">Linear Feet:</span> {cut.linearFeet} LF</div>
                                      <div><span className="font-semibold">Cut Depth:</span> {cut.cutDepth} inches</div>
                                      {cut.bladesUsed && cut.bladesUsed.length > 0 && (
                                        <div className="col-span-2"><span className="font-semibold">Blades Used:</span> {cut.bladesUsed.join(', ')}</div>
                                      )}
                                      {cut.cutSteel && <div className="col-span-2"><span className="font-semibold">Steel Cut:</span> Yes{cut.steelEncountered ? ` (${cut.steelEncountered})` : ''}</div>}
                                      {cut.overcut && <div className="col-span-2"><span className="font-semibold">Overcut:</span> Yes</div>}
                                      {cut.chainsawed && (
                                        <div className="col-span-2">
                                          <span className="font-semibold">Chainsawed:</span> {cut.chainsawAreas} areas @ {cut.chainsawWidthInches}" width
                                        </div>
                                      )}
                                      {cut.areas && cut.areas.length > 0 && (
                                        <div className="col-span-2">
                                          <span className="font-semibold">Areas Cut:</span>
                                          {cut.areas.map((area: any, areaIndex: number) => (
                                            <div key={areaIndex} className="ml-4">
                                              • {area.length}' × {area.width}' × {area.depth}" deep (Qty: {area.quantity})
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {(item as any).details.cutType && (
                                  <div className="text-sm text-gray-700 pl-4">
                                    <span className="font-semibold">Cut Type:</span> {(item as any).details.cutType === 'wet' ? 'Wet Cut' : 'Dry Cut'}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* General Details */}
                            {(item as any).details?.duration && (
                              <div className="mt-2 text-sm text-gray-700">
                                <span className="font-semibold">Duration:</span> {(item as any).details.duration} hours
                              </div>
                            )}
                            {(item as any).details?.equipment && (item as any).details.equipment.length > 0 && (
                              <div className="mt-2 text-sm text-gray-700">
                                <span className="font-semibold">Equipment:</span> {(item as any).details.equipment.join(', ')}
                              </div>
                            )}

                            {/* Notes */}
                            {item.notes && (
                              <div className="mt-2 text-sm text-gray-700 bg-gray-50 p-2 rounded">
                                <span className="font-semibold">Notes:</span> {item.notes}
                              </div>
                            )}
                            {(item as any).details?.notes && (
                              <div className="mt-2 text-sm text-gray-700 bg-gray-50 p-2 rounded">
                                <span className="font-semibold">Additional Notes:</span> {(item as any).details.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : jobData.workPerformed.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-gray-600 mb-2 block">Work Completed</label>
                  <ul className="space-y-2">
                    {jobData.workPerformed.map((item, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-gray-900">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {jobData.estimatedTotal && (
                <div className="pt-4 border-t border-gray-200">
                  <label className="text-sm font-semibold text-gray-600">Estimated Total</label>
                  <p className="text-2xl font-bold text-green-600">${jobData.estimatedTotal.toFixed(2)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 2: Completion Terms */}
        {currentSection === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Service Completion Terms</h3>
                <p className="text-sm text-gray-600">Acknowledgment of completed work</p>
              </div>
            </div>

            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 space-y-4">
              <h4 className="font-bold text-gray-900 text-lg">Work Completion Acknowledgment</h4>

              <div className="space-y-3">
                <p className="text-gray-700 leading-relaxed">
                  I acknowledge that <strong>Pontifex Industries</strong> (formerly B&D Concrete Cutting) has completed the contracted services at the above location as described. The work has been performed in accordance with the scope of services requested.
                </p>

                <div className="bg-white rounded-lg p-4 space-y-3">
                  <p className="font-semibold text-gray-900">Please confirm:</p>

                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setWorkSatisfactory(true);
                        setContactNotOnSite(false);
                      }}
                      className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                        workSatisfactory === true && !contactNotOnSite
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          workSatisfactory === true && !contactNotOnSite ? 'border-green-500 bg-green-500' : 'border-gray-300'
                        }`}>
                          {workSatisfactory === true && !contactNotOnSite && (
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Work is satisfactory and complete</p>
                          <p className="text-sm text-gray-600">I accept the work as performed</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setWorkSatisfactory(false);
                        setContactNotOnSite(false);
                      }}
                      className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                        workSatisfactory === false && !contactNotOnSite
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          workSatisfactory === false && !contactNotOnSite ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                        }`}>
                          {workSatisfactory === false && !contactNotOnSite && (
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Work requires correction or completion</p>
                          <p className="text-sm text-gray-600">Issues need to be addressed</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        setWorkSatisfactory(true);
                        setContactNotOnSite(true);
                      }}
                      className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                        contactNotOnSite
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          contactNotOnSite ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                        }`}>
                          {contactNotOnSite && (
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">Contact not on site</p>
                          <p className="text-sm text-gray-600">No one available to sign</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {workSatisfactory === false && (
                  <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Please describe what needs attention *
                    </label>
                    <textarea
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border-2 border-orange-300 focus:border-orange-500 focus:outline-none"
                      rows={4}
                      placeholder="Describe the issues or incomplete work..."
                      required
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Customer Feedback Survey - Hidden when contact not on site */}
            {workSatisfactory !== null && !contactNotOnSite && (
              <div className="bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-200 rounded-xl p-6 space-y-6">
                {/* Warning for Operators */}
                <div className="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <p className="font-bold text-yellow-900 mb-1">⚠️ OPERATOR NOTICE</p>
                      <p className="text-sm text-yellow-800">
                        This survey is for <strong>CUSTOMER FEEDBACK ONLY</strong>. Do not fill this out yourself.
                        Hand the device to the customer to complete the survey. These ratings directly affect your
                        performance metrics and profile ratings.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  <h4 className="font-bold text-gray-900 text-lg">Quick Feedback Survey</h4>
                </div>
                <p className="text-sm text-gray-600">Help us improve by rating our service (optional but appreciated)</p>

                {/* Cleanliness Rating */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Site Cleanliness After Work</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                      <button
                        key={rating}
                        onClick={() => setCleanlinessRating(rating)}
                        className={`w-12 h-12 rounded-lg font-bold transition-all ${
                          cleanlinessRating === rating
                            ? 'bg-green-600 text-white shadow-lg scale-110'
                            : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-green-400'
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Poor</span>
                    <span>Excellent</span>
                  </div>
                </div>

                {/* Communication Rating */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Operator Communication</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                      <button
                        key={rating}
                        onClick={() => setCommunicationRating(rating)}
                        className={`w-12 h-12 rounded-lg font-bold transition-all ${
                          communicationRating === rating
                            ? 'bg-green-600 text-white shadow-lg scale-110'
                            : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-green-400'
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Poor</span>
                    <span>Excellent</span>
                  </div>
                </div>

                {/* Overall Rating */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Overall Experience</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                      <button
                        key={rating}
                        onClick={() => setOverallRating(rating)}
                        className={`w-12 h-12 rounded-lg font-bold transition-all ${
                          overallRating === rating
                            ? 'bg-green-600 text-white shadow-lg scale-110'
                            : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-green-400'
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Poor</span>
                    <span>Excellent</span>
                  </div>
                </div>

                {/* Comments */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Additional Comments (Optional)
                  </label>
                  <textarea
                    value={feedbackComments}
                    onChange={(e) => setFeedbackComments(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-green-500 focus:outline-none"
                    rows={3}
                    placeholder="Any other feedback about the service..."
                  />
                </div>
              </div>
            )}

          </div>
        )}

        {/* Section 3: Payment & Liability */}
        {currentSection === 3 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Payment & Liability Terms</h3>
                <p className="text-sm text-gray-600">Final billing and legal acknowledgments</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Payment Terms */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h4 className="font-bold text-gray-900 mb-4">Payment Terms</h4>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex gap-2">
                    <span className="text-green-600 font-bold">•</span>
                    <span>Payment is due upon completion unless other arrangements were made in writing.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-600 font-bold">•</span>
                    <span>A finance charge of 1.5% per month (18% annual) applies to overdue balances after 30 days.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-600 font-bold">•</span>
                    <span>Customer is responsible for all collection costs and reasonable attorney fees if collection action is required.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-green-600 font-bold">•</span>
                    <span>Any change orders or additional work beyond the original scope may result in adjusted pricing.</span>
                  </li>
                </ul>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acknowledgedPayment}
                      onChange={(e) => setAcknowledgedPayment(e.target.checked)}
                      className="mt-1 w-5 h-5 text-green-600 rounded focus:ring-green-500"
                    />
                    <span className="text-gray-900">
                      <strong>I acknowledge and accept</strong> the payment terms stated above and agree to remit payment according to these terms.
                    </span>
                  </label>
                </div>
              </div>

              {/* Liability Release */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h4 className="font-bold text-gray-900 mb-4">Liability Release & Indemnification</h4>
                <div className="space-y-3 text-gray-700 text-sm leading-relaxed">
                  <p>
                    <strong>Limitation of Liability:</strong> Pontifex Industries' liability for any claim arising out of this agreement shall not exceed the total amount paid for the services rendered. We shall not be liable for any indirect, incidental, special, or consequential damages.
                  </p>
                  <p>
                    <strong>Indemnification:</strong> Customer agrees to indemnify, defend, and hold harmless Pontifex Industries, its officers, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorney fees) arising from: (a) Customer's breach of this agreement; (b) Customer's use of the services or work product; (c) Any third-party claims related to the work performed at Customer's premises.
                  </p>
                  <p>
                    <strong>Underground Utilities:</strong> Customer warrants that all underground utilities have been properly marked and disclosed. Pontifex Industries is not liable for damage to unmarked or incorrectly marked utilities.
                  </p>
                  <p>
                    <strong>Site Conditions:</strong> Customer is responsible for site safety and access. Any unforeseen site conditions that affect the scope of work may result in additional charges.
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-1 w-5 h-5 text-green-600 rounded focus:ring-green-500"
                    />
                    <span className="text-gray-900">
                      <strong>I have read and accept</strong> all terms and conditions stated above, including the liability release and indemnification provisions.
                    </span>
                  </label>
                </div>
              </div>

              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
                <div className="flex gap-3">
                  <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-sm text-red-800">
                    <p className="font-semibold">Important Legal Notice</p>
                    <p className="mt-1">By proceeding, you are entering into a binding legal agreement. Please read all terms carefully before signing.</p>
                  </div>
                </div>
              </div>

              {/* Progress Indicator */}
              {(!acceptedTerms || !acknowledgedPayment) && (
                <div className="bg-yellow-50 border-4 border-yellow-400 rounded-xl p-6 shadow-lg">
                  <div className="flex gap-4">
                    <svg className="w-10 h-10 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-xl font-bold text-yellow-900 mb-4">⚠️ Please Complete Both Checkboxes Above:</p>
                      <ul className="space-y-3">
                        <li className="flex items-center gap-3">
                          {acknowledgedPayment ? (
                            <svg className="w-7 h-7 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                              <circle cx="12" cy="12" r="10" strokeWidth="2" />
                            </svg>
                          )}
                          <span className={`text-lg font-semibold ${acknowledgedPayment ? 'line-through text-gray-500' : 'text-yellow-900'}`}>
                            ☐ Payment Terms (scroll up to first section)
                          </span>
                        </li>
                        <li className="flex items-center gap-3">
                          {acceptedTerms ? (
                            <svg className="w-7 h-7 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                              <circle cx="12" cy="12" r="10" strokeWidth="2" />
                            </svg>
                          )}
                          <span className={`text-lg font-semibold ${acceptedTerms ? 'line-through text-gray-500' : 'text-yellow-900'}`}>
                            ☐ Liability Release & Indemnification (second section)
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 4: Final Signature or Submit (Contact Not On Site) */}
        {currentSection === 4 && (
          <div className="space-y-6 animate-fade-in">
            {contactNotOnSite ? (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Complete Job Ticket</h3>
                    <p className="text-sm text-gray-600">No signature required - contact not on site</p>
                  </div>
                </div>

                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
                  <div className="flex gap-3 mb-4">
                    <svg className="w-6 h-6 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-blue-900 mb-2">Contact Not Available</p>
                      <p className="text-sm text-blue-800">
                        Since no contact was available on site to sign, this job ticket will be marked as completed without a customer signature. The admin will be able to review this ticket in the Completed Jobs Archive.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 bg-white rounded-lg p-4">
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Optional Notes
                    </label>
                    <textarea
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none"
                      rows={3}
                      placeholder="Add any notes about why contact was not available..."
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">Final Signature</h3>
                    <p className="text-sm text-gray-600">Authorize and complete the agreement</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Customer Name (Print) *
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-green-500 focus:outline-none text-gray-900 font-medium"
                      placeholder="Enter your full name"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Title/Position
                    </label>
                    <input
                      type="text"
                      value={customerTitle}
                      onChange={(e) => setCustomerTitle(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-green-500 focus:outline-none text-gray-900"
                      placeholder="e.g., Project Manager, Property Owner"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Electronic Signature *
                    </label>
                    <input
                      type="text"
                      value={signature}
                      onChange={(e) => setSignature(e.target.value)}
                      className="w-full px-4 py-4 rounded-xl border-2 border-gray-300 focus:border-green-500 focus:outline-none font-signature text-2xl text-gray-900"
                      placeholder="Type your full name to sign"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-2">
                  By typing your name above, you are creating a legally binding electronic signature equivalent to a handwritten signature.
                </p>
              </div>

              <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                <h4 className="font-bold text-green-900 mb-3">Summary of Your Agreement:</h4>
                <ul className="space-y-2 text-sm text-green-800">
                  <li className="flex gap-2">
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Work performed: {workSatisfactory ? 'Satisfactory' : 'Requires attention'}</span>
                  </li>
                  <li className="flex gap-2">
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Payment terms accepted</span>
                  </li>
                  <li className="flex gap-2">
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Liability release and indemnification accepted</span>
                  </li>
                </ul>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600">
                <p className="mb-2"><strong>Date/Time of Signature:</strong> {new Date().toLocaleString()}</p>
                <p><strong>Job Order:</strong> {jobData.orderId}</p>
              </div>
            </div>
          </>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
          {currentSection > 1 && (
            <button
              onClick={handleBack}
              disabled={isSubmitting}
              className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
          )}

          {onCancel && currentSection === 1 && (
            <button
              onClick={onCancel}
              className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
            >
              Cancel
            </button>
          )}

          <div className="flex-1" />

          {currentSection < 4 ? (
            <button
              onClick={handleNext}
              disabled={!isSectionComplete(currentSection)}
              className={`px-8 py-3 rounded-xl font-semibold transition-all ${
                isSectionComplete(currentSection)
                  ? 'bg-gradient-to-r from-green-600 to-emerald-500 text-white hover:from-green-700 hover:to-emerald-600 shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!isSectionComplete(4) || isSubmitting}
              className={`px-8 py-4 rounded-xl font-bold text-lg transition-all flex items-center gap-3 ${
                isSectionComplete(4) && !isSubmitting
                  ? 'bg-gradient-to-r from-green-600 to-emerald-500 text-white hover:from-green-700 hover:to-emerald-600 shadow-lg hover:shadow-xl transform hover:scale-105'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin w-6 h-6 border-3 border-white border-t-transparent rounded-full" />
                  Submitting...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Submit Agreement
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .font-signature {
          font-family: 'Brush Script MT', 'Lucida Handwriting', cursive;
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

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
