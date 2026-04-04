'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Send, Edit3, Trash2, Clock, User, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { JobNote } from '@/types/job-notes';

interface JobNotesPanelProps {
  jobId: string;
  jobNumber: string;
  onClose: () => void;
}

export default function JobNotesPanel({ jobId, jobNumber, onClose }: JobNotesPanelProps) {
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      setCurrentUserId(session.user.id);

      const res = await fetch(`/api/admin/job-notes?jobOrderId=${jobId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setNotes(json.data);
        }
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/job-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          jobOrderId: jobId,
          content: newNote.trim(),
          noteType: 'manual',
        }),
      });

      if (res.ok) {
        setNewNote('');
        await fetchNotes();
      }
    } catch (error) {
      console.error('Error adding note:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditNote = async (noteId: string) => {
    if (!editContent.trim()) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/job-notes/${noteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (res.ok) {
        setEditingId(null);
        setEditContent('');
        await fetchNotes();
      }
    } catch (error) {
      console.error('Error editing note:', error);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Delete this note?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/job-notes/${noteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        await fetchNotes();
      }
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getNoteIcon = (noteType: string) => {
    switch (noteType) {
      case 'change_log': return <Settings className="w-3.5 h-3.5 text-gray-400" />;
      case 'system': return <Clock className="w-3.5 h-3.5 text-blue-400" />;
      default: return <User className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end">
      <div
        className="bg-white w-full max-w-md shadow-2xl flex flex-col"
        style={{ animation: 'slideInRight 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Job Notes</h2>
              <p className="text-blue-100 text-sm">{jobNumber}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* New Note Input */}
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex gap-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              rows={2}
              className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-gray-900 text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddNote();
                }
              }}
            />
            <button
              onClick={handleAddNote}
              disabled={submitting || !newNote.trim()}
              className="self-end px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Press Enter to send, Shift+Enter for new line</p>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-3 text-gray-500 text-sm">Loading notes...</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No notes yet</p>
              <p className="text-gray-400 text-sm mt-1">Add the first note above</p>
            </div>
          ) : (
            notes.map((note) => {
              const isChangeLog = note.note_type === 'change_log';
              const isSystem = note.note_type === 'system';
              const isOwn = note.author_id === currentUserId;
              const isEditing = editingId === note.id;

              return (
                <div
                  key={note.id}
                  className={`rounded-xl p-3 ${
                    isChangeLog || isSystem
                      ? 'bg-gray-50 border border-gray-200'
                      : 'bg-white border-2 border-gray-100 shadow-sm'
                  }`}
                >
                  {/* Note Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getNoteIcon(note.note_type)}
                      <span className="text-xs font-bold text-gray-700">{note.author_name}</span>
                      {isChangeLog && (
                        <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded text-xs">change</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">{formatTimestamp(note.created_at)}</span>
                      {isOwn && !isChangeLog && !isSystem && (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(note.id);
                              setEditContent(note.content);
                            }}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3 h-3 text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Note Content */}
                  {isEditing ? (
                    <div className="flex gap-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none text-gray-900 text-sm resize-none"
                        rows={2}
                        autoFocus
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleEditNote(note.id)}
                          className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditContent(''); }}
                          className="px-2 py-1 bg-gray-200 text-gray-600 rounded-lg text-xs font-bold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={`text-sm whitespace-pre-wrap ${
                      isChangeLog ? 'text-gray-500 font-mono text-xs' : 'text-gray-700'
                    }`}>
                      {isChangeLog ? (
                        note.content.split('\n').map((line, i) => {
                          const match = line.match(/^(.+?):\s*"(.+?)"\s*→\s*"(.+?)"$/);
                          if (match) {
                            return (
                              <div key={i} className="flex items-start gap-1 py-0.5">
                                <span className="text-gray-400 font-semibold">{match[1]}:</span>
                                <span className="text-red-400 line-through">{match[2]}</span>
                                <span className="text-gray-400">→</span>
                                <span className="text-green-600 font-semibold">{match[3]}</span>
                              </div>
                            );
                          }
                          return <div key={i}>{line}</div>;
                        })
                      ) : (
                        note.content
                      )}
                    </div>
                  )}

                  {note.updated_at !== note.created_at && !isEditing && (
                    <p className="text-xs text-gray-400 mt-1 italic">edited</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
