'use client';

import { useState } from 'react';

interface DebugLog {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  details?: any;
}

export default function LiabilityPDFDebugger() {
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [testData, setTestData] = useState({
    jobId: '',
    customerName: 'Test Customer',
    customerEmail: 'test@example.com',
    operatorName: 'Test Operator',
    jobNumber: 'TEST-001',
    jobAddress: '123 Test St',
  });

  const addLog = (type: DebugLog['type'], message: string, details?: any) => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    }]);
  };

  const testPDFGeneration = async () => {
    addLog('info', 'Starting PDF generation test...');

    try {
      // Create a mock signature
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 150;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000';
        ctx.font = '30px cursive';
        ctx.fillText('Test Signature', 50, 80);
      }
      const signatureDataURL = canvas.toDataURL('image/png');

      addLog('info', 'Generated mock signature', { signatureLength: signatureDataURL.length });

      // Get session
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        addLog('error', 'No session found');
        return;
      }

      addLog('success', 'Session retrieved');

      // Call PDF API
      const response = await fetch('/api/liability-release/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          ...testData,
          signatureDataURL
        })
      });

      const data = await response.json();

      if (response.ok) {
        addLog('success', 'PDF API call successful', data);
      } else {
        addLog('error', 'PDF API call failed', { status: response.status, data });
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
        className="fixed bottom-4 right-4 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg shadow-lg font-semibold text-sm z-50"
      >
        🔧 PDF Debugger
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white rounded-xl shadow-2xl border-2 border-purple-200 w-[500px] max-h-[600px] flex flex-col z-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 rounded-t-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔧</span>
          <h3 className="font-bold">Liability PDF Debugger</h3>
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
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Job ID"
            value={testData.jobId}
            onChange={(e) => setTestData({ ...testData, jobId: e.target.value })}
            className="px-2 py-1 text-xs border rounded"
          />
          <input
            type="text"
            placeholder="Customer Name"
            value={testData.customerName}
            onChange={(e) => setTestData({ ...testData, customerName: e.target.value })}
            className="px-2 py-1 text-xs border rounded"
          />
          <input
            type="email"
            placeholder="Customer Email"
            value={testData.customerEmail}
            onChange={(e) => setTestData({ ...testData, customerEmail: e.target.value })}
            className="px-2 py-1 text-xs border rounded"
          />
          <input
            type="text"
            placeholder="Operator Name"
            value={testData.operatorName}
            onChange={(e) => setTestData({ ...testData, operatorName: e.target.value })}
            className="px-2 py-1 text-xs border rounded"
          />
        </div>
        <button
          onClick={testPDFGeneration}
          className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-semibold text-sm"
        >
          Run Test
        </button>
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
                  <pre className="mt-1 text-[10px] bg-white/50 p-1 rounded overflow-x-auto">
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
