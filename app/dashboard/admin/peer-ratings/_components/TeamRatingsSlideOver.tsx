'use client';

import { useEffect, useState } from 'react';
import { X, Star, Loader2, MessageSquare, Calendar, CheckCircle2, XCircle, BarChart3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface TeamMemberRating {
  id: string;
  full_name: string;
  role: string;
  avg_score: number | null;
  submission_count: number;
}

interface ReceivedRating {
  id: string;
  form_title: string;
  overall_score: number | null;
  submitted_at: string;
  rater_display_name: string;
  responses: Record<string, any>;
  questions: Array<{ id: string; text: string; type: string; required: boolean }>;
  job: { id: string; job_number: string; customer_name: string } | null;
}

interface Props {
  member: TeamMemberRating;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Owner',
  operations_manager: 'Ops Manager',
  admin: 'Admin',
  supervisor: 'Supervisor',
  salesman: 'Project Mgr',
  shop_manager: 'Shop Manager',
  shop_help: 'Shop Helper',
  inventory_manager: 'Office Admin',
  operator: 'Operator',
  apprentice: 'Team Member',
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-10 text-right">{score}/{max}</span>
    </div>
  );
}

function ResponseDisplay({ question, value }: { question: any; value: any }) {
  if (question.type === 'rating_5') {
    return (
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border-2 ${
              n <= (value || 0) ? 'bg-amber-100 border-amber-400 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-300'
            }`}
          >
            {n}
          </div>
        ))}
        <span className="text-xs text-gray-500 ml-1">/ 5</span>
      </div>
    );
  }
  if (question.type === 'rating_10') {
    return (
      <div>
        <ScoreBar score={Number(value) || 0} max={10} />
      </div>
    );
  }
  if (question.type === 'yes_no') {
    const isYes = value === true || value === 'true' || value === 'yes';
    return (
      <div className="flex items-center gap-1.5">
        {isYes ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <XCircle className="w-4 h-4 text-red-500" />
        )}
        <span className={`text-sm font-semibold ${isYes ? 'text-emerald-600' : 'text-red-600'}`}>
          {isYes ? 'Yes' : 'No'}
        </span>
      </div>
    );
  }
  // text
  return (
    <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2 italic">
      {value ? String(value) : <span className="text-gray-400">No response</span>}
    </p>
  );
}

export default function TeamRatingsSlideOver({ member, onClose }: Props) {
  const [ratings, setRatings] = useState<ReceivedRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/ratings/received?user_id=${member.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setRatings(json.data ?? []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [member.id]);

  const avgScore = ratings.length > 0
    ? ratings.filter((r) => r.overall_score !== null).reduce((a, r) => a + (r.overall_score || 0), 0) /
      Math.max(ratings.filter((r) => r.overall_score !== null).length, 1)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 pt-5 pb-4 z-10">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
              {member.full_name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{member.full_name}</h2>
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                {ROLE_LABELS[member.role] || member.role}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="text-lg font-bold text-gray-900">
                  {avgScore !== null ? avgScore.toFixed(1) : '—'}
                </span>
              </div>
              <p className="text-xs text-gray-500">Avg Score /10</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{ratings.length}</p>
              <p className="text-xs text-gray-500">Total Reviews</p>
            </div>
          </div>
        </div>

        {/* Ratings list */}
        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : ratings.length === 0 ? (
            <div className="text-center py-16">
              <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">No ratings received yet</p>
              <p className="text-gray-400 text-xs mt-1">Ratings will appear here after coworkers submit reviews</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ratings.map((rating) => (
                <div key={rating.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === rating.id ? null : rating.id)}
                    className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{rating.form_title}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(rating.submitted_at)}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {rating.rater_display_name}
                        </span>
                        {rating.job && (
                          <span className="text-xs text-blue-600">{rating.job.job_number}</span>
                        )}
                      </div>
                    </div>
                    {rating.overall_score !== null && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span className="text-sm font-bold text-gray-800">{rating.overall_score.toFixed(1)}</span>
                        <span className="text-xs text-gray-400">/10</span>
                      </div>
                    )}
                  </button>

                  {expandedId === rating.id && (
                    <div className="border-t border-gray-100 px-4 py-3 space-y-4 bg-gray-50">
                      {rating.questions.map((q) => {
                        const val = rating.responses[q.id];
                        return (
                          <div key={q.id}>
                            <p className="text-xs font-semibold text-gray-600 mb-1.5">{q.text}</p>
                            <ResponseDisplay question={q} value={val} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
