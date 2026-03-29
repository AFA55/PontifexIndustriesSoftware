'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  due_date: string | null;
  position: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  normal: 'bg-blue-500',
  low: 'bg-gray-300',
};

export default function MyTasksWidget({ isLoading }: WidgetProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/dashboard-tasks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setTasks(json.data ?? json ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/dashboard-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        setNewTitle('');
        fetchTasks();
      }
    } catch {
      // silent
    }
  };

  const toggleTask = async (task: Task) => {
    try {
      const token = await getToken();
      await fetch('/api/admin/dashboard-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: task.id, completed: !task.completed }),
      });
      fetchTasks();
    } catch {
      // silent
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const token = await getToken();
      await fetch('/api/admin/dashboard-tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      fetchTasks();
    } catch {
      // silent
    }
  };

  const saveEdit = async (task: Task) => {
    try {
      const token = await getToken();
      await fetch('/api/admin/dashboard-tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: task.id, title: editTitle }),
      });
      setEditingId(null);
      fetchTasks();
    } catch {
      // silent
    }
  };

  if (isLoading || loading) return <LoadingSkeleton className="h-full" />;

  const isOverdue = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date(new Date().toDateString());
  };

  const sorted = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.completed && b.completed) {
      return new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime();
    }
    return a.position - b.position;
  });

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Add a task..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {sorted.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-xs">No tasks yet</div>
        )}
        {sorted.map((task) => (
          <div
            key={task.id}
            className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors ${task.completed ? 'opacity-50' : ''}`}
          >
            <button
              onClick={() => toggleTask(task)}
              className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                task.completed
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              {task.completed && (
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority] ?? 'bg-blue-500'}`} />

            {editingId === task.id ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => saveEdit(task)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(task); }}
                className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
            ) : (
              <span
                className={`flex-1 text-xs cursor-pointer ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}
                onClick={() => { setEditingId(task.id); setEditTitle(task.title); }}
              >
                {task.title}
              </span>
            )}

            {task.due_date && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${isOverdue(task.due_date) ? 'text-red-600 bg-red-50' : 'text-gray-400 bg-gray-50'}`}>
                {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}

            <button
              onClick={() => deleteTask(task.id)}
              className="p-0.5 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
