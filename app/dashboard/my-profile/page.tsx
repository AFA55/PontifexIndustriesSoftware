'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, User, Phone, Calendar, Shield, Save,
  Loader2, CheckCircle, Camera, Upload
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

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
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token || '';
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

  // Avatar upload state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Image must be under 5 MB'); return; }
    if (!file.type.startsWith('image/')) { setAvatarError('Only image files are supported'); return; }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarError('');

    // Immediately upload
    setUploadingAvatar(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { setAvatarError('Not authenticated'); return; }

      const form = new FormData();
      form.append('avatar', file);

      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (json.success && json.data?.url) {
        setProfilePicUrl(json.data.url);
        setProfile(prev => prev ? { ...prev, profile_picture_url: json.data.url } : prev);
      } else {
        setAvatarError(json.error || 'Failed to upload photo');
      }
    } catch {
      setAvatarError('Failed to upload photo. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:bg-[#0b0618] dark:from-[#0b0618] dark:via-[#0b0618] dark:to-[#0b0618]">
      <div className="container mx-auto px-4 md:px-6 py-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
              <User className="w-6 h-6 text-purple-600" />
              My Profile
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">View and edit your information</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Profile Header Card */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 p-6 flex items-center gap-5 shadow-sm">
              <div className="relative flex-shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center overflow-hidden">
                  {(avatarPreview || profile.profile_picture_url) ? (
                    <img
                      src={avatarPreview || profile.profile_picture_url!}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white font-bold text-2xl">
                      {profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                {/* Clickable camera overlay */}
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 w-7 h-7 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center border-2 border-white dark:border-[#0b0618] transition-colors disabled:opacity-60"
                  title="Change profile photo"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5 text-white" />
                  )}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{profile.full_name}</h2>
                <span className={`inline-flex px-3 py-0.5 rounded-full text-xs font-bold mt-1 ${
                  profile.role === 'operator'
                    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                    : 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300'
                }`}>
                  {roleName}
                </span>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{profile.email}</p>
                {avatarError && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{avatarError}</p>}
                {uploadingAvatar && <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Uploading photo...</p>}
              </div>
            </div>

            {/* Editable Fields */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 p-6 space-y-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider">Personal Info</h3>

              <div>
                <label className="block text-sm font-semibold text-gray-600 dark:text-gray-200 mb-1">Nickname</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="What do people call you?"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-white/[0.07] border border-gray-200 dark:border-white/20 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-600 dark:text-gray-200 mb-1">
                  Phone Number
                  <span className="ml-2 text-[10px] font-normal text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full">
                    Used for SMS job notifications
                  </span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-white/[0.07] border border-gray-200 dark:border-white/20 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
                {!phone && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Add your phone number to receive SMS alerts when jobs are dispatched to you.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-600 dark:text-gray-200 mb-1">Date of Birth</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-white/[0.07] border border-gray-200 dark:border-white/20 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-600 dark:text-gray-200 mb-1">Profile Photo</label>
                <label className="flex items-center gap-3 cursor-pointer w-fit">
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-white/[0.07] border border-gray-200 dark:border-white/20 hover:border-purple-400 dark:hover:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 transition-colors">
                    <Upload className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    {uploadingAvatar ? 'Uploading...' : profilePicUrl ? 'Change Photo' : 'Upload Photo'}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                    disabled={uploadingAvatar}
                  />
                </label>
                {profilePicUrl && !avatarPreview && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">Photo uploaded</p>
                )}
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="bg-white dark:bg-white/[0.05] rounded-2xl border border-gray-200 dark:border-white/10 p-6 space-y-5 shadow-sm">
              <h3 className="text-sm font-bold text-gray-600 dark:text-gray-200 uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500 dark:text-red-400" />
                Emergency Contact
              </h3>

              <div>
                <label className="block text-sm font-semibold text-gray-600 dark:text-gray-200 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={ecName}
                  onChange={(e) => setEcName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-white/[0.07] border border-gray-200 dark:border-white/20 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-600 dark:text-gray-200 mb-1">Contact Phone</label>
                <input
                  type="tel"
                  value={ecPhone}
                  onChange={(e) => setEcPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-white/[0.07] border border-gray-200 dark:border-white/20 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-600 dark:text-gray-200 mb-1">Relationship</label>
                <input
                  type="text"
                  value={ecRelationship}
                  onChange={(e) => setEcRelationship(e.target.value)}
                  placeholder="e.g. Spouse, Parent, Sibling"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-white/[0.07] border border-gray-200 dark:border-white/20 rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
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
          <div className="text-center py-20">
            <User className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-white/20" />
            <p className="text-gray-500 dark:text-gray-400">Could not load profile</p>
          </div>
        )}
      </div>
    </div>
  );
}
