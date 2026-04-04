'use client';

import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/contexts/NotificationContext';
import { WifiOff, RefreshCw } from 'lucide-react';

/**
 * NetworkMonitor — detects offline/online transitions and API failures.
 * Renders a persistent top banner when offline + fires toast notifications.
 * Also monitors for repeated API failures (server issues).
 */
export default function NetworkMonitor() {
  const { notify, dismiss } = useNotifications();
  const [isOffline, setIsOffline] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);

  // Use refs so the fetch interceptor closure always reads current values
  const offlineNotifRef = useRef<string | null>(null);
  const serverIssuesNotifRef = useRef<string | null>(null);
  const wasOfflineRef = useRef(false);
  const failCountRef = useRef(0);
  const apiHealthyRef = useRef(true);
  const healthCheckRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initial state
    setIsOffline(!navigator.onLine);

    const handleOffline = () => {
      setIsOffline(true);
      setBannerVisible(true);
      wasOfflineRef.current = true;
      if (!offlineNotifRef.current) {
        const id = notify({
          type: 'offline',
          title: 'You\'re offline',
          message: 'Check your internet connection. Changes will sync when you reconnect.',
          duration: 0, // Persistent
          dismissible: false,
        });
        offlineNotifRef.current = id;
      }
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
      if (!apiHealthyRef.current) {
        apiHealthyRef.current = true;
        setBannerVisible(false);
        if (serverIssuesNotifRef.current) {
          dismiss(serverIssuesNotifRef.current);
          serverIssuesNotifRef.current = null;
        }
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Monitor fetch failures globally
    const originalFetch = window.fetch;

    const shouldIgnoreUrl = (input: RequestInfo | URL): boolean => {
      try {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        // Ignore the health check itself (prevent recursive fail counting)
        if (url.includes('/api/health')) return true;
        // Ignore Supabase auth/realtime endpoints — these can fail transiently
        // and are not representative of our own API health
        if (url.includes('supabase.co') && (url.includes('/auth/') || url.includes('/realtime/'))) return true;
        return false;
      } catch {
        return false;
      }
    };

    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);

        if (!shouldIgnoreUrl(args[0])) {
          // Reset fail count on any successful (non-5xx) API response
          if (response.status < 500) {
            if (failCountRef.current > 0) {
              failCountRef.current = Math.max(0, failCountRef.current - 1);
            }
            // If we were in unhealthy state and now getting good responses, recover
            if (!apiHealthyRef.current && failCountRef.current === 0) {
              apiHealthyRef.current = true;
              setBannerVisible(false);
              if (serverIssuesNotifRef.current) {
                dismiss(serverIssuesNotifRef.current);
                serverIssuesNotifRef.current = null;
              }
              notify({
                type: 'success',
                title: 'Server connection restored',
                message: 'Everything is working normally again.',
                duration: 3000,
              });
            }
          }

          // Track consecutive server errors (5xx only)
          if (response.status >= 500) {
            failCountRef.current++;
            // Only fire the server-issues notification once (guard with ref)
            if (failCountRef.current >= 3 && apiHealthyRef.current && !serverIssuesNotifRef.current) {
              apiHealthyRef.current = false;
              setBannerVisible(true);
              const id = notify({
                type: 'error',
                title: 'Server issues detected',
                message: 'Some features may be temporarily unavailable. We\'re working on it.',
                duration: 0,
                action: {
                  label: 'Retry',
                  onClick: () => window.location.reload(),
                },
              });
              serverIssuesNotifRef.current = id;
            }
          }
        }

        return response;
      } catch (err) {
        if (!shouldIgnoreUrl(args[0])) {
          // Network error (not a server response) — only count if we're online
          if (navigator.onLine) {
            failCountRef.current++;
            if (failCountRef.current >= 3 && apiHealthyRef.current && !serverIssuesNotifRef.current) {
              apiHealthyRef.current = false;
              setBannerVisible(true);
              const id = notify({
                type: 'warning',
                title: 'Connection problems',
                message: 'Having trouble reaching the server. Retrying automatically...',
                duration: 0,
                action: {
                  label: 'Retry',
                  onClick: () => window.location.reload(),
                },
              });
              serverIssuesNotifRef.current = id;
            }
          }
        }
        throw err;
      }
    };

    // Periodic health check every 30s when unhealthy
    healthCheckRef.current = setInterval(async () => {
      if (!apiHealthyRef.current && navigator.onLine) {
        try {
          const res = await originalFetch('/api/health', { method: 'GET' });
          if (res.ok) {
            failCountRef.current = 0;
            apiHealthyRef.current = true;
            setBannerVisible(false);
            if (serverIssuesNotifRef.current) {
              dismiss(serverIssuesNotifRef.current);
              serverIssuesNotifRef.current = null;
            }
            notify({
              type: 'success',
              title: 'Server connection restored',
              message: 'Everything is working normally again.',
              duration: 3000,
            });
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

  // Persistent banner at top of screen: offline OR server issues
  if (!isOffline && !bannerVisible) return null;

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
