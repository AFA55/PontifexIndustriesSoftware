/**
 * React Query hooks for authenticated API data fetching.
 * Provides caching, deduplication, and background refetching
 * for all major data endpoints.
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, type PaginatedResponse } from '@/lib/api-client'

// ============================================================
// Query Key Factories (for consistent cache invalidation)
// ============================================================

export const queryKeys = {
  // Job Orders
  jobOrders: {
    all: ['jobOrders'] as const,
    list: (filters: Record<string, any>) => ['jobOrders', 'list', filters] as const,
    detail: (id: string) => ['jobOrders', 'detail', id] as const,
  },
  // Users / Operators
  users: {
    all: ['users'] as const,
    list: (filters: Record<string, any>) => ['users', 'list', filters] as const,
    operators: () => ['users', 'operators'] as const,
    admins: () => ['users', 'admins'] as const,
  },
  // Active Operators (status tracking)
  activeOperators: {
    all: ['activeOperators'] as const,
  },
  // Inventory
  inventory: {
    all: ['inventory'] as const,
    list: (filters: Record<string, any>) => ['inventory', 'list', filters] as const,
    detail: (id: string) => ['inventory', 'detail', id] as const,
  },
}

// ============================================================
// Job Orders
// ============================================================

interface JobOrderFilters {
  page?: number
  pageSize?: number
  status?: string
  assignedTo?: string
  startDate?: string
  endDate?: string
}

interface JobOrderSummary {
  totalJobs: number
  statusCounts: Record<string, number>
  avgDriveTimeMinutes: number
  avgProductionTimeMinutes: number
}

interface JobOrdersResponse {
  success: boolean
  data: {
    jobOrders: any[]
    summary: JobOrderSummary
    pagination: {
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
  }
}

export function useJobOrders(filters: JobOrderFilters = {}) {
  const { page = 1, pageSize = 50, ...rest } = filters
  return useQuery({
    queryKey: queryKeys.jobOrders.list({ page, pageSize, ...rest }),
    queryFn: () =>
      apiFetch<JobOrdersResponse>('/api/admin/job-orders', {
        params: {
          page,
          pageSize,
          ...(rest.status && { status: rest.status }),
          ...(rest.assignedTo && { assignedTo: rest.assignedTo }),
          ...(rest.startDate && { startDate: rest.startDate }),
          ...(rest.endDate && { endDate: rest.endDate }),
        },
      }),
  })
}

export function useCreateJobOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobData: any) =>
      apiFetch('/api/admin/job-orders', {
        method: 'POST',
        body: JSON.stringify(jobData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.jobOrders.all })
    },
  })
}

// ============================================================
// Users / Operators
// ============================================================

interface UsersFilters {
  page?: number
  pageSize?: number
  role?: string
}

interface UsersResponse {
  success: boolean
  data: any[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export function useUsers(filters: UsersFilters = {}) {
  const { page = 1, pageSize = 50, role } = filters
  return useQuery({
    queryKey: queryKeys.users.list({ page, pageSize, role }),
    queryFn: () =>
      apiFetch<UsersResponse>('/api/admin/users', {
        params: {
          page,
          pageSize,
          ...(role && { role }),
        },
      }),
  })
}

/** Convenience hook: fetch only operators */
export function useOperators() {
  return useQuery({
    queryKey: queryKeys.users.operators(),
    queryFn: () =>
      apiFetch<UsersResponse>('/api/admin/users', {
        params: { role: 'operator', pageSize: 200 },
      }),
  })
}

// ============================================================
// Active Operators (real-time status)
// ============================================================

interface ActiveOperatorsResponse {
  success: boolean
  data: {
    operators: any[]
    summary: {
      totalActive: number
      byStatus: Record<string, number>
      totalHoursWorked: number
    }
  }
}

export function useActiveOperators() {
  return useQuery({
    queryKey: queryKeys.activeOperators.all,
    queryFn: () =>
      apiFetch<ActiveOperatorsResponse>('/api/admin/operators/active'),
    // Refresh every 30 seconds for near-real-time operator tracking
    refetchInterval: 30_000,
  })
}

// ============================================================
// Inventory
// ============================================================

interface InventoryFilters {
  page?: number
  pageSize?: number
  category?: string
  search?: string
}

interface InventoryResponse {
  data: any[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export function useInventory(filters: InventoryFilters = {}) {
  const { page = 1, pageSize = 50, category, search } = filters
  return useQuery({
    queryKey: queryKeys.inventory.list({ page, pageSize, category, search }),
    queryFn: () =>
      apiFetch<InventoryResponse>('/api/inventory', {
        params: {
          page,
          pageSize,
          ...(category && category !== 'all' && { category }),
          ...(search && { search }),
        },
      }),
  })
}

export function useCreateInventoryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (itemData: any) =>
      apiFetch('/api/inventory', {
        method: 'POST',
        body: JSON.stringify(itemData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })
    },
  })
}
