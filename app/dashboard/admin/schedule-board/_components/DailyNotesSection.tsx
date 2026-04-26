'use client';

import { useState } from 'react';
import { ClipboardList, Send, User, Clock, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

export interface DailyNote {
  id: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface DailyNotesSectionProps {
  date: string;
  notes: DailyNote[];
  canEdit: boolean;
  onAddNote: (text: string) => void;
  onDeleteNote?: (id: string) => void;
}

export default function DailyNotesSection({ date, notes, canEdit, onAddNote, onDeleteNote }: DailyNotesSectionProps) {
  const [newNote, setNewNote] = useState('');
  const [expanded, setExpanded] = useState(true);

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const handleSubmit = () => {
    if (newNote.trim()) {
      onAddNote(newNote.trim());
      setNewNote('');
    }
  };

  return (
    <div className="bg-white dark:bg-white/[0.04] rounded-2xl shadow-lg border border-gray-200 dark:border-white/10 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full bg-gray-50 dark:bg-white/[0.04] border-b border-gray-200 dark:border-white/10 px-5 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
          <ClipboardList className="w-5 h-5 text-gray-600 dark:text-white/60" />
          <h3 className="font-bold">Daily Notes</h3>
          {notes.length > 0 && (
            <span className="px-2 py-0.5 bg-gray-200 dark:bg-white/10 rounded-full text-xs font-bold text-gray-700 dark:text-white/70">{notes.length}</span>
          )}
          <span className="text-gray-500 dark:text-white/40 text-xs hidden sm:inline ml-2">{formatDate(date)}</span>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-gray-500 dark:text-white/40" />
          : <ChevronDown className="w-4 h-4 text-gray-500 dark:text-white/40" />}
      </button>

      {expanded && (
        <div className="p-5">
          {/* Notes list */}
          {notes.length > 0 ? (
            <div className="space-y-3 mb-4">
              {notes.map((note) => (
                <div key={note.id} className="bg-gray-50 dark:bg-white/[0.05] rounded-xl p-3 border border-gray-200 dark:border-white/10 group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-slate-600 dark:text-white/60" />
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{note.author_name}</span>
                      <span className="text-gray-300 dark:text-white/20">·</span>
                      <span className="text-xs text-gray-400 dark:text-white/40 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(note.created_at)}
                      </span>
                    </div>
                    {canEdit && onDeleteNote && (
                      <button
                        onClick={() => onDeleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400 transition-all"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-white/80 ml-8 whitespace-pre-wrap">{note.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-white/30 mb-4">
              <ClipboardList className="w-8 h-8 mb-2 text-gray-300 dark:text-white/20" />
              <p className="text-sm text-gray-500 dark:text-white/50">No notes for this day</p>
              <p className="text-xs text-gray-400 dark:text-white/30">Add schedule changes, crew absences, or reminders</p>
            </div>
          )}

          {/* Add note input */}
          {canEdit && (
            <div className="border-t border-gray-200 dark:border-white/10 pt-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note — schedule changes, crew out, reminders..."
                  rows={2}
                  className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-white/10 rounded-xl focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-500/20 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 resize-none bg-white dark:bg-white/[0.05] transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!newNote.trim()}
                  className="p-3 bg-purple-600 text-white rounded-xl transition-all hover:bg-purple-700 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1">Press Enter to send, Shift+Enter for new line</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
