'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface RevealSectionProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}

/**
 * RevealSection — fade/translate content in as it mounts or scrolls into view.
 * Respects prefers-reduced-motion (skips animation entirely).
 */
export default function RevealSection({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: RevealSectionProps) {
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true);
      return;
    }
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay, reducedMotion]);

  const style: React.CSSProperties = reducedMotion
    ? {}
    : {
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 420ms ease, transform 420ms ease',
        willChange: 'opacity, transform',
      };

  // Use a div by default — keep generic Tag support but cast for TS
  const Component = Tag as unknown as React.ElementType;
  return (
    <Component
      ref={ref as React.RefObject<HTMLDivElement>}
      className={className}
      style={style}
    >
      {children}
    </Component>
  );
}
