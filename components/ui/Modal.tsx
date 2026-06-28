'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Modal — overlay + centered panel.
 *
 * - Closes on overlay click + Esc (both can be disabled).
 * - Body-scroll-lock while open.
 * - Mobile: slides up from the bottom, full-width; sm+: centered card.
 * - Sticky header (title + close button) and a scrollable body.
 * - Rendered via portal so it escapes overflow/stacking contexts.
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Optional text under the title. */
  description?: React.ReactNode;
  size?: ModalSize;
  children?: React.ReactNode;
  /** Sticky footer slot (e.g. action buttons). */
  footer?: React.ReactNode;
  /** Hide the X button (default false). */
  hideClose?: boolean;
  /** Disable closing on overlay click. */
  disableOverlayClose?: boolean;
  /** Disable closing on Esc. */
  disableEscClose?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  hideClose = false,
  disableOverlayClose = false,
  disableEscClose = false,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc to close
  useEffect(() => {
    if (!open || disableEscClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, disableEscClose, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onOverlayMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disableOverlayClose) return;
      if (e.target === e.currentTarget) onClose();
    },
    [disableOverlayClose, onClose],
  );

  if (!open || typeof document === 'undefined') return null;

  const hasHeader = title != null || !hideClose;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onMouseDown={onOverlayMouseDown}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={panelRef}
        className={cn(
          'flex w-full max-h-[92vh] flex-col overflow-hidden',
          'rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900',
          'border border-gray-200 dark:border-white/10 shadow-2xl',
          'animate-slide-up',
          SIZE[size],
          className,
        )}
      >
        {hasHeader && (
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-white/10 px-5 sm:px-6 py-4 shrink-0">
            <div className="min-w-0">
              {title != null && (
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                  {title}
                </h2>
              )}
              {description != null && (
                <p className="mt-0.5 text-sm text-gray-500 dark:text-white/60">{description}</p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">{children}</div>

        {footer != null && (
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 dark:border-white/10 px-5 sm:px-6 py-4 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
