'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  company_code: string;
}

interface TenantContextType {
  tenant: Tenant | null;
  setTenant: (t: Tenant | null) => void;
  clearTenant: () => void;
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  setTenant: () => {},
  clearTenant: () => {},
});

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenantState] = useState<Tenant | null>(null);

  useEffect(() => {
    // Load from localStorage on mount
    try {
      const stored = localStorage.getItem('current-tenant');
      if (stored) {
        setTenantState(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  const setTenant = (t: Tenant | null) => {
    setTenantState(t);
    if (t) {
      localStorage.setItem('current-tenant', JSON.stringify(t));
    } else {
      localStorage.removeItem('current-tenant');
    }
  };

  const clearTenant = () => {
    setTenantState(null);
    localStorage.removeItem('current-tenant');
    // Clear any tenant-specific branding caches
    try {
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith('branding-')) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore
    }
  };

  return (
    <TenantContext.Provider value={{ tenant, setTenant, clearTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
