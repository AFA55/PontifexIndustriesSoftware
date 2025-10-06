'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

// Organized work item categories based on DSM screenshots
const WORK_CATEGORIES = {
  'Core Drilling': [
    'CORE DRILL',
    'HYDRAULIC CORE DRILL',
    'SPOT/CAUGHT CORES'
  ],
  'Sawing': [
    'SLAB SAW',
    'ELECTRIC SLAB SAW',
    'WALL SAW',
    'WIRE SAW',
    'HAND SAW',
    'FLUSH CUT HAND SAW',
    'CHAIN SAW',
    'RING SAW'
  ],
  'Breaking & Removal': [
    'BREAK & REMOVE',
    'DEMOLITION',
    'REMOVAL',
    'EXCAVATE DIRT',
    'BROKK'
  ],
  'Concrete Work': [
    'POURED/FINISH CONCRETE',
    'REPAIR',
    'GRINDING',
    'CHIPPING'
  ],
  'Installation': [
    'INSTALL BOLLARD(S)',
    'INSTALL LINTEL(S)',
    'MANHOLE BOOT',
    'JOINT SEALING'
  ],
  'Equipment & Tools': [
    'JACK HAMMERING',
    'HAND DRILL',
    'PRESSURE WASH',
    'VACUUMING & WATER CONTROL'
  ],
  'Services': [
    'IMAGE SCAN',
    'SAFETY MEETINGS/ORIENTATION',
    'STANDBY TIME',
    'TRAVEL CHARGE',
    'TRIP CHARGE',
    'HAULING',
    'DELIVER',
    'DUMPSTER CHARGE'
  ],
  'Materials': [
    'MATERIAL(S)',
    'SALE OF'
  ]
};

// Popular/Common items for quick access
const POPULAR_ITEMS = [
  'CORE DRILL',
  'SLAB SAW',
  'WALL SAW',
  'BREAK & REMOVE',
  'JACK HAMMERING'
];

interface WorkItem {
  name: string;
  quantity: number;
  notes?: string;
  details?: CoreDrillingDetails | SawingDetails | GeneralDetails;
}

interface CoreDrillingHole {
  bitSize: string;
  depthInches: number;
  quantity: number;
}

interface CoreDrillingDetails {
  holes: CoreDrillingHole[];
  plasticSetup: boolean;
  cutSteel: boolean;
  steelEncountered?: string;
  notes?: string;
}

interface SawingCut {
  linearFeet: number;
  cutDepth: number;
  bladesUsed: string[];
  cutSteel: boolean;
  steelEncountered?: string;
  overcut: boolean;
}

interface SawingDetails {
  cuts: SawingCut[];
  cutType: 'wet' | 'dry';
  notes?: string;
}

interface GeneralDetails {
  duration?: number;
  equipment?: string[];
  notes?: string;
}

