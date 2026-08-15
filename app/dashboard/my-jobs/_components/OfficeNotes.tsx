'use client';

/**
 * "Notes from the Office" — the crew-facing half of the two-audience note
 * system (founder, Aug 15: "notes for operator, so operators can see notes
 * within certain jobs. Create an area where they can see these").
 *
 * The API has already filtered by audience; this component renders what came
 * back and never re-derives visibility. It is deliberately loud — a note the
 * office took the trouble to address to the crew should not look like the six
 * other grey cards on this screen — and deliberately labelled FROM THE OFFICE,
 * so an operator is never guessing whether they are reading their own note back.
 *
 * Mobile: 375px in gloves. Full-width rows, 16px body text, no horizontal
 * scroll, attachments open at tap-target size via the shared PhotoViewer.
 */

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, ChevronDown, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PhotoViewer } from '@/components/PhotoUploader';

interface CrewNote {
  id: string;
  content: string;
  author_name: string;
  audience?: string | null;
  photo_urls?: string[] | null;
  created_at: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export default function OfficeNotes({ jobId }: { jobId: string }) {
  const [notes, setNotes] = useState<CrewNote[] | null>(null);
  const [open, setOpen] = useState(true);

  const fetchNotes = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/job-orders/${jobId}/notes`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setNotes([]);
        return;
      }
      const json = await res.json();
      // Belt and braces on top of the server filter: only notes explicitly
      // addressed to the crew appear in this panel. The operator's own
      // workflow notes come back from the same endpoint and do not belong here.
      setNotes(((json.data || []) as CrewNote[]).filter((n) => n.audience === 'operator'));
    } catch {
      setNotes([]);
    }
  }, [jobId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // Nothing to say = no empty card taking up a screen the operator has to
  // scroll past in the truck.
  if (notes === null || notes.length === 0) return null;

  return (
    <div className="bg-white/90 dark:bg-white/[0.05] backdrop-blur-lg rounded-2xl shadow-xl border-2 border-amber-400/70 dark:border-amber-400/40 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-5 py-4 min-h-[56px] text-left hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Megaphone className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-base font-bold text-gray-800 dark:text-white truncate">
            Notes from the Office
          </span>
          <span className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
            {notes.length}
          </span>
        </div>
        <ChevronDown className={`w-5 h-5 flex-shrink-0 text-gray-400 dark:text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 space-y-2"
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  {note.author_name}
                </span>
                <span className="text-xs text-amber-700/70 dark:text-amber-300/60">
                  {formatWhen(note.created_at)}
                </span>
              </div>
              <p className="text-base leading-relaxed text-gray-800 dark:text-white/85 whitespace-pre-wrap break-words">
                {note.content}
              </p>
              {!!note.photo_urls?.length && (
                <PhotoViewer photos={note.photo_urls} label="Attached" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
