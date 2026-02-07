'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function OperatorRatingsDebugger() {
  const [operators, setOperators] = useState<any[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>('');
  const [cleanlinessRating, setCleanlinessRating] = useState<number>(0);
  const [communicationRating, setCommunicationRating] = useState<number>(0);
  const [overallRating, setOverallRating] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<Array<{ timestamp: string; message: string; type: 'success' | 'error' | 'info' }>>([]);

  const addLog = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    }]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const loadOperators = async () => {
    setLoading(true);
    addLog('Loading operators...', 'info');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, cleanliness_rating_avg, communication_rating_avg, overall_rating_avg, total_ratings_received')
        .in('role', ['operator', 'super_operator', 'apprentice'])
        .order('full_name');

      if (error) {
        addLog(`Error loading operators: ${error.message}`, 'error');
      } else {
        setOperators(data || []);
        addLog(`✅ Loaded ${data?.length || 0} operators`, 'success');
      }
    } catch (e: any) {
      addLog(`❌ Unexpected error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testRatingUpdate = async () => {
    if (!selectedOperatorId) {
      addLog('❌ Please select an operator', 'error');
      return;
    }

    if (!cleanlinessRating && !communicationRating && !overallRating) {
      addLog('❌ Please provide at least one rating', 'error');
      return;
    }

    setLoading(true);
    addLog('🧪 Testing rating update...', 'info');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        addLog('❌ No active session', 'error');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/operator-ratings/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          operatorId: selectedOperatorId,
          cleanlinessRating: cleanlinessRating || null,
          communicationRating: communicationRating || null,
          overallRating: overallRating || null
        })
      });

      const result = await response.json();

      if (response.ok) {
        addLog(`✅ Rating updated successfully!`, 'success');
        addLog(`📊 Updates: ${JSON.stringify(result.updates, null, 2)}`, 'info');

        // Refresh operator data
        await loadOperators();

        // Reset ratings
        setCleanlinessRating(0);
        setCommunicationRating(0);
        setOverallRating(0);
      } else {
        addLog(`❌ API Error: ${result.error}`, 'error');
      }
    } catch (e: any) {
      addLog(`❌ Unexpected error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testDatabaseSchema = async () => {
    setLoading(true);
    addLog('🔍 Checking database schema...', 'info');

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('cleanliness_rating_avg, communication_rating_avg, overall_rating_avg, total_ratings_received, last_rating_received_at')
        .limit(1);

      if (error) {
        addLog(`❌ Schema check failed: ${error.message}`, 'error');
        addLog('⚠️ Make sure you\'ve pushed the migration to Supabase!', 'error');
      } else {
        addLog('✅ Schema check passed! All rating columns exist.', 'success');
        addLog(`📋 Sample data: ${JSON.stringify(data?.[0] || {}, null, 2)}`, 'info');
      }
    } catch (e: any) {
      addLog(`❌ Unexpected error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const getSelectedOperator = () => {
    return operators.find(op => op.id === selectedOperatorId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Operator Ratings Debugger</h1>
          <p className="text-gray-600">Test and validate operator rating system</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Tests */}
          <div className="space-y-6">
            {/* Database Schema Test */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-indigo-900 mb-4">Database Schema Check</h2>
              <p className="text-sm text-gray-600 mb-4">
                Verify that the rating columns have been added to the profiles table
              </p>
              <button
                onClick={testDatabaseSchema}
                disabled={loading}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
              >
                {loading ? 'Checking...' : 'Check Database Schema'}
              </button>
            </div>

            {/* Load Operators */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-blue-900 mb-4">Load Operators</h2>
              <button
                onClick={loadOperators}
                disabled={loading}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors mb-4"
              >
                {loading ? 'Loading...' : 'Load All Operators'}
              </button>

              {/* Operator List */}
              {operators.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    Select an operator ({operators.length} found):
                  </p>
                  {operators.map((operator) => (
                    <div
                      key={operator.id}
                      onClick={() => setSelectedOperatorId(operator.id)}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedOperatorId === operator.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-900">{operator.full_name}</p>
                          <p className="text-xs text-gray-600">{operator.email}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {operator.total_ratings_received || 0} reviews
                          </p>
                        </div>
                        {operator.total_ratings_received > 0 && (
                          <div className="text-right">
                            <div className="text-xs text-gray-500">Avg Ratings:</div>
                            <div className="text-xs space-y-0.5">
                              <div>🧹 {operator.cleanliness_rating_avg?.toFixed(1) || 'N/A'}</div>
                              <div>💬 {operator.communication_rating_avg?.toFixed(1) || 'N/A'}</div>
                              <div>⭐ {operator.overall_rating_avg?.toFixed(1) || 'N/A'}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rating Input */}
            {selectedOperatorId && (
              <div className="bg-white rounded-2xl shadow-xl p-6">
                <h2 className="text-xl font-bold text-green-900 mb-4">Submit Test Rating</h2>
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3 mb-4">
                  <p className="text-sm font-semibold text-green-900">
                    Selected: {getSelectedOperator()?.full_name}
                  </p>
                </div>

                {/* Cleanliness Rating */}
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Cleanliness Rating (1-10)
                  </label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                      <button
                        key={rating}
                        onClick={() => setCleanlinessRating(rating)}
                        className={`w-10 h-10 rounded-lg font-bold transition-all ${
                          cleanlinessRating === rating
                            ? 'bg-green-600 text-white scale-110'
                            : 'bg-gray-100 text-gray-600 hover:bg-green-100'
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">(0 = skip this rating)</p>
                </div>

                {/* Communication Rating */}
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Communication Rating (1-10)
                  </label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                      <button
                        key={rating}
                        onClick={() => setCommunicationRating(rating)}
                        className={`w-10 h-10 rounded-lg font-bold transition-all ${
                          communicationRating === rating
                            ? 'bg-blue-600 text-white scale-110'
                            : 'bg-gray-100 text-gray-600 hover:bg-blue-100'
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">(0 = skip this rating)</p>
                </div>

                {/* Overall Rating */}
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Overall Rating (1-10)
                  </label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                      <button
                        key={rating}
                        onClick={() => setOverallRating(rating)}
                        className={`w-10 h-10 rounded-lg font-bold transition-all ${
                          overallRating === rating
                            ? 'bg-purple-600 text-white scale-110'
                            : 'bg-gray-100 text-gray-600 hover:bg-purple-100'
                        }`}
                      >
                        {rating}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">(0 = skip this rating)</p>
                </div>

                <button
                  onClick={testRatingUpdate}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                >
                  {loading ? 'Submitting...' : 'Submit Test Rating'}
                </button>
              </div>
            )}
          </div>

          {/* Right Column - Logs */}
          <div className="bg-white rounded-2xl shadow-xl p-6 h-fit lg:sticky lg:top-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Test Results</h2>
              <button
                onClick={clearLogs}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 h-[800px] overflow-y-auto font-mono text-sm">
              {logs.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No test results yet. Run some tests!</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded ${
                        log.type === 'success' ? 'bg-green-900/30 text-green-300' :
                        log.type === 'error' ? 'bg-red-900/30 text-red-300' :
                        'bg-blue-900/30 text-blue-300'
                      }`}
                    >
                      <span className="text-gray-500 text-xs">[{log.timestamp}]</span>{' '}
                      <span className="whitespace-pre-wrap">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-6 mt-8">
          <h3 className="font-bold text-yellow-900 mb-2">📋 Testing Instructions</h3>
          <ol className="text-sm text-yellow-800 space-y-2 list-decimal list-inside">
            <li>First, click "Check Database Schema" to verify the migration has been applied</li>
            <li>If schema check fails, run: <code className="bg-yellow-100 px-2 py-1 rounded">npm run db:push</code></li>
            <li>Click "Load All Operators" to fetch operator list</li>
            <li>Select an operator from the list</li>
            <li>Set test ratings (0 to skip a rating, 1-10 to set)</li>
            <li>Click "Submit Test Rating" to test the API</li>
            <li>Check the logs for success/error messages</li>
            <li>Reload operators to see updated averages</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
