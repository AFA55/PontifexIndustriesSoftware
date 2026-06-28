'use client';

import React, { createContext, useContext, useId, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Tabs — accessible tab list with a brand active underline.
 *
 * Controlled (`value` + `onValueChange`) or uncontrolled (`defaultValue`).
 * Compose:
 *   <Tabs defaultValue="a">
 *     <TabList>
 *       <Tab value="a">First</Tab>
 *       <Tab value="b">Second</Tab>
 *     </TabList>
 *     <TabPanel value="a">...</TabPanel>
 *     <TabPanel value="b">...</TabPanel>
 *   </Tabs>
 */

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
}

const Ctx = createContext<TabsCtx | null>(null);

function useTabs(component: string): TabsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error(`<${component}> must be used inside <Tabs>`);
  return ctx;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({
  value: controlled,
  defaultValue,
  onValueChange,
  className,
  children,
  ...rest
}: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState(defaultValue ?? '');
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : internal;

  const setValue = (v: string) => {
    if (!isControlled) setInternal(v);
    onValueChange?.(v);
  };

  return (
    <Ctx.Provider value={{ value, setValue, baseId }}>
      <div className={className} {...rest}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function TabList({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center gap-1 border-b border-gray-200 dark:border-white/10 overflow-x-auto',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface TabProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  value: string;
}

export function Tab({ value, className, children, ...rest }: TabProps) {
  const { value: active, setValue, baseId } = useTabs('Tab');
  const selected = active === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => setValue(value)}
      className={cn(
        'relative -mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 rounded-t-md',
        selected
          ? 'border-brand text-brand'
          : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-white/60 dark:hover:text-white',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  /** Keep the panel mounted (hidden) when inactive. Default: unmount. */
  keepMounted?: boolean;
}

export function TabPanel({
  value,
  keepMounted = false,
  className,
  children,
  ...rest
}: TabPanelProps) {
  const { value: active, baseId } = useTabs('TabPanel');
  const selected = active === value;
  if (!selected && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      hidden={!selected}
      className={cn('pt-4 focus:outline-none', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Tabs;
