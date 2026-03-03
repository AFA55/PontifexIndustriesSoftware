'use client';

import { useState, useCallback } from 'react';

export interface NotificationState {
  type: 'success' | 'error' | 'info';
  message: string;
}

/**
 * Hook for managing toast notifications.
 * Pairs with <Notification /> from components/Notification.tsx.
 *
 * Usage:
 *   const { notification, notify, clearNotification } = useNotification();
 *   notify('error', 'Something went wrong');
 *   // In JSX:
 *   {notification && <Notification type={notification.type} message={notification.message} onClose={clearNotification} />}
 */
export function useNotification() {
  const [notification, setNotification] = useState<NotificationState | null>(null);

  const notify = useCallback((type: NotificationState['type'], message: string) => {
    setNotification({ type, message });
  }, []);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return { notification, notify, clearNotification };
}
