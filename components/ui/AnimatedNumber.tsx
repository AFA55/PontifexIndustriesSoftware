'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  colorThreshold?: { low: number; medium: number; high: number };
}

export function AnimatedNumber({
  value,
  duration = 0.5,
  decimals = 2,
  prefix = '$',
  suffix = '',
  className = '',
  colorThreshold,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const previousValue = useRef(value);

  useEffect(() => {
    if (previousValue.current !== value) {
      setIsAnimating(true);

      const startValue = previousValue.current;
      const endValue = value;
      const startTime = Date.now();
      const durationMs = duration * 1000;

      const animate = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);

        // Easing function (ease-out cubic)
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        const currentValue = startValue + (endValue - startValue) * easeProgress;
        setDisplayValue(currentValue);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayValue(endValue);
          setIsAnimating(false);
          previousValue.current = endValue;
        }
      };

      requestAnimationFrame(animate);
    }
  }, [value, duration]);

  // Determine color based on value if thresholds provided
  const getColor = () => {
    if (!colorThreshold) return '';

    if (value >= colorThreshold.high) return 'text-green-600 dark:text-green-400';
    if (value >= colorThreshold.medium) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const formattedValue = displayValue.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <motion.div
      className={`${className} ${getColor()} number-transition`}
      animate={isAnimating ? { scale: [1, 1.05, 1] } : {}}
      transition={{ duration: 0.3 }}
    >
      <span className="font-mono">
        {prefix}{formattedValue}{suffix}
      </span>
    </motion.div>
  );
}

// Simpler version for smaller numbers
export function AnimatedCounter({ value, className = '' }: { value: number; className?: string }) {
  return (
    <motion.span
      key={value}
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -10, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`inline-block ${className}`}
    >
      {value}
    </motion.span>
  );
}
