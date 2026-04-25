'use client';

import { Shield, Droplets, Zap, Wind, AlertTriangle, HardHat, FileText } from 'lucide-react';

interface SiteConditionsPanelProps {
  job: {
    required_documents?: string[] | null;
    scheduling_flexibility?: string | null;
    // Jobsite conditions from schedule form (stored in description or separate fields)
    description?: string;
  };
}

export default function SiteConditionsPanel({ job }: SiteConditionsPanelProps) {
  const docs = job.required_documents || [];
  const flexibility = job.scheduling_flexibility;

  return (
    <div className="space-y-4">
      {/* Required Documents / Compliance */}
      {docs.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-700 dark:text-white/80 flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-blue-600" />
            Required Documents
          </h4>
          <div className="space-y-1.5">
            {docs.map((doc, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-100 rounded-lg">
                <Shield className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="text-sm text-blue-800">{doc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scheduling Flexibility */}
      {flexibility && (
        <div>
          <h4 className="text-sm font-bold text-gray-700 dark:text-white/80 flex items-center gap-2 mb-2">
            <HardHat className="w-4 h-4 text-amber-600" />
            Scheduling Notes
          </h4>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm text-amber-800">{flexibility}</p>
          </div>
        </div>
      )}

      {/* Safety Reminders */}
      <div>
        <h4 className="text-sm font-bold text-gray-700 dark:text-white/80 flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          Safety Reminders
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl">
            <Droplets className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-gray-700 dark:text-white/80">Water Control</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-xl">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span className="text-xs font-medium text-gray-700 dark:text-white/80">Electrical Safety</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-xl">
            <Wind className="w-4 h-4 text-cyan-500" />
            <span className="text-xs font-medium text-gray-700 dark:text-white/80">Dust/Ventilation</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-200 rounded-xl">
            <HardHat className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-medium text-gray-700 dark:text-white/80">PPE Required</span>
          </div>
        </div>
      </div>

      {docs.length === 0 && !flexibility && (
        <div className="text-center py-4 text-gray-400 dark:text-white/40 text-sm">
          No additional site conditions specified
        </div>
      )}
    </div>
  );
}
