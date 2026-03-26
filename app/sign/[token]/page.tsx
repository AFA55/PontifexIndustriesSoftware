'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2, Loader2, AlertTriangle, PenTool, Shield,
  FileText, Star, ThumbsUp, ThumbsDown, X, MapPin,
  ClipboardCheck,
} from 'lucide-react';

type RequestType = 'utility_waiver' | 'completion' | 'custom';
type PageState = 'loading' | 'form' | 'survey' | 'success' | 'error';

interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'checkbox' | 'signature' | 'select' | 'date' | 'number';
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

interface SignatureData {
  request_type: RequestType;
  contact_name: string;
  status: string;
  form_template: {
    id: string;
    name: string;
    description: string;
    fields: FormField[];
    requires_signature: boolean;
  } | null;
  job: {
    job_number: string;
    customer_name: string;
    job_type: string;
    address: string;
    description: string;
    customer_contact: string;
  } | null;
}

export default function PublicSignPage() {
  const params = useParams();
  const token = params.token as string;

  const [pageState, setPageState] = useState<PageState>('loading');
  const [data, setData] = useState<SignatureData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureDataState] = useState('');
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');

  // Form data for custom forms
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  // Waiver checkboxes
  const [safetyAck, setSafetyAck] = useState(false);
  const [cutThroughAuth, setCutThroughAuth] = useState(false);
  const [liabilityAccepted, setLiabilityAccepted] = useState(false);

  // Completion form
  const [workConfirmed, setWorkConfirmed] = useState(false);
  const [exceptionNotes, setExceptionNotes] = useState('');

  // Survey state
  const [surveyClean, setSurveyClean] = useState(0);
  const [surveyComm, setSurveyComm] = useState(0);
  const [surveyOverall, setSurveyOverall] = useState(0);
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  useEffect(() => {
    fetchSignatureRequest();
  }, [token]);

  const fetchSignatureRequest = async () => {
    try {
      const res = await fetch(`/api/public/signature/${token}`);
      if (!res.ok) {
        const errData = await res.json();
        if (errData.error === 'already_signed') {
          setErrorMessage('This document has already been signed.');
        } else if (errData.error === 'expired') {
          setErrorMessage('This signature request has expired. Please contact the team for a new link.');
        } else {
          setErrorMessage('Invalid or expired link.');
        }
        setPageState('error');
        return;
      }

      const result = await res.json();
      setData(result.data);
      if (result.data.contact_name) {
        setSignerName(result.data.contact_name);
      }
      setPageState('form');
    } catch {
      setErrorMessage('Unable to load. Please check your connection and try again.');
      setPageState('error');
    }
  };

  // Signature canvas handlers
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureDataState(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataState('');
  };

  const handleSubmit = async (skipSurvey = false) => {
    if (!signatureData) return;
    setSubmitting(true);

    try {
      const payload: Record<string, any> = {
        signature_data: signatureData,
        signer_name: signerName || undefined,
        signer_title: signerTitle || undefined,
        form_data: {},
      };

      // Add form-specific data
      if (data?.request_type === 'utility_waiver') {
        payload.form_data = {
          safety_acknowledged: safetyAck,
          cut_through_authorized: cutThroughAuth,
          liability_accepted: liabilityAccepted,
        };
      } else if (data?.request_type === 'completion') {
        payload.form_data = {
          work_confirmed: workConfirmed,
          exception_notes: exceptionNotes || undefined,
        };
      } else if (data?.request_type === 'custom') {
        payload.form_data = formValues;
      }

      // Add survey data if completion type and not skipping
      if (data?.request_type === 'completion' && !skipSurvey && pageState === 'survey') {
        payload.survey = {
          cleanliness_rating: surveyClean || undefined,
          communication_rating: surveyComm || undefined,
          overall_rating: surveyOverall || undefined,
          would_recommend: wouldRecommend,
          feedback_text: feedbackText || undefined,
        };
      }

      const res = await fetch(`/api/public/signature/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setPageState('success');
      } else {
        const errData = await res.json();
        setErrorMessage(errData.error === 'already_signed' ? 'Already signed' : (errData.error || 'Failed to submit'));
        setPageState('error');
      }
    } catch {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignAndContinue = () => {
    if (data?.request_type === 'completion') {
      setPageState('survey');
    } else {
      handleSubmit(true);
    }
  };

  // Star rating component
  const StarRating = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-1.5">{label}</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="p-1 transition-all"
          >
            <Star className={`w-7 h-7 ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
          </button>
        ))}
      </div>
    </div>
  );

  // Render dynamic field for custom forms
  const renderDynamicField = (field: FormField) => {
    const val = formValues[field.id];
    const updateVal = (v: any) => setFormValues(prev => ({ ...prev, [field.id]: v }));

    return (
      <div key={field.id}>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {field.type === 'text' && (
          <input
            type="text"
            value={val || ''}
            onChange={e => updateVal(e.target.value)}
            placeholder={field.placeholder}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
          />
        )}
        {field.type === 'textarea' && (
          <textarea
            value={val || ''}
            onChange={e => updateVal(e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 resize-none"
          />
        )}
        {field.type === 'number' && (
          <input
            type="number"
            value={val || ''}
            onChange={e => updateVal(e.target.value)}
            placeholder={field.placeholder}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
          />
        )}
        {field.type === 'date' && (
          <input
            type="date"
            value={val || ''}
            onChange={e => updateVal(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
          />
        )}
        {field.type === 'checkbox' && (
          <label className="flex items-center gap-3 cursor-pointer py-1">
            <input
              type="checkbox"
              checked={val || false}
              onChange={e => updateVal(e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-600">{field.placeholder || field.label}</span>
          </label>
        )}
        {field.type === 'select' && (
          <select
            value={val || ''}
            onChange={e => updateVal(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
          >
            <option value="">{field.placeholder || 'Select...'}</option>
            {(field.options || []).map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        )}
        {field.type === 'signature' && (
          <div className="text-xs text-slate-400 italic">Signature captured below</div>
        )}
      </div>
    );
  };

  // ─── LOADING ──────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading document...</p>
        </div>
      </div>
    );
  }

  // ─── ERROR ────────────────────────────────
  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Unable to Load</h1>
          <p className="text-sm text-slate-600">{errorMessage}</p>
        </div>
      </div>
    );
  }

  // ─── SUCCESS ──────────────────────────────
  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Thank You!</h1>
          <p className="text-sm text-slate-600">Your signature has been recorded successfully.</p>
          <p className="text-xs text-slate-400 mt-4">You may close this page.</p>
        </div>
      </div>
    );
  }

  // ─── SURVEY (after completion signature) ────
  if (pageState === 'survey') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="container mx-auto px-4 py-8 max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-6 space-y-5">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                <Star className="w-6 h-6 text-amber-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Quick Feedback</h2>
              <p className="text-sm text-slate-500">How was your experience? (Optional)</p>
            </div>

            <div className="space-y-4">
              <StarRating value={surveyClean} onChange={setSurveyClean} label="Cleanliness" />
              <StarRating value={surveyComm} onChange={setSurveyComm} label="Communication" />
              <StarRating value={surveyOverall} onChange={setSurveyOverall} label="Overall Experience" />

              <div>
                <p className="text-sm font-medium text-slate-700 mb-1.5">Would you recommend us?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setWouldRecommend(true)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                      wouldRecommend === true
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setWouldRecommend(false)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                      wouldRecommend === false
                        ? 'bg-red-50 border-red-500 text-red-700'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    No
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Additional Feedback</label>
                <textarea
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  placeholder="Any additional comments..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 resize-none"
                />
              </div>
            </div>

            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl py-3.5 font-semibold text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>

            <button
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              className="w-full text-slate-400 text-sm hover:text-slate-600 py-2"
            >
              Skip Survey
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── FORM ─────────────────────────────────
  const isWaiver = data?.request_type === 'utility_waiver';
  const isCompletion = data?.request_type === 'completion';
  const isCustom = data?.request_type === 'custom';

  const canSubmit = () => {
    if (!signatureData) return false;
    if (isWaiver && (!safetyAck || !cutThroughAuth || !liabilityAccepted)) return false;
    if (isCompletion && !workConfirmed) return false;
    // Check required fields for custom forms
    if (isCustom && data?.form_template?.fields) {
      for (const field of data.form_template.fields) {
        if (field.required && field.type !== 'signature') {
          const val = formValues[field.id];
          if (!val && val !== false && val !== 0) return false;
        }
      }
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white">
        <div className="container mx-auto px-4 py-6 max-w-md">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Pontifex Industries</h1>
              <p className="text-xs text-blue-300">Secure Document Signing</p>
            </div>
          </div>
          {data?.job && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-sm space-y-1">
              <p className="font-semibold">{data.job.customer_name}</p>
              <p className="text-blue-200 text-xs">{data.job.job_number} &bull; {data.job.job_type}</p>
              {data.job.address && (
                <p className="text-blue-200 text-xs flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {data.job.address}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-md space-y-5">
        {/* ── UTILITY WAIVER FORM ─── */}
        {isWaiver && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-bold text-slate-900">Utility Waiver</h2>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-amber-800 leading-relaxed">
                  This is where the utility waiver legal content will go. [Editable via Form Builder]
                </p>
                <p className="text-xs text-amber-600 mt-2">
                  By signing below, you acknowledge that cutting operations may encounter subsurface utilities,
                  and you authorize the work to proceed under the stated conditions.
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={safetyAck}
                    onChange={e => setSafetyAck(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">
                    I acknowledge the safety protocols and potential hazards involved in this work.
                    <span className="text-red-500 ml-1">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={liabilityAccepted}
                    onChange={e => setLiabilityAccepted(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">
                    I understand and accept the liability terms described above.
                    <span className="text-red-500 ml-1">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cutThroughAuth}
                    onChange={e => setCutThroughAuth(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">
                    I authorize the concrete cutting operations to proceed, including potential cut-throughs.
                    <span className="text-red-500 ml-1">*</span>
                  </span>
                </label>
              </div>
            </div>
          </>
        )}

        {/* ── COMPLETION FORM ─── */}
        {isCompletion && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardCheck className="w-5 h-5 text-emerald-500" />
              <h2 className="text-lg font-bold text-slate-900">Work Completion Acknowledgment</h2>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-emerald-800 leading-relaxed">
                This is where the work completion agreement will go. [Editable via Form Builder]
              </p>
              <p className="text-xs text-emerald-600 mt-2">
                Please confirm that the work has been completed to your satisfaction.
              </p>
            </div>

            {data?.job?.description && (
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <p className="text-xs text-slate-500 font-medium mb-1">Scope of Work</p>
                <p className="text-sm text-slate-700">{data.job.description}</p>
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={workConfirmed}
                onChange={e => setWorkConfirmed(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-700">
                I confirm the work described above has been completed satisfactorily.
                <span className="text-red-500 ml-1">*</span>
              </span>
            </label>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Exceptions / Notes (optional)</label>
              <textarea
                value={exceptionNotes}
                onChange={e => setExceptionNotes(e.target.value)}
                placeholder="Any exceptions, issues, or additional notes..."
                rows={3}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-slate-900 resize-none"
              />
            </div>
          </div>
        )}

        {/* ── CUSTOM FORM ─── */}
        {isCustom && data?.form_template && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-purple-500" />
              <h2 className="text-lg font-bold text-slate-900">{data.form_template.name}</h2>
            </div>
            {data.form_template.description && (
              <p className="text-sm text-slate-500 mb-4">{data.form_template.description}</p>
            )}
            <div className="space-y-4">
              {data.form_template.fields
                .filter(f => f.type !== 'signature')
                .map(field => renderDynamicField(field))}
            </div>
          </div>
        )}

        {/* ── SIGNATURE SECTION (always shown) ─── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-bold text-slate-900">Your Signature</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title (optional)</label>
              <input
                type="text"
                value={signerTitle}
                onChange={e => setSignerTitle(e.target.value)}
                placeholder="e.g. Site Manager"
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">
                Signature <span className="text-red-500">*</span>
              </label>
              {signatureData && (
                <button onClick={clearSignature} className="text-xs text-red-500 hover:text-red-700">
                  Clear
                </button>
              )}
            </div>
            <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-slate-50">
              <canvas
                ref={canvasRef}
                width={640}
                height={200}
                className="w-full touch-none cursor-crosshair"
                style={{ height: '140px' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1 text-center">
              {signatureData ? 'Signature captured' : 'Sign above using your finger or mouse'}
            </p>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSignAndContinue}
          disabled={!canSubmit() || submitting}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl py-4 font-bold text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <PenTool className="w-5 h-5" />
          )}
          {submitting ? 'Submitting...' : 'Sign & Submit'}
        </button>

        <p className="text-center text-xs text-slate-400 pb-8">
          Powered by Pontifex Industries
        </p>
      </div>
    </div>
  );
}
