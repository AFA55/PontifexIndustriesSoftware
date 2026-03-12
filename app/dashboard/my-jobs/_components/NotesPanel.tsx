'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, Loader2, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Note {
  id: string;
  content: string;
  created_by_name: string;
  created_at: string;
}

interface NotesPanelProps {
  jobId: string;
}

export default function NotesPanel({ jobId }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotes();
  }, [jobId]);

  const fetchNotes = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/admin/job-notes?job_order_id=${jobId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const json = await res.json();
        setNotes(json.data || []);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No notes for this job</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div key={note.id} className="p-3 bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center gap-2 mb-1.5">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-semibold text-gray-600">{note.created_by_name || 'Admin'}</span>
            <span className="text-xs text-gray-400">
              {new Date(note.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </span>
          </div>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
        </div>
      ))}
    </div>
  );
}
