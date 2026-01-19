'use client';

import { useState } from 'react';

interface WorkOrderContractProps {
  jobData: {
    orderId: string;
    date: string;
    customer: string;
    jobLocation: string;
    poNumber?: string;
    workDescription: string;
    scopeOfWork?: string[];
  };
  mode: 'start' | 'completion';
  onSign: (signatureData: {
    signature: string;
    name: string;
    title: string;
    date: string;
    cutThroughAuthorized?: boolean;
    cutThroughSignature?: string;
    completionNotes?: string;
  }) => Promise<void>;
  onCancel?: () => void;
}

export default function WorkOrderContract({ jobData, mode, onSign, onCancel }: WorkOrderContractProps) {
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [cutThroughAuthorized, setCutThroughAuthorized] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signature, setSignature] = useState('');
  const [cutThroughSignature, setCutThroughSignature] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentSection, setCurrentSection] = useState(1);

  const handleSubmit = async () => {
    if (!acceptedTerms || !signerName || !signature) {
      alert('Please complete all required fields and accept the terms');
      return;
    }

    if (cutThroughAuthorized && !cutThroughSignature) {
      alert('Please sign the Cut-Through Authorization');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSign({
        signature,
        name: signerName,
        title: signerTitle,
        date: new Date().toISOString(),
        cutThroughAuthorized,
        cutThroughSignature: cutThroughAuthorized ? cutThroughSignature : undefined,
        completionNotes: mode === 'completion' ? completionNotes : undefined
      });
    } catch (error) {
      console.error('Error submitting contract:', error);
      alert('Error submitting contract. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-6">
        <h1 className="text-2xl font-bold mb-2">PONTIFEX INDUSTRIES</h1>
        <h2 className="text-xl">Work Order & Service Agreement</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-semibold">Work Order #:</span> {jobData.orderId}
          </div>
          <div>
            <span className="font-semibold">Date:</span> {new Date(jobData.date).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="bg-gray-100 p-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {[1, 2, 3, 4].map((section) => (
            <div key={section} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentSection >= section ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {section}
              </div>
              {section < 4 && (
                <div className={`w-16 h-1 ${currentSection > section ? 'bg-orange-500' : 'bg-gray-300'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="text-center mt-2 text-sm text-gray-600">
          {currentSection === 1 && 'Customer Information'}
          {currentSection === 2 && 'Terms & Conditions'}
          {currentSection === 3 && 'GPR & Liability Limitations'}
          {currentSection === 4 && 'Signature & Acceptance'}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="p-6 max-h-[60vh] overflow-y-auto">
        {/* Section 1: Customer Information */}
        {currentSection === 1 && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 border-b-2 border-orange-500 pb-2">
              Customer Information
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Company/Customer</label>
                <div className="p-3 bg-gray-50 rounded border">{jobData.customer}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">PO Number</label>
                <div className="p-3 bg-gray-50 rounded border">{jobData.poNumber || 'N/A'}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Job Location</label>
              <div className="p-3 bg-gray-50 rounded border">{jobData.jobLocation}</div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Scope of Work</label>
              <div className="p-3 bg-gray-50 rounded border whitespace-pre-wrap">{jobData.workDescription}</div>
            </div>

            {jobData.scopeOfWork && jobData.scopeOfWork.length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Work Items</label>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  {jobData.scopeOfWork.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Section 2: Terms & Conditions */}
        {currentSection === 2 && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 border-b-2 border-orange-500 pb-2">
              Terms & Conditions
            </h3>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
              <h4 className="font-bold text-blue-900 mb-2">Customer Responsibilities</h4>
              <p className="text-sm text-blue-800 mb-2">Customer shall provide at Customer's expense:</p>
              <ul className="text-sm text-blue-800 space-y-1 ml-4">
                <li>✓ Safe and adequate access to work area</li>
                <li>✓ Electrical power and water supply (if required)</li>
                <li>✓ Adequate parking for equipment and vehicles</li>
                <li>✓ Protection of existing property and finishes</li>
                <li>✓ Accurate location of all utilities and obstructions</li>
                <li>✓ Building access and security clearances</li>
              </ul>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
              <h4 className="font-bold text-yellow-900 mb-2">Inherent Risks of Concrete Cutting</h4>
              <p className="text-sm text-yellow-800 mb-2">Customer acknowledges that concrete cutting operations inherently involve:</p>
              <ul className="text-sm text-yellow-800 space-y-1 ml-4">
                <li>• Vibration that may affect adjacent structures</li>
                <li>• Dust generation despite control measures</li>
                <li>• Noise during operations</li>
                <li>• Minor cosmetic damage within 2" of cut edges</li>
              </ul>
            </div>

            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <h4 className="font-bold text-red-900 mb-2">Water Damage Disclaimer</h4>
              <p className="text-sm text-red-800">
                Pontifex Industries assumes NO responsibility for water damage, moisture intrusion, or water-related issues
                resulting from wet cutting operations, including damage to flooring, walls, ceilings, electrical systems, or
                stored materials.
              </p>
            </div>

            <div className="bg-purple-50 border-l-4 border-purple-500 p-4">
              <h4 className="font-bold text-purple-900 mb-2">Indemnification</h4>
              <p className="text-sm text-purple-800">
                Customer agrees to indemnify, defend, and hold harmless Pontifex Industries from any claims, damages, or expenses
                arising from Customer's negligence, inaccurate information, or failure to fulfill obligations under this Agreement.
              </p>
            </div>
          </div>
        )}

        {/* Section 3: GPR & Liability Limitations */}
        {currentSection === 3 && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 border-b-2 border-orange-500 pb-2">
              Ground Penetrating Radar (GPR) & Liability Limitations
            </h3>

            <div className="bg-red-50 border-2 border-red-500 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-8 h-8 text-red-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h4 className="font-bold text-red-900 text-lg mb-2">CRITICAL NOTICE</h4>
                  <p className="text-red-800 font-semibold mb-2">
                    Pontifex Industries assumes NO responsibility and explicitly disclaims all liability for:
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="border-l-4 border-gray-400 pl-4">
                <h5 className="font-bold text-gray-900 mb-2">1. Layout & Location Accuracy</h5>
                <p className="text-sm text-gray-700">
                  Customer is solely responsible for providing accurate work location layout and dimensions.
                  Pontifex is not responsible for errors in customer-provided layouts.
                </p>
              </div>

              <div className="border-l-4 border-gray-400 pl-4">
                <h5 className="font-bold text-gray-900 mb-2">2. Water Damage</h5>
                <p className="text-sm text-gray-700">
                  Any water damage, moisture intrusion, or water-related issues from wet cutting operations.
                </p>
              </div>

              <div className="border-l-4 border-gray-400 pl-4">
                <h5 className="font-bold text-gray-900 mb-2">3. GPR Limitations - Items NOT Guaranteed to be Detected</h5>
                <p className="text-sm text-gray-700 mb-2">
                  When GPR services are performed, Pontifex DOES NOT GUARANTEE detection of:
                </p>
                <ul className="text-sm text-gray-700 space-y-1 ml-4">
                  <li>▸ Post-tension cables or small diameter rebar (less than #4)</li>
                  <li>▸ Non-metallic utilities (PVC, fiber optic, etc.)</li>
                  <li>▸ Utilities in slabs-on-grade or shallow embedment</li>
                  <li>▸ De-energized or inactive electrical lines</li>
                  <li>▸ Low-voltage wiring, data cables, communication lines</li>
                  <li>▸ Obstructions in newly poured concrete (&lt;30 days)</li>
                  <li>▸ Wet or saturated subsurface conditions that impede radar</li>
                  <li>▸ Heavily reinforced concrete (rebar spacing &lt;6")</li>
                  <li>▸ Items beyond equipment penetration limits</li>
                  <li>▸ Any obstruction in areas not specifically scanned</li>
                </ul>
              </div>

              <div className="border-l-4 border-gray-400 pl-4">
                <h5 className="font-bold text-gray-900 mb-2">4. Unforeseen Conditions</h5>
                <p className="text-sm text-gray-700">
                  Any unforeseen subsurface conditions, concealed utilities, hazardous materials, or obstructions not
                  detectable by GPR or visual inspection.
                </p>
              </div>
            </div>

            {/* Cut-Through Authorization */}
            <div className="bg-red-100 border-2 border-red-600 p-4 rounded-lg">
              <h4 className="font-bold text-red-900 text-lg mb-3 flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Cut-Through Authorization
              </h4>

              <div className="bg-white p-4 rounded border-2 border-red-400 mb-3">
                <p className="text-sm text-red-900 font-semibold mb-2">
                  ⚠️ WARNING: Pontifex Industries STRONGLY RECOMMENDS never cutting through any obstructions or
                  utilities identified during GPR investigation.
                </p>
                <p className="text-sm text-gray-700 mb-3">
                  If you direct Pontifex to cut through, near, or around any marked obstruction, you assume 100% of
                  risk and liability for all resulting damages.
                </p>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cutThroughAuthorized}
                    onChange={(e) => setCutThroughAuthorized(e.target.checked)}
                    className="mt-1 w-5 h-5 text-red-600 rounded"
                  />
                  <span className="text-sm text-gray-900">
                    <strong>I authorize cutting through marked obstructions</strong> and acknowledge that I accept
                    full responsibility for any damages to utilities, embedments, or structures. I agree to indemnify
                    and hold harmless Pontifex Industries from all claims, damages, costs, and attorney fees.
                  </span>
                </label>
              </div>

              {cutThroughAuthorized && (
                <div className="bg-white p-4 rounded border-2 border-red-400">
                  <label className="block text-sm font-semibold text-red-900 mb-2">
                    Cut-Through Authorization Signature *
                  </label>
                  <input
                    type="text"
                    value={cutThroughSignature}
                    onChange={(e) => setCutThroughSignature(e.target.value)}
                    placeholder="Type your full name to authorize"
                    className="w-full px-4 py-3 border-2 border-red-400 rounded-lg font-signature text-2xl focus:border-red-600 focus:outline-none"
                  />
                  <p className="text-xs text-red-700 mt-1">
                    By typing your name, you are providing an electronic signature authorizing this high-risk operation.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section 4: Signature & Acceptance */}
        {currentSection === 4 && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 border-b-2 border-orange-500 pb-2">
              {mode === 'start' ? 'Agreement Acceptance' : 'Work Completion Acknowledgment'}
            </h3>

            {mode === 'completion' && (
              <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6">
                <h4 className="font-bold text-green-900 mb-3">Work Completion Checklist</h4>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 text-sm text-green-800">
                    <input type="checkbox" className="mt-1 w-4 h-4 text-green-600 rounded" defaultChecked />
                    <span>Work has been completed in accordance with the scope described above</span>
                  </label>
                  <label className="flex items-start gap-3 text-sm text-green-800">
                    <input type="checkbox" className="mt-1 w-4 h-4 text-green-600 rounded" defaultChecked />
                    <span>I have inspected the work and find it acceptable</span>
                  </label>
                  <label className="flex items-start gap-3 text-sm text-green-800">
                    <input type="checkbox" className="mt-1 w-4 h-4 text-green-600 rounded" defaultChecked />
                    <span>No claims for defective work or damages (other than noted below)</span>
                  </label>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-semibold text-green-900 mb-2">
                    Notes/Exceptions (if any)
                  </label>
                  <textarea
                    value={completionNotes}
                    onChange={(e) => setCompletionNotes(e.target.value)}
                    placeholder="Any issues, concerns, or exceptions to note..."
                    className="w-full px-3 py-2 border-2 border-green-300 rounded-lg focus:border-green-500 focus:outline-none"
                    rows={3}
                  />
                </div>
              </div>
            )}

            <div className="bg-gray-50 p-4 rounded-lg border-2 border-gray-300">
              <h4 className="font-bold text-gray-900 mb-3">By signing below, I acknowledge that:</h4>
              <ul className="space-y-2 text-sm text-gray-700 mb-4">
                <li className="flex items-start gap-2">
                  <span className="text-orange-500 mt-1">✓</span>
                  <span>I have read and understand all terms and conditions of this Agreement</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500 mt-1">✓</span>
                  <span>I have authority to bind Customer to this Agreement</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500 mt-1">✓</span>
                  <span>Work scope, pricing, and terms are acceptable</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500 mt-1">✓</span>
                  <span>I accept all limitations of liability and risk allocations stated above</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500 mt-1">✓</span>
                  <span>I will ensure Customer fulfills all obligations listed in this Agreement</span>
                </li>
              </ul>

              <label className="flex items-start gap-3 cursor-pointer bg-white p-3 rounded border-2 border-orange-500">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 w-5 h-5 text-orange-600 rounded"
                />
                <span className="text-sm font-semibold text-gray-900">
                  I accept all terms and conditions of this Work Order & Service Agreement
                </span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Print Name *
                </label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Title/Position
                </label>
                <input
                  type="text"
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                  placeholder="e.g., Project Manager"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Signature *
              </label>
              <input
                type="text"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="Type your full name as signature"
                className="w-full px-4 py-4 border-2 border-gray-300 rounded-lg font-signature text-3xl focus:border-orange-500 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-2">
                By typing your name above, you are providing a legally binding electronic signature
              </p>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>Date & Time:</strong> {new Date().toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="p-6 bg-gray-50 border-t-2 border-gray-200">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-3">
            {currentSection > 1 && (
              <button
                onClick={() => setCurrentSection(currentSection - 1)}
                className="px-6 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-colors font-semibold"
              >
                Previous
              </button>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                className="px-6 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-colors font-semibold"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex gap-3">
            {currentSection < 4 ? (
              <button
                onClick={() => setCurrentSection(currentSection + 1)}
                className="px-6 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-semibold flex items-center gap-2"
              >
                Next Section
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!acceptedTerms || !signerName || !signature || isSubmitting}
                className="px-8 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Sign & Submit</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .font-signature {
          font-family: 'Brush Script MT', 'Lucida Handwriting', cursive;
        }
      `}</style>
    </div>
  );
}
