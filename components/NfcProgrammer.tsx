'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Smartphone, Wifi, CheckCircle, AlertTriangle, Loader2, Keyboard } from 'lucide-react';

interface NfcProgrammerProps {
  onTagRead: (tagUid: string, existingData?: string) => void;
  onTagWritten: (pontifexId: string) => void;
  onError: (error: string) => void;
  pontifexIdToWrite?: string; // if set, will write this to tag after reading
}

type ScanState = 'idle' | 'scanning' | 'writing' | 'success' | 'error';

export default function NfcProgrammer({
  onTagRead,
  onTagWritten,
  onError,
  pontifexIdToWrite,
}: NfcProgrammerProps) {
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [manualUid, setManualUid] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setNfcSupported(typeof window !== 'undefined' && 'NDEFReader' in window);
  }, []);

  const stopScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setScanState('idle');
    setStatusMessage('');
  }, []);

  const startScan = useCallback(async () => {
    if (!('NDEFReader' in window)) {
      onError('Web NFC is not supported on this device.');
      return;
    }

    try {
      setScanState('scanning');
      setStatusMessage('Hold your NFC tag near the device...');

      const ndef = new (window as unknown as { NDEFReader: new () => {
        scan: (opts: { signal: AbortSignal }) => Promise<void>;
        addEventListener: (event: string, handler: (evt: { serialNumber: string; message?: { records?: Array<{ recordType: string; encoding?: string; data: BufferSource }> } }) => void) => void;
        write: (data: { records: Array<{ recordType: string; data: string }> }, opts?: { signal: AbortSignal }) => Promise<void>;
      } }).NDEFReader();
      abortControllerRef.current = new AbortController();

      await ndef.scan({ signal: abortControllerRef.current.signal });

      ndef.addEventListener('reading', async ({ serialNumber, message }) => {
        // Read existing NDEF text records
        let existingData: string | undefined;
        if (message?.records) {
          for (const record of message.records) {
            if (record.recordType === 'text') {
              const decoder = new TextDecoder((record.encoding as string) || 'utf-8');
              const text = decoder.decode(record.data);
              if (text) {
                existingData = text;
                break;
              }
            }
          }
        }

        const tagUid = serialNumber;
        onTagRead(tagUid, existingData);

        // If we have data to write, do it now
        if (pontifexIdToWrite) {
          try {
            setScanState('writing');
            setStatusMessage(`Writing ${pontifexIdToWrite} to tag...`);

            await ndef.write(
              {
                records: [{ recordType: 'text', data: pontifexIdToWrite }],
              },
              { signal: abortControllerRef.current!.signal }
            );

            setScanState('success');
            setStatusMessage(`Successfully wrote ${pontifexIdToWrite} to tag!`);
            onTagWritten(pontifexIdToWrite);
          } catch (writeErr) {
            setScanState('error');
            const msg = writeErr instanceof Error ? writeErr.message : 'Failed to write to NFC tag';
            setStatusMessage(msg);
            onError(msg);
          }
        } else {
          setScanState('success');
          setStatusMessage(`Tag read successfully! UID: ${tagUid}`);
        }

        // Stop scanning after successful read
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
      });
    } catch (err) {
      setScanState('error');
      const msg = err instanceof Error ? err.message : 'Failed to start NFC scan';
      setStatusMessage(msg);
      onError(msg);
    }
  }, [pontifexIdToWrite, onTagRead, onTagWritten, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualUid.trim()) {
      onTagRead(manualUid.trim());
      setScanState('success');
      setStatusMessage(`Manual UID entered: ${manualUid.trim()}`);
    }
  };

  // ── No Web NFC: manual input fallback ──
  if (nfcSupported === false) {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-700 mb-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-bold">Web NFC Not Available</span>
          </div>
          <p className="text-xs text-amber-600">
            Web NFC requires Chrome on Android over HTTPS. Enter the tag UID manually below, or use an Android device to scan.
          </p>
        </div>
        <form onSubmit={handleManualSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">
              <Keyboard className="w-3.5 h-3.5 inline mr-1" />
              Manual Tag UID
            </label>
            <input
              type="text"
              value={manualUid}
              onChange={(e) => setManualUid(e.target.value)}
              placeholder="Enter or paste the NFC tag UID"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold text-sm hover:from-emerald-600 hover:to-teal-700 transition-all"
          >
            Use This UID
          </button>
        </form>
      </div>
    );
  }

  // ── Loading state while checking NFC support ──
  if (nfcSupported === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  // ── NFC supported: scan UI ──
  return (
    <div className="space-y-4">
      {/* Scan button / status area */}
      <div className="flex flex-col items-center gap-4 py-4">
        {scanState === 'idle' && (
          <button
            onClick={startScan}
            className="relative w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-xl hover:shadow-2xl transition-all hover:scale-105 active:scale-95"
          >
            <Smartphone className="w-10 h-10" />
          </button>
        )}

        {scanState === 'scanning' && (
          <button
            onClick={stopScan}
            className="relative w-28 h-28 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-xl"
          >
            {/* Pulse animation */}
            <span className="absolute inset-0 rounded-full animate-ping bg-emerald-400 opacity-30" />
            <span className="absolute inset-2 rounded-full animate-pulse bg-emerald-400 opacity-20" />
            <Wifi className="w-10 h-10 relative z-10 animate-pulse" />
          </button>
        )}

        {scanState === 'writing' && (
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-xl">
            <Loader2 className="w-10 h-10 animate-spin" />
          </div>
        )}

        {scanState === 'success' && (
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white flex items-center justify-center shadow-xl">
            <CheckCircle className="w-10 h-10" />
          </div>
        )}

        {scanState === 'error' && (
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-red-500 to-rose-600 text-white flex items-center justify-center shadow-xl">
            <AlertTriangle className="w-10 h-10" />
          </div>
        )}

        {/* Status text */}
        <div className="text-center">
          {scanState === 'idle' && (
            <p className="text-sm text-gray-500">Tap the button to start scanning</p>
          )}
          {statusMessage && (
            <p className={`text-sm font-semibold ${
              scanState === 'success' ? 'text-green-700' :
              scanState === 'error' ? 'text-red-700' :
              scanState === 'writing' ? 'text-blue-700' :
              'text-emerald-700'
            }`}>
              {statusMessage}
            </p>
          )}
        </div>

        {/* Reset button for error/success states */}
        {(scanState === 'error' || scanState === 'success') && (
          <button
            onClick={() => { setScanState('idle'); setStatusMessage(''); }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-all"
          >
            Scan Another Tag
          </button>
        )}
      </div>

      {/* Manual fallback link */}
      {scanState === 'idle' && (
        <div className="text-center">
          <button
            onClick={() => setNfcSupported(false)}
            className="text-xs text-gray-400 hover:text-gray-600 underline transition-colors"
          >
            Enter UID manually instead
          </button>
        </div>
      )}

      {/* Write mode info */}
      {pontifexIdToWrite && scanState === 'idle' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <p className="text-xs text-blue-700">
            <strong>Write mode:</strong> After scanning, the ID <span className="font-mono">{pontifexIdToWrite}</span> will be written to the tag.
            Writing only works in Chrome on Android over HTTPS.
          </p>
        </div>
      )}
    </div>
  );
}
