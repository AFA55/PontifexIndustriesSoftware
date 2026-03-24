'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, Users, UserPlus, Search, Mail, Calendar,
  Loader2, CheckCircle, XCircle
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import AddProfileModal from './_components/AddProfileModal';
import ProfileDetailDrawer from './_components/ProfileDetailDrawer';

interface Profile {
  id: string;
  full_name: string;
  nickname: string | null;
  email: string;
  phone: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  role: string;
  active: boolean;
  profile_picture_url: string | null;
  created_at: string;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('supabase-user') : null;
  const token = stored ? JSON.parse(stored).session?.access_token : null;
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
}

export default function OperatorProfilesPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'operator' | 'apprentice'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    if (!['admin', 'super_admin', 'salesman', 'operations_manager'].includes(currentUser.role || '')) {
      router.push('/dashboard');
    }
  }, [router]);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/profiles');
      if (res.ok) {
        const json = await res.json();
        setProfiles(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = !search || p.full_name.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || p.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const operatorCount = profiles.filter(p => p.role === 'operator').length;
  const helperCount = profiles.filter(p => p.role === 'apprentice').length;

  const handleAddProfile = async (data: { fullName: string; email: string; role: string; dateOfBirth: string | null }) => {
    const res = await apiFetch('/api/admin/profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || 'Failed to create account');
    }
    setShowAddModal(false);
    fetchProfiles();
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/admin" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users className="w-6 h-6 text-purple-400" />
                Team Profiles
              </h1>
              <p className="text-sm text-gray-400">Manage operators and helpers</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Add Team Member
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl font-bold text-white">{profiles.length}</p>
            <p className="text-xs text-gray-400">Total</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl font-bold text-purple-400">{operatorCount}</p>
            <p className="text-xs text-gray-400">Operators</p>
          </div>
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <p className="text-2xl font-bold text-cyan-400">{helperCount}</p>
            <p className="text-xs text-gray-400">Helpers</p>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
            />
          </div>
          <div className="flex bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            {(['all', 'operator', 'apprentice'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-2.5 text-xs font-bold transition-all ${
                  roleFilter === r ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {r === 'all' ? 'All' : r === 'operator' ? 'Operators' : 'Helpers'}
              </button>
            ))}
          </div>
        </div>

        {/* Profiles List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="font-semibold text-gray-300">No profiles found</p>
            <p className="text-sm">{search ? 'Try a different search' : 'Add your first team member'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredProfiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProfileId(p.id)}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/30 rounded-xl p-4 transition-all text-left flex items-center gap-4"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                  {p.profile_picture_url ? (
                    <img src={p.profile_picture_url} alt="" className="w-full h-full rounded-xl object-cover" />
                  ) : (
                    <span className="text-white font-bold text-sm">
                      {p.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white text-sm truncate">{p.full_name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      p.role === 'operator' ? 'bg-purple-500/20 text-purple-300' : 'bg-cyan-500/20 text-cyan-300'
                    }`}>
                      {p.role === 'apprentice' ? 'Helper' : 'Operator'}
                    </span>
                    {p.active ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-0.5">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {p.email}
                    </span>
                    {p.date_of_birth && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {formatDate(p.date_of_birth)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddProfileModal onSubmit={handleAddProfile} onClose={() => setShowAddModal(false)} />
      )}
      {selectedProfileId && (
        <ProfileDetailDrawer
          profileId={selectedProfileId}
          onClose={() => setSelectedProfileId(null)}
          apiFetch={apiFetch}
        />
      )}
    </div>
  );
}
