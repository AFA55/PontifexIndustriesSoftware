'use client';

import { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Calendar, Briefcase, MapPin, Clock, AlertCircle, Shield, BadgeCheck, Building2, ExternalLink, Loader2 } from 'lucide-react';

interface ProfileDetail {
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
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  created_at: string;
  project_history: Array<{
    id: string;
    job_number: string;
    customer_name: string;
    job_type: string;
    location: string | null;
    status: string;
    scheduled_date: string | null;
    work_completed_at: string | null;
  }>;
}

interface OperatorBadge {
  id: string;
  facility_id: string;
  badge_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  status: string;
  operator_name: string;
  facility_name: string;
  expiry_status: string;
}

interface ProfileDetailDrawerProps {
  profileId: string;
  onClose: () => void;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}

export default function ProfileDetailDrawer({ profileId, onClose, apiFetch }: ProfileDetailDrawerProps) {
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<OperatorBadge[]>([]);
  const [badgesLoading, setBadgesLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await apiFetch(`/api/admin/profiles/${profileId}`);
        if (res.ok) {
          const json = await res.json();
          setProfile(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [profileId, apiFetch]);

  useEffect(() => {
    async function fetchBadges() {
      try {
        const res = await apiFetch(`/api/admin/badges?operator_id=${profileId}`);
        if (res.ok) {
          const json = await res.json();
          setBadges(json.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch badges:', err);
      } finally {
        setBadgesLoading(false);
      }
    }
    fetchBadges();
  }, [profileId, apiFetch]);

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700';
      case 'in_progress': return 'bg-blue-100 text-blue-700';
      case 'scheduled': case 'assigned': return 'bg-purple-100 text-purple-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[70]" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-white border-l border-gray-200 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <User className="w-5 h-5 text-purple-600" />
                {profile?.full_name || 'Loading...'}
              </h2>
              {profile && (
                <p className="text-gray-500 text-sm capitalize">{profile.role === 'apprentice' ? 'Helper' : profile.role}</p>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
            </div>
          ) : profile ? (
            <>
              {/* Contact Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Contact</h3>
                <div className="grid gap-2">
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{profile.email}</span>
                  </div>
                  {(profile.phone || profile.phone_number) && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-700">{profile.phone_number || profile.phone}</span>
                    </div>
                  )}
                  {profile.date_of_birth && (
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-700">{formatDate(profile.date_of_birth)}</span>
                    </div>
                  )}
                  {profile.nickname && (
                    <div className="flex items-center gap-3 text-sm">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-700">Goes by &ldquo;{profile.nickname}&rdquo;</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Emergency Contact */}
              {profile.emergency_contact_name && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                    <Shield className="w-4 h-4 text-red-500" />
                    Emergency Contact
                  </h3>
                  <div className="bg-red-50 rounded-xl p-3 border border-red-200 space-y-1">
                    <p className="text-sm font-semibold text-gray-900">{profile.emergency_contact_name}</p>
                    {profile.emergency_contact_relationship && (
                      <p className="text-xs text-gray-500">{profile.emergency_contact_relationship}</p>
                    )}
                    {profile.emergency_contact_phone && (
                      <p className="text-sm text-gray-700">{profile.emergency_contact_phone}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Facility Badges */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 text-purple-500" />
                  Facility Badges
                  {!badgesLoading && (
                    <span className="px-2 py-0.5 bg-purple-100 rounded-full text-xs text-purple-700 font-bold">
                      {badges.length}
                    </span>
                  )}
                </h3>
                {badgesLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                  </div>
                ) : badges.length > 0 ? (
                  <div className="space-y-2">
                    {badges.map((badge) => {
                      const expiryColorClass =
                        badge.expiry_status === 'valid' ? 'bg-green-100 text-green-700 border-green-200' :
                        badge.expiry_status === 'expiring_soon' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        badge.expiry_status === 'expired' ? 'bg-red-100 text-red-700 border-red-200' :
                        'bg-gray-100 text-gray-600 border-gray-200';
                      const expiryText =
                        badge.expiry_status === 'valid' ? 'Valid' :
                        badge.expiry_status === 'expiring_soon' ? 'Expiring Soon' :
                        badge.expiry_status === 'expired' ? 'Expired' : 'No Expiry';
                      const statusColor =
                        badge.status === 'active' ? 'bg-green-100 text-green-700' :
                        badge.status === 'revoked' ? 'bg-gray-100 text-gray-700' :
                        'bg-yellow-100 text-yellow-700';
                      return (
                        <div key={badge.id} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-gray-400" />
                              {badge.facility_name}
                            </span>
                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${statusColor}`}>
                              {badge.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {badge.badge_number && (
                              <span className="text-xs text-gray-500">#{badge.badge_number}</span>
                            )}
                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full border ${expiryColorClass}`}>
                              {expiryText}
                            </span>
                            {badge.expiry_date && (
                              <span className="text-[10px] text-gray-400">Exp: {formatDate(badge.expiry_date)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-400">
                    <BadgeCheck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No facility badges</p>
                  </div>
                )}
                <a
                  href="/dashboard/admin/facilities"
                  className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium"
                >
                  <ExternalLink className="w-3 h-3" />
                  Manage badges in Facilities
                </a>
              </div>

              {/* Project History */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-purple-500" />
                  Project History
                  <span className="px-2 py-0.5 bg-purple-100 rounded-full text-xs text-purple-700 font-bold">
                    {profile.project_history.length}
                  </span>
                </h3>
                {profile.project_history.length > 0 ? (
                  <div className="space-y-2">
                    {profile.project_history.map((job) => (
                      <div key={job.id} className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-gray-900">{job.customer_name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor(job.status)}`}>
                            {job.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{job.job_number} · {job.job_type?.split(',')[0]?.trim()}</p>
                        {job.location && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {job.location}
                          </p>
                        )}
                        {job.scheduled_date && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> {formatDate(job.scheduled_date)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No project history yet</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-red-500">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm">Failed to load profile</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
