'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Smartphone, X, Keyboard } from 'lucide-react';
import { useState } from 'react';

interface NfcClockInButtonProps {
  onScanResult: (tagUid: string) => void;
  onError: (error: string) => void;
  scanning: boolean;
  onStartScan: () => void;
  onStopScan: () => void;
}

export default function NfcClockInButton({
  onScanResult,
  onError,
  scanning,
  onStartScan,
  onStopScan,
}: NfcClockInButtonProps) {
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);
  const [manualUid, setManualUid] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setNfcSupported(typeof window !== 'undefined' && 'NDEFReader' in window);
  }, []);

  const startNfcScan = useCallback(async () => {
    if (!('NDEFReader' in window)) {
      onError('Web NFC is not supported on this device.');
      return;
    }

    try {
      const ndef = new (window as any).NDEFReader();
      abortControllerRef.current = new AbortController();

      await ndef.scan({ signal: abortControllerRef.current.signal });

      ndef.addEventListener('reading', ({ serialNumber, message }: any) => {
        // Prefer NDEF text record if available, otherwise use serialNumber
        let tagUid = serialNumber;
        if (message?.records) {
          for (const record of message.records) {
            if (record.recordType === 'text') {
              const decoder = new TextDecoder(record.encoding || 'utf-8');
              const text = decoder.decode(record.data);
              if (text) {
                tagUid = text;
                break;
              }
            }
          }
        }
        if (tagUid) {
          onScanResult(tagUid);
        } else {
          onError('Could not read NFC tag data.');
        }
      });

      ndef.addEventListener('readingerror', () => {
        onError('Failed to read NFC tag. Please try again.');
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      onError(err.message || 'NFC scan failed. Please try again.');
    }
  }, [onScanResult, onError]);

  // Start/stop scanning
  useEffect(() => {
    if (scanning && nfcSupported) {
      startNfcScan();
    }
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [scanning, nfcSupported, startNfcScan]);

  const handleManualSubmit = () => {
    const trimmed = manualUid.trim();
    if (trimmed) {
      onScanResult(trimmed);
      setManualUid('');
    }
  };

  // NFC not supported — show manual fallback
  if (nfcSupported === false) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 justify-center text-amber-600 text-sm">
          <Smartphone className="w-4 h-4" />
          <span>NFC not available on this device</span>
        </div>
        <div className="flex gap-2 max-w-xs mx-auto">
          <input
            type="text"
            value={manualUid}
            onChange={(e) => setManualUid(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            placeholder="Enter tag ID manually"
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualUid.trim()}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-blue-700 transition-colors flex items-center gap-1.5"
          >
            <Keyboard className="w-4 h-4" />
            Submit
          </button>
        </div>
        <button
          onClick={onStopScan}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Loading state while checking support
  if (nfcSupported === null) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // NFC scanning state
  if (scanning) {
    return (
      <div className="flex flex-col items-center gap-4 py-2">
        {/* Pulse animation rings */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
          <div
            className="absolute inset-1 rounded-full bg-blue-500/10 animate-pulse"
            style={{ animationDelay: '0.5s' }}
          />
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Smartphone className="w-8 h-8 text-white" />
          </div>
        </div>

        <p className="text-sm font-medium text-gray-700">
          Hold NFC badge near device...
        </p>

        <button
          onClick={onStopScan}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    );
  }

  return null;
}
