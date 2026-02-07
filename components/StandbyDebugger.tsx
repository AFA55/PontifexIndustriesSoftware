'use client';

import { useState } from 'react';

interface DebugLog {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  details?: any;
}

export default function StandbyDebugger({ jobId }: { jobId: string }) {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [testData, setTestData] = useState({
    reason: 'Test Reason: No access to work area',
    clientName: 'Test Client',
    clientSignature: 'Test Signature',
  });

  const addLog = (type: DebugLog['type'], message: string, details?: any) => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    }]);
  };

  const testStandbyStart = async () => {
    addLog('info', 'Starting standby timer test...');

    try {
      // Get session
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        addLog('error', 'No session found');
        return;
      }

      addLog('success', 'Session retrieved');
      addLog('info', 'Calling POST /api/standby...', { jobId, ...testData });

      // Call standby API
      const response = await fetch('/api/standby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          jobId,
          reason: testData.reason,
          clientName: testData.clientName,
          clientSignature: testData.clientSignature,
          startedAt: new Date().toISOString()
        })
      });

      const data = await response.json();

      if (response.ok) {
        addLog('success', 'Standby start API call successful', data);
      } else {
        addLog('error', 'Standby start API call failed', {
          status: response.status,
          error: data.error,
          details: data.details,
          code: data.code,
          hint: data.hint
        });
      }

    } catch (error: any) {
      addLog('error', 'Test failed with exception', { error: error.message, stack: error.stack });
    }
  };

  const testStandbyGet = async () => {
    addLog('info', 'Testing GET standby logs...');

    try {
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        addLog('error', 'No session found');
        return;
      }

      addLog('info', `Calling GET /api/standby?jobId=${jobId}...`);

      const response = await fetch(`/api/standby?jobId=${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        addLog('success', `Found ${data.data?.length || 0} standby logs`, data);
      } else {
        addLog('error', 'GET standby logs failed', { status: response.status, data });
      }

    } catch (error: any) {
      addLog('error', 'Test failed with exception', { error: error.message });
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg shadow-lg font-semibold text-sm z-50"
      >
        ⏱️ Standby Debugger
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-xl shadow-2xl border-2 border-orange-200 w-[500px] max-h-[600px] flex flex-col z-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white p-4 rounded-t-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">⏱️</span>
          <h3 className="font-bold">Standby Debugger</h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-white hover:bg-white/20 rounded-lg p-1 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Test Data Form */}
      <div className="p-4 border-b border-gray-200">
        <h4 className="font-semibold text-sm text-gray-700 mb-2">Test Data</h4>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Job ID (auto-filled)"
            value={jobId}
            disabled
            className="w-full px-2 py-1 text-xs border rounded bg-gray-50"
          />
          <input
            type="text"
            placeholder="Reason"
            value={testData.reason}
            onChange={(e) => setTestData({ ...testData, reason: e.target.value })}
            className="w-full px-2 py-1 text-xs border rounded"
          />
          <input
            type="text"
            placeholder="Client Name"
            value={testData.clientName}
            onChange={(e) => setTestData({ ...testData, clientName: e.target.value })}
            className="w-full px-2 py-1 text-xs border rounded"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            onClick={testStandbyStart}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-semibold text-sm"
          >
            Test Start
          </button>
          <button
            onClick={testStandbyGet}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-semibold text-sm"
          >
            Test Get Logs
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-sm text-gray-700">Logs ({logs.length})</h4>
          <button
            onClick={clearLogs}
            className="text-xs text-red-600 hover:text-red-700 font-medium"
          >
            Clear
          </button>
        </div>

        {logs.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-8">No logs yet. Run a test to see results.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`p-2 rounded-lg text-xs ${
                  log.type === 'success' ? 'bg-green-50 border border-green-200' :
                  log.type === 'error' ? 'bg-red-50 border border-red-200' :
                  log.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                  'bg-blue-50 border border-blue-200'
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className={`font-semibold ${
                    log.type === 'success' ? 'text-green-700' :
                    log.type === 'error' ? 'text-red-700' :
                    log.type === 'warning' ? 'text-yellow-700' :
                    'text-blue-700'
                  }`}>
                    {log.type === 'success' && '✓ '}
                    {log.type === 'error' && '✗ '}
                    {log.type === 'warning' && '⚠ '}
                    {log.type === 'info' && 'ℹ '}
                    {log.type.toUpperCase()}
                  </span>
                  <span className="text-gray-500 text-[10px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-gray-700">{log.message}</p>
                {log.details && (
                  <pre className="mt-1 text-[10px] bg-white/50 p-1 rounded overflow-x-auto max-h-32">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
