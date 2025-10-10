'use client';

import React, { useState } from 'react';
import { Calculator, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type CalculatorMode = 'sqft' | 'cubicyd' | 'convert' | 'grid' | 'basic';

export function QuickCalculator() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<CalculatorMode>('sqft');

  // Square Footage Calculator
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');

  // Cubic Yards Calculator
  const [cubicLength, setCubicLength] = useState('');
  const [cubicWidth, setCubicWidth] = useState('');
  const [cubicDepth, setCubicDepth] = useState('');

  // Conversion Calculator
  const [feet, setFeet] = useState('');

  // Grid Calculator
  const [gridLength, setGridLength] = useState('');
  const [gridWidth, setGridWidth] = useState('');
  const [gridSpacingLength, setGridSpacingLength] = useState('');
  const [gridSpacingWidth, setGridSpacingWidth] = useState('');

  // Results
  const sqft = length && width ? (parseFloat(length) * parseFloat(width)).toFixed(2) : '0.00';
  const cubicYards = cubicLength && cubicWidth && cubicDepth
    ? ((parseFloat(cubicLength) * parseFloat(cubicWidth) * parseFloat(cubicDepth)) / 27).toFixed(2)
    : '0.00';
  const inches = feet ? (parseFloat(feet) * 12).toFixed(2) : '0.00';
  const gridCores = gridLength && gridWidth && gridSpacingLength && gridSpacingWidth
    ? Math.ceil(parseFloat(gridLength) / parseFloat(gridSpacingLength)) *
      Math.ceil(parseFloat(gridWidth) / parseFloat(gridSpacingWidth))
    : 0;

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-accent text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Open quick calculator"
      >
        <Calculator className="w-6 h-6" />
      </motion.button>

      {/* Calculator Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
            >
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-accent p-4 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    <h3 className="font-bold">Quick Calculator</h3>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Mode Selector */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {[
                      { id: 'sqft', label: 'Sq Ft' },
                      { id: 'cubicyd', label: 'Cubic Yds' },
                      { id: 'convert', label: 'Convert' },
                      { id: 'grid', label: 'Grid Cores' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setMode(m.id as CalculatorMode)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                          mode === m.id
                            ? 'bg-primary-500 text-white shadow-lg'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calculator Content */}
                <div className="p-6 space-y-4">
                  {mode === 'sqft' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Length (ft)
                        </label>
                        <input
                          type="number"
                          value={length}
                          onChange={(e) => setLength(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900 transition-all"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Width (ft)
                        </label>
                        <input
                          type="number"
                          value={width}
                          onChange={(e) => setWidth(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900 transition-all"
                          placeholder="0"
                        />
                      </div>
                      <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Area</p>
                        <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                          {sqft} sq ft
                        </p>
                      </div>
                    </>
                  )}

                  {mode === 'cubicyd' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Length (ft)
                        </label>
                        <input
                          type="number"
                          value={cubicLength}
                          onChange={(e) => setCubicLength(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:border-primary-500 transition-all"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Width (ft)
                        </label>
                        <input
                          type="number"
                          value={cubicWidth}
                          onChange={(e) => setCubicWidth(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:border-primary-500 transition-all"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Depth (ft)
                        </label>
                        <input
                          type="number"
                          value={cubicDepth}
                          onChange={(e) => setCubicDepth(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:border-primary-500 transition-all"
                          placeholder="0"
                        />
                      </div>
                      <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Cubic Yards</p>
                        <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                          {cubicYards} yd³
                        </p>
                      </div>
                    </>
                  )}

                  {mode === 'convert' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Feet
                        </label>
                        <input
                          type="number"
                          value={feet}
                          onChange={(e) => setFeet(e.target.value)}
                          className="w-full px-4 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:border-primary-500 transition-all"
                          placeholder="0"
                        />
                      </div>
                      <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Inches</p>
                        <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                          {inches} in
                        </p>
                      </div>
                    </>
                  )}

                  {mode === 'grid' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Area Length (ft)
                          </label>
                          <input
                            type="number"
                            value={gridLength}
                            onChange={(e) => setGridLength(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:border-primary-500 transition-all text-sm"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Area Width (ft)
                          </label>
                          <input
                            type="number"
                            value={gridWidth}
                            onChange={(e) => setGridWidth(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:border-primary-500 transition-all text-sm"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Spacing L (ft)
                          </label>
                          <input
                            type="number"
                            value={gridSpacingLength}
                            onChange={(e) => setGridSpacingLength(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:border-primary-500 transition-all text-sm"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Spacing W (ft)
                          </label>
                          <input
                            type="number"
                            value={gridSpacingWidth}
                            onChange={(e) => setGridSpacingWidth(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:border-primary-500 transition-all text-sm"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      <div className="bg-primary-50 dark:bg-primary-900/20 rounded-xl p-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Cores Needed</p>
                        <p className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                          {gridCores} cores
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
