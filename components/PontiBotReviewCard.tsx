'use client';

import { motion } from 'framer-motion';
import { Check, Edit3, X, ArrowRight } from 'lucide-react';
import type { PontiBotData } from '@/lib/pontibot-script';
import { formatDateDisplay, formatTimeDisplay } from '@/lib/voice-parser';

interface PontiBotReviewCardProps {
  data: PontiBotData;
  onSubmit: () => void;
  onCancel: () => void;
  onStartOver: () => void;
  submitting: boolean;
}

export function PontiBotReviewCard({
  data,
  onSubmit,
  onCancel,
  onStartOver,
  submitting,
}: PontiBotReviewCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      {/* Header */}
      <div className="text-center mb-4">
        <div className="w-12 h-12 mx-auto bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center mb-2">
          <Check size={24} className="text-white" />
        </div>
        <h2 className="text-lg font-bold text-white">Review & Apply</h2>
        <p className="text-gray-400 text-xs mt-1">Check details, then apply to form</p>
      </div>

      {/* Card */}
      <div className="bg-gray-800/80 backdrop-blur-lg rounded-2xl border border-gray-700/50 overflow-hidden max-h-[60vh] overflow-y-auto">

        {/* Step 1: Basic Info */}
        <ReviewSection title="Basic Information" step={1}>
          <ReviewField label="Job Type(s)" value={data.jobTypes.join(', ')} />
          {!data.jobTypes.includes('SHOP TICKET') && (
            <>
              <ReviewField label="Difficulty" value={`${data.difficulty_rating}/10`} />
              <ReviewField label="Priority" value={data.priority.toUpperCase()} />
              <ReviewField label="Truck Parking" value={data.truck_parking === 'close' ? 'Close' : 'Far'} />
              <ReviewField label="Environment" value={data.work_environment === 'indoor' ? 'Indoor' : 'Outdoor'} />
              <ReviewField label="Site Cleanliness" value={`${data.site_cleanliness}/10`} />
            </>
          )}
          {data.shopTicketDescription && (
            <ReviewField label="Shop Description" value={data.shopTicketDescription} />
          )}
        </ReviewSection>

        {/* Step 2: Work Details */}
        {Object.keys(data.jobTypeDetails).length > 0 && (
          <ReviewSection title="Work Details" step={2}>
            {Object.entries(data.jobTypeDetails).map(([jobType, details]) => (
              <div key={jobType} className="mb-3">
                <p className="text-orange-400 font-bold text-sm mb-1">{jobType}</p>
                {details.accessibility && (
                  <ReviewField label="Accessibility" value={details.accessibility} small />
                )}
                {details.locations && Array.isArray(details.locations) && (
                  <ReviewField label="Locations" value={details.locations.join(', ')} small />
                )}
                {details.material && (
                  <ReviewField label="Material" value={`${details.material}${details.materialOther ? ` (${details.materialOther})` : ''}`} small />
                )}
                {details.overcutsAllowed && (
                  <ReviewField label="Overcuts" value={details.overcutsAllowed} small />
                )}
                {details.holes && Array.isArray(details.holes) && details.holes.map((h: any, i: number) => (
                  <ReviewField
                    key={i}
                    label={`Hole Set ${i + 1}`}
                    value={`${h.quantity} holes, ${h.diameter}" dia, ${h.depth}" deep${h.aboveFiveFeet ? ` (${h.ladderLiftOption || 'Above 5ft'})` : ''}`}
                    small
                  />
                ))}
                {details.cuts && Array.isArray(details.cuts) && details.cuts.map((c: any, i: number) => (
                  <ReviewField
                    key={i}
                    label={`Cut ${i + 1}`}
                    value={formatCutSummary(c, jobType)}
                    small
                  />
                ))}
                {details.methods && Array.isArray(details.methods) && (
                  <ReviewField label="Methods" value={details.methods.join(', ')} small />
                )}
                {details.removal && (
                  <ReviewField label="Removal" value={details.removal} small />
                )}
                {details.areas && Array.isArray(details.areas) && details.areas.map((a: any, i: number) => (
                  <ReviewField
                    key={i}
                    label={`Area ${i + 1}`}
                    value={`${a.areaVolume}, ${a.thickness}" thick, ${a.material}${a.materialOther ? ` (${a.materialOther})` : ''}`}
                    small
                  />
                ))}
                {details.quantity && (
                  <ReviewField label="Scan Area" value={details.quantity} small />
                )}
              </div>
            ))}
            {data.additionalInfo && (
              <ReviewField label="Additional Comments" value={data.additionalInfo} />
            )}
          </ReviewSection>
        )}

        {/* Step 3: Location */}
        <ReviewSection title="Location" step={3}>
          <ReviewField label="Location" value={data.location} />
          <ReviewField label="Address" value={data.address} />
          {(data.estimatedDriveHours > 0 || data.estimatedDriveMinutes > 0) && (
            <ReviewField label="Drive Time" value={`${data.estimatedDriveHours}h ${data.estimatedDriveMinutes}m`} />
          )}
        </ReviewSection>

        {/* Step 4: Schedule */}
        <ReviewSection title="Schedule" step={4}>
          <ReviewField label="Start Date" value={formatDateDisplay(data.startDate)} />
          {data.endDate !== data.startDate && (
            <ReviewField label="End Date" value={formatDateDisplay(data.endDate)} />
          )}
          <ReviewField label="Site Arrival" value={formatTimeDisplay(data.arrivalTime)} />
          {data.shopArrivalTime && (
            <ReviewField label="Shop Arrival" value={formatTimeDisplay(data.shopArrivalTime)} />
          )}
          <ReviewField label="Estimated Hours" value={data.estimatedHours} />
        </ReviewSection>

        {/* Step 5: Team */}
        <ReviewSection title="Team" step={5}>
          <ReviewField
            label="Operators"
            value={data.technicians.length > 0
              ? data.technicians.map(t => t.full_name).join(', ')
              : 'Unassigned'}
          />
          <ReviewField
            label="Salesman"
            value={data.salesman?.full_name || 'Not set'}
          />
        </ReviewSection>

        {/* Step 6: Equipment */}
        {data.equipment.length > 0 && (
          <ReviewSection title="Equipment" step={6}>
            <ReviewField label="Items" value={data.equipment.join(', ')} />
          </ReviewSection>
        )}

        {/* Step 7: Job Info */}
        <ReviewSection title="Job Information" step={7}>
          {data.title && <ReviewField label="Job Title" value={data.title} />}
          {data.customer && <ReviewField label="Customer" value={data.customer} />}
          {data.contactOnSite && <ReviewField label="Contact On Site" value={data.contactOnSite} />}
          {data.contactPhone && <ReviewField label="Contact Phone" value={data.contactPhone} />}
          {data.companyName && <ReviewField label="Company" value={data.companyName} />}
          {data.po && <ReviewField label="PO Number" value={data.po} />}
          {data.jobSiteGC && <ReviewField label="General Contractor" value={data.jobSiteGC} />}
          {data.jobQuote !== undefined && data.jobQuote !== null && (
            <ReviewField label="Quoted Price" value={`$${data.jobQuote.toLocaleString()}`} />
          )}
        </ReviewSection>

        {/* Step 8: Documents */}
        <ReviewSection title="Documents" step={8}>
          <ReviewField label="Required" value={data.requiredDocuments.map(d =>
            d === 'silica-dust-control' ? 'Silica Dust Exposure Plan' :
            d === 'jsa-form' ? 'JSA Form' : d
          ).join(', ')} />
        </ReviewSection>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-4">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onSubmit}
          disabled={submitting}
          className={`w-full px-6 py-3 rounded-xl font-bold text-white shadow-lg transition-all ${
            submitting
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 shadow-orange-500/30'
          }`}
        >
          <ArrowRight size={18} className="inline mr-2" />
          Apply to Form
        </motion.button>
        <div className="flex items-center justify-center gap-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onStartOver}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-orange-400 border border-orange-500/50 hover:bg-orange-500/10 transition-all"
          >
            <Edit3 size={14} className="inline mr-1" />
            Start Over
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-400 border border-gray-600 hover:bg-gray-800 transition-all"
          >
            <X size={14} className="inline mr-1" />
            Close
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ReviewSection({ title, step, children }: { title: string; step: number; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-700/50 last:border-b-0 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-6 h-6 bg-orange-500/20 text-orange-400 rounded-full flex items-center justify-center text-xs font-bold">
          {step}
        </span>
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="ml-8 space-y-1">
        {children}
      </div>
    </div>
  );
}

function ReviewField({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  if (!value || value === 'Not set' || value === 'Unassigned') {
    return (
      <div className={`flex gap-2 ${small ? 'text-xs' : 'text-sm'}`}>
        <span className="text-gray-500 min-w-[120px]">{label}:</span>
        <span className="text-gray-600 italic">{value || '—'}</span>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${small ? 'text-xs' : 'text-sm'}`}>
      <span className="text-gray-400 min-w-[120px]">{label}:</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

function formatCutSummary(cut: any, jobType: string): string {
  if (cut.linearCutOnly || cut.cutType === 'Linear Feet' || (!cut.cutType && cut.linearFeet)) {
    let s = `${cut.linearFeet || '?'} LF x ${cut.thickness || '?'}" ${jobType === 'HAND SAWING' ? 'deep' : 'thick'}`;
    if (cut.removing) {
      s += ' | REMOVING';
      if (cut.equipment) {
        const eq = Array.isArray(cut.equipment) ? cut.equipment.join(', ') : cut.equipment;
        s += ` (${eq})`;
      }
    }
    return s;
  }

  if (cut.cutType === 'Areas' || cut.length || cut.width) {
    const qty = cut.quantity || '1';
    let s = `${qty} area(s) - ${cut.length || '?'}' x ${cut.width || '?'}' x ${cut.thickness || '?'}"`;
    if (cut.openingSize) s = `${qty} area(s) - ${cut.openingSize} - ${cut.length || '?'}' x ${cut.width || '?'}' x ${cut.thickness || '?'}"`;
    if (cut.removing) {
      s += ' | REMOVING';
      if (cut.equipment) {
        const eq = Array.isArray(cut.equipment) ? cut.equipment.join(', ') : cut.equipment;
        s += ` (${eq})`;
      }
    }
    return s;
  }

  if (cut.description) return cut.description;

  return JSON.stringify(cut);
}
