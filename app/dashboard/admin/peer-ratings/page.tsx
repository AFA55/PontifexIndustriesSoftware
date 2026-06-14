'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Star, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Users, ClipboardList, Loader2, X, ChevronRight, BarChart3,
  CheckCircle2, AlertCircle, Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import RatingFormBuilderModal from './_components/RatingFormBuilderModal';
import TeamRatingsSlideOver from './_components/TeamRatingsSlideOver';

const ALLOWED_ROLES = ['admin', 'operations_manager', 'super_admin'];

interface RatingForm {
  id: string;
  title: string;
  description: string | null;
  target_roles: string[];
  rater_roles: string[];
  questions: any[];
  question_count: number;
  is_active: boolean;
  created_at: string;
}

interface TeamMemberRating {
  id: string;
  full_name: string;
  role: string;
  avg_score: number | null;
  submission_count: number;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Owner',
  operations_manager: 'Ops Manager',
  admin: 'Admin',
  supervisor: 'Supervisor',
  salesman: 'Project Mgr',
  shop_manager: 'Shop Manager',
  shop_help: 'Shop Helper',
  inventory_manager: 'Office Staff',
  operator: 'Operator',
  apprentice: 'Team Member',
};

export default function PeerRatingsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'forms' | 'team'>('forms');

  // Forms state
  const [forms, setForms] = useState<RatingForm[]>([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<RatingForm | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Team ratings state
  const [teamRatings, setTeamRatings] = useState<TeamMemberRating[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamLoaded, setTeamLoaded] = useState(false);
  const [slideOverUser, setSlideOverUser] = useState<TeamMemberRating | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Auth guard
  useEffect(() => {
    const u = getCurrentUser();
    if (!u) { router.push('/login'); return; }
    if (!ALLOWED_ROLES.includes(u.role)) { router.push('/dashboard/admin'); return; }
    setAuthLoading(false);
  }, [router]);

  const fetchForms = useCallback(async () => {
    setFormsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/admin/rating-forms', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setForms(json.data ?? []);
      }
    } catch {
      // silent
    } finally {
      setFormsLoading(false);
    }
  }, []);

  const fetchTeamRatings = useCallback(async () => {
    if (teamLoaded) return;
    setTeamLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch all team members
      const profilesRes = await fetch('/api/admin/team-profiles?limit=200', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!profilesRes.ok) return;
      const profilesJson = await profilesRes.json();
      const members: any[] = profilesJson.data ?? [];

      // Fetch submission stats per member via received endpoint
      const statsArr: TeamMemberRating[] = await Promise.all(
        members.map(async (m: any) => {
          try {
            const res = await fetch(`/api/ratings/received?user_id=${m.id}`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (!res.ok) return { id: m.id, full_name: m.full_name, role: m.role, avg_score: null, submission_count: 0 };
            const json = await res.json();
            const subs: any[] = json.data ?? [];
            if (subs.length === 0) {
              return { id: m.id, full_name: m.full_name, role: m.role, avg_score: null, submission_count: 0 };
            }
            const scores = subs.map((s: any) => s.overall_score).filter((s: any) => s !== null && s !== undefined);
            const avg = scores.length > 0
              ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
              : null;
            return { id: m.id, full_name: m.full_name, role: m.role, avg_score: avg, submission_count: subs.length };
          } catch {
            return { id: m.id, full_name: m.full_name, role: m.role, avg_score: null, submission_count: 0 };
          }
        })
      );

      // Only show members who have at least one rating, or filter to rated roles
      setTeamRatings(statsArr.sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1)));
      setTeamLoaded(true);
    } catch {
      // silent
    } finally {
      setTeamLoading(false);
    }
  }, [teamLoaded]);

  useEffect(() => {
    if (!authLoading) fetchForms();
  }, [authLoading, fetchForms]);

  useEffect(() => {
    if (!authLoading && activeTab === 'team') fetchTeamRatings();
  }, [authLoading, activeTab, fetchTeamRatings]);

  const handleToggleActive = async (form: RatingForm) => {
    setTogglingId(form.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/rating-forms/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ is_active: !form.is_active }),
      });
      if (res.ok) {
        setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, is_active: !f.is_active } : f));
        showToast(form.is_active ? 'Form deactivated' : 'Form activated');
      } else {
        showToast('Failed to update form', 'error');
      }
    } catch {
      showToast('Failed to update form', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (form: RatingForm) => {
    if (!confirm(`Deactivate "${form.title}"? It will no longer be available for submissions.`)) return;
    setDeletingId(form.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/admin/rating-forms/${form.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, is_active: false } : f));
        showToast('Form deactivated');
      } else {
        showToast('Failed to deactivate form', 'error');
      }
    } catch {
      showToast('Failed to deactivate form', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleFormSaved = (savedForm: RatingForm) => {
    setForms((prev) => {
      const exists = prev.find((f) => f.id === savedForm.id);
      if (exists) {
        return prev.map((f) => f.id === savedForm.id ? { ...savedForm, question_count: savedForm.questions?.length ?? 0 } : f);
      }
      return [{ ...savedForm, question_count: savedForm.questions?.length ?? 0 }, ...prev];
    });
    setBuilderOpen(false);
    setEditingForm(null);
    showToast(editingForm ? 'Form updated' : 'Form created');
  };

  const activeForms = forms.filter((f) => f.is_active);
  const inactiveForms = forms.filter((f) => !f.is_active);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-5xl">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin" className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl border border-gray-200 transition-all">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <Star className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">Peer Ratings</h1>
              <p className="text-gray-500 text-xs">Team performance reviews and rating forms</p>
            </div>
            <button
              onClick={() => { setEditingForm(null); setBuilderOpen(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-all min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Form</span>
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Hero stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-4 text-white shadow-md">
            <ClipboardList className="w-6 h-6 mb-2 opacity-80" />
            <p className="text-2xl font-bold">{activeForms.length}</p>
            <p className="text-xs opacity-80 font-medium">Active Forms</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-4 text-white shadow-md">
            <Users className="w-6 h-6 mb-2 opacity-80" />
            <p className="text-2xl font-bold">{teamRatings.filter((t) => t.submission_count > 0).length}</p>
            <p className="text-xs opacity-80 font-medium">Rated Members</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-md col-span-2 sm:col-span-1">
            <BarChart3 className="w-6 h-6 mb-2 opacity-80" />
            <p className="text-2xl font-bold">{forms.length}</p>
            <p className="text-xs opacity-80 font-medium">Total Forms</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-200 rounded-xl p-1 mb-6 w-fit">
          <button
            onClick={() => setActiveTab('forms')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all min-h-[44px] ${activeTab === 'forms' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <span className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Forms
            </span>
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all min-h-[44px] ${activeTab === 'team' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Team Ratings
            </span>
          </button>
        </div>

        {/* Forms Tab */}
        {activeTab === 'forms' && (
          <div>
            {formsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
              </div>
            ) : forms.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Star className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">No rating forms yet</h3>
                <p className="text-gray-500 text-sm mb-6">Create your first rating form to enable peer reviews.</p>
                <button
                  onClick={() => { setEditingForm(null); setBuilderOpen(true); }}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-all min-h-[44px]"
                >
                  <Plus className="w-4 h-4" />
                  Create First Form
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {activeForms.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Active ({activeForms.length})</h2>
                    <div className="space-y-3">
                      {activeForms.map((form) => (
                        <FormCard
                          key={form.id}
                          form={form}
                          onEdit={() => { setEditingForm(form); setBuilderOpen(true); }}
                          onToggle={() => handleToggleActive(form)}
                          onDelete={() => handleDelete(form)}
                          toggling={togglingId === form.id}
                          deleting={deletingId === form.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {inactiveForms.length > 0 && (
                  <div>
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Inactive ({inactiveForms.length})</h2>
                    <div className="space-y-3 opacity-60">
                      {inactiveForms.map((form) => (
                        <FormCard
                          key={form.id}
                          form={form}
                          onEdit={() => { setEditingForm(form); setBuilderOpen(true); }}
                          onToggle={() => handleToggleActive(form)}
                          onDelete={() => handleDelete(form)}
                          toggling={togglingId === form.id}
                          deleting={deletingId === form.id}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Team Ratings Tab */}
        {activeTab === 'team' && (
          <div>
            {teamLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              </div>
            ) : teamRatings.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-purple-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">No ratings submitted yet</h3>
                <p className="text-gray-500 text-sm">Once operators rate each other after jobs, scores will appear here.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Member</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Score</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reviews</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {teamRatings.map((member) => (
                        <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {member.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </div>
                              <span className="text-sm font-semibold text-gray-800">{member.full_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full font-medium">
                              {ROLE_LABELS[member.role] || member.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {member.avg_score !== null ? (
                              <div className="flex items-center justify-center gap-1">
                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                <span className="text-sm font-bold text-gray-800">{member.avg_score.toFixed(1)}</span>
                                <span className="text-xs text-gray-400">/10</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-semibold ${member.submission_count > 0 ? 'text-gray-800' : 'text-gray-400'}`}>
                              {member.submission_count}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setSlideOverUser(member)}
                              className="inline-flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 font-semibold px-3 py-2 rounded-lg hover:bg-purple-50 transition-colors min-h-[36px]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rating Form Builder Modal */}
      {builderOpen && (
        <RatingFormBuilderModal
          editForm={editingForm}
          onClose={() => { setBuilderOpen(false); setEditingForm(null); }}
          onSaved={handleFormSaved}
        />
      )}

      {/* Team Ratings Slide-Over */}
      {slideOverUser && (
        <TeamRatingsSlideOver
          member={slideOverUser}
          onClose={() => setSlideOverUser(null)}
        />
      )}
    </div>
  );
}

// ─── FormCard ────────────────────────────────────────────────────────────────

function FormCard({
  form,
  onEdit,
  onToggle,
  onDelete,
  toggling,
  deleting,
}: {
  form: RatingForm;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  toggling: boolean;
  deleting: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <ClipboardList className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-gray-900">{form.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${form.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
              {form.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          {form.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{form.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
              {form.question_count} question{form.question_count !== 1 ? 's' : ''}
            </span>
            {form.target_roles.length > 0 && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                Rates: {form.target_roles.join(', ')}
              </span>
            )}
            {form.rater_roles.length > 0 && (
              <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-lg">
                By: {form.rater_roles.join(', ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Edit form"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onToggle}
            disabled={toggling}
            className="p-2.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
            title={form.is_active ? 'Deactivate' : 'Activate'}
          >
            {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> :
              form.is_active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="p-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
            title="Deactivate form"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
