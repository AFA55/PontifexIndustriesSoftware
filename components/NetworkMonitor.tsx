'use client';

import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/contexts/NotificationContext';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

/**
 * NetworkMonitor — detects offline/online transitions and API failures.
 * Renders a persistent top banner when offline + fires toast notifications.
 * Also monitors for repeated API failures (server issues).
 */
export default function NetworkMonitor() {
  const { notify, dismiss } = useNotifications();
  const [isOffline, setIsOffline] = useState(false);
  const [apiHealthy, setApiHealthy] = useState(true);
  const offlineNotifRef = useRef<string | null>(null);
  const wasOfflineRef = useRef(false);
  const failCountRef = useRef(0);
  const healthCheckRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initial state
    setIsOffline(!navigator.onLine);

    const handleOffline = () => {
      setIsOffline(true);
      wasOfflineRef.current = true;
      // Show persistent offline notification
      const id = notify({
        type: 'offline',
        title: 'You\'re offline',
        message: 'Check your internet connection. Changes will sync when you reconnect.',
        duration: 0, // Persistent
        dismissible: false,
      });
      offlineNotifRef.current = id;
    };

    const handleOnline = () => {
      setIsOffline(false);
      // Dismiss offline notification
      if (offlineNotifRef.current) {
        dismiss(offlineNotifRef.current);
        offlineNotifRef.current = null;
      }
      // Only show reconnected if we were previously offline
      if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        notify({
          type: 'reconnected',
          title: 'Back online',
          message: 'Connection restored. Your data is syncing.',
          duration: 3000,
        });
      }
      failCountRef.current = 0;
      setApiHealthy(true);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Monitor fetch failures globally
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        // Reset fail count on any non-5xx response
        if (response.status < 500) {
          if (failCountRef.current > 0) {
            failCountRef.current = 0;
            if (!apiHealthy) {
              setApiHealthy(true);
              notify({
                type: 'success',
                title: 'Server connection restored',
                message: 'Everything is working normally again.',
                duration: 3000,
              });
            }
          }
        }
        // Track consecutive server errors
        if (response.status >= 500) {
          failCountRef.current++;
          if (failCountRef.current >= 3 && apiHealthy) {
            setApiHealthy(false);
            notify({
              type: 'error',
              title: 'Server issues detected',
              message: 'Some features may be temporarily unavailable. We\'re working on it.',
              duration: 0,
              action: {
                label: 'Retry',
                onClick: () => window.location.reload(),
              },
            });
          }
        }
        return response;
      } catch (err) {
        // Network error (not a server response)
        failCountRef.current++;
        if (failCountRef.current >= 2 && navigator.onLine && apiHealthy) {
          setApiHealthy(false);
          notify({
            type: 'warning',
            title: 'Connection problems',
            message: 'Having trouble reaching the server. Retrying automatically...',
            duration: 6000,
          });
        }
        throw err;
      }
    };

    // Periodic health check every 30s when unhealthy
    healthCheckRef.current = setInterval(async () => {
      if (!apiHealthy && navigator.onLine) {
        try {
          const res = await originalFetch('/api/health', { method: 'GET' });
          if (res.ok) {
            failCountRef.current = 0;
            setApiHealthy(true);
          }
        } catch {
          // Still unhealthy
        }
      }
    }, 30000);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.fetch = originalFetch;
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistent offline banner at top of screen
  if (!isOffline && apiHealthy) return null;

  return (
    <div className={`fixed top-0 left-0 right-0 z-[10000] ${
      isOffline
        ? 'bg-gray-900 text-white'
        : 'bg-amber-500 text-amber-950'
    }`}>
      <div className="flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium">
        {isOffline ? (
          <>
            <WifiOff className="w-4 h-4 animate-pulse-slow" />
            <span>No internet connection</span>
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Experiencing server issues - reconnecting...</span>
          </>
        )}
      </div>
    </div>
  );
}
