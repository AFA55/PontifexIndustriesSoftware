'use client';

import { useState, useCallback } from 'react';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { Mic, MicOff, Square, Loader2, Trash2, Plus, Volume2 } from 'lucide-react';

interface VoiceMemoNotesProps {
  onNotesChange: (notes: string) => void;
  notes: string;
  placeholder?: string;
}

export default function VoiceMemoNotes({ onNotesChange, notes, placeholder }: VoiceMemoNotesProps) {
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
      <textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder={placeholder || 'Type notes or use the mic button to dictate...'}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all text-base text-gray-900 placeholder:text-gray-400 min-h-[100px] resize-y"
        rows={4}
      />

      {/* Voice input controls */}
      <div className="flex items-center gap-3">
        {isSupported ? (
          <>
            {!isListening ? (
              <button
                type="button"
                onClick={start}
                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg"
              >
                <Mic className="w-5 h-5" />
                Voice Memo
              </button>
            ) : (
              <button
                type="button"
                onClick={stop}
                className="flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg animate-pulse"
              >
                <Square className="w-4 h-4" />
                Stop Recording
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400 italic">Voice input not supported in this browser</p>
        )}

        {notes && (
          <button
            type="button"
            onClick={() => onNotesChange('')}
            className="flex items-center gap-1.5 px-3 py-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors text-sm"
          >
            <Trash2 className="w-4 h-4" /> Clear
          </button>
        )}
      </div>

      {/* Listening indicator with live transcript */}
      {isListening && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 animate-in fade-in duration-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
            <span className="text-sm font-bold text-blue-700">Listening... speak now</span>
          </div>
          {interimTranscript && (
            <p className="text-sm text-blue-600 italic">&ldquo;{interimTranscript}&rdquo;</p>
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
