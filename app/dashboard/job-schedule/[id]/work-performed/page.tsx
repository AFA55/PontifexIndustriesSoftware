'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import QuickAccessButtons from '@/components/QuickAccessButtons';
import EquipmentUsageForm from '@/components/EquipmentUsageForm';
import RecommendedItems from './_components/RecommendedItems';
import PhotoUploader from '@/components/PhotoUploader';
import { Camera, Mic, Save, Zap, Home } from 'lucide-react';
import VoiceMemoNotes from './_components/VoiceMemoNotes';
import { DarkModeIconToggle } from '@/components/ui/DarkModeToggle';

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
    'RING SAW',
    'PUSH SAW'
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
  'HAND SAW',
  'CHAIN SAW',
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
  plasticSetup: boolean;
  cutSteel: boolean;
  steelEncountered?: string;
}

interface CoreDrillingDetails {
  holes: CoreDrillingHole[];
  notes?: string;
}

interface CutArea {
  length: number; // in feet
  width: number; // in feet
  depth: number; // in inches
  quantity: number; // number of areas
  cutSteel: boolean;
  overcut: boolean;
  steelEncountered?: string;
  chainsawed: boolean;
  chainsawAreas?: number;
  chainsawWidthInches?: number;
}

interface SawingCut {
  inputMode: 'linear' | 'area'; // How the cut was specified
  linearFeet: number; // Total linear feet (calculated from areas or direct input)
  cutDepth: number;
  areas?: CutArea[]; // If using area mode
  bladesUsed: string[];
  cutSteel: boolean;
  steelEncountered?: string;
  overcut: boolean;
  chainsawed: boolean;
  chainsawAreas?: number;
  chainsawWidthInches?: number;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState<WorkItem[]>([]);
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [showAddMoreDialog, setShowAddMoreDialog] = useState(false);
  const [currentItem, setCurrentItem] = useState<string>('');
  const [currentQuantity, setCurrentQuantity] = useState(1);
  const [currentNotes, setCurrentNotes] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [coreDrillingData, setCoreDrillingData] = useState<CoreDrillingDetails>({
    holes: [],
    notes: ''
  });
  const [currentHole, setCurrentHole] = useState<CoreDrillingHole>({
    bitSize: '',
    depthInches: 0,
    quantity: 1,
    plasticSetup: false,
    cutSteel: false,
    steelEncountered: ''
  });
  const [sawingData, setSawingData] = useState<SawingDetails>({
    cuts: [],
    cutType: 'wet',
    notes: ''
  });
  const [currentCut, setCurrentCut] = useState<SawingCut>({
    inputMode: 'linear',
    linearFeet: 0,
    cutDepth: 0,
    areas: [],
    bladesUsed: [],
    cutSteel: false,
    steelEncountered: '',
    overcut: false,
    chainsawed: false,
    chainsawAreas: 0,
    chainsawWidthInches: 0
  });
  const [cutInputMode, setCutInputMode] = useState<'linear' | 'area'>('linear');
  const [currentArea, setCurrentArea] = useState<CutArea>({
    length: 0,
    width: 0,
    depth: 0,
    quantity: 1,
    cutSteel: false,
    overcut: false,
    steelEncountered: '',
    chainsawed: false,
    chainsawAreas: 0,
    chainsawWidthInches: 0
  });
  const [tempAreas, setTempAreas] = useState<CutArea[]>([]);
  const [selectedBlades, setSelectedBlades] = useState<string[]>([]);
  const [customBladeSize, setCustomBladeSize] = useState('');
  const [view, setView] = useState<'search' | 'selected'>('search');
  const [equipmentUsageEntries, setEquipmentUsageEntries] = useState<any[]>([]);
  const [showEquipmentForm, setShowEquipmentForm] = useState(false);
  const [savingEquipment, setSavingEquipment] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [jobDifficultyRating, setJobDifficultyRating] = useState<number>(0);
  const [jobAccessRating, setJobAccessRating] = useState<number>(0);
  const [difficultyNotes, setDifficultyNotes] = useState('');
  const [accessNotes, setAccessNotes] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [jobType, setJobType] = useState<string>('');
  const [currentDayNumber, setCurrentDayNumber] = useState<number>(1);
  const [jobPhotos, setJobPhotos] = useState<string[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<string>('');

  // ─── Day lock state (read-only if today's daily log already submitted) ──────
  const [dayAlreadySubmitted, setDayAlreadySubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Auto-save state ─────────────────────────────────────────────────────────
  type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoadedRef = useRef(false);

  // Mark this job as having visited work-performed (for resume-last-position logic)
  useEffect(() => {
    if (params.id) {
      localStorage.setItem(`job_last_page_${params.id}`, 'work-performed');
    }
  }, [params.id]);

  // Back navigation — clears resume key so job ticket doesn't loop back here
  const goBack = () => {
    localStorage.removeItem(`job_last_page_${params.id}`);
    router.push(`/dashboard/my-jobs/${params.id}`);
  };

  // Fetch job type and day number for smart recommendations + correct work item tracking
  useEffect(() => {
    const fetchJobInfo = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        // Fetch only this specific job (not all jobs) for efficiency on long-term projects
        const res = await fetch(`/api/job-orders?id=${params.id}&include_helper_jobs=true&includeCompleted=true`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          const found = (json.data || [])[0];
          if (found?.job_type) setJobType(found.job_type);
          // Calculate the current day number: total_days_worked + 1 (today is a new day)
          const daysWorked = found?.total_days_worked || 0;
          setCurrentDayNumber(daysWorked + 1);
        }
      } catch (err) {
        console.error('Error fetching job info:', err);
      }
    };
    fetchJobInfo();
  }, [params.id]);

