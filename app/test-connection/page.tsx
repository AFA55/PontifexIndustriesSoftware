'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TestConnection() {
  const [status, setStatus] = useState('Testing connection...');
  const [error, setError] = useState('');

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    try {
      // Check if supabase exists
      if (!supabase) {
        setError('Supabase client is null or undefined');
        setStatus('❌ Failed');
        return;
      }

      setStatus('Supabase client exists, testing database connection...');

      // Try a simple query
      const { data, error } = await supabase
        .from('equipment')
        .select('count')
        .limit(1);

      if (error) {
        setError(`Database error: ${error.message}`);
        setStatus('❌ Database connection failed');
      } else {
        setStatus('✅ Connection successful!');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
      setStatus('❌ Connection failed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Supabase Connection Test</h1>

        <div className="bg-gray-800/50 backdrop-blur-lg rounded-xl p-6 border border-gray-700">
          <p className="text-xl mb-4">{status}</p>
          {error && (
            <div className="mt-4 p-4 bg-red-500/20 border border-red-500 rounded-lg">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          <div className="mt-6 p-4 bg-gray-900 rounded-lg">
            <p className="text-sm text-gray-400 mb-2">Supabase URL:</p>
            <p className="text-xs text-cyan-400 break-all">https://thebticaroasspmbhisx.supabase.co</p>
            <p className="text-sm text-gray-400 mt-4 mb-2">Client Status:</p>
            <p className="text-cyan-400">{supabase ? 'Initialized' : 'Not initialized'}</p>
          </div>

          <button
            onClick={testConnection}
            className="mt-6 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 rounded-lg font-semibold transition-all"
          >
            Test Again
          </button>
        </div>

        <button
          onClick={() => window.location.href = '/equipment'}
          className="mt-6 w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-colors"
        >
          Back to Equipment
        </button>
      </div>
    </div>
  );
}