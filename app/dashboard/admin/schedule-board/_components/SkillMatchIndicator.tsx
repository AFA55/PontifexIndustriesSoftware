'use client';

import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { useState } from 'react';

interface SkillMatchIndicatorProps {
  operatorSkill: number | null;
  jobDifficulty: number | null;
  isQualified?: boolean;
}

export default function SkillMatchIndicator({ operatorSkill, jobDifficulty, isQualified }: SkillMatchIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (operatorSkill === null || jobDifficulty === null) return null;

  let matchQuality: 'good' | 'stretch' | 'over';
  if (operatorSkill >= jobDifficulty) {
    matchQuality = 'good';
  } else if (operatorSkill >= jobDifficulty - 2) {
    matchQuality = 'stretch';
  } else {
    matchQuality = 'over';
  }

  const config = {
    good: {
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50 border-green-200',
      label: 'Good Match',
      desc: `Skill ${operatorSkill} >= Difficulty ${jobDifficulty}`,
    },
    stretch: {
      icon: AlertTriangle,
      color: 'text-amber-600',
      bg: 'bg-amber-50 border-amber-200',
      label: 'Stretch',
      desc: `Skill ${operatorSkill} is close to Difficulty ${jobDifficulty}`,
    },
    over: {
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50 border-red-200',
      label: 'Over Difficulty',
      desc: `Skill ${operatorSkill} < Difficulty ${jobDifficulty}`,
    },
  };

  const c = config[matchQuality];
  const Icon = c.icon;

  return (
    <div
      className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${c.bg} ${c.color}`}>
        <Icon className="w-3 h-3" />
        {operatorSkill}
      </span>

      {isQualified !== undefined && (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${
          isQualified
            ? 'bg-green-50 border-green-200 text-green-600'
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {isQualified ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        </span>
      )}

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl whitespace-nowrap z-[100]">
          <p className="font-bold">{c.label}</p>
          <p className="text-gray-300 text-[10px]">{c.desc}</p>
          {isQualified !== undefined && (
            <p className="text-gray-300 text-[10px]">
              {isQualified ? 'Qualified for this task type' : 'Not qualified for this task type'}
            </p>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}