  // Check if today's daily log is already submitted (lock the page if so)
  useEffect(() => {
    const checkDaySubmitted = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/job-orders/${params.id}/daily-log`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          // Check if any log for today already has day_completed_at set
          const todayLog = (json.logs || []).find((l: any) => l.log_date === today && l.day_completed_at);
          if (todayLog) {
            setDayAlreadySubmitted(true);
          }
        }
      } catch { /* non-critical — default to editable */ }
    };
    checkDaySubmitted();
  }, [params.id]);

  // ─── Draft save/load helpers ──────────────────────────────────────────────────
  const saveDraft = useCallback(async (draft: object | null) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`/api/job-orders/${params.id}/work-performed-draft`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ draft }),
      });
    } catch { /* non-critical */ }
  }, [params.id]);

  // Load draft on mount (runs once after job info loads)
  useEffect(() => {
    if (draftLoadedRef.current) return;
    const loadDraft = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          draftLoadedRef.current = true;
          return;
        }

        let draft: Record<string, any> | null = null;

        // ── Try DB first ──────────────────────────────────────────────────────
        try {
          const res = await fetch(`/api/job-orders/${params.id}/work-performed-draft`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const json = await res.json();
            // API shape: { success, data: { draft } }
            draft = json.data?.draft ?? null;
          }
        } catch { /* network error — fall through to localStorage */ }

        // ── Fallback: localStorage ────────────────────────────────────────────
        if (!draft) {
          try {
            const stored = localStorage.getItem(`work-draft-${params.id}`);
            if (stored) draft = JSON.parse(stored);
          } catch { /* corrupt storage — ignore */ }
        }

        // ── Restore state ─────────────────────────────────────────────────────
        if (draft) {
          if (draft.selectedItems?.length > 0) setSelectedItems(draft.selectedItems);
          if (draft.sawingData) setSawingData(draft.sawingData);
          if (draft.coreDrillingData) setCoreDrillingData(draft.coreDrillingData);
          if (draft.jobNotes !== undefined) setVoiceNotes(draft.jobNotes);
          showNotification('Draft restored', 'success');
        }
      } catch { /* non-critical */ }
      // Always mark draft as loaded so auto-save can proceed
      draftLoadedRef.current = true;
    };
    loadDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Debounced auto-save: fires 2 s after any major state change
  useEffect(() => {
    if (!draftLoadedRef.current) return; // don't save before draft is loaded
    // Don't overwrite a previously saved draft with a completely empty state
    if (selectedItems.length === 0 && !voiceNotes) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setSaveStatus('saving');
    autoSaveTimerRef.current = setTimeout(async () => {
      const draft = {
        selectedItems,
        sawingData,
        coreDrillingData,
        jobNotes: voiceNotes,
      };

      // ── Save to localStorage immediately (synchronous backup) ──────────────
      try {
        localStorage.setItem(`work-draft-${params.id}`, JSON.stringify(draft));
      } catch { /* storage quota — ignore */ }

      // ── Save to DB ────────────────────────────────────────────────────────
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setSaveStatus('error');
          return;
        }
        const res = await fetch(`/api/job-orders/${params.id}/work-performed-draft`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ draft }),
        });
        if (res.ok) {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 3000);
        } else {
          setSaveStatus('error');
        }
      } catch {
        setSaveStatus('error');
      }
    }, 2000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems, sawingData, coreDrillingData, voiceNotes]);

  const [standbyLogs, setStandbyLogs] = useState<any[]>([]);
  const [totalStandbyMinutes, setTotalStandbyMinutes] = useState(0);

  // Quick Entry Modal State (Slab/Wall/Hand Saw)
  const [showQuickEntryModal, setShowQuickEntryModal] = useState(false);
  const [quickEntryCuts, setQuickEntryCuts] = useState<Array<{
    numCuts: number;
    lengthFeet: number;
    depth: number;
  }>>([]);
  const [quickEntryNumCuts, setQuickEntryNumCuts] = useState<number>(1);
  const [quickEntryLengthFeet, setQuickEntryLengthFeet] = useState<number>(0);
  const [quickEntryDepth, setQuickEntryDepth] = useState<number>(0);

  // Chain Saw Quick Entry State (length in inches)
  const [showChainsawModal, setShowChainsawModal] = useState(false);
  const [chainsawCuts, setChainsawCuts] = useState<Array<{
    numCuts: number;
    lengthInches: number;
    depth: number;
  }>>([]);
  const [chainsawNumCuts, setChainsawNumCuts] = useState<number>(1);
  const [chainsawLengthInches, setChainsawLengthInches] = useState<number>(0);
  const [chainsawDepth, setChainsawDepth] = useState<number>(0);

  // Break & Remove Quick Entry State
  const [showBreakRemoveModal, setShowBreakRemoveModal] = useState(false);
  const [breakRemoveAreas, setBreakRemoveAreas] = useState<Array<{
    length: number;
    width: number;
    depth: number;
  }>>([]);
  const [breakRemoveLength, setBreakRemoveLength] = useState<number>(0);
  const [breakRemoveWidth, setBreakRemoveWidth] = useState<number>(0);
  const [breakRemoveDepth, setBreakRemoveDepth] = useState<number>(0);
  const [removalMethod, setRemovalMethod] = useState<string>('');
  const [removalEquipment, setRemovalEquipment] = useState<string>('');

  // Jack Hammering Quick Entry State
  const [showJackhammerModal, setShowJackhammerModal] = useState(false);
  const [jackhammerEquipment, setJackhammerEquipment] = useState<string>('');
  const [jackhammerOther, setJackhammerOther] = useState<string>('');
  const [jackhammerAreas, setJackhammerAreas] = useState<Array<{
    length: number;
    width: number;
  }>>([]);
  const [jackhammerLength, setJackhammerLength] = useState<number>(0);
  const [jackhammerWidth, setJackhammerWidth] = useState<number>(0);

  // Brokk Quick Entry State
  const [showBrokkModal, setShowBrokkModal] = useState(false);
  const [brokkAreas, setBrokkAreas] = useState<Array<{
    length: number;
    width: number;
    thickness: number;
  }>>([]);
  const [brokkLength, setBrokkLength] = useState<number>(0);
  const [brokkWidth, setBrokkWidth] = useState<number>(0);
  const [brokkThickness, setBrokkThickness] = useState<number>(0);

  // Fetch standby logs for this job
  useEffect(() => {
    const fetchStandbyLogs = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`/api/standby?jobId=${params.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });

        if (response.ok) {
          const result = await response.json();
          const logs = result.data || [];
          setStandbyLogs(logs);

          // Calculate total standby time
          const totalMinutes = logs.reduce((sum: number, log: any) => {
            if (log.ended_at) {
              const start = new Date(log.started_at).getTime();
              const end = new Date(log.ended_at).getTime();
              const minutes = Math.round((end - start) / 60000);
              return sum + minutes;
            }
            return sum;
          }, 0);
          setTotalStandbyMinutes(totalMinutes);
        }
      } catch (error) {
        console.error('Error fetching standby logs:', error);
      }
    };

    fetchStandbyLogs();
  }, [params.id]);

  // Get all available work items
  const getAllItems = () => {
    let items: string[] = [];
    Object.values(WORK_CATEGORIES).forEach(categoryItems => {
      items = [...items, ...categoryItems];
    });
    return items;
  };

  // Filter work items based on search query
  const getFilteredItems = () => {
    const allItems = getAllItems();

    if (!searchQuery) {
      return allItems;
    }

    return allItems.filter(item =>
      item.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowDropdown(value.length > 0);
  };

  // Handle item selection from dropdown
  const handleQuickAddItem = (itemName: string) => {
    setSearchQuery('');
    setShowDropdown(false);
    handleSelectItem(itemName);
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

  const isBreakAndRemove = (itemName: string) => {
    return itemName.includes('BREAK & REMOVE') || itemName.includes('REMOVAL') || itemName.includes('DEMOLITION');
  };

  const isJackHammering = (itemName: string) => {
    return itemName.includes('JACK HAMMERING') || itemName.includes('JACKHAMMER');
  };

  const isChipping = (itemName: string) => {
    return itemName.includes('CHIPPING');
  };

  const isBrokk = (itemName: string) => {
    return itemName.includes('BROKK');
  };

  const handleSelectItem = (itemName: string) => {
    setCurrentItem(itemName);
    setCurrentQuantity(1);
    setCurrentNotes('');

    // Reset detailed data forms
    setCoreDrillingData({
      holes: [],
      notes: ''
    });

    setCurrentHole({
      bitSize: '',
      depthInches: 0,
      quantity: 1,
      plasticSetup: false,
      cutSteel: false,
      steelEncountered: ''
    });

    setSawingData({
      cuts: [],
      cutType: 'wet',
      notes: ''
    });

    setCurrentCut({
      inputMode: 'linear',
      linearFeet: 0,
      cutDepth: 0,
      areas: [],
      bladesUsed: [],
      cutSteel: false,
      steelEncountered: '',
      overcut: false,
      chainsawed: false,
      chainsawAreas: 0,
      chainsawWidthInches: 0
    });

    setSelectedBlades([]);
    setCustomBladeSize('');
    setCutInputMode('linear');
    setTempAreas([]);
    setCurrentArea({ length: 0, width: 0, depth: 0, quantity: 1, cutSteel: false, overcut: false, steelEncountered: '', chainsawed: false, chainsawAreas: 0, chainsawWidthInches: 0 });

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
      quantity: 1,
      plasticSetup: false,
      cutSteel: false,
      steelEncountered: ''
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
    // Validate based on input mode
    if (cutInputMode === 'area') {
      // For area mode, must have at least one area added
      if (tempAreas.length === 0) {
        alert('Please add at least one cut area');
        return;
      }

      // Calculate total linear feet from areas
      const totalLinearFeet = calculateTotalFromAreas(tempAreas);

      // Use the depth from the first area (all areas should have same depth for one cut entry)
      const cutDepth = tempAreas[0].depth;

      if (selectedBlades.length === 0) {
        const itemType = isChainsaw(currentItem) ? 'chain size' : 'blade type';
        alert(`Please select at least one ${itemType} used`);
        return;
      }

      const cutToAdd: SawingCut = {
        inputMode: 'area',
        linearFeet: totalLinearFeet,
        cutDepth: cutDepth,
        areas: [...tempAreas],
        bladesUsed: [...selectedBlades],
        cutSteel: currentCut.cutSteel,
        steelEncountered: currentCut.steelEncountered,
        overcut: currentCut.overcut,
        chainsawed: currentCut.chainsawed,
        chainsawAreas: currentCut.chainsawAreas,
        chainsawWidthInches: currentCut.chainsawWidthInches
      };

      setSawingData(prev => ({
        ...prev,
        cuts: [...prev.cuts, cutToAdd]
      }));
    } else {
      // Linear mode validation
      if (currentCut.linearFeet <= 0 || currentCut.cutDepth <= 0) {
        alert('Please specify both linear feet and cut depth');
        return;
      }

      if (selectedBlades.length === 0) {
        const itemType = isChainsaw(currentItem) ? 'chain size' : 'blade type';
        alert(`Please select at least one ${itemType} used`);
        return;
      }

      const cutToAdd: SawingCut = {
        ...currentCut,
        inputMode: 'linear',
        bladesUsed: [...selectedBlades]
      };

      setSawingData(prev => ({
        ...prev,
        cuts: [...prev.cuts, cutToAdd]
      }));
    }

    // Reset current cut for next entry
    setCurrentCut({
      inputMode: 'linear',
      linearFeet: 0,
      cutDepth: 0,
      areas: [],
      bladesUsed: [],
      cutSteel: false,
      steelEncountered: '',
      overcut: false,
      chainsawed: false,
      chainsawAreas: 0,
      chainsawWidthInches: 0
    });
    setSelectedBlades([]);
    setCustomBladeSize('');
    setCutInputMode('linear');
    setTempAreas([]);
    setCurrentArea({ length: 0, width: 0, depth: 0, quantity: 1, cutSteel: false, overcut: false, steelEncountered: '', chainsawed: false, chainsawAreas: 0, chainsawWidthInches: 0 });
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

  // Calculate linear feet from area (perimeter: 2 * length + 2 * width) * quantity
  const calculateLinearFeetFromArea = (area: CutArea): number => {
    const perimeter = (2 * area.length) + (2 * area.width);
    return perimeter * (area.quantity || 1);
  };

  // Calculate total linear feet from all areas
  const calculateTotalFromAreas = (areas: CutArea[]): number => {
    return areas.reduce((total, area) => total + calculateLinearFeetFromArea(area), 0);
  };

  // Add an area to the temporary areas list
  const addArea = () => {
    if (currentArea.length <= 0 || currentArea.width <= 0 || currentArea.depth <= 0) {
      alert('Please specify length, width, and depth for the area');
      return;
    }

    setTempAreas(prev => [...prev, { ...currentArea }]);
    setCurrentArea({ length: 0, width: 0, depth: 0, quantity: 1, cutSteel: false, overcut: false, steelEncountered: '', chainsawed: false, chainsawAreas: 0, chainsawWidthInches: 0 });
  };

  // Remove an area from temporary areas list
  const removeArea = (index: number) => {
    setTempAreas(prev => prev.filter((_, i) => i !== index));
  };

  // Quick Entry Modal Functions
  const addQuickEntryCut = () => {
    if (quickEntryNumCuts <= 0 || quickEntryLengthFeet <= 0) {
      alert('Please specify number of cuts and length');
      return;
    }

    const newCut = {
      numCuts: quickEntryNumCuts,
      lengthFeet: quickEntryLengthFeet,
      depth: quickEntryDepth
    };

    setQuickEntryCuts(prev => [...prev, newCut]);

    // Reset inputs
    setQuickEntryNumCuts(1);
    setQuickEntryLengthFeet(0);
    setQuickEntryDepth(0);
  };

  const removeQuickEntryCut = (index: number) => {
    setQuickEntryCuts(prev => prev.filter((_, i) => i !== index));
  };

  const calculateQuickEntryTotal = () => {
    return quickEntryCuts.reduce((total, cut) => {
      return total + (cut.numCuts * cut.lengthFeet);
    }, 0);
  };

  const applyQuickEntry = () => {
    if (quickEntryCuts.length === 0) {
      alert('Please add at least one cut entry');
      return;
    }

    const totalLinearFeet = calculateQuickEntryTotal();
    // Get depth from the cut entries (not from quickEntryDepth which resets after each add)
    const maxDepth = Math.max(...quickEntryCuts.map(cut => cut.depth || 0));
    setCurrentCut(prev => ({ ...prev, linearFeet: totalLinearFeet, cutDepth: maxDepth }));

    // Close modal and reset
    setShowQuickEntryModal(false);
    setQuickEntryCuts([]);
    setQuickEntryNumCuts(1);
    setQuickEntryLengthFeet(0);
    setQuickEntryDepth(0);
  };

  // Chain Saw Quick Entry Functions
  const addChainsawCut = () => {
    if (chainsawNumCuts <= 0 || chainsawLengthInches <= 0) {
      alert('Please specify number of cuts and length in inches');
      return;
    }

    const newCut = {
      numCuts: chainsawNumCuts,
      lengthInches: chainsawLengthInches,
      depth: chainsawDepth
    };

    setChainsawCuts(prev => [...prev, newCut]);

    // Reset inputs
    setChainsawNumCuts(1);
    setChainsawLengthInches(0);
    setChainsawDepth(0);
  };

  const removeChainsawCut = (index: number) => {
    setChainsawCuts(prev => prev.filter((_, i) => i !== index));
  };

  const calculateChainsawTotal = () => {
    return chainsawCuts.reduce((total, cut) => {
      // Convert inches to feet
      const lengthInFeet = cut.lengthInches / 12;
      return total + (cut.numCuts * lengthInFeet);
    }, 0);
  };

  const applyChainsawEntry = () => {
    if (chainsawCuts.length === 0) {
      alert('Please add at least one cut entry');
      return;
    }

    const totalLinearFeet = calculateChainsawTotal();
    // Get depth from the cut entries (not from chainsawDepth which resets after each add)
    const maxDepth = Math.max(...chainsawCuts.map(cut => cut.depth || 0));
    setCurrentCut(prev => ({ ...prev, linearFeet: totalLinearFeet, cutDepth: maxDepth }));

    // Close modal and reset
    setShowChainsawModal(false);
    setChainsawCuts([]);
    setChainsawNumCuts(1);
    setChainsawLengthInches(0);
    setChainsawDepth(0);
  };

  // Break & Remove Quick Entry Functions
  const addBreakRemoveArea = () => {
    if (breakRemoveLength <= 0 || breakRemoveWidth <= 0 || breakRemoveDepth <= 0) {
      alert('Please specify length, width, and depth');
      return;
    }

    const newArea = {
      length: breakRemoveLength,
      width: breakRemoveWidth,
      depth: breakRemoveDepth
    };

    setBreakRemoveAreas(prev => [...prev, newArea]);

    // Reset inputs
    setBreakRemoveLength(0);
    setBreakRemoveWidth(0);
    setBreakRemoveDepth(0);
  };

  const removeBreakRemoveArea = (index: number) => {
    setBreakRemoveAreas(prev => prev.filter((_, i) => i !== index));
  };

  const calculateBreakRemoveTotal = () => {
    return breakRemoveAreas.reduce((total, area) => {
      return total + (area.length * area.width);
    }, 0);
  };

  const applyBreakRemoveEntry = () => {
    if (breakRemoveAreas.length === 0) {
      alert('Please add at least one area');
      return;
    }

    if (!removalMethod) {
      alert('Please select a removal method');
      return;
    }

    if (removalMethod === 'rigged' && !removalEquipment) {
      alert('Please specify equipment used for rigging');
      return;
    }

    const totalSquareFeet = calculateBreakRemoveTotal();
    const notes = `Removal Method: ${removalMethod}${removalEquipment ? ` (${removalEquipment})` : ''} | Total: ${totalSquareFeet.toFixed(2)} sq ft`;

    setCurrentQuantity(totalSquareFeet);
    setCurrentNotes(notes);

    // Close modal and reset
    setShowBreakRemoveModal(false);
    setBreakRemoveAreas([]);
    setBreakRemoveLength(0);
    setBreakRemoveWidth(0);
    setBreakRemoveDepth(0);
    setRemovalMethod('');
    setRemovalEquipment('');
  };

  // Jack Hammering Quick Entry Functions
  const addJackhammerArea = () => {
    if (jackhammerLength <= 0 || jackhammerWidth <= 0) {
      alert('Please specify length and width');
      return;
    }

    const newArea = {
      length: jackhammerLength,
      width: jackhammerWidth
    };

    setJackhammerAreas(prev => [...prev, newArea]);

    // Reset inputs
    setJackhammerLength(0);
    setJackhammerWidth(0);
  };

  const removeJackhammerArea = (index: number) => {
    setJackhammerAreas(prev => prev.filter((_, i) => i !== index));
  };

  const calculateJackhammerTotal = () => {
    return jackhammerAreas.reduce((total, area) => {
      return total + (area.length * area.width);
    }, 0);
  };

  const applyJackhammerEntry = () => {
    if (jackhammerAreas.length === 0) {
      alert('Please add at least one area');
      return;
    }

    if (!jackhammerEquipment) {
      alert('Please select equipment used');
      return;
    }

    const equipment = jackhammerEquipment === 'other' ? jackhammerOther : jackhammerEquipment;
    const totalSquareFeet = calculateJackhammerTotal();
    const notes = `Equipment: ${equipment} | Total: ${totalSquareFeet.toFixed(2)} sq ft`;

    setCurrentQuantity(totalSquareFeet);
    setCurrentNotes(notes);

    // Close modal and reset
    setShowJackhammerModal(false);
    setJackhammerAreas([]);
    setJackhammerLength(0);
    setJackhammerWidth(0);
    setJackhammerEquipment('');
    setJackhammerOther('');
  };

  // Brokk Quick Entry Functions
  const addBrokkArea = () => {
    if (brokkLength <= 0 || brokkWidth <= 0 || brokkThickness <= 0) {
      alert('Please specify length, width, and thickness');
      return;
    }

    const newArea = {
      length: brokkLength,
      width: brokkWidth,
      thickness: brokkThickness
    };

    setBrokkAreas(prev => [...prev, newArea]);

    // Reset inputs
    setBrokkLength(0);
    setBrokkWidth(0);
    setBrokkThickness(0);
  };

  const removeBrokkArea = (index: number) => {
    setBrokkAreas(prev => prev.filter((_, i) => i !== index));
  };

  const calculateBrokkTotal = () => {
    return brokkAreas.reduce((total, area) => {
      return total + (area.length * area.width);
    }, 0);
  };

  const applyBrokkEntry = () => {
    if (brokkAreas.length === 0) {
      alert('Please add at least one area');
      return;
    }

    const totalSquareFeet = calculateBrokkTotal();
    const avgThickness = brokkAreas.reduce((sum, area) => sum + area.thickness, 0) / brokkAreas.length;
    const notes = `Total: ${totalSquareFeet.toFixed(2)} sq ft | Avg Thickness: ${avgThickness.toFixed(1)}"`;

    setCurrentQuantity(totalSquareFeet);
    setCurrentNotes(notes);

    // Close modal and reset
    setShowBrokkModal(false);
    setBrokkAreas([]);
    setBrokkLength(0);
    setBrokkWidth(0);
    setBrokkThickness(0);
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

    if (isWallSaw(itemName)) {
      return ['32" Diamond', '42" Diamond', '56" Diamond', '62" Diamond', '72" Diamond'];
    }

    if (isSlabSaw(itemName)) {
      return [
        '20" Diamond',
        '24" Diamond',
        '26" Diamond',
        '30" Diamond',
        '32" Diamond',
        '36" Diamond',
        '42" Diamond',
        '54" Diamond',
        '62" Diamond',
        '72" Diamond'
      ];
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

    // Show the "Add More" dialog instead of closing immediately
    setShowAddMoreDialog(true);
  };

  const handleAddMore = () => {
    // Reset for adding another work item
    setShowAddMoreDialog(false);
    setCurrentItem('');
    setCurrentQuantity(1);
    setCurrentNotes('');
    setCoreDrillingData({ holes: [], notes: '' });
    setSawingData({ cuts: [], cutType: 'wet', notes: '' });
    setCurrentCut({
      inputMode: 'linear',
      linearFeet: 0,
      cutDepth: 0,
      areas: [],
      bladesUsed: [],
      cutSteel: false,
      steelEncountered: '',
      overcut: false,
      chainsawed: false,
      chainsawAreas: 0,
      chainsawWidthInches: 0
    });
    setSelectedBlades([]);
    setCustomBladeSize('');
    setCutInputMode('linear');
    setTempAreas([]);
    setCurrentArea({ length: 0, width: 0, depth: 0, quantity: 1, cutSteel: false, overcut: false, steelEncountered: '', chainsawed: false, chainsawAreas: 0, chainsawWidthInches: 0 });
    setCurrentHole({
      bitSize: '',
      depthInches: 0,
      quantity: 1,
      plasticSetup: false,
      cutSteel: false,
      steelEncountered: ''
    });
    // Show dropdown to select another work item
    setShowDropdown(true);
  };

  const handleContinue = () => {
    // Close everything and continue
    setShowAddMoreDialog(false);
    setShowQuantityModal(false);
  };

  const handleRemoveItem = (itemName: string) => {
    setSelectedItems(selectedItems.filter(item => item.name !== itemName));
  };

  const handleSaveEquipmentUsage = async (equipmentData: any) => {
    setSavingEquipment(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        return;
      }

      // Save equipment usage via API
      const response = await fetch('/api/equipment-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          job_order_id: params.id,
          ...equipmentData
        })
      });

      const result = await response.json();

      if (result.success) {
        // Add to local state
        setEquipmentUsageEntries(prev => [...prev, result.data]);
        setShowEquipmentForm(false);
        alert('Equipment usage saved successfully!');
      } else {
        alert('Failed to save equipment usage: ' + result.error);
      }
    } catch (error) {
      console.error('Error saving equipment usage:', error);
      alert('Failed to save equipment usage');
    } finally {
      setSavingEquipment(false);
    }
  };

  const handleRemoveEquipmentEntry = async (entryId: string) => {
    if (!confirm('Are you sure you want to remove this equipment usage entry?')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/equipment-usage/${entryId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        setEquipmentUsageEntries(prev => prev.filter(entry => entry.id !== entryId));
        alert('Equipment usage entry removed');
      } else {
        alert('Failed to remove entry: ' + result.error);
      }
    } catch (error) {
      console.error('Error removing equipment entry:', error);
      alert('Failed to remove entry');
    }
  };

  const showNotification = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      showNotification('Please select at least one work item', 'warning');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Save work items to database (primary storage)
        const res = await fetch(`/api/job-orders/${params.id}/work-items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            items: selectedItems,
            dayNumber: currentDayNumber,
            notes: voiceNotes || undefined
          })
        });

        if (!res.ok) {
          console.error('Failed to save work items to DB, falling back to localStorage');
        }

        // Track blade usage for sawing work (fire and forget)
        fetch('/api/equipment/track-usage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            job_order_id: params.id,
            work_items: selectedItems
          })
        }).catch(err => console.error('Blade tracking error:', err));

        // Save photos if any were taken
        if (jobPhotos.length > 0) {
          fetch(`/api/job-orders/${params.id}/photos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ photo_urls: jobPhotos })
          }).catch(err => console.error('Photo save error:', err));
        }

        // Update workflow tracking (fire and forget)
        fetch('/api/workflow', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            jobId: params.id,
            completedStep: 'work_performed',
            currentStep: 'day_complete',
          })
        }).catch(() => {});
      }

      // Also save to localStorage as backup
      const workPerformedData = {
        jobId: params.id,
        items: selectedItems,
        photos: jobPhotos,
        notes: voiceNotes || '',
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(`work-performed-${params.id}`, JSON.stringify(workPerformedData));

      // Clear draft on successful submission (DB + localStorage)
      saveDraft(null).catch(() => {});
      try { localStorage.removeItem(`work-draft-${params.id}`); } catch { /* ignore */ }

      showNotification('Work performed saved!', 'success');

      // Clear resume-last-position marker on successful submission
      localStorage.removeItem(`job_last_page_${params.id}`);

      // Navigate to day completion page (done for today vs fully complete)
      setTimeout(() => {
        router.push(`/dashboard/job-schedule/${params.id}/day-complete`);
      }, 800);
    } catch (error) {
      console.error('Error submitting work performed:', error);
      // Fallback: save to localStorage and still navigate
      const workPerformedData = {
        jobId: params.id,
        items: selectedItems,
        photos: jobPhotos,
        notes: voiceNotes || '',
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(`work-performed-${params.id}`, JSON.stringify(workPerformedData));
      localStorage.removeItem(`job_last_page_${params.id}`);
      try { localStorage.removeItem(`work-draft-${params.id}`); } catch { /* ignore */ }
      router.push(`/dashboard/job-schedule/${params.id}/day-complete`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618]">
      {/* Header */}
      <div className="bg-white dark:bg-white/[0.03] border-b border-gray-200 dark:border-white/10 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-lg">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="p-2 bg-gray-100 dark:bg-white/10 rounded-xl border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-all"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <button
              onClick={() => { localStorage.removeItem(`job_last_page_${params.id}`); router.push('/dashboard'); }}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              title="Dashboard"
            >
              <Home className="w-5 h-5 text-gray-600 dark:text-white" />
            </button>
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">Work Performed</h1>
              <div className="flex items-center gap-2">
                <p className="text-gray-500 dark:text-white/50 text-xs">Select completed work items</p>
                {saveStatus === 'saving' && (
                  <span className="text-xs text-gray-400 dark:text-white/30 flex items-center gap-1">
                    <Save className="w-3 h-3 animate-pulse" />Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Save className="w-3 h-3" />Saved ✓
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <DarkModeIconToggle />
              {selectedItems.length > 0 && (
                <span className="px-2 py-1.5 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded-xl text-xs font-semibold border border-purple-200 dark:border-purple-500/30">
                  {selectedItems.length}
                </span>
              )}
              <button
                onClick={() => setView(view === 'search' ? 'selected' : 'search')}
                className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all font-semibold text-xs shadow-sm min-h-[36px]"
              >
                <span className="hidden sm:inline">{view === 'search' ? 'View Selected' : 'Add More'}</span>
                <span className="sm:hidden">{view === 'search' ? 'Selected' : 'Search'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 pb-24 max-w-lg">
        {/* Quick Access Buttons */}
        <QuickAccessButtons jobId={params.id as string} />

        {/* ─── Day Already Submitted Banner ───────────────────────────── */}
        {dayAlreadySubmitted && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0-6v2m-6 4h12a2 2 0 002-2V9a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <div>
              <p className="text-sm font-bold text-amber-800">Day already submitted</p>
              <p className="text-xs text-amber-700 mt-0.5">You have already tapped &quot;Done for Today&quot; for this job. Your work log is saved and cannot be edited.</p>
            </div>
          </div>
        )}

        {view === 'search' ? (
          <>
            {/* Autocomplete Search Bar */}
            <div className="bg-white dark:bg-white/[0.05] backdrop-blur-lg rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-4 mb-4">
              {/* Smart Recommendations based on job type */}
              <RecommendedItems
                jobType={jobType}
                selectedItems={selectedItems.map(i => i.name)}
                onAddItem={(itemName) => handleQuickAddItem(itemName)}
              />

              <label className="block text-sm font-bold text-gray-700 dark:text-white mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-500" />
                Search and Add Work Items
              </label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Type to search work items..."
                  className="w-full pl-12 pr-4 py-4 text-lg rounded-xl border-2 border-gray-200 dark:border-white/10 focus:border-purple-400 dark:focus:border-purple-500 focus:outline-none transition-colors text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] font-medium placeholder:text-gray-400 dark:placeholder-white/30"
                />

                {/* Autocomplete Dropdown */}
                {showDropdown && getFilteredItems().length > 0 && (
                  <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border-2 border-gray-200 dark:border-white/10 max-h-96 overflow-y-auto">
                    {getFilteredItems().slice(0, 20).map((item) => {
                      const isSelected = selectedItems.some(si => si.name === item);
                      return (
                        <button
                          key={item}
                          onClick={() => handleQuickAddItem(item)}
                          className={`w-full px-4 py-3 text-left hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors border-b border-gray-100 dark:border-white/5 last:border-b-0 ${
                            isSelected ? 'bg-green-50 dark:bg-green-500/10' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900 dark:text-white">{item}</span>
                            {isSelected && (
                              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full font-bold">
                                Added
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-white/40 mt-2">
                Start typing to see suggestions. Click to add multiple items.
              </p>
            </div>

            {/* Selected Items Display */}
            {selectedItems.length > 0 && (
              <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-500/20 rounded-2xl p-4 mb-4">
                <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Selected Items ({selectedItems.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedItems.map((item, index) => (
                    <div
                      key={index}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 shadow-sm text-sm"
                    >
                      <span>{item.name} <span className="opacity-80">×{item.quantity}</span></span>
                      <button
                        onClick={() => setSelectedItems(selectedItems.filter((_, i) => i !== index))}
                        className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Popular Items Quick Add */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-2xl shadow-sm border border-purple-100 dark:border-purple-500/20 p-5 mb-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
                Popular Items — Quick Add
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {POPULAR_ITEMS.map((item) => {
                const isSelected = selectedItems.some(si => si.name === item);
                return (
                  <button
                    key={item}
                    onClick={() => handleSelectItem(item)}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                      isSelected
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-500/40 shadow-md'
                        : 'bg-white dark:bg-white/[0.05] border-gray-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-500/50 hover:shadow-md hover:bg-purple-50 dark:hover:bg-purple-900/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className={`font-bold text-sm ${isSelected ? 'text-green-800 dark:text-green-300' : 'text-gray-800 dark:text-white group-hover:text-purple-700 dark:group-hover:text-purple-300'}`}>{item}</h3>
                        {isSelected && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5 font-semibold">
                            Qty: {selectedItems.find(si => si.name === item)?.quantity}
                          </p>
                        )}
                      </div>
                      {isSelected ? (
                        <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full border-2 border-gray-200 dark:border-white/20 group-hover:border-purple-400 dark:group-hover:border-purple-500 flex items-center justify-center flex-shrink-0 transition-colors">
                          <svg className="w-3.5 h-3.5 text-gray-300 dark:text-white/30 group-hover:text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
              </div>
            </div>
          </>
        ) : (
          /* Selected Items View */
          <div className="bg-white dark:bg-white/[0.05] rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              Selected Work Items
            </h2>

            {/* Standby Time Summary */}
            {standbyLogs.length > 0 && (
              <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-yellow-900 mb-2">⏱️ Standby Time Recorded</h3>
                    <div className="space-y-2">
                      {standbyLogs.map((log, index) => {
                        const start = new Date(log.started_at);
                        const end = log.ended_at ? new Date(log.ended_at) : null;
                        const durationMinutes = end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;
                        const hours = Math.floor(durationMinutes / 60);
                        const minutes = durationMinutes % 60;

                        return (
                          <div key={log.id || index} className="bg-white rounded-lg p-3 border border-yellow-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-gray-800">
                                  {start.toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  })}
                                  {end && (
                                    <span className="text-gray-500"> → {end.toLocaleString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true
                                    })}</span>
                                  )}
                                </p>
                                {log.reason && (
                                  <p className="text-xs text-gray-600 mt-1">Reason: {log.reason}</p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-yellow-700">
                                  {hours > 0 ? `${hours}h ` : ''}{minutes}m
                                </p>
                                <p className="text-xs text-gray-500">Duration</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 pt-3 border-t-2 border-yellow-300">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-yellow-900">Total Standby Time:</p>
                        <p className="text-2xl font-bold text-yellow-700">
                          {Math.floor(totalStandbyMinutes / 60) > 0 ? `${Math.floor(totalStandbyMinutes / 60)}h ` : ''}
                          {totalStandbyMinutes % 60}m
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedItems.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No items selected yet</p>
                <button
                  onClick={() => setView('search')}
                  className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
                >
                  Add Work Items
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedItems.map((item) => (
                  <div key={item.name} className="bg-gray-50 dark:bg-white/[0.04] rounded-xl overflow-hidden border border-gray-100 dark:border-white/10">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          {isCoreDrilling(item.name) && (
                            <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                          {isSawing(item.name) && (
                            <svg className="w-4 h-4 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                            </svg>
                          )}
                          {item.name}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs font-semibold text-gray-500 dark:text-white/50 bg-gray-200 dark:bg-white/10 px-2 py-0.5 rounded-full">
                            Qty: {item.quantity}
                          </span>
                          {item.notes && (
                            <span className="text-xs text-gray-500 dark:text-white/40 truncate max-w-[150px]">{item.notes}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.name)}
                        className="p-2 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors border border-red-100 dark:border-red-500/20"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                        <span className="font-medium text-blue-600">{cut.linearFeet.toFixed(1)}&apos;</span>
                                        <span className="text-gray-500">linear feet at</span>
                                        <span className="font-medium">{cut.cutDepth}&quot;</span>
                                        <span className="text-gray-500">deep</span>
                                      </div>
                                      {cut.inputMode === 'area' && (
                                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                          Area Mode
                                        </span>
                                      )}
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
                                    {/* Show areas if entered using area mode */}
                                    {cut.inputMode === 'area' && cut.areas && cut.areas.length > 0 && (
                                      <div className="mt-2 bg-white rounded-lg p-2 border border-purple-200">
                                        <div className="text-xs text-gray-600 mb-1">Cut Areas:</div>
                                        <div className="flex flex-wrap gap-1">
                                          {cut.areas.map((area, areaIndex) => (
                                            <span key={areaIndex} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs">
                                              {area.length}&apos; × {area.width}&apos; ({area.depth}&quot; deep)
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    <div className="flex flex-wrap gap-1 text-xs mt-1">
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
                                  <div key={index} className="bg-gray-50 rounded-lg p-2 text-sm">
                                    <div className="flex items-center gap-1 mb-1">
                                      <span className="font-medium text-orange-600">{hole.quantity}x</span>
                                      <span className="font-medium">{hole.bitSize}</span>
                                      <span className="text-gray-500">at</span>
                                      <span className="font-medium">{hole.depthInches}&quot;</span>
                                      <span className="text-gray-500">deep</span>
                                    </div>
                                    {(hole.plasticSetup || hole.cutSteel) && (
                                      <div className="flex gap-1 text-xs mt-1">
                                        {hole.plasticSetup && (
                                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Plastic</span>
                                        )}
                                        {hole.cutSteel && (
                                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                                            Steel{hole.steelEncountered ? `: ${hole.steelEncountered}` : ''}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Notes */}
                          {item.details.notes && (
                            <div className="text-sm border-t pt-3">
                              <span className="text-gray-500">Notes:</span>
                              <span className="ml-1 text-gray-700">{item.details.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Equipment Usage Section */}
            {selectedItems.length > 0 && (
              <div className="mt-8 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-xl p-6 border-2 border-indigo-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                        <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      Equipment Usage Tracking
                    </h2>
                    <p className="text-gray-600 font-medium mt-1">Track equipment metrics for accurate job costing</p>
                  </div>
                  <button
                    onClick={() => setShowEquipmentForm(true)}
                    disabled={savingEquipment}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Equipment Usage
                  </button>
                </div>

                {/* Equipment Usage Entries */}
                {equipmentUsageEntries.length === 0 ? (
                  <div className="bg-white rounded-xl p-8 text-center border-2 border-dashed border-indigo-300">
                    <svg className="w-16 h-16 mx-auto text-indigo-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-gray-500 font-semibold mb-2">No equipment usage tracked yet</p>
                    <p className="text-gray-400 text-sm">Click "Add Equipment Usage" to track linear feet, blade usage, and resource consumption</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {equipmentUsageEntries.map((entry, index) => (
                      <div key={entry.id || index} className="bg-white rounded-xl p-5 border-2 border-gray-200 hover:border-indigo-300 transition-all shadow-md">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Equipment</p>
                              <p className="text-sm font-bold text-gray-900">{entry.equipment_type.replace(/_/g, ' ').toUpperCase()}</p>
                              {entry.equipment_id && <p className="text-xs text-gray-500">{entry.equipment_id}</p>}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Linear Feet</p>
                              <p className="text-lg font-bold text-blue-600">{entry.linear_feet_cut} ft</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Difficulty</p>
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                entry.difficulty_level === 'easy' ? 'bg-green-100 text-green-700' :
                                entry.difficulty_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                entry.difficulty_level === 'hard' ? 'bg-orange-100 text-orange-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {entry.difficulty_level.toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Blades Used</p>
                              <p className="text-sm font-bold text-purple-600">{entry.blades_used || 0}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveEquipmentEntry(entry.id)}
                            className="ml-4 p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* Resource Consumption Summary */}
                        <div className="mt-3 pt-3 border-t border-gray-200 grid grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-gray-500">Hydraulic:</span>
                            <span className="ml-1 font-semibold text-gray-700">{entry.hydraulic_hose_used_ft} ft</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Water:</span>
                            <span className="ml-1 font-semibold text-gray-700">{entry.water_hose_used_ft} ft</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Power:</span>
                            <span className="ml-1 font-semibold text-gray-700">{entry.power_hours} hrs</span>
                          </div>
                        </div>

                        {entry.notes && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">Notes:</p>
                            <p className="text-sm text-gray-700">{entry.notes}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Job Photos Section */}
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 p-5 shadow-sm mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Camera className="w-5 h-5 text-purple-500" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Job Photos</h3>
            <span className="text-xs text-gray-400 dark:text-white/40">(optional)</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-white/50 mb-3">
            Document your work — site conditions, before/after, and your team in action
          </p>
          <PhotoUploader
            bucket="job-photos"
            pathPrefix={params.id as string}
            photos={jobPhotos}
            onPhotosChange={setJobPhotos}
            maxPhotos={10}
            label="Add Job Photos"
            lightMode={true}
          />
          <div className="mt-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 flex items-start gap-2">
            <span className="text-blue-500 text-lg flex-shrink-0">📸</span>
            <div>
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Showcase your work!</p>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Photos of you and your crew working are encouraged — they demonstrate professionalism and effort to the customer.
              </p>
            </div>
          </div>
        </div>

        {/* Voice Memo Notes */}
        <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-100 dark:border-white/10 p-5 shadow-sm mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Mic className="w-5 h-5 text-purple-500" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Job Notes</h3>
            <span className="text-xs text-gray-400 dark:text-white/40">(voice or typed)</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-white/50 mb-3">
            Describe work performed, conditions encountered, or anything noteworthy. Use the mic button to dictate notes hands-free.
          </p>
          <VoiceMemoNotes
            notes={voiceNotes}
            onNotesChange={setVoiceNotes}
            placeholder="Tap the mic and describe what you did today..."
          />
        </div>

        {/* Submit Button */}
        {selectedItems.length > 0 && !dayAlreadySubmitted && (
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#0b0618]/95 backdrop-blur-lg border-t border-gray-200 dark:border-white/10 p-4 pb-6 z-50">
            <div className="container mx-auto max-w-lg flex gap-3">
              <button
                onClick={goBack}
                className="flex-shrink-0 px-5 py-3.5 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-all font-semibold text-sm border border-gray-200 dark:border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                {isSubmitting ? 'Saving...' : 'Next: Job Survey'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Work Item Detail Modal */}
      {showQuantityModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 dark:border-white/10">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-white/10 p-4 sm:p-6 rounded-t-2xl">
              <h3 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ${
                  isCoreDrilling(currentItem)
                    ? 'bg-gradient-to-br from-blue-500 to-cyan-500'
                    : isSawing(currentItem)
                    ? 'bg-gradient-to-br from-orange-500 to-red-500'
                    : 'bg-gradient-to-br from-purple-600 to-indigo-600'
                }`}>
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <span className="block">{currentItem}</span>
                  <span className={`block h-0.5 w-16 mt-1 rounded-full ${
                    isCoreDrilling(currentItem) ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
                    isSawing(currentItem) ? 'bg-gradient-to-r from-orange-500 to-red-500' :
                    'bg-gradient-to-r from-purple-500 to-indigo-500'
                  }`} />
                </div>
              </h3>
            </div>
            <div className="p-4 sm:p-6">

              <div className="space-y-6">
                {/* Core Drilling - Total Holes Summary */}
                {isCoreDrilling(currentItem) && (
                  <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-2xl p-4 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm uppercase tracking-wide opacity-90">Total Holes</h4>
                        <p className="text-blue-100 text-xs mt-0.5">All sizes combined</p>
                      </div>
                      <div className="text-4xl font-black text-white">
                        {getTotalHoles()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sawing - Total Linear Feet Summary */}
                {isSawing(currentItem) && (
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-4 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm uppercase tracking-wide opacity-90">Total Linear Feet</h4>
                        <p className="text-blue-100 text-xs mt-0.5">All cuts combined</p>
                      </div>
                      <div className="text-4xl font-black text-white">
                        {getTotalLinearFeet()}&apos;
                      </div>
                    </div>
                  </div>
                )}

                {/* Core Drilling Specific Fields */}
                {isCoreDrilling(currentItem) && (
                  <div className="space-y-4">
                    <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 border-l-4 border-blue-500 pl-3">
                      <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Core Drilling Details
                    </h4>

                    {/* Add New Hole Entry */}
                    <div className="bg-white dark:bg-white/[0.04] rounded-2xl p-4 sm:p-6 border border-gray-100 dark:border-white/10 shadow-sm">
                      <h5 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2 text-base border-l-4 border-purple-500 pl-3">
                        <svg className="w-5 h-5 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Hole Entry
                      </h5>

                      <div className="grid grid-cols-3 gap-2 sm:gap-4">
                        {/* Bit Size - Text Input */}
                        <div>
                          <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Bit Size
                          </label>
                          <input
                            type="text"
                            value={currentHole.bitSize}
                            onChange={(e) => setCurrentHole(prev => ({ ...prev, bitSize: e.target.value }))}
                            className="w-full px-4 py-3 text-base font-semibold text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-white/30"
                            placeholder='e.g., 1", 2-1/2", 6"'
                          />
                          <p className="text-xs text-gray-500 dark:text-white/40 mt-1">Common: 1/2", 1", 2", 4", 6", 8", 12"</p>
                        </div>

                        {/* Depth - Modern Input */}
                        <div>
                          <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            Depth (in)
                          </label>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            value={currentHole.depthInches || ''}
                            onChange={(e) => setCurrentHole(prev => ({ ...prev, depthInches: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-4 py-3 text-base font-semibold text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-white/30"
                            placeholder="0.00"
                          />
                        </div>

                        {/* Quantity - Modern Input */}
                        <div>
                          <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                            </svg>
                            Quantity
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={currentHole.quantity}
                            onChange={(e) => setCurrentHole(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                            className="w-full px-4 py-3 text-base font-semibold text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-white/30"
                            placeholder="1"
                          />
                        </div>
                      </div>

                      {/* Plastic Setup for this hole */}
                      <div className={`mt-4 rounded-xl border-2 px-4 py-3 flex items-center justify-between cursor-pointer transition-all ${
                        currentHole.plasticSetup
                          ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                      }`}
                        onClick={() => setCurrentHole(prev => ({ ...prev, plasticSetup: !prev.plasticSetup }))}>
                        <div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">Plastic Setup Required</span>
                          <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">Need plastic for dust control?</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={currentHole.plasticSetup}
                          onChange={(e) => setCurrentHole(prev => ({ ...prev, plasticSetup: e.target.checked }))}
                          className="w-5 h-5 text-purple-600 bg-white dark:bg-white/10 border-2 border-gray-300 dark:border-white/20 rounded focus:ring-2 focus:ring-purple-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      {/* Cut Through Steel for this hole */}
                      <div className={`mt-3 rounded-xl border-2 px-4 py-3 flex items-center justify-between cursor-pointer transition-all ${
                        currentHole.cutSteel
                          ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                          : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                      }`}
                        onClick={() => setCurrentHole(prev => ({ ...prev, cutSteel: !prev.cutSteel }))}>
                        <div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">Cut Through Steel</span>
                          <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">Cut through steel/rebar?</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={currentHole.cutSteel}
                          onChange={(e) => setCurrentHole(prev => ({ ...prev, cutSteel: e.target.checked }))}
                          className="w-5 h-5 text-red-600 bg-white dark:bg-white/10 border-2 border-gray-300 dark:border-white/20 rounded focus:ring-2 focus:ring-red-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>

                      <button
                        onClick={addHole}
                        className="mt-4 w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl transition-all flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add This Hole
                      </button>
                    </div>

                    {/* Added Holes List */}
                    {coreDrillingData.holes.length > 0 && (
                      <div className="bg-white dark:bg-white/[0.04] rounded-2xl border border-gray-200 dark:border-white/10 p-4">
                        <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2 border-l-4 border-purple-500 pl-3 text-base">
                          <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Added Holes ({coreDrillingData.holes.length} entries)
                        </h5>
                        <div className="space-y-2">
                          {coreDrillingData.holes.map((hole, index) => (
                            <div key={index} className="bg-gray-50 dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/10 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-4 text-sm">
                                  <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{hole.bitSize}</span>
                                    <span className="text-gray-500 dark:text-white/40"> bit</span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{hole.depthInches}&quot;</span>
                                    <span className="text-gray-500 dark:text-white/40"> deep</span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-gray-900 dark:text-white">{hole.quantity}</span>
                                    <span className="text-gray-500 dark:text-white/40"> {hole.quantity === 1 ? 'hole' : 'holes'}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => removeHole(index)}
                                  className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg p-1.5 transition-all"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                              {(hole.plasticSetup || hole.cutSteel) && (
                                <div className="flex gap-2 text-xs">
                                  {hole.plasticSetup && (
                                    <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full font-medium">Plastic Setup</span>
                                  )}
                                  {hole.cutSteel && (
                                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full font-medium">
                                      Steel Cut{hole.steelEncountered ? `: ${hole.steelEncountered}` : ''}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}


                    {/* Core Drilling Notes */}
                    <div>
                      <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">Additional Notes</label>
                      <textarea
                        value={coreDrillingData.notes}
                        onChange={(e) => setCoreDrillingData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Any additional details about the core drilling work..."
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none transition-colors text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder:text-white/30"
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {/* Sawing Specific Fields */}
                {isSawing(currentItem) && (
                  <div className="space-y-4">
                    <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 border-l-4 border-orange-500 pl-3">
                      <svg className="w-5 h-5 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                      </svg>
                      Sawing Details
                    </h4>

                    {/* Add New Cut Entry */}
                    <div className="bg-white dark:bg-white/[0.04] rounded-2xl p-4 border border-gray-100 dark:border-white/10 shadow-sm">
                      <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2 border-l-4 border-purple-500 pl-3 text-base">
                        <svg className="w-5 h-5 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add Cut Entry
                      </h5>

                      {/* Input Mode Toggle - Show only for Hand Saw */}
                      {isHandSaw(currentItem) && (
                        <div className="mb-4 bg-white rounded-lg p-3">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Cut Specification Method</label>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => setCutInputMode('linear')}
                              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                                cutInputMode === 'linear'
                                  ? 'bg-blue-500 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              Linear Feet
                            </button>
                            <button
                              type="button"
                              onClick={() => setCutInputMode('area')}
                              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                                cutInputMode === 'area'
                                  ? 'bg-blue-500 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              Cut Areas (L × W)
                            </button>
                          </div>
                        </div>
                      )}

                      {/* LINEAR MODE - Traditional linear feet input */}
                      {cutInputMode === 'linear' && (
                        <>
                          {/* Chainsaw Quick Entry (length in inches) */}
                          {isChainsaw(currentItem) ? (
                            <div className="mb-4">
                              {/* Chainsaw Quick Entry Button */}
                              <button
                                type="button"
                                onClick={() => setShowChainsawModal(true)}
                                className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Quick Entry - Chain Saw (Inches)
                              </button>

                              {/* Total Linear Feet & Cut Depth */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white dark:bg-white/[0.05] rounded-xl p-4 border-2 border-gray-200 dark:border-white/10">
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1.5 uppercase tracking-wide">Total Linear Feet</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={currentCut.linearFeet || ''}
                                    onChange={(e) => setCurrentCut(prev => ({ ...prev, linearFeet: parseFloat(e.target.value) || 0 }))}
                                    className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="Total linear feet"
                                  />
                                  <p className="text-xs text-gray-500 dark:text-white/40 mt-1.5">Use Quick Entry or type directly</p>
                                </div>
                                <div className="bg-white dark:bg-white/[0.05] rounded-xl p-4 border-2 border-gray-200 dark:border-white/10">
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1.5 uppercase tracking-wide">Cut Depth (in)</label>
                                  <input
                                    type="number"
                                    step="0.25"
                                    min="0"
                                    value={currentCut.cutDepth || ''}
                                    onChange={(e) => setCurrentCut(prev => ({ ...prev, cutDepth: parseFloat(e.target.value) || 0 }))}
                                    className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="Depth"
                                  />
                                  <p className="text-xs text-gray-500 dark:text-white/40 mt-1.5">Auto-filled from Quick Entry or type directly</p>
                                </div>
                              </div>
                            </div>
                          ) : (isSlabSaw(currentItem) || isWallSaw(currentItem) || isHandSaw(currentItem)) ? (
                            /* Saw Types Multi-Cut Entry (Slab, Wall, Hand Saw) */
                            <div className="mb-4">
                              {/* Quick Entry Button */}
                              <button
                                type="button"
                                onClick={() => setShowQuickEntryModal(true)}
                                className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Quick Entry - Multiple Cuts
                              </button>

                              {/* Total Linear Feet & Cut Depth */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white dark:bg-white/[0.05] rounded-xl p-4 border-2 border-gray-200 dark:border-white/10">
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1.5 uppercase tracking-wide">Total Linear Feet</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={currentCut.linearFeet || ''}
                                    onChange={(e) => setCurrentCut(prev => ({ ...prev, linearFeet: parseFloat(e.target.value) || 0 }))}
                                    className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="Total linear feet"
                                  />
                                  <p className="text-xs text-gray-500 dark:text-white/40 mt-1.5">Use Quick Entry or type directly</p>
                                </div>
                                <div className="bg-white dark:bg-white/[0.05] rounded-xl p-4 border-2 border-gray-200 dark:border-white/10">
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1.5 uppercase tracking-wide">Cut Depth (in)</label>
                                  <input
                                    type="number"
                                    step="0.25"
                                    min="0"
                                    value={currentCut.cutDepth || ''}
                                    onChange={(e) => setCurrentCut(prev => ({ ...prev, cutDepth: parseFloat(e.target.value) || 0 }))}
                                    className="w-full px-4 py-3 text-lg border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-bold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="Depth"
                                  />
                                  <p className="text-xs text-gray-500 dark:text-white/40 mt-1.5">Auto-filled from Quick Entry or type directly</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            // Standard linear feet input for other saw types
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              {/* Linear Feet */}
                              <div>
                                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-1">Linear Feet Cut</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={currentCut.linearFeet || ''}
                                  onChange={(e) => setCurrentCut(prev => ({ ...prev, linearFeet: parseFloat(e.target.value) || 0 }))}
                                  className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-semibold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="Linear feet"
                                />
                              </div>

                              {/* Cut Depth */}
                              <div>
                                <label className="block text-sm font-bold text-gray-900 dark:text-white mb-1">Cut Depth (in)</label>
                                <input
                                  type="number"
                                  step="0.25"
                                  min="0"
                                  value={currentCut.cutDepth || ''}
                                  onChange={(e) => setCurrentCut(prev => ({ ...prev, cutDepth: parseFloat(e.target.value) || 0 }))}
                                  className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white font-semibold placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="Depth"
                                />
                              </div>
                            </div>
                          )}

                          {/* Chainsaw Question */}
                          <div className={`mb-4 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all ${
                            currentCut.chainsawed
                              ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20'
                              : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                          }`}
                            onClick={() => setCurrentCut(prev => ({ ...prev, chainsawed: !prev.chainsawed }))}>
                            <label className="flex items-center justify-between cursor-pointer mb-0">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">Did you chainsaw?</span>
                              <input
                                type="checkbox"
                                checked={currentCut.chainsawed}
                                onChange={(e) => setCurrentCut(prev => ({ ...prev, chainsawed: e.target.checked }))}
                                className="w-4 h-4 text-purple-600 rounded"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </label>

                            {currentCut.chainsawed && (
                              <div className="grid grid-cols-2 gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                                <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1">Number of Areas</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={currentCut.chainsawAreas || ''}
                                    onChange={(e) => setCurrentCut(prev => ({ ...prev, chainsawAreas: parseInt(e.target.value) || 0 }))}
                                    className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="e.g., 5"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1">Avg Width (inches)</label>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    value={currentCut.chainsawWidthInches || ''}
                                    onChange={(e) => setCurrentCut(prev => ({ ...prev, chainsawWidthInches: parseFloat(e.target.value) || 0 }))}
                                    className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                    placeholder="e.g., 3.5"
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Cut Through Steel and Overcut - Linear Mode */}
                          <div className="mb-4 space-y-2">
                            <div className={`rounded-xl border-2 px-4 py-3 flex items-center justify-between cursor-pointer transition-all ${
                              currentCut.cutSteel ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                            }`}
                              onClick={() => setCurrentCut(prev => ({ ...prev, cutSteel: !prev.cutSteel }))}>
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">Cut Through Steel</span>
                              <input
                                type="checkbox"
                                checked={currentCut.cutSteel}
                                onChange={(e) => setCurrentCut(prev => ({ ...prev, cutSteel: e.target.checked }))}
                                className="w-4 h-4 text-red-600 rounded"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            {(isHandSaw(currentItem) || isChainsaw(currentItem)) && (
                              <div className={`rounded-xl border-2 px-4 py-3 flex items-center justify-between cursor-pointer transition-all ${
                                currentCut.overcut ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                              }`}
                                onClick={() => setCurrentCut(prev => ({ ...prev, overcut: !prev.overcut }))}>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">Overcut</span>
                                <input
                                  type="checkbox"
                                  checked={currentCut.overcut}
                                  onChange={(e) => setCurrentCut(prev => ({ ...prev, overcut: e.target.checked }))}
                                  className="w-4 h-4 text-amber-600 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* AREA MODE - Length x Width input for multiple areas */}
                      {cutInputMode === 'area' && (
                        <div className="mb-4">
                          {/* Area Input Form */}
                          <div className="bg-white dark:bg-white/[0.04] rounded-xl p-4 mb-3 border border-gray-200 dark:border-white/10 shadow-sm">
                            <label className="block text-sm font-bold text-gray-900 dark:text-white mb-3">
                              Add Cut Area (e.g., 5&apos; × 7&apos;)
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                              <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1">Length (ft)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={currentArea.length}
                                  onChange={(e) => setCurrentArea(prev => ({ ...prev, length: parseFloat(e.target.value) || 0 }))}
                                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="Length"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1">Width (ft)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={currentArea.width}
                                  onChange={(e) => setCurrentArea(prev => ({ ...prev, width: parseFloat(e.target.value) || 0 }))}
                                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="Width"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1">Depth (in)</label>
                                <input
                                  type="number"
                                  step="0.25"
                                  min="0"
                                  value={currentArea.depth}
                                  onChange={(e) => setCurrentArea(prev => ({ ...prev, depth: parseFloat(e.target.value) || 0 }))}
                                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="Depth"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-1">Qty</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={currentArea.quantity}
                                  onChange={(e) => setCurrentArea(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  placeholder="1"
                                />
                              </div>
                            </div>

                            {/* Cut Steel and Overcut options for this area */}
                            <div className="grid grid-cols-2 gap-2 mt-3">
                              <div className={`rounded-xl border-2 px-3 py-2.5 flex items-center justify-between cursor-pointer transition-all ${
                                currentArea.cutSteel ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                              }`}
                                onClick={() => setCurrentArea(prev => ({ ...prev, cutSteel: !prev.cutSteel }))}>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">Cut Steel</span>
                                <input
                                  type="checkbox"
                                  checked={currentArea.cutSteel}
                                  onChange={(e) => setCurrentArea(prev => ({ ...prev, cutSteel: e.target.checked }))}
                                  className="w-4 h-4 text-red-600 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className={`rounded-xl border-2 px-3 py-2.5 flex items-center justify-between cursor-pointer transition-all ${
                                currentArea.overcut ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                              }`}
                                onClick={() => setCurrentArea(prev => ({ ...prev, overcut: !prev.overcut }))}>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">Overcut</span>
                                <input
                                  type="checkbox"
                                  checked={currentArea.overcut}
                                  onChange={(e) => setCurrentArea(prev => ({ ...prev, overcut: e.target.checked }))}
                                  className="w-4 h-4 text-amber-600 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>

                            {/* Steel Info field - appears when Cut Through Steel is checked */}
                            {currentArea.cutSteel && (
                              <div className="mt-3">
                                <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1">Steel Type/Description</label>
                                <textarea
                                  value={currentArea.steelEncountered || ''}
                                  onChange={(e) => setCurrentArea(prev => ({ ...prev, steelEncountered: e.target.value }))}
                                  placeholder="e.g., #4 rebar, angle iron, etc..."
                                  className="w-full px-3 py-2 text-sm border-2 border-red-300 dark:border-red-500/30 rounded-xl focus:border-red-500 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                  rows={2}
                                />
                              </div>
                            )}

                            {/* Chainsaw Question */}
                            <div className={`mt-3 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all ${
                              currentArea.chainsawed ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                            }`}
                              onClick={() => setCurrentArea(prev => ({ ...prev, chainsawed: !prev.chainsawed }))}>
                              <label className="flex items-center justify-between cursor-pointer mb-0">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">Did you chainsaw?</span>
                                <input
                                  type="checkbox"
                                  checked={currentArea.chainsawed}
                                  onChange={(e) => setCurrentArea(prev => ({ ...prev, chainsawed: e.target.checked }))}
                                  className="w-4 h-4 text-purple-600 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </label>

                              {currentArea.chainsawed && (
                                <div className="grid grid-cols-2 gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                                  <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1">Number of Areas</label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={currentArea.chainsawAreas || ''}
                                      onChange={(e) => setCurrentArea(prev => ({ ...prev, chainsawAreas: parseInt(e.target.value) || 0 }))}
                                      className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                      placeholder="e.g., 5"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-gray-700 dark:text-white/70 mb-1">Avg Width (inches)</label>
                                    <input
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      value={currentArea.chainsawWidthInches || ''}
                                      onChange={(e) => setCurrentArea(prev => ({ ...prev, chainsawWidthInches: parseFloat(e.target.value) || 0 }))}
                                      className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
                                      placeholder="e.g., 6"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={addArea}
                              className="mt-3 w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl transition-all flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg text-sm"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              Add Area
                            </button>
                          </div>

                          {/* Added Areas List */}
                          {tempAreas.length > 0 && (
                            <div className="bg-white dark:bg-white/[0.04] rounded-xl p-3 border border-gray-200 dark:border-white/10">
                              <h6 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                                <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Added Areas ({tempAreas.length})
                              </h6>
                              <div className="space-y-2 mb-3">
                                {tempAreas.map((area, index) => (
                                  <div key={index} className="bg-gray-50 dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/10 p-2 text-sm">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-purple-600 dark:text-purple-400">
                                          {area.length}&apos; × {area.width}&apos; × {area.depth}&quot;
                                        </span>
                                        {area.quantity > 1 && (
                                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                            ×{area.quantity} areas
                                          </span>
                                        )}
                                        <span className="text-xs text-gray-400">
                                          ({calculateLinearFeetFromArea(area).toFixed(1)}&apos; total)
                                        </span>
                                        {area.cutSteel && (
                                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                            Steel Cut
                                          </span>
                                        )}
                                        {area.overcut && (
                                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                                            Overcut
                                          </span>
                                        )}
                                        {area.chainsawed && (
                                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                            Chainsawed
                                          </span>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeArea(index)}
                                        className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg p-1.5 transition-all flex-shrink-0"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                      </button>
                                    </div>
                                    {area.steelEncountered && (
                                      <div className="mt-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded">
                                        Steel: {area.steelEncountered}
                                      </div>
                                    )}
                                    {area.chainsawed && area.chainsawAreas && area.chainsawWidthInches && (
                                      <div className="mt-1 text-xs text-purple-700 bg-purple-50 px-2 py-1 rounded">
                                        Chainsaw: {area.chainsawAreas} areas × {area.chainsawWidthInches}&quot; width
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-3 border border-purple-200 dark:border-purple-500/20">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="font-bold text-gray-700 dark:text-white/80">Total Linear Feet:</span>
                                  <span className="text-xl font-black text-purple-600 dark:text-purple-400">
                                    {calculateTotalFromAreas(tempAreas).toFixed(1)}&apos;
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Blade Selection */}
                      <div className="mb-4">
                        <label className="block text-sm font-bold text-gray-900 dark:text-white mb-3 border-l-4 border-purple-500 pl-3">
                          {isChainsaw(currentItem) ? 'Chain Size Used' : 'Blades Used'} — select all that apply
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                          {getBladesForSawType(currentItem).map((blade) => (
                            <button
                              key={blade}
                              type="button"
                              onClick={() => toggleBladeSelection(blade)}
                              className={`px-3 py-2.5 text-sm rounded-xl border-2 font-semibold transition-all ${
                                selectedBlades.includes(blade)
                                  ? 'border-purple-500 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                  : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-gray-700 dark:text-white/70 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                              }`}
                            >
                              {blade}
                            </button>
                          ))}
                        </div>

                        {/* Custom Blade Input - Only show for non-hand saws and non-chainsaws */}
                        {!isHandSaw(currentItem) && !isChainsaw(currentItem) && (
                          <div className="bg-gray-50 dark:bg-white/[0.04] rounded-xl p-3 border border-gray-200 dark:border-white/10">
                            <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-2">Custom Blade Size</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={customBladeSize}
                                onChange={(e) => setCustomBladeSize(e.target.value)}
                                placeholder='e.g., 30" Diamond, 36" Wire'
                                className="flex-1 px-3 py-2 text-sm border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder:text-white/30"
                              />
                              <button
                                type="button"
                                onClick={addCustomBlade}
                                disabled={!customBladeSize.trim()}
                                className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold transition-all"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Show selected blades */}
                        {selectedBlades.length > 0 && (
                          <div className="mt-3">
                            <label className="block text-xs font-bold text-gray-600 dark:text-white/60 mb-2">
                              {isChainsaw(currentItem) ? 'Selected Chains:' : 'Selected Blades:'}
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {selectedBlades.map((blade, index) => (
                                <span key={index} className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-xs flex items-center gap-1 font-medium">
                                  {blade}
                                  <button
                                    type="button"
                                    onClick={() => toggleBladeSelection(blade)}
                                    className="hover:bg-purple-200 dark:hover:bg-purple-800 rounded-full p-0.5 transition-colors"
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

                      <button
                        onClick={addCut}
                        className="w-full px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl transition-all flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add This Cut
                      </button>
                    </div>

                    {/* Added Cuts List */}
                    {sawingData.cuts.length > 0 && (
                      <div className="bg-white dark:bg-white/[0.04] rounded-2xl border border-gray-200 dark:border-white/10 p-4">
                        <h5 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2 border-l-4 border-purple-500 pl-3 text-base">
                          <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Added Cuts ({sawingData.cuts.length} entries)
                        </h5>
                        <div className="space-y-3">
                          {sawingData.cuts.map((cut, index) => (
                            <div key={index} className="bg-gray-50 dark:bg-white/[0.04] rounded-xl border border-gray-200 dark:border-white/10 p-3">
                              <div className="flex items-start justify-between mb-2 gap-2">
                                <div className="flex flex-wrap items-center gap-2 text-sm flex-1">
                                  <div>
                                    <span className="font-bold text-purple-600 dark:text-purple-400">{cut.linearFeet.toFixed(1)}&apos;</span>
                                    <span className="text-gray-500 dark:text-white/40"> linear feet</span>
                                  </div>
                                  <div>
                                    <span className="font-semibold text-gray-700 dark:text-white/80">{cut.cutDepth}&quot;</span>
                                    <span className="text-gray-500 dark:text-white/40"> deep</span>
                                  </div>
                                  {cut.inputMode === 'area' && (
                                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                                      Area Mode
                                    </span>
                                  )}
                                  {cut.cutSteel && (
                                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs font-medium">
                                      Steel Cut
                                    </span>
                                  )}
                                  {cut.overcut && (
                                    <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-medium">
                                      Overcut
                                    </span>
                                  )}
                                  {cut.chainsawed && (
                                    <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                                      Chainsawed
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => removeCut(index)}
                                  className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg p-1.5 transition-all flex-shrink-0"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                              {cut.chainsawed && cut.chainsawAreas && cut.chainsawWidthInches && (
                                <div className="mb-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2 border border-indigo-200 dark:border-indigo-500/20">
                                  <div className="text-xs text-indigo-700 dark:text-indigo-300">
                                    <span className="font-bold">Chainsaw:</span> {cut.chainsawAreas} areas × {cut.chainsawWidthInches}&quot; width
                                  </div>
                                </div>
                              )}
                              {/* Show areas if entered using area mode */}
                              {cut.inputMode === 'area' && cut.areas && cut.areas.length > 0 && (
                                <div className="mb-2 bg-white dark:bg-white/[0.04] rounded-lg p-2 border border-purple-200 dark:border-purple-500/20">
                                  <div className="text-xs text-gray-600 dark:text-white/50 mb-1">Cut Areas:</div>
                                  <div className="flex flex-wrap gap-1">
                                    {cut.areas.map((area, areaIndex) => (
                                      <span key={areaIndex} className="px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                                        {area.length}&apos; × {area.width}&apos; ({area.depth}&quot; deep)
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1 text-xs">
                                <span className="text-gray-500 dark:text-white/40">
                                  {isChainsaw(currentItem) ? 'Chains:' : 'Blades:'}
                                </span>
                                {cut.bladesUsed.map((blade, bladeIndex) => (
                                  <span key={bladeIndex} className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full font-medium">
                                    {blade}
                                  </span>
                                ))}
                              </div>
                              {cut.cutSteel && cut.steelEncountered && (
                                <div className="mt-2 text-xs">
                                  <span className="text-gray-500 dark:text-white/40">Steel type:</span>
                                  <span className="ml-1 text-red-600 dark:text-red-400 font-medium">{cut.steelEncountered}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sawing Notes */}
                    <div>
                      <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">Additional Notes</label>
                      <textarea
                        value={sawingData.notes}
                        onChange={(e) => setSawingData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Any additional details about the sawing work..."
                        className="w-full px-4 py-3 border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none transition-colors text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder:text-white/30"
                        rows={3}
                      />
                    </div>
                  </div>
                )}

                {/* Quick Entry Buttons for Specific Work Types */}
                {!isCoreDrilling(currentItem) && !isSawing(currentItem) && (
                  <div className="mb-6">
                    {/* Break & Remove Quick Entry */}
                    {isBreakAndRemove(currentItem) && (
                      <button
                        type="button"
                        onClick={() => setShowBreakRemoveModal(true)}
                        className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Quick Entry - Area Calculator
                      </button>
                    )}

                    {/* Jack Hammering Quick Entry */}
                    {isJackHammering(currentItem) && (
                      <button
                        type="button"
                        onClick={() => setShowJackhammerModal(true)}
                        className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Quick Entry - Jack Hammering
                      </button>
                    )}

                    {/* Chipping Quick Entry */}
                    {isChipping(currentItem) && (
                      <button
                        type="button"
                        onClick={() => setShowJackhammerModal(true)}
                        className="w-full mb-3 px-4 py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Quick Entry - Chipping Area
                      </button>
                    )}

                    {/* Brokk Quick Entry */}
                    {isBrokk(currentItem) && (
                      <button
                        type="button"
                        onClick={() => setShowBrokkModal(true)}
                        className="w-full mb-3 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Quick Entry - Brokk Area
                      </button>
                    )}
                  </div>
                )}

                {/* General Notes for non-specialized items */}
                {!isCoreDrilling(currentItem) && !isSawing(currentItem) && (
                  <div>
                    <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
                      {(isBreakAndRemove(currentItem) || isJackHammering(currentItem) || isChipping(currentItem) || isBrokk(currentItem)) ? 'Quantity/Notes (Auto-filled by Quick Entry)' : 'Notes'}
                    </label>
                    <textarea
                      value={currentNotes}
                      onChange={(e) => setCurrentNotes(e.target.value)}
                      placeholder="Add any notes about this work item..."
                      className="w-full px-4 py-3 border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200/50 dark:focus:ring-purple-500/20 focus:outline-none transition-colors text-gray-900 dark:text-white bg-white dark:bg-white/[0.05] placeholder:text-gray-400 dark:placeholder:text-white/30"
                      rows={3}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowQuantityModal(false)}
                  className="flex-shrink-0 px-6 py-3 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-200 dark:hover:bg-white/20 transition-all font-semibold border border-gray-200 dark:border-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddItem}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all font-bold flex items-center justify-center gap-2"
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

      {/* Add More Dialog */}
      {showAddMoreDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] sm:p-4">
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 dark:border-white/10">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-500 rounded-2xl flex items-center justify-center shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 text-center">Work Item Added!</h3>
              <p className="text-gray-500 dark:text-white/50 text-center mb-6">
                Would you like to add another work item or continue to the next step?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleAddMore}
                  className="flex-1 px-6 py-3 bg-white dark:bg-white/10 border-2 border-gray-200 dark:border-white/10 text-gray-700 dark:text-white rounded-xl hover:bg-gray-50 dark:hover:bg-white/20 transition-all font-bold"
                >
                  Add Another
                </button>
                <button
                  onClick={handleContinue}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all font-bold"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Equipment Usage Form Modal */}
      {showEquipmentForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="w-full sm:my-8">
            <EquipmentUsageForm
              onSave={handleSaveEquipmentUsage}
              onCancel={() => setShowEquipmentForm(false)}
            />
          </div>
        </div>
      )}

      {/* Quick Entry Modal */}
      {showQuickEntryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-3xl w-full p-4 sm:p-8 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900">Quick Entry - Multiple Cuts</h3>
                <p className="text-sm text-gray-600 mt-1">Add multiple different cut lengths with ease</p>
              </div>
              <button
                onClick={() => {
                  setShowQuickEntryModal(false);
                  setQuickEntryCuts([]);
                  setQuickEntryNumCuts(1);
                  setQuickEntryLengthFeet(0);
                  setQuickEntryDepth(0);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entry Form */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-blue-200">
              <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Cut Entry
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Number of Cuts */}
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2">
                    Number of Cuts
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quickEntryNumCuts}
                    onChange={(e) => setQuickEntryNumCuts(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none bg-white text-gray-900 font-semibold"
                    placeholder="e.g., 5"
                  />
                </div>

                {/* Length in Feet */}
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2">
                    Length (ft)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={quickEntryLengthFeet}
                    onChange={(e) => setQuickEntryLengthFeet(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none bg-white text-gray-900 font-semibold"
                    placeholder="e.g., 25.5"
                  />
                </div>

                {/* Depth */}
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2">
                    Depth (in)
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={quickEntryDepth}
                    onChange={(e) => setQuickEntryDepth(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none bg-white text-gray-900 font-semibold"
                    placeholder="e.g., 6"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={addQuickEntryCut}
                className="mt-4 w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add to List
              </button>
            </div>

            {/* List of Added Cuts */}
            {quickEntryCuts.length > 0 && (
              <div className="mb-6">
                <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Cut Entries ({quickEntryCuts.length})
                </h4>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {quickEntryCuts.map((cut, index) => {
                    const totalForCut = cut.numCuts * cut.lengthFeet;

                    return (
                      <div
                        key={index}
                        className="bg-white rounded-xl p-4 border-2 border-gray-200 hover:border-blue-300 transition-colors flex items-center justify-between"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">
                            {cut.numCuts} cuts @ {cut.lengthFeet} ft
                            {cut.depth > 0 && ` × ${cut.depth}" deep`}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            = {totalForCut.toFixed(2)} linear feet
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuickEntryCut(index)}
                          className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Total Calculation */}
                <div className="mt-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border-2 border-green-300">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-lg">Total Linear Feet:</span>
                    <span className="font-bold text-green-700 text-2xl">
                      {calculateQuickEntryTotal().toFixed(2)} ft
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowQuickEntryModal(false);
                  setQuickEntryCuts([]);
                  setQuickEntryNumCuts(1);
                  setQuickEntryLengthFeet(0);
                  setQuickEntryDepth(0);
                }}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyQuickEntry}
                disabled={quickEntryCuts.length === 0}
                className={`flex-1 px-6 py-4 rounded-xl font-bold transition-all shadow-lg ${
                  quickEntryCuts.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-xl hover:shadow-2xl'
                }`}
              >
                Apply to Total Linear Feet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chainsaw Quick Entry Modal */}
      {showChainsawModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 sm:p-6 rounded-t-3xl flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold">Chain Saw Quick Entry</h2>
                <p className="text-purple-100 text-xs sm:text-sm mt-1">Length measurements in INCHES</p>
              </div>
              <button
                onClick={() => {
                  setShowChainsawModal(false);
                  setChainsawCuts([]);
                  setChainsawNumCuts(1);
                  setChainsawLengthInches(0);
                  setChainsawDepth(0);
                }}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entry Form */}
            <div className="p-4 sm:p-6">
              <div className="bg-purple-50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-purple-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Add Cut Entry</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Number of Cuts */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Number of Cuts
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={chainsawNumCuts}
                      onChange={(e) => setChainsawNumCuts(parseInt(e.target.value) || 1)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 5"
                    />
                  </div>

                  {/* Length in Inches */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Length (inches)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={chainsawLengthInches}
                      onChange={(e) => setChainsawLengthInches(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 48"
                    />
                  </div>

                  {/* Depth */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Depth (in)
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={chainsawDepth}
                      onChange={(e) => setChainsawDepth(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 12"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addChainsawCut}
                  className="mt-4 w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
                >
                  Add to List
                </button>
              </div>

              {/* List of Cuts */}
              {chainsawCuts.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Cuts Added:</h3>
                  <div className="space-y-2">
                    {chainsawCuts.map((cut, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
                          <span>{cut.numCuts} cuts</span>
                          <span>×</span>
                          <span>{cut.lengthInches}" long</span>
                          {cut.depth > 0 && (
                            <>
                              <span>@</span>
                              <span>{cut.depth}" deep</span>
                            </>
                          )}
                          <span>=</span>
                          <span className="text-purple-600 font-bold">
                            {((cut.numCuts * cut.lengthInches) / 12).toFixed(2)} ft
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeChainsawCut(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-2 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="mt-4 bg-purple-100 rounded-xl p-4 border-2 border-purple-300">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-gray-800">Total Linear Feet:</span>
                      <span className="text-2xl font-bold text-purple-600">
                        {calculateChainsawTotal().toFixed(2)} ft
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl flex gap-4 border-t-2 border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowChainsawModal(false);
                  setChainsawCuts([]);
                  setChainsawNumCuts(1);
                  setChainsawLengthInches(0);
                  setChainsawDepth(0);
                }}
                className="flex-1 px-6 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyChainsawEntry}
                className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
              >
                Apply to Total Linear Feet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Break & Remove Quick Entry Modal */}
      {showBreakRemoveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-red-600 to-rose-600 text-white p-4 sm:p-6 rounded-t-3xl flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold">Break & Remove</h2>
                <p className="text-red-100 text-xs sm:text-sm mt-1">Calculate total square footage removed</p>
              </div>
              <button
                onClick={() => {
                  setShowBreakRemoveModal(false);
                  setBreakRemoveAreas([]);
                  setBreakRemoveLength(0);
                  setBreakRemoveWidth(0);
                  setBreakRemoveDepth(0);
                  setRemovalMethod('');
                  setRemovalEquipment('');
                }}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entry Form */}
            <div className="p-4 sm:p-6">
              <div className="bg-red-50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-red-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Add Area</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Length */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Length (ft)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={breakRemoveLength}
                      onChange={(e) => setBreakRemoveLength(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 10"
                    />
                  </div>

                  {/* Width */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Width (ft)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={breakRemoveWidth}
                      onChange={(e) => setBreakRemoveWidth(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 8"
                    />
                  </div>

                  {/* Depth */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Depth (in)
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={breakRemoveDepth}
                      onChange={(e) => setBreakRemoveDepth(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 6"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addBreakRemoveArea}
                  className="mt-4 w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
                >
                  Add Area to List
                </button>
              </div>

              {/* List of Areas */}
              {breakRemoveAreas.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Areas Added:</h3>
                  <div className="space-y-2">
                    {breakRemoveAreas.map((area, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
                          <span>{area.length} ft</span>
                          <span>×</span>
                          <span>{area.width} ft</span>
                          {area.depth > 0 && (
                            <>
                              <span>@</span>
                              <span>{area.depth}" deep</span>
                            </>
                          )}
                          <span>=</span>
                          <span className="text-red-600 font-bold">
                            {(area.length * area.width).toFixed(2)} sq ft
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBreakRemoveArea(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-2 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="mt-4 bg-red-100 rounded-xl p-4 border-2 border-red-300">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-gray-800">Total Square Feet:</span>
                      <span className="text-2xl font-bold text-red-600">
                        {calculateBreakRemoveTotal().toFixed(2)} sq ft
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Removal Method */}
              <div className="mb-6 bg-rose-50 rounded-2xl p-6 border-2 border-rose-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Removal Method</h3>

                {/* Method Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-800 mb-2">
                    How was the material removed?
                  </label>
                  <select
                    value={removalMethod}
                    onChange={(e) => {
                      setRemovalMethod(e.target.value);
                      if (e.target.value !== 'rigged') {
                        setRemovalEquipment('');
                      }
                    }}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                  >
                    <option value="">Select removal method...</option>
                    <option value="hand_removal">Hand Removal</option>
                    <option value="rigged">Rigged with Equipment</option>
                  </select>
                </div>

                {/* Equipment Selection (only if rigged) */}
                {removalMethod === 'rigged' && (
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Equipment Used
                    </label>
                    <select
                      value={removalEquipment}
                      onChange={(e) => setRemovalEquipment(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                    >
                      <option value="">Select equipment...</option>
                      <option value="lull">Lull</option>
                      <option value="forklift">Forklift</option>
                      <option value="skidsteer">Skidsteer</option>
                      <option value="mini_x">Mini X</option>
                      <option value="sherpa">Sherpa</option>
                      <option value="dingo">Dingo</option>
                      <option value="other">Other</option>
                    </select>

                    {/* Other Equipment Text Input */}
                    {removalEquipment === 'other' && (
                      <input
                        type="text"
                        placeholder="Specify equipment..."
                        value={removalEquipment === 'other' ? '' : removalEquipment}
                        onChange={(e) => setRemovalEquipment(e.target.value)}
                        className="w-full mt-3 px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-red-500 focus:ring-2 focus:ring-red-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl flex gap-4 border-t-2 border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowBreakRemoveModal(false);
                  setBreakRemoveAreas([]);
                  setBreakRemoveLength(0);
                  setBreakRemoveWidth(0);
                  setBreakRemoveDepth(0);
                  setRemovalMethod('');
                  setRemovalEquipment('');
                }}
                className="flex-1 px-6 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBreakRemoveEntry}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
              >
                Apply to Work Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jack Hammering Quick Entry Modal */}
      {showJackhammerModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-yellow-600 to-amber-600 text-white p-4 sm:p-6 rounded-t-3xl flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold">
                  {isChipping(currentItem) ? 'Chipping' : 'Jack Hammering'} Quick Entry
                </h2>
                <p className="text-yellow-100 text-xs sm:text-sm mt-1">Calculate total square footage</p>
              </div>
              <button
                onClick={() => {
                  setShowJackhammerModal(false);
                  setJackhammerEquipment('');
                  setJackhammerOther('');
                  setJackhammerAreas([]);
                  setJackhammerLength(0);
                  setJackhammerWidth(0);
                }}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entry Form */}
            <div className="p-4 sm:p-6">
              {/* Equipment Selection */}
              <div className="mb-4 sm:mb-6 bg-yellow-50 rounded-2xl p-4 sm:p-6 border-2 border-yellow-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Equipment Used</h3>
                <select
                  value={jackhammerEquipment}
                  onChange={(e) => {
                    setJackhammerEquipment(e.target.value);
                    if (e.target.value !== 'other') {
                      setJackhammerOther('');
                    }
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 focus:outline-none bg-white text-gray-900 font-semibold"
                >
                  <option value="">Select equipment...</option>
                  <option value="hilti_1000">Hilti 1000</option>
                  <option value="hilti_3000">Hilti 3000</option>
                  <option value="other">Other</option>
                </select>

                {/* Other Equipment Text Input */}
                {jackhammerEquipment === 'other' && (
                  <input
                    type="text"
                    placeholder="Specify equipment..."
                    value={jackhammerOther}
                    onChange={(e) => setJackhammerOther(e.target.value)}
                    className="w-full mt-3 px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 focus:outline-none bg-white text-gray-900 font-semibold"
                  />
                )}
              </div>

              {/* Area Entry */}
              <div className="bg-amber-50 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-amber-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Add Area</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Length */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Length (ft)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={jackhammerLength}
                      onChange={(e) => setJackhammerLength(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 10"
                    />
                  </div>

                  {/* Width */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Width (ft)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={jackhammerWidth}
                      onChange={(e) => setJackhammerWidth(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 8"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addJackhammerArea}
                  className="mt-4 w-full px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
                >
                  Add Area to List
                </button>
              </div>

              {/* List of Areas */}
              {jackhammerAreas.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Areas Added:</h3>
                  <div className="space-y-2">
                    {jackhammerAreas.map((area, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
                          <span>{area.length} ft</span>
                          <span>×</span>
                          <span>{area.width} ft</span>
                          <span>=</span>
                          <span className="text-yellow-600 font-bold">
                            {(area.length * area.width).toFixed(2)} sq ft
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeJackhammerArea(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-2 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div className="mt-4 bg-yellow-100 rounded-xl p-4 border-2 border-yellow-300">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-gray-800">Total Square Feet:</span>
                      <span className="text-2xl font-bold text-yellow-600">
                        {calculateJackhammerTotal().toFixed(2)} sq ft
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl flex gap-4 border-t-2 border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowJackhammerModal(false);
                  setJackhammerEquipment('');
                  setJackhammerOther('');
                  setJackhammerAreas([]);
                  setJackhammerLength(0);
                  setJackhammerWidth(0);
                }}
                className="flex-1 px-6 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyJackhammerEntry}
                className="flex-1 px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
              >
                Apply to Work Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brokk Quick Entry Modal */}
      {showBrokkModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 sm:p-6 rounded-t-3xl flex justify-between items-center">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Brokk Quick Entry</h2>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">Calculate area and thickness</p>
              </div>
              <button
                onClick={() => {
                  setShowBrokkModal(false);
                  setBrokkAreas([]);
                  setBrokkLength(0);
                  setBrokkWidth(0);
                  setBrokkThickness(0);
                }}
                className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entry Form */}
            <div className="p-4 sm:p-6">
              <div className="bg-gray-100 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-gray-300">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Add Area</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Length */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Length (ft)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={brokkLength}
                      onChange={(e) => setBrokkLength(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-gray-500 focus:ring-2 focus:ring-gray-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 10"
                    />
                  </div>

                  {/* Width */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Width (ft)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={brokkWidth}
                      onChange={(e) => setBrokkWidth(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-gray-500 focus:ring-2 focus:ring-gray-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 8"
                    />
                  </div>

                  {/* Thickness */}
                  <div>
                    <label className="block text-sm font-bold text-gray-800 mb-2">
                      Thickness (in)
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={brokkThickness}
                      onChange={(e) => setBrokkThickness(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-gray-500 focus:ring-2 focus:ring-gray-200 focus:outline-none bg-white text-gray-900 font-semibold"
                      placeholder="e.g., 6"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={addBrokkArea}
                  className="mt-4 w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
                >
                  Add Area to List
                </button>
              </div>

              {/* List of Areas */}
              {brokkAreas.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Areas Added:</h3>
                  <div className="space-y-2">
                    {brokkAreas.map((area, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-100 rounded-xl p-4">
                        <div className="flex items-center gap-4 text-sm font-semibold text-gray-700">
                          <span>{area.length} ft</span>
                          <span>×</span>
                          <span>{area.width} ft</span>
                          <span>@</span>
                          <span>{area.thickness}" thick</span>
                          <span>=</span>
                          <span className="text-gray-700 font-bold">
                            {(area.length * area.width).toFixed(2)} sq ft
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBrokkArea(index)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-2 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="mt-4 bg-gray-200 rounded-xl p-4 border-2 border-gray-400">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-gray-800">Total Square Feet:</span>
                      <span className="text-2xl font-bold text-gray-700">
                        {calculateBrokkTotal().toFixed(2)} sq ft
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-600">Average Thickness:</span>
                      <span className="text-lg font-bold text-gray-600">
                        {brokkAreas.length > 0
                          ? (brokkAreas.reduce((sum, a) => sum + a.thickness, 0) / brokkAreas.length).toFixed(2)
                          : 0
                        } in
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="sticky bottom-0 bg-gray-50 p-6 rounded-b-3xl flex gap-4 border-t-2 border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowBrokkModal(false);
                  setBrokkAreas([]);
                  setBrokkLength(0);
                  setBrokkWidth(0);
                  setBrokkThickness(0);
                }}
                className="flex-1 px-6 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBrokkEntry}
                className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors shadow-md hover:shadow-lg"
              >
                Apply to Work Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-[60] animate-slide-in">
          <div className={`rounded-2xl shadow-2xl p-4 flex items-center gap-3 min-w-[300px] ${
            notification.type === 'success' ? 'bg-green-500 text-white' :
            notification.type === 'error' ? 'bg-red-500 text-white' :
            'bg-yellow-500 text-white'
          }`}>
            <div className="flex-shrink-0">
              {notification.type === 'success' && (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {notification.type === 'error' && (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {notification.type === 'warning' && (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
            </div>
            <p className="font-semibold">{notification.message}</p>
            <button
              onClick={() => setNotification(null)}
              className="ml-auto flex-shrink-0 hover:bg-white/20 rounded-lg p-1 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}