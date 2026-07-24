'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, X, Mic, MicOff, Send, Loader2, CheckCircle2,
  AlertTriangle, Brain, Zap, MessageSquare, ChevronRight, Camera,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ParsedField {
  key: string;
  label: string;
  value: unknown;
  confidence: number;
}

interface AISmartFillModalProps {
  onApply: (fields: Record<string, unknown>) => void;
  onClose: () => void;
}

// Downscale a phone photo to a reasonable size before upload (a raw shot is
// several MB; base64 inflates it further). Long edge ≤ 1800px, JPEG q≈0.82.
async function downscaleToDataUrl(file: File, maxEdge = 1800, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error('Could not read the image'));
    fr.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('load'));
      i.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl; // fall back to the original if canvas processing fails
  }
}

export default function AISmartFillModal({ onApply, onClose }: AISmartFillModalProps) {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedFields, setParsedFields] = useState<ParsedField[]>([]);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [micPermission, setMicPermission] = useState<'unknown' | 'denied' | 'granted'>('unknown');
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Check for speech recognition support
  const speechSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Field label mapping
  const fieldLabels: Record<string, string> = {
    service_types: 'Service Types',
    contractor_name: 'Customer/Contractor',
    site_address: 'Job Address',
    site_contact: 'Site Contact',
    contact_phone: 'Contact Phone',
    start_date: 'Start Date',
    estimated_cost: 'Estimated Cost',
    difficulty_rating: 'Difficulty Rating',
    description: 'Job Description',
    scope_details: 'Scope Details',
    po_number: 'PO Number',
    water_available: 'Water Available',
    electricity_available: 'Electricity Available',
    inside_outside: 'Inside/Outside',
    overcutting_allowed: 'Overcutting Allowed',
    high_work: 'High Work',
    scaffolding_provided: 'Scaffolding',
    clean_up_required: 'Clean Up Required',
    orientation_required: 'Orientation Required',
    badging_required: 'Badging Required',
    permit_required: 'Permit Required',
    cord_480: '480 Cord Required',
    plastic_needed: 'Plastic/Poly Needed',
  };

  // Request mic permission then start speech recognition
  const startListening = useCallback(async () => {
    if (!speechSupported) return;

    // Request microphone permission explicitly first
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');
    } catch {
      setMicPermission('denied');
      setError('Microphone access was denied. Please allow microphone access in your browser settings, then try again.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = text;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? ' ' : '') + transcript;
        } else {
          interim = transcript;
        }
      }
      setText(finalTranscript + (interim ? ' ' + interim : ''));
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setMicPermission('denied');
        setError('Microphone access was denied. Please click the lock icon in your browser address bar and allow microphone access.');
      } else if (event.error === 'no-speech') {
        // Silently stop — user just didn't say anything
      } else {
        setError(`Voice input error: ${event.error}. Try typing your job details instead.`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [speechSupported, text]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Parse text with AI
  const handleParse = useCallback(async () => {
    if (!text.trim()) return;
    setIsProcessing(true);
    setError('');
    setParsedFields([]);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      const res = await fetch('/api/admin/schedule-form/ai-parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ text: text.trim() }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to parse');
        return;
      }

      const { fields, confidence, summary: resultSummary } = json.data;
      setSummary(resultSummary);

      // Convert to display format
      const parsed: ParsedField[] = [];
      const selected = new Set<string>();

      for (const [key, value] of Object.entries(fields)) {
        parsed.push({
          key,
          label: fieldLabels[key] || key.replace(/_/g, ' '),
          value,
          confidence: confidence[key] || 0,
        });
        selected.add(key); // Select all by default
      }

      setParsedFields(parsed);
      setSelectedFields(selected);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  }, [text]);

  // Scan a photographed paper ticket → extract fields (vision) → same review UI.
  const handleImage = useCallback(async (file: File) => {
    setError('');
    setParsedFields([]);
    setIsProcessing(true);
    try {
      const image = await downscaleToDataUrl(file);
      setImagePreview(image);
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');
      const res = await fetch('/api/admin/schedule-form/ai-parse-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
        body: JSON.stringify({ image }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to read the ticket'); return; }

      const { fields, confidence, summary: resultSummary } = json.data;
      setSummary(resultSummary);
      const parsed: ParsedField[] = [];
      const selected = new Set<string>();
      for (const [key, value] of Object.entries(fields)) {
        parsed.push({ key, label: fieldLabels[key] || key.replace(/_/g, ' '), value, confidence: (confidence as Record<string, number>)[key] || 0 });
        selected.add(key);
      }
      setParsedFields(parsed);
      setSelectedFields(selected);
    } catch (err: any) {
      setError(err.message || 'Could not scan the photo');
    } finally {
      setIsProcessing(false);
    }
    // fieldLabels is a stable literal in component scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply selected fields
  const handleApply = useCallback(() => {
    const fieldsToApply: Record<string, unknown> = {};
    for (const field of parsedFields) {
      if (selectedFields.has(field.key)) {
        fieldsToApply[field.key] = field.value;
      }
    }
    onApply(fieldsToApply);
    onClose();
  }, [parsedFields, selectedFields, onApply, onClose]);

  // Toggle field selection
  const toggleField = (key: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Format display value
  const formatValue = (value: unknown): string => {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object' && value !== null) return JSON.stringify(value).slice(0, 60) + '...';
    return String(value);
  };

  // Confidence color
  const confidenceColor = (c: number) => {
    if (c >= 0.85) return 'text-green-600';
    if (c >= 0.7) return 'text-yellow-600';
    return 'text-orange-600';
  };

  const confidenceBg = (c: number) => {
    if (c >= 0.85) return 'bg-green-100 border-green-200';
    if (c >= 0.7) return 'bg-yellow-100 border-yellow-200';
    return 'bg-orange-100 border-orange-200';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-brand via-brand to-brand-accent px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">AI Smart Fill</h2>
              <p className="text-white/80 text-sm">Scan a ticket, speak, or type — AI fills the form</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-all">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Input Section */}
        <div className="px-6 py-4 border-b border-gray-100">
          {/* Scan a paper ticket (photo → AI reads the fields) */}
          <input
            ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImage(f); e.target.value = ''; }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border-2 border-dashed border-brand/40 bg-brand/5 text-brand font-bold text-sm hover:bg-brand/10 transition-all disabled:opacity-50 min-h-[48px]"
          >
            <Camera className="w-4 h-4" /> Scan a paper ticket (take a photo)
          </button>
          {imagePreview && (
            <div className="mb-3 flex items-center gap-3 p-2 rounded-xl bg-gray-50 border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="Scanned ticket" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
              <span className="text-xs text-gray-500 flex-1">Ticket photo attached — review &amp; edit the fields below, then Apply.</span>
              <button onClick={() => setImagePreview(null)} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Remove photo"><X className="w-4 h-4" /></button>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mb-2 text-center">or type / dictate the job below</p>
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder='Try: "Schedule a wall saw job for Turner Construction at 450 Main Street next Tuesday, 50 linear feet at 6 inches deep, estimated $3500, water available, outside job, moderate difficulty, contact Mike Johnson 555-1234"'
              className="w-full h-32 px-4 py-3 text-gray-900 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent text-sm placeholder:text-gray-400"
            />

            {/* Voice + Send buttons */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {speechSupported && (
                <button
                  onClick={micPermission === 'denied' ? undefined : (isListening ? stopListening : startListening)}
                  title={
                    micPermission === 'denied'
                      ? 'Microphone access denied — click the lock icon in your address bar to allow it'
                      : isListening
                      ? 'Stop listening'
                      : 'Click to speak your job description'
                  }
                  className={`p-2.5 rounded-xl transition-all shadow-sm ${
                    micPermission === 'denied'
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : isListening
                      ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                  }`}
                >
                  {micPermission === 'denied'
                    ? <MicOff className="w-4 h-4" />
                    : isListening
                    ? <MicOff className="w-4 h-4" />
                    : <Mic className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={handleParse}
                disabled={!text.trim() || isProcessing}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-1.5 shadow-sm ${
                  text.trim() && !isProcessing
                    ? 'bg-gradient-to-r from-brand to-brand-accent hover:from-brand-dark hover:to-brand text-white'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Parsing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Parse
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick examples */}
          {!parsedFields.length && !isProcessing && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-gray-400 font-medium">Try:</span>
              {[
                'Core drill 4 holes at 6 inches for ABC Construction next Monday',
                'Wall saw 30 linear feet 8 inches deep at 100 Oak Street',
                'GPR scan job at downtown parking garage, difficulty 8',
              ].map((example, i) => (
                <button
                  key={i}
                  onClick={() => { setText(example); textareaRef.current?.focus(); }}
                  className="text-xs px-2.5 py-1.5 bg-brand/10 hover:bg-brand/20 text-brand rounded-lg transition-all border border-brand/20"
                >
                  {example.slice(0, 40)}...
                </button>
              ))}
            </div>
          )}

          {isListening ? (
            <div className="mt-3 flex items-center gap-2 text-red-500">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">Listening... speak your job description</span>
              <span className="text-xs text-gray-400 ml-1">(tap mic to stop)</span>
            </div>
          ) : micPermission === 'unknown' && speechSupported && !text && (
            <div className="mt-2 flex items-center gap-1.5 text-gray-400">
              <Mic className="w-3.5 h-3.5" />
              <span className="text-xs">Tap the mic button to dictate your job description</span>
            </div>
          )}
        </div>

        {/* Results Section */}
        {error && (
          <div className={`px-6 py-3 border-b ${micPermission === 'denied' ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${micPermission === 'denied' ? 'text-amber-500' : 'text-red-500'}`} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${micPermission === 'denied' ? 'text-amber-800' : 'text-red-700'}`}>
                  {micPermission === 'denied' ? 'Microphone Access Required' : 'Voice Input Error'}
                </p>
                <p className={`text-xs mt-0.5 ${micPermission === 'denied' ? 'text-amber-700' : 'text-red-600'}`}>{error}</p>
                {micPermission === 'denied' && (
                  <div className="mt-2 text-xs text-amber-700 space-y-0.5">
                    <p className="font-semibold">How to enable:</p>
                    <p>🔒 Click the <strong>lock icon</strong> in your browser address bar</p>
                    <p>🎙️ Set <strong>Microphone</strong> to <strong>Allow</strong></p>
                    <p>🔄 Refresh the page and try again</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => { setError(''); if (micPermission === 'denied') setMicPermission('unknown'); }}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {parsedFields.length > 0 && (
          <>
            {/* Summary */}
            <div className="px-6 py-3 bg-green-50 border-b border-green-100">
              <div className="flex items-center gap-2 text-green-700">
                <Zap className="w-4 h-4" />
                <span className="text-sm font-medium">{summary}</span>
              </div>
            </div>

            {/* Parsed fields */}
            <div className="px-6 py-4 overflow-y-auto max-h-[35vh] space-y-2">
              {parsedFields
                .filter(f => f.key !== 'description') // Don't show raw description
                .map((field) => (
                <button
                  key={field.key}
                  onClick={() => toggleField(field.key)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                    selectedFields.has(field.key)
                      ? 'bg-brand/10 border-brand/30'
                      : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    selectedFields.has(field.key)
                      ? 'bg-brand border-brand'
                      : 'border-gray-300'
                  }`}>
                    {selectedFields.has(field.key) && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700">{field.label}</span>
                      <span className={`text-xs font-medium ${confidenceColor(field.confidence)}`}>
                        {Math.round(field.confidence * 100)}%
                      </span>
                    </div>
                    <div className="text-sm text-gray-900 font-medium truncate mt-0.5">
                      {formatValue(field.value)}
                    </div>
                  </div>

                  <div className={`px-2 py-1 rounded-md text-xs font-bold border ${confidenceBg(field.confidence)}`}>
                    {field.confidence >= 0.85 ? 'High' : field.confidence >= 0.7 ? 'Med' : 'Low'}
                  </div>
                </button>
              ))}
            </div>

            {/* Apply button */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {selectedFields.size - (selectedFields.has('description') ? 1 : 0)} fields selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 text-gray-600 hover:text-gray-800 font-medium text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={selectedFields.size === 0}
                  className="px-6 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" /> Apply to Form
                </button>
              </div>
            </div>
          </>
        )}

        {/* Empty state */}
        {!parsedFields.length && !isProcessing && !error && (
          <div className="px-6 py-8 text-center">
            <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              Describe the job in natural language — voice or text — and AI will extract the form fields
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
