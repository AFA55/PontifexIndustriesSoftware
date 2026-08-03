'use client';

import { useState, useCallback } from 'react';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { Mic, MicOff, Square, Loader2, Trash2, Plus, Volume2 } from 'lucide-react';

interface VoiceMemoNotesProps {
  onNotesChange: (notes: string) => void;
  notes: string;
  placeholder?: string;
  /** Shorter box + smaller mic button — for the per-work-item quick note,
   *  which sits inside an already-tall modal. */
  compact?: boolean;
}

export default function VoiceMemoNotes({ onNotesChange, notes, placeholder, compact = false }: VoiceMemoNotesProps) {
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const handleVoiceResult = useCallback((transcript: string) => {
    // Append voice transcript to existing notes
    const updated = notes
      ? `${notes}\n${transcript}`
      : transcript;
    onNotesChange(updated);
    setVoiceError(null);
  }, [notes, onNotesChange]);

  const handleVoiceError = useCallback((error: string) => {
    setVoiceError(error);
  }, []);

  const {
    isListening,
    isSupported,
    start,
    stop,
    interimTranscript,
  } = useVoiceInput({
    onResult: handleVoiceResult,
    onError: handleVoiceError,
    continuous: true,
    accumulateResults: true,
    silenceTimeout: 4000,
    language: 'en-US',
  });

  return (
    <div className="space-y-3">
      {/* Text area for notes */}
      {/* text-base (16px) is load-bearing on iOS — anything smaller makes
          Safari zoom the whole page on focus. */}
      <textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder={placeholder || 'Type notes or use the mic button to dictate...'}
        className={`w-full px-4 py-3 border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-brand focus:ring-2 focus:ring-brand/30 dark:focus:ring-brand/20 focus:outline-none transition-all text-base bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 resize-y ${
          compact ? 'min-h-[84px]' : 'min-h-[100px]'
        }`}
        rows={compact ? 3 : 4}
      />

      {/* Voice input controls */}
      <div className="flex items-center gap-3">
        {isSupported ? (
          <>
            {!isListening ? (
              <button
                type="button"
                onClick={start}
                className={`flex items-center gap-2 min-h-[44px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg ${
                  compact ? 'px-4 py-2.5' : 'px-5 py-3'
                }`}
              >
                <Mic className="w-5 h-5" />
                {compact ? 'Dictate' : 'Voice Memo'}
              </button>
            ) : (
              <button
                type="button"
                onClick={stop}
                className={`flex items-center gap-2 min-h-[44px] bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg animate-pulse ${
                  compact ? 'px-4 py-2.5' : 'px-5 py-3'
                }`}
              >
                <Square className="w-4 h-4" />
                Stop Recording
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400 dark:text-white/35 italic">Voice input not supported — use your keyboard&apos;s mic key</p>
        )}

        {notes && (
          <button
            type="button"
            onClick={() => onNotesChange('')}
            className="flex items-center gap-1.5 min-h-[44px] px-3 py-3 text-gray-400 dark:text-white/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors text-sm"
          >
            <Trash2 className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {/* Listening indicator with live transcript */}
      {isListening && (
        <div className="bg-blue-50 dark:bg-blue-500/10 border-2 border-blue-200 dark:border-blue-500/30 rounded-xl p-4 animate-in fade-in duration-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">Listening... speak now</span>
          </div>
          {interimTranscript && (
            <p className="text-sm text-blue-600 dark:text-blue-400 italic">&ldquo;{interimTranscript}&rdquo;</p>
          )}
        </div>
      )}

      {/* Error display */}
      {voiceError && !isListening && (
        <p className="text-sm text-red-500 font-medium">{voiceError}</p>
      )}
    </div>
  );
}
