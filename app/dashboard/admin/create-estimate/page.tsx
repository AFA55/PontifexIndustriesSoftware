'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, FileText, Mail, Plus, X, DollarSign, Calculator } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ==================== TYPES ====================
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
  depth: number;
  complexity: number;
}

interface WallSawingItem {
  id: string;
  description: string;
  quantity: number;
  length: number;
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
  materials: number;
  equipmentRentals: number;
  adjustments: number;
}

export default function ModernEstimateBuilder() {
  // State
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
    materials: 0,
    equipmentRentals: 0,
    adjustments: 0,
  });

  const [expandedSection, setExpandedSection] = useState<string | null>('projectInfo');

  // ==================== CALCULATIONS ====================
  const calculateCoreDrillingCost = (item: CoreDrillingItem): number => {
    const footagePerHole = item.depth / 12;
    const totalFootage = item.quantity * footagePerHole;
    const laborHours = totalFootage * 0.15;
    const laborCost = laborHours * projectInfo.techLaborRate;
    const diamondCost = totalFootage * 2.5;
    const baseCost = laborCost + diamondCost;
    return baseCost * (1 + item.complexity / 100);
  };

  const calculateWallSawingCost = (item: WallSawingItem): number => {
    const totalLinearFeet = item.quantity * item.length;
    const laborHours = totalLinearFeet * 0.25;
    const laborCost = laborHours * projectInfo.techLaborRate;
    const diamondCost = totalLinearFeet * 3.5;
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

  const coreDrillingTotal = coreDrillingItems.reduce((sum, item) => sum + calculateCoreDrillingCost(item), 0);
  const wallSawingTotal = wallSawingItems.reduce((sum, item) => sum + calculateWallSawingCost(item), 0);
  const handHeldChainSawTotal = handHeldChainSawItems.reduce((sum, item) => sum + calculateHandHeldChainSawCost(item), 0);
  const handSawTotal = handSawItems.reduce((sum, item) => sum + calculateHandSawCost(item), 0);
  const slabSawingTotal = slabSawingItems.reduce((sum, item) => sum + calculateSlabSawingCost(item), 0);
  const laborTotal = laborItems.reduce((sum, item) => sum + calculateLaborCost(item), 0);

  const servicesSubtotal = coreDrillingTotal + wallSawingTotal + handHeldChainSawTotal + handSawTotal + slabSawingTotal + laborTotal;
  const shopFees = servicesSubtotal * 0.15;
  const mileageCost = additionalCosts.mileageDistance * additionalCosts.mileageTrips * projectInfo.mileageRate * 2;
  const travelCost = (additionalCosts.techTravelHours * projectInfo.techLaborRate) + (additionalCosts.traineeTravelHours * projectInfo.laborerRate);
  const equipmentCost = additionalCosts.equipmentManNights * 150;
  const outsideLaborCost = additionalCosts.outsideLaborerHours * additionalCosts.outsideLaborerRate;

  const additionalCostsTotal = shopFees + mileageCost + travelCost + equipmentCost +
    additionalCosts.perDiems + outsideLaborCost + additionalCosts.slurryDisposal +
    additionalCosts.materials + additionalCosts.equipmentRentals + additionalCosts.adjustments;

  const grandTotal = servicesSubtotal + additionalCostsTotal;

  const completionPercentage = Math.round(
    ((projectInfo.contractor !== '' && projectInfo.jobName !== '' ? 25 : 0) +
     (coreDrillingItems.length + wallSawingItems.length + handHeldChainSawItems.length + handSawItems.length + slabSawingItems.length + laborItems.length > 0 ? 50 : 0) +
     (grandTotal > 0 ? 25 : 0))
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-200 rounded-full opacity-5 blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard/admin" className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors text-gray-700 hover:text-blue-600 border border-gray-200">
                <ArrowLeft className="w-5 h-5" />
                <span className="font-semibold hidden sm:inline">Back to Admin</span>
              </Link>
              <div className="h-8 w-px bg-gray-300" />
              <div>
                <h1 className="text-2xl font-bold gradient-text">Create New Estimate</h1>
                <p className="text-sm text-gray-600 font-medium">Professional concrete cutting estimates</p>
              </div>
            </div>
            <button className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 border-2 border-gray-300 rounded-xl transition-all font-semibold text-gray-700 shadow-sm hover:shadow-md">
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Save Draft</span>
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Estimate Progress</span>
              <span className="text-sm font-bold gradient-text">{completionPercentage}%</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
              <motion.div
                className="h-full gradient-bg-brand"
                initial={{ width: 0 }}
                animate={{ width: `${completionPercentage}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">

            {/* Project Info Card */}
            <ServiceSection
              title="Project Information"
              icon="📋"
              gradient="from-slate-500 to-slate-600"
              isExpanded={expandedSection === 'projectInfo'}
              onClick={() => setExpandedSection(expandedSection === 'projectInfo' ? null : 'projectInfo')}
              itemCount={0}
              totalCost={0}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField
                  label="Date"
                  type="date"
                  value={projectInfo.date}
                  onChange={(v) => setProjectInfo({ ...projectInfo, date: v })}
                />
                <InputField
                  label="Contractor Name"
                  value={projectInfo.contractor}
                  onChange={(v) => setProjectInfo({ ...projectInfo, contractor: v })}
                  placeholder="Enter contractor name"
                  required
                />
                <InputField
                  label="Contact/Phone"
                  type="tel"
                  value={projectInfo.contactPhone}
                  onChange={(v) => setProjectInfo({ ...projectInfo, contactPhone: v })}
                  placeholder="(555) 123-4567"
                />
                <InputField
                  label="Job Name"
                  value={projectInfo.jobName}
                  onChange={(v) => setProjectInfo({ ...projectInfo, jobName: v })}
                  placeholder="Downtown Plaza Renovation"
                  required
                />
                <InputField
                  label="Tech Labor Rate ($/hr)"
                  type="number"
                  value={projectInfo.techLaborRate.toString()}
                  onChange={(v) => setProjectInfo({ ...projectInfo, techLaborRate: parseFloat(v) || 0 })}
                />
                <InputField
                  label="Laborer Rate ($/hr)"
                  type="number"
                  value={projectInfo.laborerRate.toString()}
                  onChange={(v) => setProjectInfo({ ...projectInfo, laborerRate: parseFloat(v) || 0 })}
                />
                <InputField
                  label="Mileage Rate ($/mile)"
                  type="number"
                  step="0.01"
                  value={projectInfo.mileageRate.toString()}
                  onChange={(v) => setProjectInfo({ ...projectInfo, mileageRate: parseFloat(v) || 0 })}
                />
              </div>
            </ServiceSection>

            {/* Core Drilling */}
            <ServiceSection
              title="Core/Diamond Drilling"
              icon="⚙️"
              gradient="from-blue-500 to-blue-600"
              isExpanded={expandedSection === 'coreDrilling'}
              onClick={() => setExpandedSection(expandedSection === 'coreDrilling' ? null : 'coreDrilling')}
              itemCount={coreDrillingItems.length}
              totalCost={coreDrillingTotal}
            >
              <ItemList
                items={coreDrillingItems}
                setItems={setCoreDrillingItems}
                calculateCost={calculateCoreDrillingCost}
                addItemTemplate={() => ({ id: Date.now().toString(), description: '', quantity: 1, depth: 0, complexity: 0 })}
                renderFields={(item, updateItem) => (
                  <>
                    <InputField label="Quantity" type="number" value={item.quantity.toString()} onChange={(v) => updateItem({ quantity: parseFloat(v) || 0 })} />
                    <InputField label="Depth (inches)" type="number" value={item.depth.toString()} onChange={(v) => updateItem({ depth: parseFloat(v) || 0 })} />
                    <ComplexitySlider value={item.complexity} onChange={(v) => updateItem({ complexity: v })} />
                  </>
                )}
                color="blue"
                addButtonText="Add Core Drilling Item"
              />
            </ServiceSection>

            {/* Wall Sawing */}
            <ServiceSection
              title="Wall Sawing"
              icon="🧱"
              gradient="from-orange-500 to-red-600"
              isExpanded={expandedSection === 'wallSawing'}
              onClick={() => setExpandedSection(expandedSection === 'wallSawing' ? null : 'wallSawing')}
              itemCount={wallSawingItems.length}
              totalCost={wallSawingTotal}
            >
              <ItemList
                items={wallSawingItems}
                setItems={setWallSawingItems}
                calculateCost={calculateWallSawingCost}
                addItemTemplate={() => ({ id: Date.now().toString(), description: '', quantity: 1, length: 0, depth: 0, complexity: 0 })}
                renderFields={(item, updateItem) => (
                  <>
                    <InputField label="Quantity" type="number" value={item.quantity.toString()} onChange={(v) => updateItem({ quantity: parseFloat(v) || 0 })} />
                    <InputField label="Length (ft)" type="number" value={item.length.toString()} onChange={(v) => updateItem({ length: parseFloat(v) || 0 })} />
                    <InputField label="Depth (in)" type="number" value={item.depth.toString()} onChange={(v) => updateItem({ depth: parseFloat(v) || 0 })} />
                    <ComplexitySlider value={item.complexity} onChange={(v) => updateItem({ complexity: v })} />
                  </>
                )}
                color="red"
                addButtonText="Add Wall Sawing Item"
              />
            </ServiceSection>

            {/* Additional Costs */}
            <ServiceSection
              title="Additional Costs"
              icon="💰"
              gradient="from-green-500 to-emerald-600"
              isExpanded={expandedSection === 'additionalCosts'}
              onClick={() => setExpandedSection(expandedSection === 'additionalCosts' ? null : 'additionalCosts')}
              itemCount={0}
              totalCost={additionalCostsTotal}
            >
              <div className="space-y-4">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <h4 className="font-semibold text-gray-800 mb-2">Auto-Calculated Costs</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Shop Fees (15%)</span>
                    <span className="font-semibold text-blue-600">${shopFees.toFixed(2)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="Mileage Distance (miles)" type="number" value={additionalCosts.mileageDistance.toString()} onChange={(v) => setAdditionalCosts({ ...additionalCosts, mileageDistance: parseFloat(v) || 0 })} />
                  <InputField label="Number of Trips" type="number" value={additionalCosts.mileageTrips.toString()} onChange={(v) => setAdditionalCosts({ ...additionalCosts, mileageTrips: parseFloat(v) || 0 })} />
                  <InputField label="Tech Travel Hours" type="number" value={additionalCosts.techTravelHours.toString()} onChange={(v) => setAdditionalCosts({ ...additionalCosts, techTravelHours: parseFloat(v) || 0 })} />
                  <InputField label="Equipment (man/nights)" type="number" value={additionalCosts.equipmentManNights.toString()} onChange={(v) => setAdditionalCosts({ ...additionalCosts, equipmentManNights: parseFloat(v) || 0 })} />
                  <InputField label="Per Diems ($)" type="number" value={additionalCosts.perDiems.toString()} onChange={(v) => setAdditionalCosts({ ...additionalCosts, perDiems: parseFloat(v) || 0 })} />
                  <InputField label="Materials ($)" type="number" value={additionalCosts.materials.toString()} onChange={(v) => setAdditionalCosts({ ...additionalCosts, materials: parseFloat(v) || 0 })} />
                  <InputField label="Equipment Rentals ($)" type="number" value={additionalCosts.equipmentRentals.toString()} onChange={(v) => setAdditionalCosts({ ...additionalCosts, equipmentRentals: parseFloat(v) || 0 })} />
                  <InputField label="Adjustments (+/-)" type="number" value={additionalCosts.adjustments.toString()} onChange={(v) => setAdditionalCosts({ ...additionalCosts, adjustments: parseFloat(v) || 0 })} />
                </div>
              </div>
            </ServiceSection>

          </div>

          {/* Sticky Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-32">
              <div className="bg-white rounded-3xl shadow-xl p-6 border-2 border-gray-200">
                <h3 className="text-xl font-bold gradient-text mb-6 flex items-center gap-2 pb-3 border-b-2 border-gray-100">
                  <Calculator className="w-6 h-6 text-blue-600" />
                  Estimate Summary
                </h3>

                {/* Services Breakdown */}
                {(coreDrillingTotal > 0 || wallSawingTotal > 0 || handHeldChainSawTotal > 0 || handSawTotal > 0 || slabSawingTotal > 0 || laborTotal > 0) && (
                  <div className="space-y-2 mb-4 pb-4 border-b-2 border-gray-100">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Services</h4>
                    {coreDrillingTotal > 0 && <CostRow label="Core Drilling" amount={coreDrillingTotal} />}
                    {wallSawingTotal > 0 && <CostRow label="Wall Sawing" amount={wallSawingTotal} />}
                    {handHeldChainSawTotal > 0 && <CostRow label="Chain Saw" amount={handHeldChainSawTotal} />}
                    {handSawTotal > 0 && <CostRow label="Hand Saw" amount={handSawTotal} />}
                    {slabSawingTotal > 0 && <CostRow label="Slab Sawing" amount={slabSawingTotal} />}
                    {laborTotal > 0 && <CostRow label="Labor" amount={laborTotal} />}
                  </div>
                )}

                {/* Additional Costs */}
                <div className="space-y-2 mb-6 pb-4 border-b-2 border-gray-100">
                  <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Additional Costs</h4>
                  <CostRow label="Shop Fees (15%)" amount={shopFees} />
                  {mileageCost > 0 && <CostRow label="Mileage" amount={mileageCost} />}
                  {travelCost > 0 && <CostRow label="Travel" amount={travelCost} />}
                  {equipmentCost > 0 && <CostRow label="Equipment" amount={equipmentCost} />}
                </div>

                {/* Grand Total */}
                <div className="bg-gradient-to-br from-blue-600 to-red-600 rounded-2xl p-6 text-white mb-6 shadow-lg">
                  <p className="text-sm font-bold opacity-90 mb-1 tracking-wide">GRAND TOTAL</p>
                  <p className="text-5xl font-bold tracking-tight">${grandTotal.toFixed(2)}</p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
                    <FileText className="w-5 h-5" />
                    Generate PDF
                  </button>
                  <button className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-white hover:bg-gray-50 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">
                    <Mail className="w-5 h-5" />
                    Email to Client
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

// ==================== COMPONENTS ====================

interface InputFieldProps {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  step?: string;
}

function InputField({ label, type = 'text', value, onChange, placeholder, required, step }: InputFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label} {required && <span className="text-red-500">*</span>}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-gray-800 placeholder-gray-400"
        required={required}
      />
    </div>
  );
}

interface ServiceSectionProps {
  title: string;
  icon: string;
  gradient: string;
  isExpanded: boolean;
  onClick: () => void;
  itemCount: number;
  totalCost: number;
  children: React.ReactNode;
}

function ServiceSection({ title, icon, gradient, isExpanded, onClick, itemCount, totalCost, children }: ServiceSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-premium overflow-hidden"
    >
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center text-2xl shadow-lg`}>
            {icon}
          </div>
          <div className="text-left">
            <h3 className="text-lg font-bold text-gray-800">{title}</h3>
            {itemCount > 0 && (
              <p className="text-sm text-gray-500">{itemCount} item{itemCount !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {totalCost > 0 && (
            <span className="text-xl font-bold gradient-text">${totalCost.toFixed(2)}</span>
          )}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="p-6 pt-0 border-t border-gray-100">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface ItemListProps<T extends { id: string; description: string; complexity: number }> {
  items: T[];
  setItems: (items: T[]) => void;
  calculateCost: (item: T) => number;
  addItemTemplate: () => T;
  renderFields: (item: T, updateItem: (updates: Partial<T>) => void) => React.ReactNode;
  color: string;
  addButtonText: string;
}

function ItemList<T extends { id: string; description: string; complexity: number }>({
  items,
  setItems,
  calculateCost,
  addItemTemplate,
  renderFields,
  color,
  addButtonText
}: ItemListProps<T>) {
  const addItem = () => setItems([...items, addItemTemplate()]);
  const removeItem = (id: string) => setItems(items.filter(item => item.id !== id));
  const updateItem = (id: string, updates: Partial<T>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    red: 'bg-red-50 border-red-200 text-red-600',
    green: 'bg-green-50 border-green-200 text-green-600',
  }[color] || 'bg-gray-50 border-gray-200 text-gray-600';

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.id} className={`${colorClasses} rounded-xl p-4 border-2`}>
          <div className="flex items-start justify-between mb-3">
            <h4 className="font-semibold text-gray-800">Item {index + 1}</h4>
            <button
              onClick={() => removeItem(item.id)}
              className="p-1 hover:bg-red-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-red-500" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              value={item.description}
              onChange={(e) => updateItem(item.id, { description: e.target.value } as Partial<T>)}
              placeholder="Description"
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {renderFields(item, (updates) => updateItem(item.id, updates))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
              <span className="text-sm font-medium text-gray-600">Item Cost:</span>
              <span className="text-lg font-bold gradient-text">${calculateCost(item).toFixed(2)}</span>
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={addItem}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-gray-50 border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-xl font-medium text-gray-700 transition-all hover:shadow-md"
      >
        <Plus className="w-5 h-5" />
        {addButtonText}
      </button>
    </div>
  );
}

function ComplexitySlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="col-span-2 md:col-span-2">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Complexity: +{value}%
      </label>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
    </div>
  );
}

function CostRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
      <span className="text-gray-700 font-medium text-sm">{label}</span>
      <span className="font-bold text-gray-900 text-base">${amount.toFixed(2)}</span>
    </div>
  );
}
