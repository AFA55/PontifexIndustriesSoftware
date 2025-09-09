'use client';

import { useState } from 'react';
import Link from 'next/link';
import { testDatabaseAccess, testDirectInsert } from '../../../../lib/supabase-equipment';

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

export default function DebugPage() {
  const [connectionTest, setConnectionTest] = useState<TestResult | null>(null);
  const [insertTest, setInsertTest] = useState<TestResult | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isTestingInsert, setIsTestingInsert] = useState(false);

  const runConnectionTest = async () => {
    try {
      setIsTestingConnection(true);
      console.log('🔬 Starting database connection test...');
      const result = await testDatabaseAccess();
      setConnectionTest(result);
      console.log('📊 Connection test result:', result);
    } catch (err: any) {
      console.error('💥 Connection test error:', err);
      setConnectionTest({
        success: false,
        message: `Test failed: ${err.message || err}`,
        details: err
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const runInsertTest = async () => {
    try {
      setIsTestingInsert(true);
      console.log('🧪 Starting database insert test...');
      const result = await testDirectInsert();
      setInsertTest(result);
      console.log('📊 Insert test result:', result);
    } catch (err: any) {
      console.error('💥 Insert test error:', err);
      setInsertTest({
        success: false,
        message: `Test failed: ${err.message || err}`,
        details: err
      });
    } finally {
      setIsTestingInsert(false);
    }
  };

  const clearResults = () => {
    setConnectionTest(null);
    setInsertTest(null);
  };

  const formatDetails = (details: any) => {
    try {
      return JSON.stringify(details, null, 2);
    } catch (err) {
      return String(details);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-slate-800 to-gray-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard"
              className="p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 text-white hover:bg-white/20 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-3xl font-bold text-white">Debug Tools</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Environment Info */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Environment Information</h2>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-blue-200">Supabase URL:</span>
                <p className="text-white font-mono text-xs break-all">
                  {process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not set'}
                </p>
              </div>
              <div>
                <span className="text-blue-200">Supabase Key (first 20 chars):</span>
                <p className="text-white font-mono text-xs">
                  {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20) + '...' : 
                    'Not set'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Test Controls */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Connection Test */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Database Connection Test</h3>
              <p className="text-blue-200 text-sm mb-4">
                Tests basic database connectivity and equipment table access.
              </p>
              <button
                onClick={runConnectionTest}
                disabled={isTestingConnection}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center space-x-2"
              >
                {isTestingConnection ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Test Connection</span>
                  </>
                )}
              </button>
            </div>

            {/* Insert Test */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Database Insert Test</h3>
              <p className="text-blue-200 text-sm mb-4">
                Tests inserting a sample equipment record to verify write permissions.
              </p>
              <button
                onClick={runInsertTest}
                disabled={isTestingInsert}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-colors min-h-[48px] flex items-center justify-center space-x-2"
              >
                {isTestingInsert ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>Test Insert</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Clear Results Button */}
          {(connectionTest || insertTest) && (
            <div className="text-center mb-6">
              <button
                onClick={clearResults}
                className="bg-white/10 hover:bg-white/20 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Clear Results
              </button>
            </div>
          )}

          {/* Test Results */}
          <div className="space-y-6">
            {/* Connection Test Results */}
            {connectionTest && (
              <div className={`backdrop-blur-xl rounded-2xl border p-6 ${
                connectionTest.success 
                  ? 'bg-green-500/20 border-green-500/30' 
                  : 'bg-red-500/20 border-red-500/30'
              }`}>
                <div className="flex items-center space-x-3 mb-4">
                  {connectionTest.success ? (
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <h3 className="text-lg font-semibold text-white">Connection Test Results</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-blue-200 text-sm font-medium">Status:</span>
                    <p className={connectionTest.success ? 'text-green-300' : 'text-red-300'}>
                      {connectionTest.success ? 'SUCCESS' : 'FAILED'}
                    </p>
                  </div>
                  
                  <div>
                    <span className="text-blue-200 text-sm font-medium">Message:</span>
                    <p className="text-white">{connectionTest.message}</p>
                  </div>

                  {connectionTest.details && (
                    <div>
                      <span className="text-blue-200 text-sm font-medium">Details:</span>
                      <pre className="text-white text-xs bg-black/30 p-3 rounded-lg mt-2 overflow-x-auto">
                        {formatDetails(connectionTest.details)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Insert Test Results */}
            {insertTest && (
              <div className={`backdrop-blur-xl rounded-2xl border p-6 ${
                insertTest.success 
                  ? 'bg-green-500/20 border-green-500/30' 
                  : 'bg-red-500/20 border-red-500/30'
              }`}>
                <div className="flex items-center space-x-3 mb-4">
                  {insertTest.success ? (
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <h3 className="text-lg font-semibold text-white">Insert Test Results</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-blue-200 text-sm font-medium">Status:</span>
                    <p className={insertTest.success ? 'text-green-300' : 'text-red-300'}>
                      {insertTest.success ? 'SUCCESS' : 'FAILED'}
                    </p>
                  </div>
                  
                  <div>
                    <span className="text-blue-200 text-sm font-medium">Message:</span>
                    <p className="text-white">{insertTest.message}</p>
                  </div>

                  {insertTest.details && (
                    <div>
                      <span className="text-blue-200 text-sm font-medium">Details:</span>
                      <pre className="text-white text-xs bg-black/30 p-3 rounded-lg mt-2 overflow-x-auto">
                        {formatDetails(insertTest.details)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 mt-8">
            <h3 className="text-lg font-semibold text-white mb-4">Troubleshooting Tips</h3>
            <ul className="text-blue-200 text-sm space-y-2">
              <li>• If connection test fails, check your Supabase URL and API key in .env.local</li>
              <li>• If insert test fails, verify that RLS (Row Level Security) policies are properly configured</li>
              <li>• Check the browser console for detailed error messages</li>
              <li>• Ensure the equipment table exists in your Supabase database</li>
              <li>• Verify that your database user has INSERT permissions on the equipment table</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}