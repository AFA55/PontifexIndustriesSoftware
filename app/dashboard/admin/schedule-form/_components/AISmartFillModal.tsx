'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, X, Mic, MicOff, Send, Loader2, CheckCircle2,
  AlertTriangle, Brain, Zap, MessageSquare, ChevronRight,
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

export default function AISmartFillModal({ onApply, onClose }: AISmartFillModalProps) {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedFields, setParsedFields] = useState<ParsedField[]>([]);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Start speech recognition
  const startListening = useCallback(() => {
    if (!speechSupported) return;

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
      console.error('Speech recognition error:', event.error);
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
        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">AI Smart Fill</h2>
              <p className="text-violet-200 text-sm">Speak or type a job description — AI fills the form</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-all">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Input Section */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder='Try: "Schedule a wall saw job for Turner Construction at 450 Main Street next Tuesday, 50 linear feet at 6 inches deep, estimated $3500, water available, outside job, moderate difficulty, contact Mike Johnson 555-1234"'
              className="w-full h-32 px-4 py-3 text-gray-900 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent text-sm placeholder:text-gray-400"
            />

            {/* Voice + Send buttons */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {speechSupported && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`p-2.5 rounded-xl transition-all shadow-sm ${
                    isListening
                      ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={handleParse}
                disabled={!text.trim() || isProcessing}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-1.5 shadow-sm ${
                  text.trim() && !isProcessing
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white'
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
                  className="text-xs px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-lg transition-all border border-purple-100"
                >
                  {example.slice(0, 40)}...
                </button>
              ))}
            </div>
          )}

          {isListening && (
            <div className="mt-3 flex items-center gap-2 text-red-500">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium">Listening... speak your job description</span>
            </div>
          )}
        </div>

        {/* Results Section */}
        {error && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-100">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">{error}</span>
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
                      ? 'bg-purple-50 border-purple-200'
                      : 'bg-gray-50 border-gray-200 opacity-60'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    selectedFields.has(field.key)
                      ? 'bg-purple-600 border-purple-600'
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
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md flex items-center gap-2"
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
