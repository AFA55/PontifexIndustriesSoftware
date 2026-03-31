'use client';

import React, { Component, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, ChevronDown, ChevronUp } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  retryCount: number;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Log to our error logging endpoint (fire-and-forget)
    try {
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'react_error_boundary',
          error: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          url: typeof window !== 'undefined' ? window.location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          timestamp: new Date().toISOString(),
        }),
      }).catch(() => {});
    } catch {
      // Silent fail — can't log if everything is broken
    }

    // Also log to console for dev
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleRetry = () => {
    if (this.state.retryCount >= 3) {
      // Too many retries — force full reload instead of risking infinite loop
      window.location.reload();
      return;
    }
    this.setState(prev => ({ hasError: false, error: null, errorInfo: null, retryCount: prev.retryCount + 1 }));
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Something went wrong</h1>
                  <p className="text-red-100 text-sm mt-0.5">Don&apos;t worry - your data is safe</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                An unexpected error occurred. This has been automatically reported to our team.
                Try one of the options below to get back on track.
              </p>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={this.handleRetry}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold text-sm transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={this.handleReload}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-medium text-sm transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reload Page
                  </button>
                  <button
                    onClick={this.handleGoHome}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-medium text-sm transition-colors"
                  >
                    <Home className="w-4 h-4" />
                    Go to Dashboard
                  </button>
                </div>
              </div>

              {/* Error Details (collapsible) */}
              <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
                <button
                  onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <Bug className="w-3.5 h-3.5" />
                  <span>Technical Details</span>
                  {this.state.showDetails
                    ? <ChevronUp className="w-3.5 h-3.5" />
                    : <ChevronDown className="w-3.5 h-3.5" />
                  }
                </button>
                {this.state.showDetails && this.state.error && (
                  <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <p className="text-xs font-mono text-red-600 dark:text-red-400 break-all">
                      {this.state.error.message}
                    </p>
                    {this.state.error.stack && (
                      <pre className="mt-2 text-[10px] font-mono text-gray-500 dark:text-gray-400 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                        {this.state.error.stack.split('\n').slice(0, 8).join('\n')}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Smaller inline error boundary for individual components/sections.
 * Shows a compact error message instead of a full-page takeover.
 */
export class SectionErrorBoundary extends Component<
  { children: React.ReactNode; section?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; section?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[SectionError:${this.props.section || 'unknown'}]`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-300">
                {this.props.section ? `Error loading ${this.props.section}` : 'Something went wrong'}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300 hover:text-red-900 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
