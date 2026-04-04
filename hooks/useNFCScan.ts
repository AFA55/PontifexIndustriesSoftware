'use client';

/**
 * useNFCScan — Web NFC API hook for physical NFC chip scanning
 *
 * Supports the NDEFReader API available in Chrome on Android (Web NFC).
 * Falls back gracefully on iOS / unsupported browsers.
 *
 * Usage:
 *   const { isSupported, isScanning, startScan, stopScan, lastScan, error } = useNFCScan();
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface NFCScanResult {
  /** Hardware serial number reported by the chip */
  serialNumber: string;
  /** Raw NDEF text record if present (may be a URL, ID, etc.) */
  ndefText: string | null;
  /** The best identifier to use for lookup: ndefText first, then serialNumber */
  tagUid: string;
  timestamp: string;
}

export interface UseNFCScanReturn {
  /** True only on Android Chrome with Web NFC enabled */
  isSupported: boolean;
  isScanning: boolean;
  startScan: () => Promise<void>;
  stopScan: () => void;
  lastScan: NFCScanResult | null;
  error: string | null;
  clearError: () => void;
}

// Extend window type for NDEFReader (not yet in TypeScript lib)
declare global {
  interface Window {
    NDEFReader?: new () => {
      scan: (options?: { signal?: AbortSignal }) => Promise<void>;
      addEventListener: (
        event: 'reading' | 'readingerror',
        listener: (event: any) => void
      ) => void;
      removeEventListener: (
        event: 'reading' | 'readingerror',
        listener: (event: any) => void
      ) => void;
    };
  }
}

export function useNFCScan(): UseNFCScanReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScan, setLastScan] = useState<NFCScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Detect support on mount (client-only)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'NDEFReader' in window) {
      setIsSupported(true);
    }
  }, []);

  const stopScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    if (!isSupported) {
      setError('Web NFC is not supported on this device. Use Android Chrome.');
      return;
    }

    // Stop any previous scan
    stopScan();
    setError(null);

    try {
      const ndef = new window.NDEFReader!();
      abortControllerRef.current = new AbortController();

      await ndef.scan({ signal: abortControllerRef.current.signal });
      setIsScanning(true);

      const onReading = ({ serialNumber, message }: any) => {
        // Try to extract NDEF text record
        let ndefText: string | null = null;
        if (message?.records) {
          for (const record of message.records) {
            if (record.recordType === 'text' && record.data) {
              try {
                const decoder = new TextDecoder(record.encoding || 'utf-8');
                const text = decoder.decode(record.data);
                if (text.trim()) {
                  ndefText = text.trim();
                  break;
                }
              } catch {
                // Non-text encoding, skip
              }
            }
          }
        }

        const result: NFCScanResult = {
          serialNumber: serialNumber || '',
          ndefText,
          tagUid: ndefText || serialNumber || '',
          timestamp: new Date().toISOString(),
        };

        setLastScan(result);
        setIsScanning(false);
        stopScan();
      };

      const onReadingError = () => {
        setError('Failed to read NFC tag. Hold the chip closer and try again.');
        setIsScanning(false);
      };

      ndef.addEventListener('reading', onReading);
      ndef.addEventListener('readingerror', onReadingError);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // Normal abort — do nothing
        setIsScanning(false);
        return;
      }
      if (err?.name === 'NotAllowedError') {
        setError('NFC permission denied. Please allow NFC access in your browser settings.');
      } else if (err?.name === 'NotSupportedError') {
        setError('NFC is disabled on this device. Enable it in Android Settings → Connected Devices.');
      } else {
        setError(err?.message || 'NFC scan failed. Please try again.');
      }
      setIsScanning(false);
    }
  }, [isSupported, stopScan]);

  const clearError = useCallback(() => setError(null), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { isSupported, isScanning, startScan, stopScan, lastScan, error, clearError };
}
