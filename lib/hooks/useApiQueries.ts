/**
 * Stub React-Query-style hooks for equipment unit API operations.
 * These provide the expected return shapes so consuming pages compile.
 * Replace with real react-query / SWR implementations when ready.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Shared helper types
// ---------------------------------------------------------------------------

interface QueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface MutationResult<TInput, TOutput = any> {
  mutateAsync: (input: TInput) => Promise<TOutput>;
  isPending: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// useEquipmentUnits
// ---------------------------------------------------------------------------

interface UseEquipmentUnitsParams {
  page?: number;
  pageSize?: number;
  category?: string;
  status?: string;
  search?: string;
}

interface EquipmentUnitsResponse {
  data: any[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  stats: {
    total: number;
    active: number;
    needsService: number;
    retired: number;
  };
}

export function useEquipmentUnits(
  params: UseEquipmentUnitsParams = {},
): QueryResult<EquipmentUnitsResponse> {
  const [data, setData] = useState<EquipmentUnitsResponse | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiFetch<EquipmentUnitsResponse>(
        '/api/equipment-units',
        { params: paramsRef.current as Record<string, any> },
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [
    fetchData,
    params.page,
    params.pageSize,
    params.category,
    params.status,
    params.search,
  ]);

  return { data, isLoading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// useOperators
// ---------------------------------------------------------------------------

interface OperatorsResponse {
  data: any[];
}

export function useOperators(): QueryResult<OperatorsResponse> {
  const [data, setData] = useState<OperatorsResponse | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await apiFetch<OperatorsResponse>('/api/operators');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// useCreateEquipmentUnit
// ---------------------------------------------------------------------------

export function useCreateEquipmentUnit(): MutationResult<Record<string, any>> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = useCallback(async (input: Record<string, any>) => {
    setIsPending(true);
    setError(null);
    try {
      const result = await apiFetch('/api/equipment-units', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsPending(false);
    }
  }, []);

  return { mutateAsync, isPending, error };
}

// ---------------------------------------------------------------------------
// useUpdateEquipmentUnit
// ---------------------------------------------------------------------------

export function useUpdateEquipmentUnit(): MutationResult<
  Record<string, any> & { id: string }
> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = useCallback(
    async (input: Record<string, any> & { id: string }) => {
      setIsPending(true);
      setError(null);
      try {
        const { id, ...body } = input;
        const result = await apiFetch(`/api/equipment-units/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutateAsync, isPending, error };
}

// ---------------------------------------------------------------------------
// usePairNfc
// ---------------------------------------------------------------------------

export function usePairNfc(): MutationResult<{
  unitId: string;
  nfcTagId: string;
}> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = useCallback(
    async (input: { unitId: string; nfcTagId: string }) => {
      setIsPending(true);
      setError(null);
      try {
        const result = await apiFetch(
          `/api/equipment-units/${input.unitId}/pair-nfc`,
          {
            method: 'POST',
            body: JSON.stringify({ nfc_tag_id: input.nfcTagId }),
          },
        );
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutateAsync, isPending, error };
}