export default function WorkPerformed() {
  const router = useRouter();
  const params = useParams();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<WorkItem[]>([]);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [currentItem, setCurrentItem] = useState<string>('');
  const [currentQuantity, setCurrentQuantity] = useState(1);
  const [currentNotes, setCurrentNotes] = useState('');
  const [coreDrillingData, setCoreDrillingData] = useState<CoreDrillingDetails>({
    holes: [],
    plasticSetup: false,
    cutSteel: false,
    steelEncountered: '',
    notes: ''
  });
  const [currentHole, setCurrentHole] = useState<CoreDrillingHole>({
    bitSize: '',
    depthInches: 0,
    quantity: 1
  });
  const [sawingData, setSawingData] = useState<SawingDetails>({
    cuts: [],
    cutType: 'wet',
    notes: ''
  });
  const [currentCut, setCurrentCut] = useState<SawingCut>({
    linearFeet: 0,
    cutDepth: 0,
    bladesUsed: [],
    cutSteel: false,
    steelEncountered: '',
    overcut: false
  });
  const [selectedBlades, setSelectedBlades] = useState<string[]>([]);
  const [customBladeSize, setCustomBladeSize] = useState('');
  const [view, setView] = useState<'categories' | 'selected'>('categories');

  // Filter work items based on search and category
  const getFilteredItems = () => {
    let items: string[] = [];

    if (selectedCategory === 'All') {
      Object.values(WORK_CATEGORIES).forEach(categoryItems => {
        items = [...items, ...categoryItems];
      });
    } else if (selectedCategory === 'Popular') {
      items = POPULAR_ITEMS;
    } else {
      items = WORK_CATEGORIES[selectedCategory] || [];
    }

    if (searchQuery) {
      items = items.filter(item =>
        item.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return items;
  };

  // Check if item requires detailed data collection
  const requiresDetailedData = (itemName: string) => {
    return itemName.includes('CORE DRILL') ||
           itemName.includes('SAW') ||
           itemName.includes('CUTTING');
  };

  const isCoreDrilling = (itemName: string) => {
    return itemName.includes('CORE DRILL');
  };

  const isSawing = (itemName: string) => {
    return itemName.includes('SAW') && !itemName.includes('CORE DRILL');
  };

  const isHandSaw = (itemName: string) => {
    return itemName.includes('HAND SAW');
  };

  const isSlabSaw = (itemName: string) => {
    return itemName.includes('SLAB SAW');
  };

  const isWallSaw = (itemName: string) => {
    return itemName.includes('WALL SAW');
  };

  const isChainsaw = (itemName: string) => {
    return itemName.includes('CHAIN SAW');
  };

  const handleSelectItem = (itemName: string) => {
    setCurrentItem(itemName);
    setCurrentQuantity(1);
    setCurrentNotes('');

    // Reset detailed data forms
    setCoreDrillingData({
      holes: [],
      plasticSetup: false,
      cutSteel: false,
      steelEncountered: '',
      notes: ''
    });

    setCurrentHole({
      bitSize: '',
      depthInches: 0,
      quantity: 1
    });

    setSawingData({
      cuts: [],
      cutType: 'wet',
      notes: ''
    });

    setCurrentCut({
      linearFeet: 0,
      cutDepth: 0,
      bladesUsed: [],
      cutSteel: false,
      steelEncountered: '',
      overcut: false
    });

    setSelectedBlades([]);
    setCustomBladeSize('');

    setShowQuantityModal(true);
  };

  const addHole = () => {
    if (!currentHole.bitSize || currentHole.depthInches <= 0) {
      alert('Please specify both bit size and depth for the hole');
      return;
    }

    setCoreDrillingData(prev => ({
      ...prev,
      holes: [...prev.holes, { ...currentHole }]
    }));

    // Reset current hole for next entry
    setCurrentHole({
      bitSize: '',
      depthInches: 0,
      quantity: 1
    });
  };

  const removeHole = (index: number) => {
    setCoreDrillingData(prev => ({
      ...prev,
      holes: prev.holes.filter((_, i) => i !== index)
    }));
  };

  const getTotalHoles = () => {
    return coreDrillingData.holes.reduce((total, hole) => total + hole.quantity, 0);
  };

  const addCut = () => {
    if (currentCut.linearFeet <= 0 || currentCut.cutDepth <= 0) {
      alert('Please specify both linear feet and cut depth');
      return;
    }

    if (selectedBlades.length === 0) {
      const itemType = isChainsaw(currentItem) ? 'chain size' : 'blade type';
      alert(`Please select at least one ${itemType} used`);
      return;
    }

    const cutToAdd = {
      ...currentCut,
      bladesUsed: [...selectedBlades]
    };

    setSawingData(prev => ({
      ...prev,
      cuts: [...prev.cuts, cutToAdd]
    }));

    // Reset current cut for next entry
    setCurrentCut({
      linearFeet: 0,
      cutDepth: 0,
      bladesUsed: [],
      cutSteel: false,
      steelEncountered: '',
      overcut: false
    });
    setSelectedBlades([]);
    setCustomBladeSize('');
  };

  const removeCut = (index: number) => {
    setSawingData(prev => ({
      ...prev,
      cuts: prev.cuts.filter((_, i) => i !== index)
    }));
  };

  const getTotalLinearFeet = () => {
    return sawingData.cuts.reduce((total, cut) => total + cut.linearFeet, 0);
  };

  const toggleBladeSelection = (blade: string) => {
    setSelectedBlades(prev => {
      if (prev.includes(blade)) {
        return prev.filter(b => b !== blade);
      } else {
        return [...prev, blade];
      }
    });
  };

  const addCustomBlade = () => {
    if (customBladeSize.trim() && !selectedBlades.includes(customBladeSize.trim())) {
      setSelectedBlades(prev => [...prev, customBladeSize.trim()]);
      setCustomBladeSize('');
    }
  };

  const getBladesForSawType = (itemName: string) => {
    if (isHandSaw(itemName)) {
      return ['20" Hand Saw', '24" Hand Saw', '30" Hand Saw'];
    }

    if (isChainsaw(itemName)) {
      return ['10" Chain', '15" Chain', '20" Chain', '24" Chain'];
    }

    // Standard blades for other saw types
    return [
      '7" Diamond',
      '9" Diamond',
      '12" Diamond',
      '14" Diamond',
      '16" Diamond',
      '18" Diamond',
      '20" Diamond',
      '24" Diamond',
      'Abrasive',
      'Masonry',
      'Metal Cutting',
      'Wire Saw'
    ];
  };

  const handleAddItem = () => {
    const existingIndex = selectedItems.findIndex(item => item.name === currentItem);

    // Prepare detailed data based on item type
    let details: CoreDrillingDetails | SawingDetails | GeneralDetails | undefined;

    if (isCoreDrilling(currentItem)) {
      if (coreDrillingData.holes.length === 0) {
        alert('Please add at least one hole entry with size and depth');
        return;
      }
      details = { ...coreDrillingData };
    } else if (isSawing(currentItem)) {
      if (sawingData.cuts.length === 0) {
        alert('Please add at least one cut entry with linear feet and depth');
        return;
      }
      details = { ...sawingData };
    }

    // For core drilling, use total holes as quantity; for sawing, use total linear feet; otherwise use currentQuantity
    const itemQuantity = isCoreDrilling(currentItem)
      ? getTotalHoles()
      : isSawing(currentItem)
      ? getTotalLinearFeet()
      : currentQuantity;

    if (existingIndex >= 0) {
      // Update existing item
      const updated = [...selectedItems];
      updated[existingIndex].quantity = itemQuantity; // Replace instead of add for core drilling
      if (currentNotes) {
        updated[existingIndex].notes = currentNotes;
      }
      if (details) {
        updated[existingIndex].details = details;
      }
      setSelectedItems(updated);
    } else {
      // Add new item
      const newItem: WorkItem = {
        name: currentItem,
        quantity: itemQuantity,
        notes: currentNotes
      };

      if (details) {
        newItem.details = details;
      }

      setSelectedItems([...selectedItems, newItem]);
    }

    setShowQuantityModal(false);
  };

  const handleRemoveItem = (itemName: string) => {
    setSelectedItems(selectedItems.filter(item => item.name !== itemName));
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      alert('Please select at least one work item');
      return;
    }

    // Save work performed data
    const workPerformedData = {
      jobId: params.id,
      items: selectedItems,
      timestamp: new Date().toISOString()
    };

    console.log('Submitting work performed:', workPerformedData);

    // Save to localStorage (in real app, send to backend)
    localStorage.setItem(`work-performed-${params.id}`, JSON.stringify(workPerformedData));

    alert('Work performed items saved successfully!');
    router.push(`/dashboard/job-schedule/${params.id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/70 border-b border-white/20 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href={`/dashboard/job-schedule/${params.id}`}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Work Performed</h1>
                <p className="text-sm text-gray-500">Select completed work items</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
                {selectedItems.length} Selected
              </span>
              <button
                onClick={() => setView(view === 'categories' ? 'selected' : 'categories')}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors font-medium text-sm"
              >
                {view === 'categories' ? 'View Selected' : 'Add More'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {view === 'categories' ? (
          <>
            {/* Search Bar */}
            <div className="bg-white rounded-2xl shadow-lg p-4 mb-6">
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search work items..."
                  className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Category Tabs */}
            <div className="mb-6">
              <div className="flex gap-2 overflow-x-auto pb-2">
                <button
                  onClick={() => setSelectedCategory('Popular')}
                  className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all ${
                    selectedCategory === 'Popular'
                      ? 'bg-orange-500 text-white shadow-lg'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  ⭐ Popular
                </button>
                <button
                  onClick={() => setSelectedCategory('All')}
                  className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all ${
                    selectedCategory === 'All'
                      ? 'bg-blue-500 text-white shadow-lg'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  All Items
                </button>
                {Object.keys(WORK_CATEGORIES).map(category => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all ${
                      selectedCategory === category
                        ? 'bg-blue-500 text-white shadow-lg'
                        : 'bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {/* Work Items Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFilteredItems().map((item) => {
                const isSelected = selectedItems.some(si => si.name === item);
                return (
                  <button
                    key={item}
                    onClick={() => handleSelectItem(item)}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                      isSelected
                        ? 'bg-green-50 border-green-400 shadow-md'
                        : 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800">{item}</h3>
                        {isSelected && (
                          <p className="text-sm text-green-600 mt-1">
                            Qty: {selectedItems.find(si => si.name === item)?.quantity}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          /* Selected Items View */
          <div className="bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Selected Work Items</h2>
            {selectedItems.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No items selected yet</p>
                <button
                  onClick={() => setView('categories')}
                  className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
                >
                  Add Work Items
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedItems.map((item) => (
                  <div key={item.name} className="bg-gray-50 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                          {isCoreDrilling(item.name) && (
                            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                          {isSawing(item.name) && (
                            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                            </svg>
                          )}
                          {item.name}
                        </h3>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-sm text-gray-600">Quantity: {item.quantity}</span>
                          {item.notes && (
                            <span className="text-sm text-gray-500">Note: {item.notes}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.name)}
                        className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Show detailed information for sawing */}
                    {isSawing(item.name) && item.details && 'cuts' in item.details && (
                      <div className="px-4 pb-4">
                        <div className="bg-white rounded-lg p-3 border-l-4 border-blue-500">
                          <h4 className="font-medium text-gray-700 mb-3">Sawing Details:</h4>

                          {/* Cut Entries */}
                          {item.details.cuts.length > 0 && (
                            <div className="mb-4">
                              <h5 className="text-sm font-medium text-gray-600 mb-2">Cuts Made:</h5>
                              <div className="grid gap-2">
                                {item.details.cuts.map((cut, index) => (
                                  <div key={index} className="bg-gray-50 rounded-lg p-2 text-sm">
                                    <div className="flex items-center gap-4 mb-1">
                                      <div className="flex items-center gap-1">
                                        <span className="font-medium text-blue-600">{cut.linearFeet}&apos;</span>
                                        <span className="text-gray-500">linear feet at</span>
                                        <span className="font-medium">{cut.cutDepth}&quot;</span>
                                        <span className="text-gray-500">deep</span>
                                      </div>
                                      {cut.cutSteel && (
                                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                          Steel Cut
                                        </span>
                                      )}
                                      {cut.overcut && (
                                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                                          Overcut
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-1 text-xs">
                                      <span className="text-gray-500">
                                        {isChainsaw(item.name) ? 'Chains:' : 'Blades:'}
                                      </span>
                                      {cut.bladesUsed.map((blade, bladeIndex) => (
                                        <span key={bladeIndex} className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded">
                                          {blade}
                                        </span>
                                      ))}
                                    </div>
                                    {cut.cutSteel && cut.steelEncountered && (
                                      <div className="mt-1 text-xs">
                                        <span className="text-gray-500">Steel:</span>
                                        <span className="ml-1 text-red-600 font-medium">{cut.steelEncountered}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Other Details */}
                          <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
                            <div>
                              <span className="text-gray-500">Cut Method:</span>
                              <span className={`ml-1 font-medium ${item.details.cutType === 'wet' ? 'text-blue-600' : 'text-orange-600'}`}>
                                {item.details.cutType === 'wet' ? 'Wet' : 'Dry'} Cutting
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Total Linear Feet:</span>
                              <span className="ml-1 font-medium text-blue-600">
                                {item.details.cuts.reduce((total, cut) => total + cut.linearFeet, 0)}&apos;
                              </span>
                            </div>
                            {item.details.notes && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Notes:</span>
                                <span className="ml-1 text-gray-700">{item.details.notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Show detailed information for core drilling */}
                    {isCoreDrilling(item.name) && item.details && 'holes' in item.details && (
                      <div className="px-4 pb-4">
                        <div className="bg-white rounded-lg p-3 border-l-4 border-orange-500">
                          <h4 className="font-medium text-gray-700 mb-3">Core Drilling Details:</h4>

                          {/* Hole Entries */}
                          {item.details.holes.length > 0 && (
                            <div className="mb-4">
                              <h5 className="text-sm font-medium text-gray-600 mb-2">Holes Drilled:</h5>
                              <div className="grid gap-2">
                                {item.details.holes.map((hole, index) => (
                                  <div key={index} className="flex items-center gap-4 bg-gray-50 rounded-lg p-2 text-sm">
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium text-orange-600">{hole.quantity}x</span>
                                      <span className="font-medium">{hole.bitSize}</span>
                                      <span className="text-gray-500">at</span>
                                      <span className="font-medium">{hole.depthInches}&quot;</span>
                                      <span className="text-gray-500">deep</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Other Details */}
                          <div className="grid grid-cols-2 gap-3 text-sm border-t pt-3">
                            <div>
                              <span className="text-gray-500">Plastic Setup:</span>
                              <span className={`ml-1 font-medium ${item.details.plasticSetup ? 'text-blue-600' : 'text-gray-400'}`}>
                                {item.details.plasticSetup ? 'Yes' : 'No'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Cut Steel:</span>
                              <span className={`ml-1 font-medium ${item.details.cutSteel ? 'text-red-600' : 'text-gray-400'}`}>
                                {item.details.cutSteel ? 'Yes' : 'No'}
                              </span>
                            </div>
                            {item.details.cutSteel && item.details.steelEncountered && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Steel Type:</span>
                                <span className="ml-1 font-medium text-red-600">{item.details.steelEncountered}</span>
                              </div>
                            )}
                            {item.details.notes && (
                              <div className="col-span-2">
                                <span className="text-gray-500">Notes:</span>
                                <span className="ml-1 text-gray-700">{item.details.notes}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Submit Button */}
        {selectedItems.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
            <div className="container mx-auto max-w-6xl flex gap-3">
              <button
                onClick={() => router.push(`/dashboard/job-schedule/${params.id}`)}
                className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Submit Work Performed
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Work Item Detail Modal */}
      {showQuantityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                {currentItem}
              </h3>

              <div className="space-y-6">
                {/* Quantity Section - For non-core drilling items */}
                {!isCoreDrilling(currentItem) && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Number of Items</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setCurrentQuantity(Math.max(1, currentQuantity - 1))}
                        className="w-12 h-12 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                        </svg>
                      </button>
                      <input
                        type="number"
                        value={currentQuantity}
                        onChange={(e) => setCurrentQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="flex-1 text-center text-2xl font-bold py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none"
                      />
                      <button
                        onClick={() => setCurrentQuantity(currentQuantity + 1)}
                        className="w-12 h-12 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Core Drilling - Total Holes Summary */}
                {isCoreDrilling(currentItem) && (
                  <div className="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-800">Total Holes</h4>
                        <p className="text-sm text-gray-600">All sizes combined</p>
                      </div>
                      <div className="text-3xl font-bold text-orange-600">
                        {getTotalHoles()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sawing - Total Linear Feet Summary */}
                {isSawing(currentItem) && (
                  <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-800">Total Linear Feet</h4>
                        <p className="text-sm text-gray-600">All cuts combined</p>
                      </div>
                      <div className="text-3xl font-bold text-blue-600">
                        {getTotalLinearFeet()}&apos;&apos;
                      </div>
                    </div>
                  </div>
                )}

                {/* Core Drilling Specific Fields */}
                {isCoreDrilling(currentItem) && (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Core Drilling Details
                    </h4>

                    {/* Add New Hole Entry */}
                    <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl p-4 border-2 border-orange-200">
                      <h5 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Hole Entry
                      </h5>

                      <div className="grid grid-cols-3 gap-3">
                        {/* Bit Size */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Bit Size</label>
                          <select
                            value={currentHole.bitSize}
                            onChange={(e) => setCurrentHole(prev => ({ ...prev, bitSize: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-orange-500 focus:outline-none bg-white"
                          >
                            <option value="">Select...</option>
                            <option value='1/2"'>1/2&quot;</option>
                            <option value='5/8"'>5/8&quot;</option>
                            <option value='3/4"'>3/4&quot;</option>
                            <option value='1"'>1&quot;</option>
                            <option value='1-1/4"'>1-1/4&quot;</option>
                            <option value='1-1/2"'>1-1/2&quot;</option>
                            <option value='2"'>2&quot;</option>
                            <option value='2-1/2"'>2-1/2&quot;</option>
                            <option value='3"'>3&quot;</option>
                            <option value='4"'>4&quot;</option>
                            <option value='5"'>5&quot;</option>
                            <option value='6"'>6&quot;</option>
                            <option value='8"'>8&quot;</option>
                            <option value='10"'>10&quot;</option>
                            <option value='12"'>12&quot;</option>
                          </select>
                        </div>

                        {/* Depth */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Depth (in)</label>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            value={currentHole.depthInches}
                            onChange={(e) => setCurrentHole(prev => ({ ...prev, depthInches: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-orange-500 focus:outline-none"
                            placeholder="Depth"
                          />
                        </div>

                        {/* Quantity */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={currentHole.quantity}
                            onChange={(e) => setCurrentHole(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                            className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-orange-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <button
                        onClick={addHole}
                        className="mt-3 w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 font-medium"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add This Hole
                      </button>
                    </div>

                    {/* Added Holes List */}
                    {coreDrillingData.holes.length > 0 && (
                      <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
                        <h5 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Added Holes ({coreDrillingData.holes.length} entries)
                        </h5>
                        <div className="space-y-2">
                          {coreDrillingData.holes.map((hole, index) => (
                            <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center gap-4 text-sm">
                                <div>
                                  <span className="font-medium text-gray-700">{hole.bitSize}</span>
                                  <span className="text-gray-500"> bit</span>
                                </div>
                                <div>
                                  <span className="font-medium text-gray-700">{hole.depthInches}&quot;</span>
                                  <span className="text-gray-500"> deep</span>
                                </div>
                                <div>
                                  <span className="font-medium text-gray-700">{hole.quantity}</span>
                                  <span className="text-gray-500"> {hole.quantity === 1 ? 'hole' : 'holes'}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => removeHole(index)}
                                className="p-1 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Plastic Setup */}
                    <div className="bg-blue-50 rounded-xl p-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={coreDrillingData.plasticSetup}
                          onChange={(e) => setCoreDrillingData(prev => ({ ...prev, plasticSetup: e.target.checked }))}
                          className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div>
                          <span className="font-semibold text-gray-700">Plastic Setup Required</span>
                          <p className="text-sm text-gray-500">Did you need to set up plastic for dust control?</p>
                        </div>
                      </label>
                    </div>

                    {/* Steel Cutting */}
                    <div className="bg-red-50 rounded-xl p-4">
                      <label className="flex items-center gap-3 cursor-pointer mb-3">
                        <input
                          type="checkbox"
                          checked={coreDrillingData.cutSteel}
                          onChange={(e) => setCoreDrillingData(prev => ({ ...prev, cutSteel: e.target.checked }))}
                          className="w-5 h-5 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                        />
                        <div>
                          <span className="font-semibold text-gray-700">Cut Through Steel</span>
                          <p className="text-sm text-gray-500">Did you encounter and cut through steel/rebar?</p>
                        </div>
                      </label>

                      {coreDrillingData.cutSteel && (
                        <div className="mt-3">
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Steel Type/Description</label>
                          <input
                            type="text"
                            value={coreDrillingData.steelEncountered}
                            onChange={(e) => setCoreDrillingData(prev => ({ ...prev, steelEncountered: e.target.value }))}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-red-500 focus:outline-none"
                            placeholder="e.g., #4 rebar, angle iron, etc..."
                          />
                        </div>
                      )}
                    </div>

                    {/* Core Drilling Notes */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Additional Notes</label>
                      <textarea
                        value={coreDrillingData.notes}
                        onChange={(e) => setCoreDrillingData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Any additional details about the core drilling work..."
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors"
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {/* Sawing Specific Fields */}
                {isSawing(currentItem) && (
                  <div className="space-y-4">
                    <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                      </svg>
                      Sawing Details
                    </h4>

                    {/* Add New Cut Entry */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border-2 border-blue-200">
                      <h5 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Cut Entry
                      </h5>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {/* Linear Feet */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Linear Feet Cut</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={currentCut.linearFeet}
                            onChange={(e) => setCurrentCut(prev => ({ ...prev, linearFeet: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                            placeholder="Linear feet"
                          />
                        </div>

                        {/* Cut Depth */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Cut Depth (in)</label>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            value={currentCut.cutDepth}
                            onChange={(e) => setCurrentCut(prev => ({ ...prev, cutDepth: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                            placeholder="Depth"
                          />
                        </div>
                      </div>

                      {/* Blade Selection */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {isChainsaw(currentItem) ? 'Chain Size Used' : 'Blades Used'} (select all that apply)
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                          {getBladesForSawType(currentItem).map((blade) => (
                            <button
                              key={blade}
                              type="button"
                              onClick={() => toggleBladeSelection(blade)}
                              className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                                selectedBlades.includes(blade)
                                  ? 'bg-blue-500 text-white border-blue-600'
                                  : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                              }`}
                            >
                              {blade}
                            </button>
                          ))}
                        </div>

                        {/* Custom Blade Input - Only show for non-hand saws and non-chainsaws */}
                        {!isHandSaw(currentItem) && !isChainsaw(currentItem) && (
                          <div className="bg-gray-50 rounded-lg p-3">
                            <label className="block text-xs font-medium text-gray-600 mb-2">Custom Blade Size</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={customBladeSize}
                                onChange={(e) => setCustomBladeSize(e.target.value)}
                                placeholder='e.g., 30" Diamond, 36" Wire'
                                className="flex-1 px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={addCustomBlade}
                                disabled={!customBladeSize.trim()}
                                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Show selected blades */}
                        {selectedBlades.length > 0 && (
                          <div className="mt-3">
                            <label className="block text-xs font-medium text-gray-600 mb-2">
                              {isChainsaw(currentItem) ? 'Selected Chains:' : 'Selected Blades:'}
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {selectedBlades.map((blade, index) => (
                                <span key={index} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1">
                                  {blade}
                                  <button
                                    type="button"
                                    onClick={() => toggleBladeSelection(blade)}
                                    className="hover:bg-blue-200 rounded-full p-0.5"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Steel Cutting for this cut */}
                      <div className="bg-red-50 rounded-lg p-3 mb-4">
                        <label className="flex items-center gap-3 cursor-pointer mb-2">
                          <input
                            type="checkbox"
                            checked={currentCut.cutSteel}
                            onChange={(e) => setCurrentCut(prev => ({ ...prev, cutSteel: e.target.checked }))}
                            className="w-4 h-4 text-red-600 bg-gray-100 border-gray-300 rounded focus:ring-red-500"
                          />
                          <span className="text-sm font-medium text-gray-700">Cut Through Steel in this section</span>
                        </label>

                        {currentCut.cutSteel && (
                          <input
                            type="text"
                            value={currentCut.steelEncountered}
                            onChange={(e) => setCurrentCut(prev => ({ ...prev, steelEncountered: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-red-500 focus:outline-none"
                            placeholder="Steel type (e.g., rebar, angle iron, etc.)"
                          />
                        )}
                      </div>

                      {/* Overcut Detection - Only show for slab saws, hand saws, and chainsaws */}
                      {(isSlabSaw(currentItem) || isHandSaw(currentItem) || isChainsaw(currentItem)) && (
                        <div className="bg-yellow-50 rounded-lg p-3 mb-4">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={currentCut.overcut}
                              onChange={(e) => setCurrentCut(prev => ({ ...prev, overcut: e.target.checked }))}
                              className="w-4 h-4 text-yellow-600 bg-gray-100 border-gray-300 rounded focus:ring-yellow-500"
                            />
                            <div>
                              <span className="text-sm font-medium text-gray-700">Overcut Occurred</span>
                              <p className="text-xs text-gray-500">Check if the saw cut beyond the intended mark</p>
                            </div>
                          </label>
                        </div>
                      )}

                      <button
                        onClick={addCut}
                        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2 font-medium"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add This Cut
                      </button>
                    </div>

                    {/* Added Cuts List */}
                    {sawingData.cuts.length > 0 && (
                      <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
                        <h5 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Added Cuts ({sawingData.cuts.length} entries)
                        </h5>
                        <div className="space-y-3">
                          {sawingData.cuts.map((cut, index) => (
                            <div key={index} className="bg-gray-50 rounded-lg p-3 border">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-4 text-sm">
                                  <div>
                                    <span className="font-medium text-blue-600">{cut.linearFeet}&apos;</span>
                                    <span className="text-gray-500"> linear feet</span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-700">{cut.cutDepth}&quot;</span>
                                    <span className="text-gray-500"> deep</span>
                                  </div>
                                  {cut.cutSteel && (
                                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                      Steel Cut
                                    </span>
                                  )}
                                  {cut.overcut && (
                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                                      Overcut
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => removeCut(index)}
                                  className="p-1 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1 text-xs">
                                <span className="text-gray-500">
                                  {isChainsaw(currentItem) ? 'Chains:' : 'Blades:'}
                                </span>
                                {cut.bladesUsed.map((blade, bladeIndex) => (
                                  <span key={bladeIndex} className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                    {blade}
                                  </span>
                                ))}
                              </div>
                              {cut.cutSteel && cut.steelEncountered && (
                                <div className="mt-2 text-xs">
                                  <span className="text-gray-500">Steel type:</span>
                                  <span className="ml-1 text-red-600 font-medium">{cut.steelEncountered}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cut Type Selection */}
                    <div className="bg-gray-50 rounded-xl p-4">
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Cutting Method</label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="wet"
                            checked={sawingData.cutType === 'wet'}
                            onChange={(e) => setSawingData(prev => ({ ...prev, cutType: e.target.value as 'wet' | 'dry' }))}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-sm font-medium">Wet Cutting</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="dry"
                            checked={sawingData.cutType === 'dry'}
                            onChange={(e) => setSawingData(prev => ({ ...prev, cutType: e.target.value as 'wet' | 'dry' }))}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-sm font-medium">Dry Cutting</span>
                        </label>
                      </div>
                    </div>

                    {/* Sawing Notes */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Additional Notes</label>
                      <textarea
                        value={sawingData.notes}
                        onChange={(e) => setSawingData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Any additional details about the sawing work..."
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {/* General Notes for non-specialized items */}
                {!isCoreDrilling(currentItem) && !isSawing(currentItem) && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                    <textarea
                      value={currentNotes}
                      onChange={(e) => setCurrentNotes(e.target.value)}
                      placeholder="Add any notes about this work item..."
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none transition-colors"
                      rows={3}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowQuantityModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-semibold flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Work Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}