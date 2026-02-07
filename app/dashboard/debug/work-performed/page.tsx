'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface QuickEntryCut {
  numCuts: number;
  lengthFeet: number;
  depth: number;
}

interface ChainsawCut {
  numCuts: number;
  lengthInches: number;
  depth: number;
}

interface BreakRemoveArea {
  length: number;
  width: number;
  depth: number;
}

interface JackhammerArea {
  length: number;
  width: number;
}

interface BrokkArea {
  length: number;
  width: number;
  thickness: number;
}

export default function WorkPerformedDebugger() {
  const [activeTest, setActiveTest] = useState<string>('');
  const [testResults, setTestResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Quick Entry (Slab/Wall/Hand Saw) Test State
  const [quickEntryCuts, setQuickEntryCuts] = useState<QuickEntryCut[]>([]);
  const [quickEntryNumCuts, setQuickEntryNumCuts] = useState<number>(1);
  const [quickEntryLengthFeet, setQuickEntryLengthFeet] = useState<number>(0);
  const [quickEntryDepth, setQuickEntryDepth] = useState<number>(0);

  // Chainsaw Test State
  const [chainsawCuts, setChainsawCuts] = useState<ChainsawCut[]>([]);
  const [chainsawNumCuts, setChainsawNumCuts] = useState<number>(1);
  const [chainsawLengthInches, setChainsawLengthInches] = useState<number>(0);
  const [chainsawDepth, setChainsawDepth] = useState<number>(0);

  // Break & Remove Test State
  const [breakRemoveAreas, setBreakRemoveAreas] = useState<BreakRemoveArea[]>([]);
  const [breakRemoveLength, setBreakRemoveLength] = useState<number>(0);
  const [breakRemoveWidth, setBreakRemoveWidth] = useState<number>(0);
  const [breakRemoveDepth, setBreakRemoveDepth] = useState<number>(0);
  const [removalMethod, setRemovalMethod] = useState<string>('');
  const [removalEquipment, setRemovalEquipment] = useState<string>('');

  // Jack Hammering Test State
  const [jackhammerEquipment, setJackhammerEquipment] = useState<string>('');
  const [jackhammerOther, setJackhammerOther] = useState<string>('');
  const [jackhammerAreas, setJackhammerAreas] = useState<JackhammerArea[]>([]);
  const [jackhammerLength, setJackhammerLength] = useState<number>(0);
  const [jackhammerWidth, setJackhammerWidth] = useState<number>(0);

  // Brokk Test State
  const [brokkAreas, setBrokkAreas] = useState<BrokkArea[]>([]);
  const [brokkLength, setBrokkLength] = useState<number>(0);
  const [brokkWidth, setBrokkWidth] = useState<number>(0);
  const [brokkThickness, setBrokkThickness] = useState<number>(0);

  const addLog = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setTestResults(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    }]);
  };

  const clearLogs = () => {
    setTestResults([]);
  };

  // Quick Entry Functions
  const addQuickEntryCut = () => {
    if (quickEntryNumCuts <= 0 || quickEntryLengthFeet <= 0) {
      addLog('❌ Quick Entry: Invalid input - numCuts or lengthFeet <= 0', 'error');
      return;
    }
    const newCut = {
      numCuts: quickEntryNumCuts,
      lengthFeet: quickEntryLengthFeet,
      depth: quickEntryDepth
    };
    setQuickEntryCuts(prev => [...prev, newCut]);
    addLog(`✅ Quick Entry: Added ${quickEntryNumCuts} cuts × ${quickEntryLengthFeet} ft @ ${quickEntryDepth}" deep`, 'success');
    setQuickEntryNumCuts(1);
    setQuickEntryLengthFeet(0);
    setQuickEntryDepth(0);
  };

  const removeQuickEntryCut = (index: number) => {
    setQuickEntryCuts(prev => prev.filter((_, i) => i !== index));
    addLog(`🗑️ Quick Entry: Removed cut at index ${index}`, 'info');
  };

  const calculateQuickEntryTotal = () => {
    const total = quickEntryCuts.reduce((sum, cut) => {
      return sum + (cut.numCuts * cut.lengthFeet);
    }, 0);
    addLog(`📊 Quick Entry Total: ${total.toFixed(2)} linear feet`, 'info');
    return total;
  };

  // Chainsaw Functions
  const addChainsawCut = () => {
    if (chainsawNumCuts <= 0 || chainsawLengthInches <= 0) {
      addLog('❌ Chainsaw: Invalid input - numCuts or lengthInches <= 0', 'error');
      return;
    }
    const newCut = {
      numCuts: chainsawNumCuts,
      lengthInches: chainsawLengthInches,
      depth: chainsawDepth
    };
    setChainsawCuts(prev => [...prev, newCut]);
    const lengthInFeet = chainsawLengthInches / 12;
    addLog(`✅ Chainsaw: Added ${chainsawNumCuts} cuts × ${chainsawLengthInches}" (${lengthInFeet.toFixed(2)} ft) @ ${chainsawDepth}" deep`, 'success');
    setChainsawNumCuts(1);
    setChainsawLengthInches(0);
    setChainsawDepth(0);
  };

  const removeChainsawCut = (index: number) => {
    setChainsawCuts(prev => prev.filter((_, i) => i !== index));
    addLog(`🗑️ Chainsaw: Removed cut at index ${index}`, 'info');
  };

  const calculateChainsawTotal = () => {
    const total = chainsawCuts.reduce((sum, cut) => {
      const lengthInFeet = cut.lengthInches / 12;
      return sum + (cut.numCuts * lengthInFeet);
    }, 0);
    addLog(`📊 Chainsaw Total: ${total.toFixed(2)} linear feet (converted from inches)`, 'info');
    return total;
  };

  // Break & Remove Functions
  const addBreakRemoveArea = () => {
    if (breakRemoveLength <= 0 || breakRemoveWidth <= 0) {
      addLog('❌ Break & Remove: Invalid input - length or width <= 0', 'error');
      return;
    }
    const newArea = {
      length: breakRemoveLength,
      width: breakRemoveWidth,
      depth: breakRemoveDepth
    };
    setBreakRemoveAreas(prev => [...prev, newArea]);
    const sqFt = breakRemoveLength * breakRemoveWidth;
    addLog(`✅ Break & Remove: Added ${breakRemoveLength} ft × ${breakRemoveWidth} ft = ${sqFt.toFixed(2)} sq ft @ ${breakRemoveDepth}" deep`, 'success');
    setBreakRemoveLength(0);
    setBreakRemoveWidth(0);
    setBreakRemoveDepth(0);
  };

  const removeBreakRemoveArea = (index: number) => {
    setBreakRemoveAreas(prev => prev.filter((_, i) => i !== index));
    addLog(`🗑️ Break & Remove: Removed area at index ${index}`, 'info');
  };

  const calculateBreakRemoveTotal = () => {
    const total = breakRemoveAreas.reduce((sum, area) => {
      return sum + (area.length * area.width);
    }, 0);
    addLog(`📊 Break & Remove Total: ${total.toFixed(2)} square feet`, 'info');
    return total;
  };

  const validateBreakRemoveEntry = () => {
    if (breakRemoveAreas.length === 0) {
      addLog('❌ Break & Remove: No areas added', 'error');
      return false;
    }
    if (!removalMethod) {
      addLog('❌ Break & Remove: No removal method selected', 'error');
      return false;
    }
    if (removalMethod === 'rigged' && !removalEquipment) {
      addLog('❌ Break & Remove: Rigged method requires equipment selection', 'error');
      return false;
    }
    addLog('✅ Break & Remove: Validation passed', 'success');
    return true;
  };

  // Jack Hammering Functions
  const addJackhammerArea = () => {
    if (jackhammerLength <= 0 || jackhammerWidth <= 0) {
      addLog('❌ Jack Hammering: Invalid input - length or width <= 0', 'error');
      return;
    }
    const newArea = {
      length: jackhammerLength,
      width: jackhammerWidth
    };
    setJackhammerAreas(prev => [...prev, newArea]);
    const sqFt = jackhammerLength * jackhammerWidth;
    addLog(`✅ Jack Hammering: Added ${jackhammerLength} ft × ${jackhammerWidth} ft = ${sqFt.toFixed(2)} sq ft`, 'success');
    setJackhammerLength(0);
    setJackhammerWidth(0);
  };

  const removeJackhammerArea = (index: number) => {
    setJackhammerAreas(prev => prev.filter((_, i) => i !== index));
    addLog(`🗑️ Jack Hammering: Removed area at index ${index}`, 'info');
  };

  const calculateJackhammerTotal = () => {
    const total = jackhammerAreas.reduce((sum, area) => {
      return sum + (area.length * area.width);
    }, 0);
    addLog(`📊 Jack Hammering Total: ${total.toFixed(2)} square feet`, 'info');
    return total;
  };

  const validateJackhammerEntry = () => {
    if (!jackhammerEquipment) {
      addLog('❌ Jack Hammering: No equipment selected', 'error');
      return false;
    }
    if (jackhammerEquipment === 'other' && !jackhammerOther) {
      addLog('❌ Jack Hammering: Other equipment requires text input', 'error');
      return false;
    }
    if (jackhammerAreas.length === 0) {
      addLog('❌ Jack Hammering: No areas added', 'error');
      return false;
    }
    addLog('✅ Jack Hammering: Validation passed', 'success');
    return true;
  };

  // Brokk Functions
  const addBrokkArea = () => {
    if (brokkLength <= 0 || brokkWidth <= 0) {
      addLog('❌ Brokk: Invalid input - length or width <= 0', 'error');
      return;
    }
    const newArea = {
      length: brokkLength,
      width: brokkWidth,
      thickness: brokkThickness
    };
    setBrokkAreas(prev => [...prev, newArea]);
    const sqFt = brokkLength * brokkWidth;
    addLog(`✅ Brokk: Added ${brokkLength} ft × ${brokkWidth} ft = ${sqFt.toFixed(2)} sq ft @ ${brokkThickness}" thick`, 'success');
    setBrokkLength(0);
    setBrokkWidth(0);
    setBrokkThickness(0);
  };

  const removeBrokkArea = (index: number) => {
    setBrokkAreas(prev => prev.filter((_, i) => i !== index));
    addLog(`🗑️ Brokk: Removed area at index ${index}`, 'info');
  };

  const calculateBrokkTotal = () => {
    const total = brokkAreas.reduce((sum, area) => {
      return sum + (area.length * area.width);
    }, 0);
    addLog(`📊 Brokk Total: ${total.toFixed(2)} square feet`, 'info');
    return total;
  };

  const calculateBrokkAvgThickness = () => {
    if (brokkAreas.length === 0) return 0;
    const avgThickness = brokkAreas.reduce((sum, a) => sum + a.thickness, 0) / brokkAreas.length;
    addLog(`📊 Brokk Average Thickness: ${avgThickness.toFixed(2)} inches`, 'info');
    return avgThickness;
  };

  // Database Tests
  const testDatabaseConnection = async () => {
    setLoading(true);
    addLog('🔌 Testing database connection...', 'info');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        addLog('❌ No active session - user not logged in', 'error');
      } else {
        addLog(`✅ Active session found for user: ${session.user.email}`, 'success');
      }

      const { data, error } = await supabase
        .from('job_orders')
        .select('id, job_number')
        .limit(5);

      if (error) {
        addLog(`❌ Database error: ${error.message}`, 'error');
      } else {
        addLog(`✅ Database connection successful - Retrieved ${data.length} job orders`, 'success');
      }
    } catch (error: any) {
      addLog(`❌ Unexpected error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const testWorkPerformedAPI = async () => {
    setLoading(true);
    addLog('🧪 Testing work performed API...', 'info');
    try {
      // Get a test job ID
      const { data: jobs } = await supabase
        .from('job_orders')
        .select('id')
        .limit(1);

      if (!jobs || jobs.length === 0) {
        addLog('❌ No jobs found in database', 'error');
        setLoading(false);
        return;
      }

      const testJobId = jobs[0].id;
      addLog(`📝 Using job ID: ${testJobId}`, 'info');

      // Test fetching work performed
      const { data: workData, error: workError } = await supabase
        .from('work_performed')
        .select('*')
        .eq('job_order_id', testJobId);

      if (workError) {
        addLog(`❌ Error fetching work performed: ${workError.message}`, 'error');
      } else {
        addLog(`✅ Work performed fetch successful - ${workData.length} entries found`, 'success');
      }
    } catch (error: any) {
      addLog(`❌ Unexpected error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Work Performed Debugger</h1>
          <p className="text-gray-600">Test and validate all quick entry modals</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Tests */}
          <div className="space-y-6">
            {/* Quick Entry Test (Slab/Wall/Hand Saw) */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-blue-900 mb-4">Quick Entry (Slab/Wall/Hand Saw)</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    placeholder="Cuts"
                    value={quickEntryNumCuts}
                    onChange={(e) => setQuickEntryNumCuts(parseInt(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Length (ft)"
                    step="0.1"
                    value={quickEntryLengthFeet}
                    onChange={(e) => setQuickEntryLengthFeet(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Depth (in)"
                    step="0.25"
                    value={quickEntryDepth}
                    onChange={(e) => setQuickEntryDepth(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                </div>
                <button
                  onClick={addQuickEntryCut}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
                >
                  Add Cut
                </button>
                <button
                  onClick={calculateQuickEntryTotal}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                >
                  Calculate Total ({quickEntryCuts.length} cuts)
                </button>
                {quickEntryCuts.length > 0 && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="font-semibold text-sm text-blue-900">Entries:</p>
                    {quickEntryCuts.map((cut, i) => (
                      <div key={i} className="text-xs text-blue-700 flex justify-between items-center">
                        <span>{cut.numCuts} × {cut.lengthFeet} ft @ {cut.depth}"</span>
                        <button onClick={() => removeQuickEntryCut(i)} className="text-red-500">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Chainsaw Test */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-purple-900 mb-4">Chainsaw (Inches)</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    placeholder="Cuts"
                    value={chainsawNumCuts}
                    onChange={(e) => setChainsawNumCuts(parseInt(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Length (in)"
                    step="0.25"
                    value={chainsawLengthInches}
                    onChange={(e) => setChainsawLengthInches(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Depth (in)"
                    step="0.25"
                    value={chainsawDepth}
                    onChange={(e) => setChainsawDepth(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                </div>
                <button
                  onClick={addChainsawCut}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700"
                >
                  Add Cut
                </button>
                <button
                  onClick={calculateChainsawTotal}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                >
                  Calculate Total ({chainsawCuts.length} cuts)
                </button>
                {chainsawCuts.length > 0 && (
                  <div className="bg-purple-50 rounded-lg p-3">
                    <p className="font-semibold text-sm text-purple-900">Entries:</p>
                    {chainsawCuts.map((cut, i) => (
                      <div key={i} className="text-xs text-purple-700 flex justify-between items-center">
                        <span>{cut.numCuts} × {cut.lengthInches}" @ {cut.depth}" = {((cut.numCuts * cut.lengthInches) / 12).toFixed(2)} ft</span>
                        <button onClick={() => removeChainsawCut(i)} className="text-red-500">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Break & Remove Test */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-red-900 mb-4">Break & Remove</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    placeholder="Length (ft)"
                    step="0.1"
                    value={breakRemoveLength}
                    onChange={(e) => setBreakRemoveLength(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Width (ft)"
                    step="0.1"
                    value={breakRemoveWidth}
                    onChange={(e) => setBreakRemoveWidth(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Depth (in)"
                    step="0.25"
                    value={breakRemoveDepth}
                    onChange={(e) => setBreakRemoveDepth(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                </div>
                <select
                  value={removalMethod}
                  onChange={(e) => setRemovalMethod(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Removal Method...</option>
                  <option value="hand_removal">Hand Removal</option>
                  <option value="rigged">Rigged</option>
                </select>
                {removalMethod === 'rigged' && (
                  <select
                    value={removalEquipment}
                    onChange={(e) => setRemovalEquipment(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Equipment...</option>
                    <option value="lull">Lull</option>
                    <option value="forklift">Forklift</option>
                    <option value="skidsteer">Skidsteer</option>
                    <option value="mini_x">Mini X</option>
                    <option value="sherpa">Sherpa</option>
                    <option value="dingo">Dingo</option>
                    <option value="other">Other</option>
                  </select>
                )}
                <button
                  onClick={addBreakRemoveArea}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
                >
                  Add Area
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={calculateBreakRemoveTotal}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                  >
                    Calculate ({breakRemoveAreas.length})
                  </button>
                  <button
                    onClick={validateBreakRemoveEntry}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700"
                  >
                    Validate
                  </button>
                </div>
              </div>
            </div>

            {/* Jack Hammering Test */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-yellow-900 mb-4">Jack Hammering</h2>
              <div className="space-y-3">
                <select
                  value={jackhammerEquipment}
                  onChange={(e) => setJackhammerEquipment(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Equipment...</option>
                  <option value="hilti_1000">Hilti 1000</option>
                  <option value="hilti_3000">Hilti 3000</option>
                  <option value="other">Other</option>
                </select>
                {jackhammerEquipment === 'other' && (
                  <input
                    type="text"
                    placeholder="Specify equipment..."
                    value={jackhammerOther}
                    onChange={(e) => setJackhammerOther(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Length (ft)"
                    step="0.1"
                    value={jackhammerLength}
                    onChange={(e) => setJackhammerLength(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Width (ft)"
                    step="0.1"
                    value={jackhammerWidth}
                    onChange={(e) => setJackhammerWidth(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                </div>
                <button
                  onClick={addJackhammerArea}
                  className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700"
                >
                  Add Area
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={calculateJackhammerTotal}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                  >
                    Calculate ({jackhammerAreas.length})
                  </button>
                  <button
                    onClick={validateJackhammerEntry}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700"
                  >
                    Validate
                  </button>
                </div>
              </div>
            </div>

            {/* Brokk Test */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Brokk</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    placeholder="Length (ft)"
                    step="0.1"
                    value={brokkLength}
                    onChange={(e) => setBrokkLength(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Width (ft)"
                    step="0.1"
                    value={brokkWidth}
                    onChange={(e) => setBrokkWidth(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Thick (in)"
                    step="0.25"
                    value={brokkThickness}
                    onChange={(e) => setBrokkThickness(parseFloat(e.target.value) || 0)}
                    className="px-3 py-2 border rounded-lg"
                  />
                </div>
                <button
                  onClick={addBrokkArea}
                  className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg font-semibold hover:bg-gray-800"
                >
                  Add Area
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={calculateBrokkTotal}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
                  >
                    Calculate ({brokkAreas.length})
                  </button>
                  <button
                    onClick={calculateBrokkAvgThickness}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
                  >
                    Avg Thickness
                  </button>
                </div>
              </div>
            </div>

            {/* Database Tests */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-bold text-indigo-900 mb-4">Database Tests</h2>
              <div className="space-y-3">
                <button
                  onClick={testDatabaseConnection}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400"
                >
                  {loading ? 'Testing...' : 'Test Database Connection'}
                </button>
                <button
                  onClick={testWorkPerformedAPI}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400"
                >
                  {loading ? 'Testing...' : 'Test Work Performed API'}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Logs */}
          <div className="bg-white rounded-2xl shadow-xl p-6 h-fit lg:sticky lg:top-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">Test Results</h2>
              <button
                onClick={clearLogs}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600"
              >
                Clear
              </button>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 h-[800px] overflow-y-auto font-mono text-sm">
              {testResults.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No test results yet. Run some tests!</p>
              ) : (
                <div className="space-y-2">
                  {testResults.map((result, index) => (
                    <div
                      key={index}
                      className={`p-2 rounded ${
                        result.type === 'success' ? 'bg-green-900/30 text-green-300' :
                        result.type === 'error' ? 'bg-red-900/30 text-red-300' :
                        'bg-blue-900/30 text-blue-300'
                      }`}
                    >
                      <span className="text-gray-500 text-xs">[{result.timestamp}]</span>{' '}
                      <span>{result.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
