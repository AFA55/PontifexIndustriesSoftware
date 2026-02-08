/**
 * useJobs Hook
 *
 * Provides job data with automatic categorization,
 * search, and date filtering. Replaces the data fetching
 * logic scattered across job board, schedule board, etc.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAllJobs,
  filterJobsBySearch,
  filterJobsByDate,
  updateJob,
  type CategorizedJobs,
} from '@/services/jobs';
import { getOperatorOptions } from '@/services/operators';
import type { JobOrder, JobUpdatePayload } from '@/types/job';
import type { OperatorOption } from '@/types/operator';
import { supabase } from '@/lib/supabase';

interface UseJobsReturn {
  /** All jobs (raw, unfiltered) */
  allJobs: JobOrder[];
  /** Jobs categorized by status */
  upcoming: JobOrder[];
  active: JobOrder[];
  completed: JobOrder[];
  /** Currently displayed jobs (after search + date filter) */
  filteredJobs: (tab: 'upcoming' | 'active' | 'completed') => JobOrder[];
  /** Available operators for assignment */
  operators: OperatorOption[];
  /** Loading state */
  loading: boolean;
  /** Search query */
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  /** Date filter */
  filterDate: string | null;
  setFilterDate: (d: string | null) => void;
  /** Refresh all data */
  refresh: () => Promise<void>;
  /** Update a job */
  updateJob: (jobId: string, updates: JobUpdatePayload) => Promise<boolean>;
}

export function useJobs(): UseJobsReturn {
  const [allJobs, setAllJobs] = useState<JobOrder[]>([]);
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [jobs, ops] = await Promise.all([
        getAllJobs(),
        getOperatorOptions(),
      ]);
      setAllJobs(jobs);
      setOperators(ops);
    } catch (err) {
      console.error('Error loading jobs data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for Supabase auth to be ready before loading data
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        loadData();
      }
    });

    // Also try immediately in case session is already established
    loadData();

    return () => subscription.unsubscribe();
  }, [loadData]);

  // Categorize jobs by status
  const categorized = useMemo<CategorizedJobs>(() => ({
    upcoming: allJobs.filter(j => j.status === 'scheduled' || j.status === 'assigned'),
    active: allJobs.filter(j => j.status === 'in_route' || j.status === 'in_progress'),
    completed: allJobs.filter(j => j.status === 'completed'),
  }), [allJobs]);

  // Apply search + date filters
  const filteredJobs = useCallback((tab: 'upcoming' | 'active' | 'completed'): JobOrder[] => {
    let jobs = categorized[tab];

    if (searchQuery.trim()) {
      jobs = filterJobsBySearch(jobs, searchQuery);
    }

    if (filterDate) {
      jobs = filterJobsByDate(jobs, filterDate);
    }

    return jobs;
  }, [categorized, searchQuery, filterDate]);

  // Update a job
  const handleUpdateJob = useCallback(async (
    jobId: string,
    updates: JobUpdatePayload
  ): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Session expired. Please log in again.');
        return false;
      }

      await updateJob(jobId, updates, session.access_token);
      await loadData(); // Refresh after update
      return true;
    } catch (err: any) {
      console.error('Error updating job:', err);
      alert(err.message || 'Failed to update job');
      return false;
    }
  }, [loadData]);

  return {
    allJobs,
    upcoming: categorized.upcoming,
    active: categorized.active,
    completed: categorized.completed,
    filteredJobs,
    operators,
    loading,
    searchQuery,
    setSearchQuery,
    filterDate,
    setFilterDate,
    refresh: loadData,
    updateJob: handleUpdateJob,
  };
}
