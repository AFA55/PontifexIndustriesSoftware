'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Calendar, MapPin, Wrench, CheckCircle, DollarSign,
  AlertTriangle, XCircle, Loader2, ArrowRight, CalendarDays,
  Gauge, Droplets, Zap, Shield, HardHat, Wind, Scissors,
  ChevronDown, ChevronUp, Package, ClipboardList, Info, FileText,
  User, Hash, Clock
} from 'lucide-react';
import { CalendarPicker } from '@/components/ui/CalendarPicker';
import { getDisplayName } from '@/lib/equipment-map';
import type { PendingJob } from './PendingQueueSidebar';

interface CapacityInfo {
  jobCount: number;
  maxSlots: number;
  warningThreshold: number;
  availableSlots: number;
  isFull: boolean;
  isWarning: boolean;
}

interface CapacitySummary {
  totalDays: number;
  fullDates: string[];
  warningDates: string[];
  hasContinuousAvailability: boolean;
  maxSlots: number;
  warningThreshold: number;
}

interface ApprovalModalProps {
  job: PendingJob;
  onConfirm: (data: { scheduledDate: string }) => Promise<void>;
  onClose: () => void;
}

// Difficulty color helper
function getDifficultyInfo(rating: number): { color: string; bg: string; label: string } {
  if (rating <= 2) return { color: 'text-green-700', bg: 'bg-green-100', label: 'Easy' };
  if (rating <= 4) return { color: 'text-blue-700', bg: 'bg-blue-100', label: 'Moderate' };
  if (rating <= 6) return { color: 'text-yellow-700', bg: 'bg-yellow-100', label: 'Challenging' };
  if (rating <= 8) return { color: 'text-orange-700', bg: 'bg-orange-100', label: 'Hard' };
  return { color: 'text-red-700', bg: 'bg-red-100', label: 'Extreme' };
}

