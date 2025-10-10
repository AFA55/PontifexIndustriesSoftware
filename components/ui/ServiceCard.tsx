'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';

interface ServiceCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  isSelected: boolean;
  isExpanded: boolean;
  itemCount: number;
  totalCost: number;
  onClick: () => void;
  children?: React.ReactNode;
}

export function ServiceCard({
  title,
  description,
  icon,
  gradient,
  isSelected,
  isExpanded,
  itemCount,
  totalCost,
  onClick,
  children,
}: ServiceCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        relative rounded-2xl overflow-hidden transition-all duration-300
        ${isSelected
          ? 'ring-4 ring-primary-500 shadow-glow-blue'
          : 'ring-1 ring-gray-200 dark:ring-gray-700'
        }
        hover-lift cursor-pointer
      `}
      onClick={onClick}
    >
      {/* Gradient Header */}
      <div className={`${gradient} p-6 text-white relative overflow-hidden`}>
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 20px 20px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="relative z-10">
          {/* Header Row */}
          <div className="flex items-start justify-between mb-4">
            {/* Icon */}
            <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center transform transition-transform group-hover:scale-110">
              {icon}
            </div>

            {/* Selected Badge */}
            <AnimatePresence>
              {isSelected && (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                  className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg"
                >
                  <Check className="w-5 h-5 text-green-600" strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Title & Description */}
          <h3 className="text-xl font-bold mb-2">{title}</h3>
          <p className="text-white/90 text-sm mb-4">{description}</p>

          {/* Stats Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {itemCount > 0 && (
                <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full">
                  <span className="text-sm font-semibold">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </span>
                </div>
              )}
              {totalCost > 0 && (
                <div className="px-3 py-1 bg-white/30 backdrop-blur-sm rounded-full">
                  <span className="text-sm font-bold">
                    ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {/* Expand/Collapse Icon */}
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
              className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center"
            >
              <ChevronDown className="w-5 h-5" />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden bg-white dark:bg-slate-800"
          >
            <div className="p-6 border-t border-gray-100 dark:border-gray-700">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shimmer effect on hover */}
      <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
      </div>
    </motion.div>
  );
}

// Add shimmer animation to tailwind config or use inline styles
