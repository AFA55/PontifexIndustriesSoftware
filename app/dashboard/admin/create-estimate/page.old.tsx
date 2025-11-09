'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Save,
  FileText,
  Mail,
  ArrowLeft,
  Settings,
  DollarSign
} from 'lucide-react';

// Types
interface ProjectInfo {
  date: string;
  contractor: string;
  contactPhone: string;
  jobName: string;
  techLaborRate: number;
  laborerRate: number;
  mileageRate: number;
}

interface CoreDrillingItem {
  id: string;
  description: string;
  quantity: number;
  length: number;
  width: number;
  depth: number;
  lengthInterval: number;
  widthInterval: number;
  complexity: number;
}

interface WallSawingItem {
  id: string;
  description: string;
  quantity: number;
  length: number;
  width: number;
  depth: number;
  complexity: number;
}

interface HandHeldChainSawItem {
  id: string;
  description: string;
  quantity: number;
  length: number;
  depth: number;
  complexity: number;
}

interface HandSawItem {
  id: string;
  description: string;
  quantity: number;
  length: number;
  depth: number;
  complexity: number;
}

interface SlabSawingItem {
  id: string;
  description: string;
  quantity: number;
  length: number;
  width: number;
  depth: number;
  complexity: number;
}

interface LaborItem {
  id: string;
  description: string;
  hours: number;
  complexity: number;
}

interface AdditionalCosts {
  mileageDistance: number;
  mileageTrips: number;
  techTravelHours: number;
  traineeTravelHours: number;
  equipmentManNights: number;
  perDiems: number;
  outsideLaborerRate: number;
  outsideLaborerHours: number;
  overtimePremium: number;
  slurryDisposal: number;
  avettaFee: number;
  isnFee: number;
  materials: number;
  equipmentRentals: number;
  trucking: number;
  dumpFees: number;
  adjustments: number;
}

