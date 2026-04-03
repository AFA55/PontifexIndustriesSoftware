'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Global error boundary — catches unhandled errors at the root layout level.
 * Must render <html> + <body> because the root layout is unavailable.
 * Styled in the platform's purple/dark theme.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console so Vercel Function Logs capture it
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div
          style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '1rem',
              padding: '2.5rem',
              maxWidth: '28rem',
              width: '100%',
              textAlign: 'center',
              color: '#fff',
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: '4rem',
                height: '4rem',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <AlertTriangle style={{ width: '2rem', height: '2rem', color: '#ef4444' }} />
            </div>

            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Something went wrong
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              An unexpected error occurred. Our team has been notified. Please try
              refreshing or return to the dashboard.
            </p>

            {/* Error ID for support reference */}
            {error.digest && (
              <p
                style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'monospace',
                  marginBottom: '1.25rem',
                  padding: '0.4rem 0.75rem',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '0.375rem',
                  display: 'inline-block',
                }}
              >
                Error ID: {error.digest}
              </p>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={reset}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw style={{ width: '1rem', height: '1rem' }} />
                Try Again
              </button>

              <a
                href="/dashboard/admin"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                <Home style={{ width: '1rem', height: '1rem' }} />
                Dashboard
              </a>
            </div>

            <p style={{ marginTop: '2rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>
              Pontifex Industries Platform
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
