'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Database,
  CheckCircle,
  AlertCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  ArrowLeft,
  Loader2
} from 'lucide-react';

interface SetupStatus {
  loading: boolean;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  sql?: string;
}

export default function SetupDatabase() {
  const [status, setStatus] = useState<SetupStatus>({
    loading: false,
    message: '',
    type: 'info'
  });
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error' | 'not-configured'>('checking');

  useEffect(() => {
    checkDatabaseStatus();
  }, []);

  const checkDatabaseStatus = async () => {
    try {
      const response = await fetch('/api/setup-database');
      const data = await response.json();

      if (response.ok && data.exists) {
        setConnectionStatus('connected');
        setStatus({
          loading: false,
          message: `✅ Database connected! Equipment table exists with ${data.recordCount} records.`,
          type: 'success'
        });
      } else if (data.error === 'Supabase not configured') {
        setConnectionStatus('not-configured');
        setStatus({
          loading: false,
          message: '⚠️ Supabase not configured - using localStorage mode',
          type: 'warning'
        });
      } else {
        setConnectionStatus('error');
        setStatus({
          loading: false,
          message: data.message || 'Database table not found',
          type: 'error',
          sql: data.sql
        });
      }
    } catch (error) {
      setConnectionStatus('error');
      setStatus({
        loading: false,
        message: 'Failed to check database status',
        type: 'error'
      });
    }
  };

  const testDatabaseConnection = async () => {
    setStatus({ loading: true, message: 'Testing database connection...', type: 'info' });

    try {
      const response = await fetch('/api/setup-database', {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        setConnectionStatus('connected');
        setStatus({
          loading: false,
          message: data.message,
          type: 'success'
        });
      } else {
        setStatus({
          loading: false,
          message: data.message,
          type: 'error',
          sql: data.sql
        });
      }
    } catch (error) {
      setStatus({
        loading: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error'
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'checking':
        return <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />;
      case 'connected':
        return <CheckCircle className="w-6 h-6 text-green-400" />;
      case 'not-configured':
        return <AlertCircle className="w-6 h-6 text-yellow-400" />;
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-400" />;
    }
  };

  const sqlToRun = `-- Pontifex Industries Equipment Management - Database Setup
-- Run this SQL in your Supabase SQL Editor

-- Create equipment table
CREATE TABLE IF NOT EXISTS equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand_name TEXT,
  model_number TEXT,
  type TEXT NOT NULL,
  serial_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'Available' CHECK (status IN ('Available', 'In Use', 'Maintenance', 'Out of Service')),
  assigned_to TEXT DEFAULT 'Unassigned',
  location TEXT,
  last_service_date DATE,
  next_service_due DATE,
  notes TEXT,
  qr_code_url TEXT,
  usage_hours INTEGER DEFAULT 0,
  equipment_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_assigned_to ON equipment(assigned_to);
CREATE INDEX IF NOT EXISTS idx_equipment_serial ON equipment(serial_number);

-- Enable Row Level Security (RLS)
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (for development/demo)
CREATE POLICY "Enable all access for equipment" ON equipment
  FOR ALL USING (true) WITH CHECK (true);

-- Insert sample equipment data
INSERT INTO equipment (name, brand_name, model_number, type, serial_number, status, assigned_to, location, notes, usage_hours)
VALUES
  ('Core Drill CD250', 'Hilti', 'DD250', 'Core Drill', 'CD250-001', 'Available', 'Matt M', 'West Warehouse', 'Heavy duty core drill', 120),
  ('Diesel Slab Saw', 'Husqvarna', 'FS5000', 'Floor Saw', 'DSS-5000-001', 'In Use', 'Skinny H', 'Job Site Alpha', 'Diesel powered saw', 340),
  ('Floor Saw FS400', 'Stihl', 'FS400', 'Floor Saw', 'FS400-002', 'Available', 'Rex Z', 'East Storage', 'Walk-behind saw', 180),
  ('Jackhammer TE3000', 'Hilti', 'TE-3000', 'Jackhammer', 'TJ-3000-001', 'Maintenance', 'Shop', 'Service Bay 1', 'Needs maintenance', 890)
ON CONFLICT (serial_number) DO NOTHING;`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-gradient-to-br from-cyan-500/10 to-indigo-600/10 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-gradient-to-tr from-indigo-600/10 to-purple-600/10 rounded-full blur-3xl animate-float-slow" style={{ animationDelay: '5s' }} />
      </div>

      <div className="relative z-10 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/dashboard"
              className="p-3 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-cyan-400" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Database className="w-8 h-8 text-cyan-400" />
                Database Setup
              </h1>
              <p className="text-blue-200 mt-1">Configure your Supabase equipment database</p>
            </div>
          </div>

          {/* Status Card */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              {getStatusIcon()}
              <div>
                <h2 className="text-xl font-semibold text-white">Connection Status</h2>
                <p className="text-blue-200">Current database configuration</p>
              </div>
            </div>

            {status.message && (
              <div className={`p-4 rounded-xl border ${
                status.type === 'success' ? 'bg-green-500/10 border-green-500/50 text-green-300' :
                status.type === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-300' :
                status.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-300' :
                'bg-blue-500/10 border-blue-500/50 text-blue-300'
              }`}>
                {status.loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {status.message}
                  </div>
                ) : (
                  status.message
                )}
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={checkDatabaseStatus}
                disabled={status.loading}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 text-white transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${status.loading ? 'animate-spin' : ''}`} />
                Refresh Status
              </button>

              {connectionStatus !== 'not-configured' && (
                <button
                  onClick={testDatabaseConnection}
                  disabled={status.loading}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-xl border border-cyan-500/50 text-cyan-300 transition-all disabled:opacity-50"
                >
                  <Database className="w-4 h-4" />
                  Test Connection
                </button>
              )}
            </div>
          </div>

          {/* Setup Instructions */}
          {connectionStatus !== 'connected' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Manual Setup */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <ExternalLink className="w-5 h-5 text-cyan-400" />
                  Manual Setup (Recommended)
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-blue-200 mb-4 text-sm">
                  <li>Go to your Supabase dashboard</li>
                  <li>Click "SQL Editor" in the left sidebar</li>
                  <li>Click "New Query"</li>
                  <li>Copy and paste the SQL below</li>
                  <li>Click "Run" button</li>
                </ol>

                <button
                  onClick={() => copyToClipboard(sqlToRun)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl font-semibold transition-all"
                >
                  <Copy className="w-4 h-4" />
                  Copy SQL to Clipboard
                </button>
              </div>

              {/* Environment Setup */}
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Environment Variables</h3>
                <p className="text-blue-200 text-sm mb-4">
                  Create a <code className="bg-white/10 px-2 py-1 rounded">.env.local</code> file with:
                </p>

                <div className="bg-gray-900/50 rounded-xl p-4 font-mono text-sm mb-4">
                  <div className="text-green-400">
                    NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co<br />
                    NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
                  </div>
                </div>

                <p className="text-blue-200 text-sm">
                  Get these values from your Supabase project's Settings → API page.
                </p>
              </div>
            </div>
          )}

          {/* SQL Code Display */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Database Schema</h3>
              <button
                onClick={() => copyToClipboard(status.sql || sqlToRun)}
                className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            </div>

            <div className="bg-gray-900/80 rounded-xl p-4 overflow-x-auto">
              <pre className="text-green-400 text-sm whitespace-pre-wrap">
                {status.sql || sqlToRun}
              </pre>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Link
              href="/equipment"
              className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl font-semibold transition-all text-center"
            >
              Go to Equipment Management
            </Link>

            <Link
              href="/dashboard"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 text-white font-medium transition-all"
            >
              Back to Dashboard
            </Link>
          </div>

          {/* Help Section */}
          <div className="mt-8 bg-amber-500/10 backdrop-blur-xl rounded-2xl border border-amber-500/30 p-6">
            <h3 className="text-amber-300 font-semibold mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Need Help?
            </h3>
            <ul className="text-amber-200 text-sm space-y-1">
              <li>• The app works without Supabase (localStorage mode) for development</li>
              <li>• For production, you must create the database table manually</li>
              <li>• Check browser console for detailed error messages</li>
              <li>• Ensure your Supabase project has the correct permissions</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Custom animations */}
      <style jsx>{`
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        .animate-float-slow {
          animation: float-slow 20s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}