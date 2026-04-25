'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, FileText, Wrench, MessageSquare, Shield,
  MapPin, Phone, User, Navigation, PlayCircle, Loader2, CheckCircle2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { JobTicketData } from './JobTicketCard';
import EquipmentPanel from './EquipmentPanel';
import NotesPanel from './NotesPanel';
import SiteConditionsPanel from './SiteConditionsPanel';
import HelperWorkLog from './HelperWorkLog';
import { isMandatoryComplete } from '@/lib/equipment-map';

interface JobTicketDetailProps {
  job: JobTicketData;
  isHelper: boolean;
  isMultiDayContinuation: boolean; // Day 2+ of a multi-day job
}

type PanelKey = 'work' | 'equipment' | 'notes' | 'site';

export default function JobTicketDetail({ job, isHelper, isMultiDayContinuation }: JobTicketDetailProps) {
  const router = useRouter();
  const [openPanels, setOpenPanels] = useState<Set<PanelKey>>(new Set(['work']));
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [startingRoute, setStartingRoute] = useState(false);

  const togglePanel = (key: PanelKey) => {
    setOpenPanels(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleEquipment = (item: string) => {
    setCheckedItems(prev => ({ ...prev, [item]: !prev[item] }));
  };

  // Check if mandatory equipment is complete
  const mandatoryItems = job.mandatory_equipment || [];
  const allEquipment = job.equipment_needed || [];
  const mandatoryComplete = isMandatoryComplete(mandatoryItems, checkedItems);
  const allEquipmentChecked = allEquipment.length === 0 || allEquipment.every(item => checkedItems[item]);

  // For multi-day continuation, skip checklist requirement
  const canStartRoute = isMultiDayContinuation || mandatoryComplete;
  const isCompleted = job.status === 'completed';
  const isInProgress = ['in_route', 'in_progress'].includes(job.status);

  const handleStartRoute = async () => {
    if (!canStartRoute) return;
    setStartingRoute(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Update status to in_route
      await fetch(`/api/job-orders/${job.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status: 'in_route' }),
      });

      // Navigate to in-route page
      router.push(`/dashboard/job-schedule/${job.id}/in-route`);
    } catch (err) {
      console.error('Error starting route:', err);
    } finally {
      setStartingRoute(false);
    }
  };

  const handleContinueJob = () => {
    if (job.status === 'in_route') {
      router.push(`/dashboard/job-schedule/${job.id}/in-route`);
    } else if (job.status === 'in_progress') {
      router.push(`/dashboard/job-schedule/${job.id}/work-performed`);
    }
  };

  const handleViewCompleted = () => {
    router.push(`/dashboard/job-schedule/${job.id}/work-performed`);
  };

  const panels = isHelper
    ? [
        { key: 'work' as PanelKey, label: 'Work Details', icon: FileText, color: 'blue' },
        { key: 'equipment' as PanelKey, label: 'Equipment Required', icon: Wrench, color: 'green' },
      ]
    : [
        { key: 'work' as PanelKey, label: 'Work Details', icon: FileText, color: 'blue' },
        { key: 'equipment' as PanelKey, label: 'Equipment Required', icon: Wrench, color: 'green' },
        { key: 'notes' as PanelKey, label: 'Job Notes', icon: MessageSquare, color: 'purple' },
        { key: 'site' as PanelKey, label: 'Site Conditions', icon: Shield, color: 'amber' },
      ];

  return (
    <div className="bg-white/90 dark:bg-white/5 backdrop-blur-lg rounded-2xl shadow-xl border-2 border-blue-200/60 dark:border-white/10 overflow-hidden animate-in slide-in-from-top-2 duration-200">
      {/* Multi-day continuation banner */}
      {isMultiDayContinuation && (
        <div className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white px-4 py-2 text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Continuing from previous day — equipment checklist not required
        </div>
      )}

      {/* Location Quick Info */}
      <div className="px-4 py-3 bg-gray-50 dark:bg-white/5 border-b border-gray-200 dark:border-white/10">
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-1.5 text-gray-700 dark:text-white/80 flex-1 min-w-0">
            <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="truncate font-medium">{job.address || job.location}</span>
          </div>
          {job.address && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-200 transition-colors flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Navigation className="w-3.5 h-3.5" /> Directions
            </a>
          )}
        </div>
        {(job.foreman_name || job.customer_contact) && (
          <div className="flex items-center gap-4 mt-2 text-sm">
            {job.foreman_name && (
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-white/60">
                <User className="w-3.5 h-3.5" />
                <span>{job.foreman_name}</span>
                {job.foreman_phone && (
                  <a href={`tel:${job.foreman_phone}`} className="text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collapsible Panels */}
      <div className="divide-y divide-gray-100 dark:divide-white/10">
        {panels.map(({ key, label, icon: Icon, color }) => {
          const isOpen = openPanels.has(key);
          return (
            <div key={key}>
              <button
                onClick={() => togglePanel(key)}
                className={`w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 text-${color}-600`} />
                  <span className="text-sm font-bold text-gray-800 dark:text-white">{label}</span>
                  {key === 'equipment' && !isMultiDayContinuation && !isCompleted && allEquipment.length > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      mandatoryComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {mandatoryComplete ? 'Ready' : 'Required'}
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="px-4 pb-4">
                  {key === 'work' && (
                    <div className="space-y-3">
                      {/* Service Type */}
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-bold">
                          {job.job_type}
                        </span>
                        {job.estimated_hours && (
                          <span className="text-sm text-gray-500 dark:text-white/60">Est. {job.estimated_hours} hrs</span>
                        )}
                        {job.po_number && (
                          <span className="text-xs text-gray-500">PO: {job.po_number}</span>
                        )}
                      </div>
                      {/* Work Description */}
                      <div className="p-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl">
                        <p className="text-sm text-gray-800 dark:text-white/80 whitespace-pre-wrap leading-relaxed">
                          {job.description || 'No description provided'}
                        </p>
                      </div>
                      {/* Project Manager */}
                      {(job.salesman_name || job.created_by_name) && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <User className="w-3.5 h-3.5" />
                          <span>Submitted by: <strong>{job.salesman_name || job.created_by_name}</strong></span>
                        </div>
                      )}
                    </div>
                  )}
                  {key === 'equipment' && (
                    <EquipmentPanel
                      equipmentNeeded={allEquipment}
                      mandatoryEquipment={mandatoryItems}
                      specialEquipment={job.special_equipment}
                      checkedItems={checkedItems}
                      onToggle={toggleEquipment}
                      disabled={isCompleted || isMultiDayContinuation}
                    />
                  )}
                  {key === 'notes' && <NotesPanel jobId={job.id} />}
                  {key === 'site' && <SiteConditionsPanel job={job} />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Helper Work Log */}
      {isHelper && !isCompleted && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-white/10">
          <HelperWorkLog
            jobId={job.id}
            jobNumber={job.job_number}
            customerName={job.customer_name}
          />
        </div>
      )}

      {/* Action Buttons */}
      {!isCompleted && !isHelper && (
        <div className="px-4 pb-4 pt-2">
          {isInProgress ? (
            <button
              onClick={handleContinueJob}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <PlayCircle className="w-5 h-5" />
              {job.status === 'in_route' ? 'Continue In Route' : 'Continue Work'}
            </button>
          ) : (
            <button
              onClick={handleStartRoute}
              disabled={!canStartRoute || startingRoute}
              className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
                canStartRoute
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                  : 'bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-white/40 cursor-not-allowed'
              }`}
            >
              {startingRoute ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Starting...</>
              ) : canStartRoute ? (
                <><PlayCircle className="w-5 h-5" /> Start In Route</>
              ) : (
                <><Wrench className="w-5 h-5" /> Complete Required Equipment First</>
              )}
            </button>
          )}
        </div>
      )}

      {/* View completed job details */}
      {isCompleted && (
        <div className="px-4 pb-4 pt-2">
          <button
            onClick={handleViewCompleted}
            className="w-full py-3 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-white/80 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" /> View Work Performed
          </button>
        </div>
      )}
    </div>
  );
}
