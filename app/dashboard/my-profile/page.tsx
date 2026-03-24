'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, User, Mail, Phone, Calendar, Shield, Save,
  Loader2, CheckCircle, Camera
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';

interface MyProfile {
  id: string;
  full_name: string;
  nickname: string | null;
  email: string;
  phone: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  role: string;
  profile_picture_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
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

export default function MyProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState('');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecRelationship, setEcRelationship] = useState('');

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
  }, [router]);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await apiFetch('/api/my-profile');
        if (res.ok) {
          const json = await res.json();
          const p = json.data;
          setProfile(p);
          setNickname(p.nickname || '');
          setPhone(p.phone_number || p.phone || '');
          setDob(p.date_of_birth || '');
          setProfilePicUrl(p.profile_picture_url || '');
          setEcName(p.emergency_contact_name || '');
          setEcPhone(p.emergency_contact_phone || '');
          setEcRelationship(p.emergency_contact_relationship || '');
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await apiFetch('/api/my-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          nickname: nickname || null,
          phone_number: phone || null,
          date_of_birth: dob || null,
          profile_picture_url: profilePicUrl || null,
          emergency_contact_name: ecName || null,
          emergency_contact_phone: ecPhone || null,
          emergency_contact_relationship: ecRelationship || null,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const roleName = profile?.role === 'apprentice' ? 'Helper' : profile?.role === 'operator' ? 'Operator' : profile?.role || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <User className="w-6 h-6 text-purple-400" />
              My Profile
            </h1>
            <p className="text-sm text-gray-400">View and edit your information</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Profile Header Card */}
            <div className="bg-white/5 rounded-2xl border border-white/10 p-6 flex items-center gap-5">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0 relative">
                {profile.profile_picture_url ? (
                  <img src={profile.profile_picture_url} alt="" className="w-full h-full rounded-2xl object-cover" />
                ) : (
                  <span className="text-white font-bold text-2xl">
                    {profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center border-2 border-slate-900">
                  <Camera className="w-3 h-3" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold">{profile.full_name}</h2>
                <span className={`inline-flex px-3 py-0.5 rounded-full text-xs font-bold mt-1 ${
                  profile.role === 'operator' ? 'bg-purple-500/20 text-purple-300' : 'bg-cyan-500/20 text-cyan-300'
                }`}>
                  {roleName}
                </span>
                <p className="text-sm text-gray-400 mt-1">{profile.email}</p>
              </div>
            </div>

            {/* Editable Fields */}
            <div className="bg-white/5 rounded-2xl border border-white/10 p-6 space-y-5">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Personal Info</h3>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">Nickname</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="What do people call you?"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">
                  Phone Number
                  <span className="ml-2 text-[10px] font-normal text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded-full">
                    📱 Used for SMS job notifications
                  </span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
                {!phone && (
                  <p className="text-xs text-amber-400 mt-1">
                    Add your phone number to receive SMS alerts when jobs are dispatched to you.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">Date of Birth</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">Profile Picture URL</label>
                <input
                  type="url"
                  value={profilePicUrl}
                  onChange={(e) => setProfilePicUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="bg-white/5 rounded-2xl border border-white/10 p-6 space-y-5">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-400" />
                Emergency Contact
              </h3>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={ecName}
                  onChange={(e) => setEcName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">Contact Phone</label>
                <input
                  type="tel"
                  value={ecPhone}
                  onChange={(e) => setEcPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-1">Relationship</label>
                <input
                  type="text"
                  value={ecRelationship}
                  onChange={(e) => setEcRelationship(e.target.value)}
                  placeholder="e.g. Spouse, Parent, Sibling"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
              ) : saved ? (
                <><CheckCircle className="w-4 h-4" /> Saved!</>
              ) : (
                <><Save className="w-4 h-4" /> Save Changes</>
              )}
            </button>
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">
            <User className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p>Could not load profile</p>
          </div>
        )}
      </div>
    </div>
  );
}
