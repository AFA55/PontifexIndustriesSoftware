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

// Mock notes for demo
const MOCK_NOTES_MAP: Record<string, NoteData[]> = {
  '1': [
    { id: 'n1', author: 'Robert Altamirano', text: 'Client confirmed 12 cores total. Floors 3, 4, and 5.', timestamp: '2026-03-08T09:00:00' },
    { id: 'n2', author: 'Mike Rodriguez', text: 'Checked out equipment — HCD and CS-14 loaded on truck.', timestamp: '2026-03-09T16:30:00' },
    { id: 'n3', author: 'Admin', text: 'Hospital security needs 24hr advance notice for access badges.', timestamp: '2026-03-09T08:15:00' },
  ],
  '2': [
    { id: 'n4', author: 'Michael Chen', text: 'Receiving area is in the back. Use dock entrance.', timestamp: '2026-03-09T11:00:00' },
  ],
  '3': [
    { id: 'n5', author: 'Admin', text: 'TxDOT requires traffic control plan before starting each day.', timestamp: '2026-03-07T14:00:00' },
    { id: 'n6', author: 'Juan Salazar', text: 'Day 1 complete. 120 LF cut. Blade wearing fast on rebar.', timestamp: '2026-03-08T17:00:00' },
    { id: 'n7', author: 'Admin', text: 'Ordered new blades. Will arrive by morning.', timestamp: '2026-03-08T18:30:00' },
    { id: 'n8', author: 'Juan Salazar', text: 'Day 2 done. 140 LF with new blade. Much better.', timestamp: '2026-03-09T17:00:00' },
    { id: 'n9', author: 'Robert Altamirano', text: 'DOT inspector will be on site Thursday for progress check.', timestamp: '2026-03-09T09:00:00' },
    { id: 'n10', author: 'Admin', text: 'Night work approved for Thursday/Friday if needed to meet deadline.', timestamp: '2026-03-09T15:00:00' },
    { id: 'n11', author: 'Juan Salazar', text: 'Need extra water supply - hydrant access on west side only.', timestamp: '2026-03-10T06:00:00' },
  ],
  '5': [
    { id: 'n12', author: 'Michael Chen', text: 'Suite level access through Gate C only.', timestamp: '2026-03-09T10:00:00' },
    { id: 'n13', author: 'Admin', text: 'GPR scan first, then core per findings.', timestamp: '2026-03-09T14:00:00' },
  ],
  '6': [
    { id: 'n14', author: 'Robert Altamirano', text: 'Wire saw setup must be approved by structural engineer on site.', timestamp: '2026-03-08T11:00:00' },
    { id: 'n15', author: 'Admin', text: 'Columns are 36" diameter. Heavy reinforcement.', timestamp: '2026-03-08T13:00:00' },
    { id: 'n16', author: 'Robert Garcia', text: 'Equipment checked, wire measured and loaded. Ready.', timestamp: '2026-03-09T16:00:00' },
    { id: 'n17', author: 'Admin', text: 'Crane support available if needed. Call site super.', timestamp: '2026-03-09T17:30:00' },
    { id: 'n18', author: 'Michael Chen', text: 'Dust containment system required — active patient areas nearby.', timestamp: '2026-03-10T07:00:00' },
  ],
  '7': [
    { id: 'n19', author: 'Admin', text: 'NIGHT SHIFT ONLY — 8pm to 6am. No daytime work allowed.', timestamp: '2026-03-08T14:00:00' },
    { id: 'n20', author: 'Robert Altamirano', text: 'Patient rooms must be cleared before cutting starts each night.', timestamp: '2026-03-09T09:00:00' },
    { id: 'n21', author: 'James Wilson', text: 'Hand saw only — no power saws in patient areas per hospital rules.', timestamp: '2026-03-09T20:00:00' },
    { id: 'n22', author: 'Admin', text: 'Noise complaint from last project. Keep it under control.', timestamp: '2026-03-10T08:00:00' },
  ],
};

export function getNotesForJob(jobId: string): NoteData[] {
  return MOCK_NOTES_MAP[jobId] || [];
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
