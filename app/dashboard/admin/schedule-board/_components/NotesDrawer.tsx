'use client';

import { useState } from 'react';
import { X, MessageSquare, Send, User, Clock } from 'lucide-react';
import type { JobCardData } from './JobCard';

export interface NoteData {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

interface NotesDrawerProps {
  job: JobCardData;
  notes: NoteData[];
  onAddNote: (text: string) => void;
  onClose: () => void;
}

export default function NotesDrawer({ job, notes, onAddNote, onClose }: NotesDrawerProps) {
  const [newNote, setNewNote] = useState('');

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const handleSubmit = () => {
    if (newNote.trim()) {
      onAddNote(newNote.trim());
      setNewNote('');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[70]" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-white shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Job Notes
              </h2>
              <p className="text-green-100 text-sm">{job.customer_name} • {job.job_number}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <MessageSquare className="w-10 h-10 mb-2 text-gray-300" />
              <p className="font-semibold text-gray-500">No notes yet</p>
              <p className="text-sm">Add the first note below</p>
            </div>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <span className="text-sm font-bold text-gray-900">{note.author}</span>
                  <span className="text-gray-300">•</span>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimestamp(note.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 ml-8">{note.text}</p>
              </div>
            ))
          )}
        </div>

        {/* Add note input */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-end gap-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              rows={2}
              className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 text-sm resize-none"
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
              className="p-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Press Enter to send, Shift+Enter for new line</p>
        </div>
      </div>
    </>
  );
}