export default function CreateEstimate() {
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    date: new Date().toISOString().split('T')[0],
    contractor: '',
    contactPhone: '',
    jobName: '',
    techLaborRate: 29,
    laborerRate: 22,
    mileageRate: 0.80,
  });

  const [coreDrillingItems, setCoreDrillingItems] = useState<CoreDrillingItem[]>([]);
  const [wallSawingItems, setWallSawingItems] = useState<WallSawingItem[]>([]);
  const [handHeldChainSawItems, setHandHeldChainSawItems] = useState<HandHeldChainSawItem[]>([]);
  const [handSawItems, setHandSawItems] = useState<HandSawItem[]>([]);
  const [slabSawingItems, setSlabSawingItems] = useState<SlabSawingItem[]>([]);
  const [laborItems, setLaborItems] = useState<LaborItem[]>([]);

  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCosts>({
    mileageDistance: 0,
    mileageTrips: 1,
    techTravelHours: 0,
    traineeTravelHours: 0,
    equipmentManNights: 0,
    perDiems: 0,
    outsideLaborerRate: 0,
    outsideLaborerHours: 0,
    overtimePremium: 0,
    slurryDisposal: 0,
    avettaFee: 0,
    isnFee: 0,
    materials: 0,
    equipmentRentals: 0,
    trucking: 0,
    dumpFees: 0,
    adjustments: 0,
  });

  // Section expansion states
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    projectInfo: true,
    coreDrilling: false,
    wallSawing: false,
    handHeldChainSaw: false,
    handSaw: false,
    slabSawing: false,
    labor: false,
    additionalCosts: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Calculation functions
  const calculateCoreDrillingCost = (item: CoreDrillingItem): number => {
    const totalHoles = item.quantity;
    const footagePerHole = item.depth / 12; // Convert inches to feet
    const totalFootage = totalHoles * footagePerHole;

    // Base cost calculation
    const laborHours = (totalFootage * 0.15); // Approximate labor hours per foot
    const laborCost = laborHours * projectInfo.techLaborRate;
    const diamondCost = totalFootage * 2.5; // $2.50 per foot diamond wear
    const baseCost = laborCost + diamondCost;

    // Apply complexity adjustment
    return baseCost * (1 + item.complexity / 100);
  };

  const calculateWallSawingCost = (item: WallSawingItem): number => {
    const totalArea = item.quantity * item.length * item.depth / 144; // Convert to sq ft
    const laborHours = totalArea * 0.25;
    const laborCost = laborHours * projectInfo.techLaborRate;
    const diamondCost = (item.length * item.quantity) * 3.5;
    const baseCost = laborCost + diamondCost;

    return baseCost * (1 + item.complexity / 100);
  };

  const calculateHandHeldChainSawCost = (item: HandHeldChainSawItem): number => {
    const totalLinearFeet = item.quantity * item.length;
    const laborHours = totalLinearFeet * 0.2;
    const laborCost = laborHours * projectInfo.techLaborRate;
    const baseCost = laborCost + (totalLinearFeet * 4.0);

    return baseCost * (1 + item.complexity / 100);
  };

  const calculateHandSawCost = (item: HandSawItem): number => {
    const totalLinearFeet = item.quantity * item.length;
    const laborHours = totalLinearFeet * 0.18;
    const laborCost = laborHours * projectInfo.techLaborRate;
    const baseCost = laborCost + (totalLinearFeet * 3.0);

    return baseCost * (1 + item.complexity / 100);
  };

  const calculateSlabSawingCost = (item: SlabSawingItem): number => {
    const totalLinearFeet = item.quantity * item.length;
    const laborHours = totalLinearFeet * 0.12;
    const laborCost = laborHours * projectInfo.techLaborRate;
    const baseCost = laborCost + (totalLinearFeet * 2.0);

    return baseCost * (1 + item.complexity / 100);
  };

  const calculateLaborCost = (item: LaborItem): number => {
    const baseCost = item.hours * projectInfo.laborerRate;
    return baseCost * (1 + item.complexity / 100);
  };

  // Total calculations
  const coreDrillingTotal = coreDrillingItems.reduce((sum, item) => sum + calculateCoreDrillingCost(item), 0);
  const wallSawingTotal = wallSawingItems.reduce((sum, item) => sum + calculateWallSawingCost(item), 0);
  const handHeldChainSawTotal = handHeldChainSawItems.reduce((sum, item) => sum + calculateHandHeldChainSawCost(item), 0);
  const handSawTotal = handSawItems.reduce((sum, item) => sum + calculateHandSawCost(item), 0);
  const slabSawingTotal = slabSawingItems.reduce((sum, item) => sum + calculateSlabSawingCost(item), 0);
  const laborTotal = laborItems.reduce((sum, item) => sum + calculateLaborCost(item), 0);

  const servicesSubtotal = coreDrillingTotal + wallSawingTotal + handHeldChainSawTotal + handSawTotal + slabSawingTotal + laborTotal;

  // Additional costs calculations
  const shopFees = servicesSubtotal * 0.15; // 15% shop fee
  const mileageCost = additionalCosts.mileageDistance * additionalCosts.mileageTrips * projectInfo.mileageRate * 2; // Round trip
  const travelCost = (additionalCosts.techTravelHours * projectInfo.techLaborRate) + (additionalCosts.traineeTravelHours * projectInfo.laborerRate);
  const equipmentCost = additionalCosts.equipmentManNights * 150; // $150 per man/night
  const outsideLaborCost = additionalCosts.outsideLaborerHours * additionalCosts.outsideLaborerRate;

  const additionalCostsTotal = shopFees + mileageCost + travelCost + equipmentCost +
    additionalCosts.perDiems + outsideLaborCost + additionalCosts.slurryDisposal +
    additionalCosts.avettaFee + additionalCosts.isnFee + additionalCosts.materials +
    additionalCosts.equipmentRentals + additionalCosts.trucking + additionalCosts.dumpFees +
    additionalCosts.adjustments;

  const grandTotal = servicesSubtotal + additionalCostsTotal;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-white/20 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin"
                className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-medium">Back to Admin</span>
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Create New Estimate
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors font-medium">
                <Save className="w-4 h-4" />
                Save Draft
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form Column */}
          <div className="lg:col-span-2 space-y-4">

            {/* Project Info Section */}
            <CollapsibleSection
              title="📋 Project Information"
              isExpanded={expandedSections.projectInfo}
              onToggle={() => toggleSection('projectInfo')}
              itemCount={0}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={projectInfo.date}
                    onChange={(e) => setProjectInfo({ ...projectInfo, date: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contractor Name</label>
                  <input
                    type="text"
                    value={projectInfo.contractor}
                    onChange={(e) => setProjectInfo({ ...projectInfo, contractor: e.target.value })}
                    placeholder="Enter contractor name"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact/Phone</label>
                  <input
                    type="text"
                    value={projectInfo.contactPhone}
                    onChange={(e) => setProjectInfo({ ...projectInfo, contactPhone: e.target.value })}
                    placeholder="Enter contact info"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Name</label>
                  <input
                    type="text"
                    value={projectInfo.jobName}
                    onChange={(e) => setProjectInfo({ ...projectInfo, jobName: e.target.value })}
                    placeholder="Enter job name"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tech Labor Rate ($/hr)</label>
                  <input
                    type="number"
                    value={projectInfo.techLaborRate}
                    onChange={(e) => setProjectInfo({ ...projectInfo, techLaborRate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Laborer Rate ($/hr)</label>
                  <input
                    type="number"
                    value={projectInfo.laborerRate}
                    onChange={(e) => setProjectInfo({ ...projectInfo, laborerRate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mileage Rate ($/mile)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={projectInfo.mileageRate}
                    onChange={(e) => setProjectInfo({ ...projectInfo, mileageRate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Core Drilling Section */}
            <CoreDrillingSection
              items={coreDrillingItems}
              setItems={setCoreDrillingItems}
              isExpanded={expandedSections.coreDrilling}
              onToggle={() => toggleSection('coreDrilling')}
              calculateCost={calculateCoreDrillingCost}
            />

            {/* Wall Sawing Section */}
            <WallSawingSection
              items={wallSawingItems}
              setItems={setWallSawingItems}
              isExpanded={expandedSections.wallSawing}
              onToggle={() => toggleSection('wallSawing')}
              calculateCost={calculateWallSawingCost}
            />

            {/* Hand Held Chain Saw Section */}
            <HandHeldChainSawSection
              items={handHeldChainSawItems}
              setItems={setHandHeldChainSawItems}
              isExpanded={expandedSections.handHeldChainSaw}
              onToggle={() => toggleSection('handHeldChainSaw')}
              calculateCost={calculateHandHeldChainSawCost}
            />

            {/* Hand Saw Section */}
            <HandSawSection
              items={handSawItems}
              setItems={setHandSawItems}
              isExpanded={expandedSections.handSaw}
              onToggle={() => toggleSection('handSaw')}
              calculateCost={calculateHandSawCost}
            />

            {/* Slab Sawing Section */}
            <SlabSawingSection
              items={slabSawingItems}
              setItems={setSlabSawingItems}
              isExpanded={expandedSections.slabSawing}
              onToggle={() => toggleSection('slabSawing')}
              calculateCost={calculateSlabSawingCost}
            />

            {/* Labor Section */}
            <LaborSection
              items={laborItems}
              setItems={setLaborItems}
              isExpanded={expandedSections.labor}
              onToggle={() => toggleSection('labor')}
              calculateCost={calculateLaborCost}
            />

            {/* Additional Costs Section */}
            <AdditionalCostsSection
              costs={additionalCosts}
              setCosts={setAdditionalCosts}
              isExpanded={expandedSections.additionalCosts}
              onToggle={() => toggleSection('additionalCosts')}
              shopFees={shopFees}
              mileageCost={mileageCost}
              travelCost={travelCost}
              equipmentCost={equipmentCost}
              outsideLaborCost={outsideLaborCost}
            />

          </div>

          {/* Sticky Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  Estimate Summary
                </h3>

                {/* Services Subtotals */}
                <div className="space-y-2 mb-4 pb-4 border-b border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Services</h4>
                  {coreDrillingTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Core Drilling</span>
                      <span className="font-semibold text-gray-800">${coreDrillingTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {wallSawingTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Wall Sawing</span>
                      <span className="font-semibold text-gray-800">${wallSawingTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {handHeldChainSawTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Hand Held Chain Saw</span>
                      <span className="font-semibold text-gray-800">${handHeldChainSawTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {handSawTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Hand Saw</span>
                      <span className="font-semibold text-gray-800">${handSawTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {slabSawingTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Slab Sawing</span>
                      <span className="font-semibold text-gray-800">${slabSawingTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {laborTotal > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Labor</span>
                      <span className="font-semibold text-gray-800">${laborTotal.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Additional Costs */}
                <div className="space-y-2 mb-4 pb-4 border-b border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Additional Costs</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Shop Fees (15%)</span>
                    <span className="font-semibold text-gray-800">${shopFees.toFixed(2)}</span>
                  </div>
                  {mileageCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Mileage</span>
                      <span className="font-semibold text-gray-800">${mileageCost.toFixed(2)}</span>
                    </div>
                  )}
                  {travelCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Travel</span>
                      <span className="font-semibold text-gray-800">${travelCost.toFixed(2)}</span>
                    </div>
                  )}
                  {equipmentCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Equipment</span>
                      <span className="font-semibold text-gray-800">${equipmentCost.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Grand Total */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-800">GRAND TOTAL</span>
                    <span className="text-2xl font-bold text-blue-600">${grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all">
                    <FileText className="w-4 h-4" />
                    Generate PDF
                  </button>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all">
                    <Mail className="w-4 h-4" />
                    Email to Client
                  </button>
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all">
                    <Save className="w-4 h-4" />
                    Save & Continue
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  itemCount?: number;
  children: React.ReactNode;
}

function CollapsibleSection({ title, isExpanded, onToggle, itemCount, children }: CollapsibleSectionProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          {itemCount !== undefined && itemCount > 0 && (
            <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-5 pt-0 border-t border-gray-100">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Core Drilling Section Component
interface CoreDrillingSectionProps {
  items: CoreDrillingItem[];
  setItems: (items: CoreDrillingItem[]) => void;
  isExpanded: boolean;
  onToggle: () => void;
  calculateCost: (item: CoreDrillingItem) => number;
}

function CoreDrillingSection({ items, setItems, isExpanded, onToggle, calculateCost }: CoreDrillingSectionProps) {
  const addItem = () => {
    const newItem: CoreDrillingItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      length: 0,
      width: 0,
      depth: 0,
      lengthInterval: 0,
      widthInterval: 0,
      complexity: 0,
    };
    setItems([...items, newItem]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<CoreDrillingItem>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  return (
    <CollapsibleSection
      title="⚙️ Core/Diamond Drilling"
      isExpanded={isExpanded}
      onToggle={onToggle}
      itemCount={items.length}
    >
      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={item.id} className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-start justify-between mb-3">
              <h4 className="font-semibold text-gray-700">Item {index + 1}</h4>
              <button
                onClick={() => removeItem(item.id)}
                className="text-red-500 hover:text-red-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateItem(item.id, { description: e.target.value })}
                placeholder="Description (e.g., Elevator shaft cores)"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
              />

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Depth (inches)</label>
                  <input
                    type="number"
                    value={item.depth}
                    onChange={(e) => updateItem(item.id, { depth: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Complexity</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={item.complexity}
                      onChange={(e) => updateItem(item.id, { complexity: parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-sm font-semibold text-blue-600 w-12">+{item.complexity}%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-600">Item Cost:</span>
                <span className="text-lg font-bold text-blue-600">${calculateCost(item).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addItem}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-medium transition-colors border-2 border-dashed border-blue-300"
        >
          <Plus className="w-5 h-5" />
          Add Core Drilling Item
        </button>
      </div>
    </CollapsibleSection>
  );
}

// Wall Sawing Section (similar structure)
interface WallSawingSectionProps {
  items: WallSawingItem[];
  setItems: (items: WallSawingItem[]) => void;
  isExpanded: boolean;
  onToggle: () => void;
  calculateCost: (item: WallSawingItem) => number;
}

function WallSawingSection({ items, setItems, isExpanded, onToggle, calculateCost }: WallSawingSectionProps) {
  const addItem = () => {
    const newItem: WallSawingItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      length: 0,
      width: 0,
      depth: 0,
      complexity: 0,
    };
    setItems([...items, newItem]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<WallSawingItem>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  return (
    <CollapsibleSection
      title="🧱 Wall Sawing"
      isExpanded={isExpanded}
      onToggle={onToggle}
      itemCount={items.length}
    >
      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={item.id} className="bg-gradient-to-br from-gray-50 to-red-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-start justify-between mb-3">
              <h4 className="font-semibold text-gray-700">Item {index + 1}</h4>
              <button
                onClick={() => removeItem(item.id)}
                className="text-red-500 hover:text-red-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateItem(item.id, { description: e.target.value })}
                placeholder="Description (e.g., Wall opening for door)"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Length (ft)</label>
                  <input
                    type="number"
                    value={item.length}
                    onChange={(e) => updateItem(item.id, { length: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Depth (in)</label>
                  <input
                    type="number"
                    value={item.depth}
                    onChange={(e) => updateItem(item.id, { depth: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Complexity</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={item.complexity}
                      onChange={(e) => updateItem(item.id, { complexity: parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-sm font-semibold text-red-600 w-12">+{item.complexity}%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-600">Item Cost:</span>
                <span className="text-lg font-bold text-red-600">${calculateCost(item).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addItem}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium transition-colors border-2 border-dashed border-red-300"
        >
          <Plus className="w-5 h-5" />
          Add Wall Sawing Item
        </button>
      </div>
    </CollapsibleSection>
  );
}

// Simplified versions for other sections (following same pattern)
function HandHeldChainSawSection({ items, setItems, isExpanded, onToggle, calculateCost }: any) {
  const addItem = () => {
    setItems([...items, { id: Date.now().toString(), description: '', quantity: 1, length: 0, depth: 0, complexity: 0 }]);
  };

  return (
    <CollapsibleSection title="✋ Hand Held Chain Saw" isExpanded={isExpanded} onToggle={onToggle} itemCount={items.length}>
      <div className="space-y-4">
        {items.map((item: HandHeldChainSawItem, index: number) => (
          <div key={item.id} className="bg-gradient-to-br from-gray-50 to-green-50 rounded-xl p-4 border border-gray-200">
            <div className="flex justify-between mb-3">
              <h4 className="font-semibold text-gray-700">Item {index + 1}</h4>
              <button onClick={() => setItems(items.filter((i: HandHeldChainSawItem) => i.id !== item.id))} className="text-red-500 hover:text-red-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={item.description}
                onChange={(e) => setItems(items.map((i: HandHeldChainSawItem) => i.id === item.id ? { ...i, description: e.target.value } : i))}
                placeholder="Description"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                  <input type="number" value={item.quantity} onChange={(e) => setItems(items.map((i: HandHeldChainSawItem) => i.id === item.id ? { ...i, quantity: parseFloat(e.target.value) || 0 } : i))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Length (ft)</label>
                  <input type="number" value={item.length} onChange={(e) => setItems(items.map((i: HandHeldChainSawItem) => i.id === item.id ? { ...i, length: parseFloat(e.target.value) || 0 } : i))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Depth (in)</label>
                  <input type="number" value={item.depth} onChange={(e) => setItems(items.map((i: HandHeldChainSawItem) => i.id === item.id ? { ...i, depth: parseFloat(e.target.value) || 0 } : i))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Complexity</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="0" max="100" value={item.complexity} onChange={(e) => setItems(items.map((i: HandHeldChainSawItem) => i.id === item.id ? { ...i, complexity: parseFloat(e.target.value) } : i))} className="flex-1" />
                    <span className="text-sm font-semibold text-green-600 w-12">+{item.complexity}%</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-600">Item Cost:</span>
                <span className="text-lg font-bold text-green-600">${calculateCost(item).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
        <button onClick={addItem} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-50 hover:bg-green-100 text-green-600 rounded-xl font-medium transition-colors border-2 border-dashed border-green-300">
          <Plus className="w-5 h-5" />
          Add Chain Saw Item
        </button>
      </div>
    </CollapsibleSection>
  );
}

function HandSawSection({ items, setItems, isExpanded, onToggle, calculateCost }: any) {
  const addItem = () => {
    setItems([...items, { id: Date.now().toString(), description: '', quantity: 1, length: 0, depth: 0, complexity: 0 }]);
  };

  return (
    <CollapsibleSection title="🪚 Hand Saw" isExpanded={isExpanded} onToggle={onToggle} itemCount={items.length}>
      <div className="space-y-4">
        {items.map((item: HandSawItem, index: number) => (
          <div key={item.id} className="bg-gradient-to-br from-gray-50 to-yellow-50 rounded-xl p-4 border border-gray-200">
            <div className="flex justify-between mb-3">
              <h4 className="font-semibold text-gray-700">Item {index + 1}</h4>
              <button onClick={() => setItems(items.filter((i: HandSawItem) => i.id !== item.id))} className="text-red-500 hover:text-red-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={item.description}
                onChange={(e) => setItems(items.map((i: HandSawItem) => i.id === item.id ? { ...i, description: e.target.value } : i))}
                placeholder="Description"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                  <input type="number" value={item.quantity} onChange={(e) => setItems(items.map((i: HandSawItem) => i.id === item.id ? { ...i, quantity: parseFloat(e.target.value) || 0 } : i))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Length (ft)</label>
                  <input type="number" value={item.length} onChange={(e) => setItems(items.map((i: HandSawItem) => i.id === item.id ? { ...i, length: parseFloat(e.target.value) || 0 } : i))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Depth (in)</label>
                  <input type="number" value={item.depth} onChange={(e) => setItems(items.map((i: HandSawItem) => i.id === item.id ? { ...i, depth: parseFloat(e.target.value) || 0 } : i))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Complexity</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="0" max="100" value={item.complexity} onChange={(e) => setItems(items.map((i: HandSawItem) => i.id === item.id ? { ...i, complexity: parseFloat(e.target.value) } : i))} className="flex-1" />
                    <span className="text-sm font-semibold text-yellow-600 w-12">+{item.complexity}%</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-600">Item Cost:</span>
                <span className="text-lg font-bold text-yellow-600">${calculateCost(item).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
        <button onClick={addItem} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-yellow-50 hover:bg-yellow-100 text-yellow-600 rounded-xl font-medium transition-colors border-2 border-dashed border-yellow-300">
          <Plus className="w-5 h-5" />
          Add Hand Saw Item
        </button>
      </div>
    </CollapsibleSection>
  );
}

function SlabSawingSection({ items, setItems, isExpanded, onToggle, calculateCost }: any) {
  const addItem = () => {
    setItems([...items, { id: Date.now().toString(), description: '', quantity: 1, length: 0, width: 0, depth: 0, complexity: 0 }]);
  };

  return (
    <CollapsibleSection title="📐 Slab Sawing" isExpanded={isExpanded} onToggle={onToggle} itemCount={items.length}>
      <div className="space-y-4">
        {items.map((item: SlabSawingItem, index: number) => (
          <div key={item.id} className="bg-gradient-to-br from-gray-50 to-purple-50 rounded-xl p-4 border border-gray-200">
            <div className="flex justify-between mb-3">
              <h4 className="font-semibold text-gray-700">Item {index + 1}</h4>
              <button onClick={() => setItems(items.filter((i: SlabSawingItem) => i.id !== item.id))} className="text-red-500 hover:text-red-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={item.description}
                onChange={(e) => setItems(items.map((i: SlabSawingItem) => i.id === item.id ? { ...i, description: e.target.value } : i))}
                placeholder="Description"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                  <input type="number" value={item.quantity} onChange={(e) => setItems(items.map((i: SlabSawingItem) => i.id === item.id ? { ...i, quantity: parseFloat(e.target.value) || 0 } : i))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Length (ft)</label>
                  <input type="number" value={item.length} onChange={(e) => setItems(items.map((i: SlabSawingItem) => i.id === item.id ? { ...i, length: parseFloat(e.target.value) || 0 } : i))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Depth (in)</label>
                  <input type="number" value={item.depth} onChange={(e) => setItems(items.map((i: SlabSawingItem) => i.id === item.id ? { ...i, depth: parseFloat(e.target.value) || 0 } : i))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Complexity</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="0" max="100" value={item.complexity} onChange={(e) => setItems(items.map((i: SlabSawingItem) => i.id === item.id ? { ...i, complexity: parseFloat(e.target.value) } : i))} className="flex-1" />
                    <span className="text-sm font-semibold text-purple-600 w-12">+{item.complexity}%</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-600">Item Cost:</span>
                <span className="text-lg font-bold text-purple-600">${calculateCost(item).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
        <button onClick={addItem} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded-xl font-medium transition-colors border-2 border-dashed border-purple-300">
          <Plus className="w-5 h-5" />
          Add Slab Sawing Item
        </button>
      </div>
    </CollapsibleSection>
  );
}

function LaborSection({ items, setItems, isExpanded, onToggle, calculateCost }: any) {
  const addItem = () => {
    setItems([...items, { id: Date.now().toString(), description: '', hours: 0, complexity: 0 }]);
  };

  return (
    <CollapsibleSection title="👷 Standalone Labor" isExpanded={isExpanded} onToggle={onToggle} itemCount={items.length}>
      <div className="space-y-4">
        {items.map((item: LaborItem, index: number) => (
          <div key={item.id} className="bg-gradient-to-br from-gray-50 to-orange-50 rounded-xl p-4 border border-gray-200">
            <div className="flex justify-between mb-3">
              <h4 className="font-semibold text-gray-700">Item {index + 1}</h4>
              <button onClick={() => setItems(items.filter((i: LaborItem) => i.id !== item.id))} className="text-red-500 hover:text-red-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={item.description}
                onChange={(e) => setItems(items.map((i: LaborItem) => i.id === item.id ? { ...i, description: e.target.value } : i))}
                placeholder="Description"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Hours</label>
                  <input type="number" value={item.hours} onChange={(e) => setItems(items.map((i: LaborItem) => i.id === item.id ? { ...i, hours: parseFloat(e.target.value) || 0 } : i))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Complexity</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min="0" max="100" value={item.complexity} onChange={(e) => setItems(items.map((i: LaborItem) => i.id === item.id ? { ...i, complexity: parseFloat(e.target.value) } : i))} className="flex-1" />
                    <span className="text-sm font-semibold text-orange-600 w-12">+{item.complexity}%</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                <span className="text-sm font-medium text-gray-600">Item Cost:</span>
                <span className="text-lg font-bold text-orange-600">${calculateCost(item).toFixed(2)}</span>
              </div>
            </div>
          </div>
        ))}
        <button onClick={addItem} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl font-medium transition-colors border-2 border-dashed border-orange-300">
          <Plus className="w-5 h-5" />
          Add Labor Item
        </button>
      </div>
    </CollapsibleSection>
  );
}

function AdditionalCostsSection({ costs, setCosts, isExpanded, onToggle, shopFees, mileageCost, travelCost, equipmentCost, outsideLaborCost }: any) {
  return (
    <CollapsibleSection title="💰 Additional Costs" isExpanded={isExpanded} onToggle={onToggle}>
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
          <h4 className="font-semibold text-gray-700 mb-2">Auto-Calculated Costs</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Shop Fees (15%)</span>
              <span className="font-semibold text-gray-800">${shopFees.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mileage Distance (miles)</label>
            <input
              type="number"
              value={costs.mileageDistance}
              onChange={(e) => setCosts({ ...costs, mileageDistance: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of Trips</label>
            <input
              type="number"
              value={costs.mileageTrips}
              onChange={(e) => setCosts({ ...costs, mileageTrips: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tech Travel Hours</label>
            <input
              type="number"
              value={costs.techTravelHours}
              onChange={(e) => setCosts({ ...costs, techTravelHours: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Equipment (man/nights)</label>
            <input
              type="number"
              value={costs.equipmentManNights}
              onChange={(e) => setCosts({ ...costs, equipmentManNights: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Per Diems ($)</label>
            <input
              type="number"
              value={costs.perDiems}
              onChange={(e) => setCosts({ ...costs, perDiems: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Materials ($)</label>
            <input
              type="number"
              value={costs.materials}
              onChange={(e) => setCosts({ ...costs, materials: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Equipment Rentals ($)</label>
            <input
              type="number"
              value={costs.equipmentRentals}
              onChange={(e) => setCosts({ ...costs, equipmentRentals: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adjustments (+/-)</label>
            <input
              type="number"
              value={costs.adjustments}
              onChange={(e) => setCosts({ ...costs, adjustments: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
