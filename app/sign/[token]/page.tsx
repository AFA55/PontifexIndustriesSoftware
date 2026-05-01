'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2, Loader2, AlertTriangle, PenTool, Shield,
  FileText, MapPin,
  ClipboardCheck,
} from 'lucide-react';
import CustomerSatisfactionSurvey, { type SurveyData } from '@/components/CustomerSatisfactionSurvey';

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

interface WorkItem {
  work_type: string;
  quantity: number;
  notes?: string;
  core_quantity?: number;
  core_size?: string;
  linear_feet_cut?: number;
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
  work_items?: WorkItem[];
  daily_logs?: Array<{ log_date: string; hours_worked: number; work_performed?: string }>;
  job: {
    job_number: string;
    customer_name: string;
    job_type: string;
    address: string;
    description: string;
    customer_contact: string;
    site_contact_phone?: string | null;
    in_route_at?: string;
    arrived_at_jobsite_at?: string;
    work_started_at?: string;
    work_completed_at?: string;
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

  // Survey state — now driven by <CustomerSatisfactionSurvey/> when it submits

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

  const handleSubmit = async (
    options: { skipSurvey?: boolean; surveyPayload?: SurveyData | null } = {}
  ) => {
    const { skipSurvey = false, surveyPayload = null } = options;
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
      if (data?.request_type === 'completion' && !skipSurvey && surveyPayload) {
        payload.survey = {
          cleanliness_rating: surveyPayload.cleanliness_rating || undefined,
          communication_rating: surveyPayload.communication_rating || undefined,
          operator_feedback_notes: surveyPayload.operator_feedback_notes || undefined,
          likely_to_use_again_rating: surveyPayload.likely_to_use_again_rating || undefined,
          customer_email: surveyPayload.send_to_email || undefined,
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
      handleSubmit({ skipSurvey: true });
    }
  };

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
        <div className="container mx-auto px-4 py-8 max-w-md space-y-4">
          <CustomerSatisfactionSurvey
            variant="public"
            contactPhoneOnSite={data?.job?.site_contact_phone || data?.job?.customer_contact || null}
            submitting={submitting}
            onSubmit={async (surveyPayload) => {
              await handleSubmit({ surveyPayload });
            }}
          />

          <button
            onClick={() => handleSubmit({ skipSurvey: true })}
            disabled={submitting}
            className="w-full text-slate-400 text-sm hover:text-slate-600 py-2"
          >
            Skip Survey
          </button>
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
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-6 max-w-md">
          {/* Company branding */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-red-600 flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Patriot Concrete Cutting</h1>
              <p className="text-xs text-slate-400">Licensed &bull; Insured &bull; Professional</p>
            </div>
          </div>

          {/* Document title */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">
                {isCompletion ? 'Work Completion Sign-Off' : isWaiver ? 'Utility Waiver' : 'Document Sign-Off'}
              </span>
            </div>
          </div>

          {/* Job card */}
          {data?.job && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-sm space-y-1.5 border border-white/10">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-white">{data.job.customer_name}</p>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono text-slate-300">
                  {data.job.job_number}
                </span>
              </div>
              <p className="text-slate-400 text-xs capitalize">{data.job.job_type?.replace(/_/g, ' ')}</p>
              {data.job.address && (
                <p className="text-slate-300 text-xs flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {data.job.address}
                </p>
              )}
              <p className="text-slate-400 text-xs">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
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

        {/* ── WORK PERFORMED SUMMARY (completion only) ─── */}
        {isCompletion && ((data?.work_items && data.work_items.length > 0) || (data?.daily_logs && data.daily_logs.length > 0) || data?.job?.arrived_at_jobsite_at || data?.job?.in_route_at) && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-green-600" />
              Work Performed
            </h2>

            {/* Timeline timestamps */}
            {(data?.job?.arrived_at_jobsite_at || data?.job?.in_route_at || data?.job?.work_completed_at) && (
              <div className="flex flex-wrap gap-4 mb-4 p-3 bg-gray-50 rounded-xl">
                {data.job?.in_route_at && (
                  <div>
                    <p className="text-xs text-gray-500">Crew Departed</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {new Date(data.job.in_route_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
                {data.job?.arrived_at_jobsite_at && (
                  <div>
                    <p className="text-xs text-gray-500">Arrived On Site</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {new Date(data.job.arrived_at_jobsite_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
                {data.job?.work_completed_at && (
                  <div>
                    <p className="text-xs text-gray-500">Work Completed</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {new Date(data.job.work_completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Work items list */}
            {data?.work_items && data.work_items.length > 0 ? (
              <div className="space-y-2">
                {data.work_items.map((item: WorkItem, i: number) => (
                  <div key={i} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-sm font-medium text-gray-800">{item.work_type}</span>
                    <span className="text-sm text-gray-500 font-mono text-right ml-3 shrink-0">
                      {item.quantity > 1 ? `×${item.quantity}` : ''}
                      {item.core_quantity ? ` ${item.core_quantity} cores` : ''}
                      {item.linear_feet_cut ? ` ${item.linear_feet_cut} LF` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Work completed as discussed on site.</p>
            )}
          </div>
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
