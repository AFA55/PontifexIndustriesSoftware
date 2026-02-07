'use client';

import { useState, useRef, useEffect } from 'react';
import { getLiabilityReleaseText } from '@/lib/legal/standby-policy';
import Notification from './Notification';

interface LiabilityReleaseModalProps {
  jobData: {
    orderId: string;
    customer: string;
    jobLocation: string;
  };
  onSign: (signatureData: {
    operatorName: string;
    signature: string;
    signedAt: string;
  }) => Promise<void>;
  onCancel?: () => void;
}

export default function LiabilityReleaseModal({
  jobData,
  onSign,
  onCancel
}: LiabilityReleaseModalProps) {
  const [operatorName, setOperatorName] = useState('');
  const [signature, setSignature] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2; // High DPI
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    // Set drawing style
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

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
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

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
    setSignature('');
  };

  const handleSubmit = async () => {
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

    setIsSubmitting(true);
    try {
      await onSign({
        operatorName,
        signature: signatureDataURL,
        signedAt: new Date().toISOString()
      });
      setNotification({ type: 'success', message: 'Liability release signed successfully. You can now start work.' });
    } catch (error) {
      console.error('Error submitting signature:', error);
      setNotification({ type: 'error', message: 'Error submitting. Please try again.' });
      setIsSubmitting(false);
    }
  };

  const liabilityText = getLiabilityReleaseText();

  return (
    <>
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-orange-500 px-8 py-6">
          <h2 className="text-2xl font-bold text-white mb-2">Liability Release & Indemnification</h2>
          <p className="text-red-100 text-sm">Required before starting work</p>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="space-y-6">
            {/* Job Details */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="font-semibold text-gray-600">Job Order:</span>
                  <p className="text-gray-900">{jobData.orderId}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-600">Customer:</span>
                  <p className="text-gray-900">{jobData.customer}</p>
                </div>
                <div className="col-span-2">
                  <span className="font-semibold text-gray-600">Location:</span>
                  <p className="text-gray-900">{jobData.jobLocation}</p>
                </div>
              </div>
            </div>

            {/* Liability Terms */}
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-6">
              <h3 className="font-bold text-orange-900 mb-4 text-lg">Liability Release & Indemnification</h3>
              <div className="space-y-4 text-sm text-orange-900 leading-relaxed max-h-64 overflow-y-auto">
                <div dangerouslySetInnerHTML={{ __html: liabilityText }} />
              </div>
            </div>

            {/* Operator Details */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Operator Name (Print) *
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 focus:border-red-500 focus:outline-none text-gray-900 font-medium"
                  placeholder="Enter your full name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Electronic Signature *
                </label>
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
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
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
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-8 py-4 border-t border-gray-200 flex gap-4">
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !operatorName || !hasSignature || !accepted}
            className={`flex-1 px-6 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-xl ${
              isSubmitting || !operatorName || !hasSignature || !accepted
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 text-white'
            }`}
          >
            {isSubmitting ? 'Signing...' : 'Accept & Continue to Equipment Checklist'}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
