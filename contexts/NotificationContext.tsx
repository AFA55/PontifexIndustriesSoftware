'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  CheckCircle, XCircle, AlertTriangle, Info, X, WifiOff,
  RefreshCw, ShieldAlert, ServerCrash, Wifi
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────
export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'offline' | 'reconnected';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = persistent
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
  timestamp: number;
}

interface NotificationContextType {
  notifications: AppNotification[];
  notify: (notification: Omit<AppNotification, 'id' | 'timestamp'>) => string;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  notify: () => '',
  success: () => '',
  error: () => '',
  warning: () => '',
  info: () => '',
  dismiss: () => {},
  dismissAll: () => {},
});

// ─── Provider ────────────────────────────────────────────────────
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
    setNotifications([]);
  }, []);

  const notify = useCallback((opts: Omit<AppNotification, 'id' | 'timestamp'>): string => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const notification: AppNotification = {
      ...opts,
      id,
      timestamp: Date.now(),
      dismissible: opts.dismissible !== false,
      duration: opts.duration ?? (opts.type === 'error' ? 8000 : opts.type === 'warning' ? 6000 : 4000),
    };

    setNotifications(prev => {
      // Cap at 5 visible notifications
      const updated = [...prev, notification];
      if (updated.length > 5) {
        const removed = updated.shift();
        if (removed) {
          const timer = timersRef.current.get(removed.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(removed.id);
          }
        }
      }
      return updated;
    });

    // Auto-dismiss after duration
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(() => dismiss(id), notification.duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [dismiss]);

  const success = useCallback((title: string, message?: string) => {
    return notify({ type: 'success', title, message });
  }, [notify]);

  const error = useCallback((title: string, message?: string) => {
    return notify({ type: 'error', title, message, duration: 8000 });
  }, [notify]);

  const warning = useCallback((title: string, message?: string) => {
    return notify({ type: 'warning', title, message, duration: 6000 });
  }, [notify]);

  const info = useCallback((title: string, message?: string) => {
    return notify({ type: 'info', title, message });
  }, [notify]);

  return (
    <NotificationContext.Provider value={{ notifications, notify, success, error, warning, info, dismiss, dismissAll }}>
      {children}
      <NotificationContainer notifications={notifications} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}

// ─── Notification Container (renders the toast stack) ────────────
function NotificationContainer({
  notifications,
  onDismiss
}: {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}) {
  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-[420px] w-full pointer-events-none"
      role="alert"
      aria-live="polite"
    >
      {notifications.map((notif) => (
        <NotificationToast key={notif.id} notification={notif} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// ─── Individual Toast ────────────────────────────────────────────
function NotificationToast({
  notification,
  onDismiss
}: {
  notification: AppNotification;
  onDismiss: (id: string) => void;
}) {
  const config: Record<NotificationType, {
    icon: React.ReactNode;
    bg: string;
    border: string;
    iconColor: string;
    progressColor: string;
  }> = {
    success: {
      icon: <CheckCircle className="w-5 h-5" />,
      bg: 'bg-white dark:bg-gray-800',
      border: 'border-l-4 border-l-green-500',
      iconColor: 'text-green-500',
      progressColor: 'bg-green-500',
    },
    error: {
      icon: <XCircle className="w-5 h-5" />,
      bg: 'bg-white dark:bg-gray-800',
      border: 'border-l-4 border-l-red-500',
      iconColor: 'text-red-500',
      progressColor: 'bg-red-500',
    },
    warning: {
      icon: <AlertTriangle className="w-5 h-5" />,
      bg: 'bg-white dark:bg-gray-800',
      border: 'border-l-4 border-l-amber-500',
      iconColor: 'text-amber-500',
      progressColor: 'bg-amber-500',
    },
    info: {
      icon: <Info className="w-5 h-5" />,
      bg: 'bg-white dark:bg-gray-800',
      border: 'border-l-4 border-l-blue-500',
      iconColor: 'text-blue-500',
      progressColor: 'bg-blue-500',
    },
    offline: {
      icon: <WifiOff className="w-5 h-5" />,
      bg: 'bg-gray-900',
      border: 'border-l-4 border-l-gray-500',
      iconColor: 'text-gray-300',
      progressColor: 'bg-gray-500',
    },
    reconnected: {
      icon: <Wifi className="w-5 h-5" />,
      bg: 'bg-white dark:bg-gray-800',
      border: 'border-l-4 border-l-green-500',
      iconColor: 'text-green-500',
      progressColor: 'bg-green-500',
    },
  };

  const c = config[notification.type];
  const duration = notification.duration || 0;

  return (
    <div
      className={`
        pointer-events-auto ${c.bg} ${c.border} rounded-lg shadow-2xl
        overflow-hidden transform transition-all duration-300
        animate-in slide-in-from-right-5 fade-in
      `}
    >
      <div className="flex items-start gap-3 p-4">
        <div className={`flex-shrink-0 mt-0.5 ${c.iconColor}`}>
          {c.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${notification.type === 'offline' ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
            {notification.title}
          </p>
          {notification.message && (
            <p className={`text-xs mt-1 leading-relaxed ${notification.type === 'offline' ? 'text-gray-300' : 'text-gray-500 dark:text-gray-400'}`}>
              {notification.message}
            </p>
          )}
          {notification.action && (
            <button
              onClick={notification.action.onClick}
              className="mt-2 text-xs font-semibold text-violet-600 hover:text-violet-700 dark:text-violet-400 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              {notification.action.label}
            </button>
          )}
        </div>
        {notification.dismissible !== false && (
          <button
            onClick={() => onDismiss(notification.id)}
            className={`flex-shrink-0 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
              notification.type === 'offline' ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-400'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {/* Progress bar for auto-dismissing notifications */}
      {duration > 0 && (
        <div className="h-0.5 w-full bg-gray-100 dark:bg-gray-700">
          <div
            className={`h-full ${c.progressColor} transition-none`}
            style={{
              animation: `shrink-width ${duration}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  );
}