export default function ApprovalModal({ job, onConfirm, onClose }: ApprovalModalProps) {
  const [approving, setApproving] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(job.scheduled_date || '');
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityData, setCapacityData] = useState<Record<string, CapacityInfo> | null>(null);
  const [capacitySummary, setCapacitySummary] = useState<CapacitySummary | null>(null);
  const [nextAvailable, setNextAvailable] = useState<{ date: string; jobCount: number; availableSlots: number } | null>(null);
  const [findingNext, setFindingNext] = useState(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    conditions: true,
    compliance: true,
    equipment: true,
  });

  const isMultiDay = !!(job.end_date && job.scheduled_date && job.end_date !== job.scheduled_date);
  const endDate = job.end_date || scheduledDate;

  const dayCount = (() => {
    if (!scheduledDate || !endDate) return 1;
    const start = new Date(scheduledDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  })();

  const isWeekend = (() => {
    if (!scheduledDate) return false;
    const d = new Date(scheduledDate + 'T12:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
  })();

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Fetch capacity when date changes ──
  const checkCapacity = useCallback(async (startDate: string, eDate: string) => {
    if (!startDate) return;
    setCapacityLoading(true);
    setCapacityData(null);
    setCapacitySummary(null);
    setWarningAcknowledged(false);

    try {
      const token = await getToken();
      let url: string;
      if (eDate && eDate !== startDate) {
        url = `/api/admin/schedule-board/capacity?startDate=${startDate}&endDate=${eDate}`;
      } else {
        url = `/api/admin/schedule-board/capacity?date=${startDate}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setCapacityData(json.data);
        if (json.summary) setCapacitySummary(json.summary);
        else {
          const info = json.data[startDate];
          if (info) {
            setCapacitySummary({
              totalDays: 1,
              fullDates: info.isFull ? [startDate] : [],
              warningDates: info.isWarning && !info.isFull ? [startDate] : [],
              hasContinuousAvailability: !info.isFull,
              maxSlots: info.maxSlots,
              warningThreshold: info.warningThreshold,
            });
          }
        }
      }
    } catch (err) {
      console.error('Capacity check failed:', err);
    } finally {
      setCapacityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (scheduledDate) {
      checkCapacity(scheduledDate, endDate);
    }
  }, [scheduledDate, endDate, checkCapacity]);

  // ── Fetch operator skill/availability match for selected date ──
  const [skillMatchLoading, setSkillMatchLoading] = useState(false);
  const [skillMatch, setSkillMatch] = useState<{
    job_difficulty: number;
    job_types: string[];
    qualified_count: number;
    available_qualified_count: number;
    total_operators: number;
    operators: Array<{
      id: string;
      full_name: string;
      skill_level_numeric: number | null;
      match_quality: 'good' | 'stretch' | 'over';
      is_qualified: boolean;
      is_available: boolean;
      tasks_qualified_for: string[];
    }>;
  } | null>(null);

  useEffect(() => {
    if (!scheduledDate || !job.id) return;
    let cancelled = false;
    (async () => {
      setSkillMatchLoading(true);
      try {
        const token = await getToken();
        const res = await fetch(
          `/api/admin/schedule-board/skill-match?jobId=${job.id}&date=${scheduledDate}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok && !cancelled) {
          const json = await res.json();
          setSkillMatch(json.data);
        }
      } catch (err) {
        console.error('Skill match fetch failed:', err);
      } finally {
        if (!cancelled) setSkillMatchLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scheduledDate, job.id]);

  // ── Find Next Available ──
  const handleFindNextAvailable = async () => {
    setFindingNext(true);
    try {
      const token = await getToken();
      const from = scheduledDate || new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/admin/schedule-board/capacity?findNext=true&from=${from}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data?.nextAvailableDate) {
          setNextAvailable({
            date: json.data.nextAvailableDate,
            jobCount: json.data.jobCount,
            availableSlots: json.data.availableSlots,
          });
        }
      }
    } catch { /* ignore */ }
    setFindingNext(false);
  };

  // ── Capacity status ──
  const hasFullDates = (capacitySummary?.fullDates?.length ?? 0) > 0;
  const hasWarningDates = (capacitySummary?.warningDates?.length ?? 0) > 0;
  const canApprove = scheduledDate && !hasFullDates && (!hasWarningDates || warningAcknowledged);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  // ── Build jobsite conditions summary ──
  const conditions = job.jobsite_conditions;
  const compliance = job.site_compliance;

  // Count active conditions for badge
  const conditionFlags: { label: string; active: boolean; icon: React.ReactNode; detail?: string; warning?: boolean }[] = conditions ? [
    { label: 'Water Available', active: !!conditions.water_available, icon: <Droplets className="w-3.5 h-3.5" />, detail: conditions.water_available_ft ? `${conditions.water_available_ft}ft away` : undefined },
    { label: 'Water Control', active: !!conditions.water_control, icon: <Droplets className="w-3.5 h-3.5" /> },
    { label: 'Electricity', active: !!conditions.electricity_available, icon: <Zap className="w-3.5 h-3.5" />, detail: conditions.electricity_available_ft ? `${conditions.electricity_available_ft}ft away` : undefined },
    { label: 'Manpower Provided', active: !!conditions.manpower_provided, icon: <HardHat className="w-3.5 h-3.5" /> },
    { label: 'Scaffolding Provided', active: !!conditions.scaffolding_provided, icon: <Package className="w-3.5 h-3.5" /> },
    { label: 'Proper Ventilation', active: !!conditions.proper_ventilation, icon: <Wind className="w-3.5 h-3.5" /> },
    { label: 'Overcutting Allowed', active: !!conditions.overcutting_allowed, icon: <Scissors className="w-3.5 h-3.5" /> },
    { label: '480 Cord Needed', active: !!conditions.cord_480, icon: <Zap className="w-3.5 h-3.5" />, detail: conditions.cord_480_ft ? `${conditions.cord_480_ft}ft` : undefined, warning: true },
    { label: 'High Work', active: !!conditions.high_work, icon: <AlertTriangle className="w-3.5 h-3.5" />, detail: conditions.high_work_ft ? `${conditions.high_work_ft}ft` : undefined, warning: true },
    { label: 'Hydraulic Hose', active: !!conditions.hyd_hose, icon: <Package className="w-3.5 h-3.5" />, detail: conditions.hyd_hose_ft ? `${conditions.hyd_hose_ft}ft` : undefined },
    { label: 'Plastic Needed', active: !!conditions.plastic_needed, icon: <Package className="w-3.5 h-3.5" /> },
    { label: 'Clean Up Required', active: !!conditions.clean_up_required, icon: <ClipboardList className="w-3.5 h-3.5" /> },
  ] : [];

  const activeConditions = conditionFlags.filter(c => c.active);
  const warningConditions = conditionFlags.filter(c => c.active && c.warning);

  // Build a flat list of ALL equipment: custom-typed (equipment_needed) + predefined grid (equipment_selections)
  const allEquipmentItems: { label: string; qty?: string; source: 'custom' | 'selection' }[] = [];

  // Add custom-typed equipment from equipment_needed
  for (const eq of (job.equipment_needed || [])) {
    allEquipmentItems.push({ label: eq, source: 'custom' });
  }

  // Add predefined grid items from equipment_selections
  if (job.equipment_selections) {
    for (const [, selections] of Object.entries(job.equipment_selections as Record<string, Record<string, string>>)) {
      for (const [key, val] of Object.entries(selections)) {
        if (!val || val === 'no' || val === 'false' || val === '0' || key === '_sub') continue;
        // Convert snake_case key to Title Case for display
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const qty = val !== 'yes' && val !== 'true' ? val : undefined;
        allEquipmentItems.push({ label, qty, source: 'selection' });
      }
    }
  }

  // Keep recommendedEquipment as empty (no longer used separately)
  const recommendedEquipment: { scope: string; items: { label: string; value: string }[] }[] = [];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Approve Job
                </h2>
                <p className="text-green-100 text-sm">Review details and place on schedule</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* ── Job Summary ── */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{job.customer_name}</h3>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {job.job_type?.split(',').map((t, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
                        {t.trim()}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1.5">
                  {job.estimated_cost && (
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Quoted</div>
                      <div className="text-lg font-bold text-green-600 flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        {formatCurrency(job.estimated_cost).replace('$', '')}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {job.location && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-2">
                  <MapPin className="w-3.5 h-3.5" /> {job.location}
                </p>
              )}

              {job.description && (
                <p className="text-xs text-gray-500 mt-2 italic line-clamp-3">&ldquo;{job.description}&rdquo;</p>
              )}
            </div>

            {/* ── Jobsite Info ── */}
            {(job.address || job.contact_phone || job.po_number || job.project_name) && (
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Jobsite Info</div>

                {job.project_name && (
                  <div className="flex items-start gap-2.5">
                    <ClipboardList className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Project</div>
                      <div className="text-sm font-semibold text-slate-800">{job.project_name}</div>
                    </div>
                  </div>
                )}

                {job.address && (
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Site Address</div>
                      <div className="text-sm font-semibold text-slate-800">{job.address}</div>
                    </div>
                  </div>
                )}

                {job.site_contact && (
                  <div className="flex items-start gap-2.5">
                    <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Site Contact</div>
                      <div className="text-sm font-semibold text-slate-800">
                        {job.site_contact}
                        {job.contact_phone && <span className="text-slate-500 font-normal ml-1.5">· {job.contact_phone}</span>}
                      </div>
                    </div>
                  </div>
                )}

                {!job.site_contact && job.contact_phone && (
                  <div className="flex items-start gap-2.5">
                    <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Site Contact Phone</div>
                      <div className="text-sm font-semibold text-slate-800">{job.contact_phone}</div>
                    </div>
                  </div>
                )}

                {job.po_number && (
                  <div className="flex items-start gap-2.5">
                    <Hash className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">PO Number</div>
                      <div className="text-sm font-semibold text-slate-800">{job.po_number}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Site Compliance (prominent) ── */}
            {job.site_compliance && (job.site_compliance.orientation_required || job.site_compliance.badging_required || job.site_compliance.special_instructions) && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 space-y-2.5">
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  Site Compliance Requirements
                </div>

                <div className="flex flex-wrap gap-2">
                  {job.site_compliance.orientation_required && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-800 rounded-lg text-xs font-bold border border-orange-200">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Orientation Required
                      {job.site_compliance.orientation_datetime && (
                        <span className="font-normal ml-0.5 text-orange-600">
                          · {new Date(job.site_compliance.orientation_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      )}
                    </span>
                  )}
                  {job.site_compliance.badging_required && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-lg text-xs font-bold border border-purple-200">
                      <Shield className="w-3.5 h-3.5" />
                      Badging Required
                      {job.site_compliance.badging_type && <span className="font-normal ml-0.5 text-purple-600">· {job.site_compliance.badging_type}</span>}
                    </span>
                  )}
                </div>

                {job.site_compliance.special_instructions && (
                  <div className="bg-amber-100/60 rounded-lg p-3 text-xs text-amber-900 font-medium border border-amber-200">
                    <span className="font-bold text-amber-700 block mb-0.5">Special Instructions:</span>
                    {job.site_compliance.special_instructions}
                  </div>
                )}
              </div>
            )}

            {/* ── Scheduling Details ── */}
            {job.scheduling_flexibility && (job.scheduling_flexibility.special_arrival || job.scheduling_flexibility.outside_hours || job.scheduling_flexibility.can_work_weekends) && (
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-2">
                <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Scheduling Notes
                </div>
                <div className="flex flex-wrap gap-2">
                  {job.scheduling_flexibility.special_arrival && (
                    <span className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold border border-blue-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Special Arrival
                      {job.scheduling_flexibility.special_arrival_time && (
                        <span className="font-normal ml-0.5 text-blue-600">· {job.scheduling_flexibility.special_arrival_time}</span>
                      )}
                    </span>
                  )}
                  {job.scheduling_flexibility.outside_hours && (
                    <span className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold border border-blue-200">
                      Outside Hours
                      {job.scheduling_flexibility.outside_hours_details && <span className="font-normal ml-0.5 text-blue-600">· {job.scheduling_flexibility.outside_hours_details}</span>}
                    </span>
                  )}
                  {job.scheduling_flexibility.can_work_weekends && (
                    <span className="px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-xs font-bold border border-green-200">Can Work Weekends</span>
                  )}
                </div>
              </div>
            )}

            {/* ── Difficulty Rating ── */}
            {job.difficulty_rating && (
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200">
                <Gauge className="w-5 h-5 text-gray-500" />
                <div className="flex-1">
                  <div className="text-[10px] font-bold text-gray-400 uppercase">Job Difficulty</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 10 }, (_, i) => (
                        <div
                          key={i}
                          className={`w-5 h-2.5 rounded-sm ${
                            i < job.difficulty_rating!
                              ? i < 3 ? 'bg-green-400' : i < 5 ? 'bg-blue-400' : i < 7 ? 'bg-yellow-400' : i < 9 ? 'bg-orange-400' : 'bg-red-500'
                              : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getDifficultyInfo(job.difficulty_rating).bg} ${getDifficultyInfo(job.difficulty_rating).color}`}>
                      {job.difficulty_rating}/10 — {getDifficultyInfo(job.difficulty_rating).label}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Equipment Section ── */}
            <div className="bg-indigo-50 rounded-xl border border-indigo-200 overflow-hidden">
              <button
                onClick={() => toggleSection('equipment')}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-indigo-100/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-bold text-indigo-900">Equipment</span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-indigo-200 text-indigo-700 rounded-full font-bold">
                    {allEquipmentItems.length} items
                  </span>
                </div>
                {expandedSections.equipment ? <ChevronUp className="w-4 h-4 text-indigo-500" /> : <ChevronDown className="w-4 h-4 text-indigo-500" />}
              </button>

              {expandedSections.equipment && (
                <div className="px-4 pb-3 space-y-3">
                  {allEquipmentItems.length > 0 ? (
                    <div>
                      <div className="text-[10px] font-bold text-indigo-500 uppercase mb-1.5">All Equipment</div>
                      <div className="flex flex-wrap gap-1.5">
                        {allEquipmentItems.map((item, idx) => (
                          <span key={idx} className="px-2.5 py-1 bg-white rounded-lg text-xs text-indigo-700 font-semibold border border-indigo-200 flex items-center gap-1">
                            <Wrench className="w-3 h-3" />
                            {item.label}
                            {item.qty && <span className="text-indigo-500 font-bold ml-0.5">×{item.qty}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-indigo-400 italic">No equipment specified</p>
                  )}

                  {/* Special equipment */}
                  {job.special_equipment && job.special_equipment.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-amber-500 uppercase mb-1.5">Special Equipment</div>
                      <div className="flex flex-wrap gap-1.5">
                        {job.special_equipment.map((eq: string) => (
                          <span key={eq} className="px-2.5 py-1 bg-amber-50 rounded-lg text-xs text-amber-700 font-semibold border border-amber-200">
                            {eq}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Jobsite Conditions ── */}
            {conditions && activeConditions.length > 0 && (
              <div className={`rounded-xl border overflow-hidden ${warningConditions.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                <button
                  onClick={() => toggleSection('conditions')}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ClipboardList className={`w-4 h-4 ${warningConditions.length > 0 ? 'text-amber-600' : 'text-gray-600'}`} />
                    <span className={`text-sm font-bold ${warningConditions.length > 0 ? 'text-amber-900' : 'text-gray-900'}`}>
                      Jobsite Conditions
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${warningConditions.length > 0 ? 'bg-amber-200 text-amber-700' : 'bg-gray-200 text-gray-700'}`}>
                      {activeConditions.length} active
                    </span>
                    {warningConditions.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-bold flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> {warningConditions.length} alert{warningConditions.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {expandedSections.conditions ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </button>

                {expandedSections.conditions && (
                  <div className="px-4 pb-3">
                    {/* Inside/Outside indicator */}
                    {conditions.inside_outside && (
                      <div className="mb-2 text-xs font-bold text-gray-600 uppercase">
                        Work Area: <span className="text-gray-900">{conditions.inside_outside}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                      {activeConditions.map(cond => (
                        <div
                          key={cond.label}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                            cond.warning
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-white text-gray-700 border border-gray-200'
                          }`}
                        >
                          {cond.icon}
                          <span className="truncate">{cond.label}</span>
                          {cond.detail && <span className="text-[10px] opacity-75 ml-auto flex-shrink-0">{cond.detail}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Site Compliance / Orientation Info ── */}
            {compliance && (compliance.orientation_required || compliance.badging_required || compliance.special_instructions) && (
              <div className="bg-blue-50 rounded-xl border border-blue-200 overflow-hidden">
                <button
                  onClick={() => toggleSection('compliance')}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-100/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-blue-900">Site Compliance & Orientation</span>
                    {(compliance.orientation_required || compliance.badging_required) && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-200 text-blue-700 rounded-full font-bold">
                        Required
                      </span>
                    )}
                  </div>
                  {expandedSections.compliance ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-blue-500" />}
                </button>

                {expandedSections.compliance && (
                  <div className="px-4 pb-3 space-y-2">
                    {compliance.orientation_required && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-blue-200">
                        <HardHat className="w-4 h-4 text-blue-600" />
                        <div>
                          <div className="text-xs font-bold text-blue-900">Orientation Required</div>
                          {compliance.orientation_datetime && (
                            <div className="text-[10px] text-blue-600">{new Date(compliance.orientation_datetime).toLocaleString()}</div>
                          )}
                        </div>
                      </div>
                    )}
                    {compliance.badging_required && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-blue-200">
                        <Shield className="w-4 h-4 text-blue-600" />
                        <div>
                          <div className="text-xs font-bold text-blue-900">Badging Required</div>
                          {compliance.badging_type && (
                            <div className="text-[10px] text-blue-600">{compliance.badging_type}</div>
                          )}
                        </div>
                      </div>
                    )}
                    {compliance.special_instructions && (
                      <div className="px-3 py-2 bg-white rounded-lg border border-blue-200">
                        <div className="text-[10px] font-bold text-blue-500 uppercase mb-1">Special Instructions</div>
                        <p className="text-xs text-blue-900">{compliance.special_instructions}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Additional Notes ── */}
            {job.additional_info && (
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 flex items-start gap-2">
                <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Additional Notes</div>
                  <p className="text-xs text-gray-700">{job.additional_info}</p>
                </div>
              </div>
            )}

            {/* ── Dates Display ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                <div className="text-[10px] font-bold text-blue-500 uppercase mb-1">Start Date</div>
                <div className="text-sm font-bold text-gray-900">
                  {job.scheduled_date ? formatDate(job.scheduled_date) : 'Not set'}
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                <div className="text-[10px] font-bold text-blue-500 uppercase mb-1">End Date</div>
                <div className="text-sm font-bold text-gray-900">
                  {job.end_date ? formatDate(job.end_date) : 'Same day'}
                </div>
                {isMultiDay && (
                  <div className="text-[10px] text-blue-600 font-semibold mt-0.5">{dayCount} day job</div>
                )}
              </div>
            </div>

            {/* Will Call note */}
            {job.is_will_call && (
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <p className="text-xs text-amber-700 font-semibold">
                  Will Call — Job will go to the Will Call folder until a slot opens.
                </p>
              </div>
            )}

            {/* ── Schedule Date Picker ── */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1.5" />
                {job.is_will_call ? 'Tentative Start Date' : 'Confirm Start Date'}
              </label>
              <CalendarPicker
                value={scheduledDate}
                onChange={setScheduledDate}
                minDate={new Date().toISOString().split('T')[0]}
              />
              {isWeekend && (
                <p className="text-xs text-red-600 font-semibold mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Weekend date — most jobs don&apos;t allow weekend work
                </p>
              )}
            </div>

            {/* ── Capacity Status ── */}
            {capacityLoading && (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking schedule capacity...
              </div>
            )}

            {!capacityLoading && capacitySummary && (
              <div className="space-y-2">
                {hasFullDates && (
                  <div className="bg-red-50 rounded-xl p-4 border-2 border-red-200">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-700">Schedule Full</p>
                        <p className="text-xs text-red-600 mt-1">
                          {capacitySummary.fullDates.length === 1
                            ? `${formatDate(capacitySummary.fullDates[0])} has ${capacitySummary.maxSlots}/${capacitySummary.maxSlots} slots filled.`
                            : `${capacitySummary.fullDates.length} dates are full: ${capacitySummary.fullDates.map(formatDate).join(', ')}`
                          }
                        </p>
                        {isMultiDay && !capacitySummary.hasContinuousAvailability && (
                          <p className="text-xs text-red-600 mt-1 font-semibold">
                            This {dayCount}-day job needs continuous availability across all dates.
                          </p>
                        )}
                        <button
                          onClick={handleFindNextAvailable}
                          disabled={findingNext}
                          className="mt-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          {findingNext ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />}
                          Find Next Available Date
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {hasWarningDates && !hasFullDates && (
                  <div className="bg-amber-50 rounded-xl p-4 border-2 border-amber-200">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-amber-700">Approaching Capacity</p>
                        <p className="text-xs text-amber-600 mt-1">
                          {capacitySummary.warningDates.map(d => {
                            const info = capacityData?.[d];
                            return `${formatDate(d)}: ${info?.jobCount}/${info?.maxSlots} slots`;
                          }).join(' | ')}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={warningAcknowledged}
                              onChange={(e) => setWarningAcknowledged(e.target.checked)}
                              className="w-4 h-4 accent-amber-600 rounded"
                            />
                            <span className="text-xs text-amber-700 font-semibold">
                              Confirm: Schedule despite near capacity
                            </span>
                          </label>
                        </div>
                        <button
                          onClick={handleFindNextAvailable}
                          disabled={findingNext}
                          className="mt-2 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          {findingNext ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarDays className="w-3.5 h-3.5" />}
                          Or: Find Next Available Spot
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {!hasFullDates && !hasWarningDates && (
                  <div className="bg-green-50 rounded-xl p-3 border border-green-200">
                    <p className="text-xs text-green-700 font-semibold flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4" />
                      {isMultiDay
                        ? `All ${dayCount} days have availability — continuous scheduling confirmed`
                        : (() => {
                            const info = capacityData?.[scheduledDate];
                            return `Schedule has capacity: ${info?.jobCount ?? 0}/${info?.maxSlots ?? 10} slots filled (${info?.availableSlots ?? 10} available)`;
                          })()
                      }
                    </p>
                  </div>
                )}

                {nextAvailable && (
                  <div className="bg-purple-50 rounded-xl p-3 border border-purple-200">
                    <p className="text-xs text-purple-700 font-semibold">
                      Next available: <strong>{formatDate(nextAvailable.date)}</strong> ({nextAvailable.jobCount} jobs, {nextAvailable.availableSlots} slots open)
                    </p>
                    <button
                      onClick={() => { setScheduledDate(nextAvailable.date); setNextAvailable(null); }}
                      className="mt-1.5 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Use This Date
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Operator Availability ── */}
            {scheduledDate && (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Operator Availability
                    </span>
                  </div>
                  {skillMatch && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      skillMatch.available_qualified_count > 0
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      {skillMatch.available_qualified_count} of {skillMatch.total_operators} ready
                    </span>
                  )}
                </div>
                <div className="p-3">
                  {skillMatchLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking crew availability...
                    </div>
                  ) : !skillMatch ? (
                    <p className="text-xs text-slate-400">Select a date to see qualified operators.</p>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-500 mb-2">
                        Matched against {skillMatch.job_types.length > 0
                          ? <span className="font-bold text-slate-700">{skillMatch.job_types.join(', ').toUpperCase()}</span>
                          : 'this job'} · difficulty <span className="font-bold text-slate-700">{skillMatch.job_difficulty}/10</span>
                      </p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {skillMatch.operators.map((op) => {
                          const matchColor =
                            !op.is_available ? 'bg-slate-100 text-slate-400 ring-slate-200 line-through' :
                            !op.is_qualified ? 'bg-rose-50 text-rose-600 ring-rose-200' :
                            op.match_quality === 'good' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                            op.match_quality === 'stretch' ? 'bg-amber-50 text-amber-700 ring-amber-200' :
                            'bg-rose-50 text-rose-600 ring-rose-200';
                          const statusLabel =
                            !op.is_available ? 'Busy' :
                            !op.is_qualified ? 'Not qualified' :
                            op.match_quality === 'good' ? 'Good match' :
                            op.match_quality === 'stretch' ? 'Stretch' :
                            'Under-skilled';
                          return (
                            <div
                              key={op.id}
                              className={`flex items-center justify-between rounded-lg px-3 py-2 ring-1 ${matchColor}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-semibold truncate">{op.full_name}</span>
                                {op.skill_level_numeric != null && (
                                  <span className="text-[10px] opacity-70 font-medium">
                                    skill {op.skill_level_numeric}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-wider">
                                {statusLabel}
                              </span>
                            </div>
                          );
                        })}
                        {skillMatch.operators.length === 0 && (
                          <p className="text-xs text-slate-400">No operators found.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Info Note ── */}
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
              <p className="text-xs text-blue-700">
                <strong>Note:</strong> Operators will be assigned 2-3 days before the start date.
              </p>
            </div>

            {/* ── Actions ── */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (approving) return;
                  setApproving(true);
                  try {
                    await onConfirm({ scheduledDate });
                  } finally {
                    setApproving(false);
                  }
                }}
                disabled={!canApprove || capacityLoading || approving}
                className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {approving ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Approving...
                  </span>
                ) : capacityLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Checking...
                  </span>
                ) : (
                  <>&#10003; {job.is_will_call ? 'Approve → Will Call' : 'Approve & Schedule'}</>
                )}
              </button>
            </div>
          </div>

          {approving && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] rounded-2xl flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-700">Approving job...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Helper — get Supabase token from client
async function getToken(): Promise<string> {
  try {
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  } catch {
    return '';
  }
}
