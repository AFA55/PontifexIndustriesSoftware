'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pin, X, Edit3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

interface Note {
  id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  position: number;
  created_at: string;
}

const NOTE_COLORS = [
  { name: 'yellow', value: '#fbbf24' },
  { name: 'blue', value: '#3b82f6' },
  { name: 'green', value: '#10b981' },
  { name: 'pink', value: '#ec4899' },
  { name: 'purple', value: '#8b5cf6' },
];

export default function QuickNotesWidget({ isLoading }: WidgetProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newColor, setNewColor] = useState('#fbbf24');

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  }, []);

  const fetchNotes = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/dashboard-notes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setNotes(json.data ?? json ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const addNote = async () => {
    if (!newTitle.trim()) return;
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/dashboard-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newTitle, content: newContent, color: newColor }),
      });
      if (res.ok) {
        setNewTitle('');
        setNewContent('');
        setNewColor('#fbbf24');
        setShowForm(false);
        fetchNotes();
      }
    } catch {
      // silent
    }
  };

  const togglePin = async (note: Note) => {
    try {
      const token = await getToken();
      await fetch('/api/admin/dashboard-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: note.id, pinned: !note.pinned }),
      });
      fetchNotes();
    } catch {
      // silent
    }
  };

  const deleteNote = async (id: string) => {
    try {
      const token = await getToken();
      await fetch('/api/admin/dashboard-notes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      fetchNotes();
    } catch {
      // silent
    }
  };

  const saveEdit = async (note: Note) => {
    try {
      const token = await getToken();
      await fetch('/api/admin/dashboard-notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: note.id, content: editContent }),
      });
      setEditingId(null);
      fetchNotes();
    } catch {
      // silent
    }
  };

  if (isLoading || loading) return <LoadingSkeleton className="h-full" />;

  const sorted = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.position - b.position;
  });

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wide">Notes</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          <Plus className="w-3 h-3" /> Add Note
        </button>
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
          <input
            type="text"
            placeholder="Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <textarea
            placeholder="Content..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={2}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setNewColor(c.value)}
                  className={`w-5 h-5 rounded-full border-2 ${newColor === c.value ? 'border-gray-600 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <button
              onClick={addNote}
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {sorted.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-xs">No notes yet</div>
        )}
        {sorted.map((note) => (
          <div
            key={note.id}
            className="group border border-gray-200 rounded-xl p-2.5 bg-white hover:shadow-sm transition-shadow"
            style={{ borderLeftWidth: '3px', borderLeftColor: note.color }}
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-xs font-semibold text-gray-800 truncate flex-1">{note.title}</p>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => togglePin(note)}
                  className={`p-0.5 rounded ${note.pinned ? 'text-blue-500' : 'text-gray-300 opacity-0 group-hover:opacity-100'} hover:text-blue-500 transition-opacity`}
                >
                  <Pin className="w-3 h-3" />
                </button>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="p-0.5 rounded text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
            {editingId === note.id ? (
              <div className="mt-1">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={2}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                  autoFocus
                  onBlur={() => saveEdit(note)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(note); } }}
                />
              </div>
            ) : (
              <p
                className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 cursor-pointer"
                onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
              >
                {note.content || 'Click to edit...'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
