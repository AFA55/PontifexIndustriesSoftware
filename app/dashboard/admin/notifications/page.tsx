'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, isAdmin, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Bell, Send, Settings, Users, Clock, AlertTriangle,
  CheckCircle, Loader2, Search, ChevronDown, X, Mail, ToggleLeft,
  ToggleRight, Save, RefreshCw
} from 'lucide-react';

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface SentNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  is_email_sent: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface NotificationSettings {
  auto_clock_in_reminder: boolean;
  clock_in_reminder_time: string;
  auto_overtime_alert: boolean;
  overtime_alert_threshold: number;
  auto_timecard_approval_reminder: boolean;
}

type TabType = 'send' | 'settings' | 'history';

export default function AdminNotificationsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('send');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Send tab state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState<'individual' | 'all_operators' | 'all_team'>('individual');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [notifType, setNotifType] = useState('custom');
  const [actionUrl, setActionUrl] = useState('');
  const [bypassNfc, setBypassNfc] = useState(false);
  const [sendEmailToo, setSendEmailToo] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userSearch, setUserSearch] = useState('');

  // Settings tab state
  const [settings, setSettings] = useState<NotificationSettings>({
    auto_clock_in_reminder: true,
    clock_in_reminder_time: '07:30',
    auto_overtime_alert: false,
    overtime_alert_threshold: 40,
    auto_timecard_approval_reminder: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // History tab state
  const [sentNotifications, setSentNotifications] = useState<SentNotification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});

  // Clock-in reminder state
  const [unclockedOperators, setUnclockedOperators] = useState<TeamMember[]>([]);
  const [sendingReminder, setSendingReminder] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) { router.push('/login'); return; }
    if (!isAdmin()) { router.push('/dashboard'); return; }
    setUser(currentUser);
    setLoading(false);
  }, [router]);

  // Fetch team members
  const fetchTeamMembers = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const members = (json.data || json.users || []).map((u: any) => ({
          id: u.id,
          full_name: u.full_name || u.name || 'Unknown',
          email: u.email || '',
          role: u.role || 'operator',
        }));
        setTeamMembers(members);

        // Build profile map for history
        const map: Record<string, string> = {};
        members.forEach((m: TeamMember) => { map[m.id] = m.full_name; });
        setProfileMap(map);
      }
    } catch (err) {
      console.error('Error fetching team members:', err);
    }
  }, []);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/notification-settings', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) setSettings(json.data);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  }, []);

  // Fetch sent notifications history
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/notifications?limit=50', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      // For admin, we query directly for recently sent notifications
      // Since the API only returns the current user's notifications, we use supabase directly
      // Actually, let's just show notifications sent by this admin
    } catch { /* silent */ }

    // Use a direct query for admin-sent notifications
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // We'll fetch from the API admin route
      const res = await fetch('/api/admin/notifications?unread=false&limit=50', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setSentNotifications(json.data || []);
      }
    } catch { /* silent */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      fetchTeamMembers();
      fetchSettings();
    }
  }, [user, fetchTeamMembers, fetchSettings]);

  useEffect(() => {
    if (user && activeTab === 'history') {
      fetchHistory();
    }
  }, [user, activeTab, fetchHistory]);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      setSendResult({ type: 'error', text: 'Title and message are required' });
      return;
    }

    let targetUserIds: string[] = [];
    if (selectMode === 'all_operators') {
      targetUserIds = teamMembers.filter(m => ['operator', 'apprentice'].includes(m.role)).map(m => m.id);
    } else if (selectMode === 'all_team') {
      targetUserIds = teamMembers.map(m => m.id);
    } else {
      targetUserIds = selectedUsers;
    }

    if (targetUserIds.length === 0) {
      setSendResult({ type: 'error', text: 'Please select at least one recipient' });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_ids: targetUserIds,
          title: title.trim(),
          message: message.trim(),
          type: notifType,
          action_url: actionUrl.trim() || undefined,
          bypass_nfc: bypassNfc,
          send_email: sendEmailToo,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setSendResult({
          type: 'success',
          text: `Sent to ${json.data.notifications_created} user(s)${json.data.emails_sent > 0 ? ` (${json.data.emails_sent} email(s))` : ''}`,
        });
        // Reset form
        setTitle('');
        setMessage('');
        setActionUrl('');
        setBypassNfc(false);
        setSelectedUsers([]);
      } else {
        const err = await res.json();
        setSendResult({ type: 'error', text: err.error || 'Failed to send' });
      }
    } catch {
      setSendResult({ type: 'error', text: 'Network error' });
    }
    setSending(false);
  };

  const handleSendClockInReminder = async () => {
    const operators = teamMembers.filter(m => ['operator', 'apprentice'].includes(m.role));
    if (operators.length === 0) return;

    setSendingReminder(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/notifications/send-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_ids: operators.map(o => o.id),
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setSendResult({
          type: 'success',
          text: `Clock-in reminder sent to ${json.data.reminders_sent} operator(s)`,
        });
      }
    } catch {
      setSendResult({ type: 'error', text: 'Failed to send reminders' });
    }
    setSendingReminder(false);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/admin/notification-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } catch { /* silent */ }
    setSavingSettings(false);
  };

  const filteredMembers = teamMembers.filter(m =>
    m.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
    m.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const toggleUser = (id: string) => {
    setSelectedUsers(prev =>
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
      {/* Header */}
      <div className="bg-slate-900/80 border-b border-white/10 sticky top-0 z-40 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/admin" className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </Link>
              <div>
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-purple-400" />
                  Notification Center
                </h1>
                <p className="text-xs text-gray-400">Send notifications and manage settings</p>
              </div>
            </div>

            {/* Quick Clock-In Reminder */}
            <button
              onClick={handleSendClockInReminder}
              disabled={sendingReminder}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/30 text-orange-300 rounded-xl text-sm font-semibold transition-all"
            >
              {sendingReminder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
              Send Clock-In Reminder
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {[
              { id: 'send' as TabType, label: 'Send Notification', icon: Send },
              { id: 'settings' as TabType, label: 'Auto Settings', icon: Settings },
              { id: 'history' as TabType, label: 'Sent History', icon: RefreshCw },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-white/10 text-white border-b-2 border-purple-500'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Result Banner */}
        {sendResult && (
          <div className={`mb-6 p-4 rounded-2xl border ${
            sendResult.type === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          } flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              {sendResult.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              <span className="text-sm font-semibold">{sendResult.text}</span>
            </div>
            <button onClick={() => setSendResult(null)} className="p-1 hover:bg-white/10 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Send Tab */}
        {activeTab === 'send' && (
          <div className="space-y-6">
            {/* Recipient Selection */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                Recipients
              </h3>

              {/* Quick Select Buttons */}
              <div className="flex gap-2 mb-4">
                {[
                  { mode: 'individual' as const, label: 'Individual' },
                  { mode: 'all_operators' as const, label: 'All Operators' },
                  { mode: 'all_team' as const, label: 'All Team' },
                ].map(opt => (
                  <button
                    key={opt.mode}
                    onClick={() => setSelectMode(opt.mode)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      selectMode === opt.mode
                        ? 'bg-purple-600 text-white'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {selectMode === 'individual' && (
                <>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search team members..."
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredMembers.map(member => (
                      <label
                        key={member.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                          selectedUsers.includes(member.id)
                            ? 'bg-purple-600/20 border border-purple-500/30'
                            : 'hover:bg-white/5'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(member.id)}
                          onChange={() => toggleUser(member.id)}
                          className="w-4 h-4 rounded border-gray-600 bg-transparent text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-white">{member.full_name}</span>
                          <span className="text-xs text-gray-500 ml-2">{member.role}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedUsers.length > 0 && (
                    <p className="text-xs text-purple-400 mt-2">{selectedUsers.length} selected</p>
                  )}
                </>
              )}
            </div>

            {/* Message Composition */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Mail className="w-4 h-4 text-purple-400" />
                Message
              </h3>

              <div className="space-y-4">
                {/* Type Select */}
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1.5 block">Type</label>
                  <select
                    value={notifType}
                    onChange={e => setNotifType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500/50"
                  >
                    <option value="custom">Custom</option>
                    <option value="reminder">Reminder</option>
                    <option value="clock_in_reminder">Clock-In Reminder</option>
                    <option value="timecard_approval">Timecard Approval</option>
                    <option value="timecard_rejection">Timecard Rejection</option>
                    <option value="system">System</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1.5 block">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Notification title..."
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1.5 block">Message</label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Write your message..."
                    rows={4}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1.5 block">Action URL (optional)</label>
                  <input
                    type="text"
                    value={actionUrl}
                    onChange={e => setActionUrl(e.target.value)}
                    placeholder="/dashboard/timecard"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                {/* Options */}
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bypassNfc}
                      onChange={e => setBypassNfc(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-transparent text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-300">Bypass NFC</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendEmailToo}
                      onChange={e => setSendEmailToo(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-transparent text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-300">Also send email</span>
                  </label>
                </div>
              </div>

              <button
                onClick={handleSend}
                disabled={sending}
                className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Notification
              </button>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
              <Settings className="w-4 h-4 text-purple-400" />
              Auto-Notification Settings
            </h3>

            <div className="space-y-6">
              {/* Auto Clock-In Reminder */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-white">Auto Clock-In Reminder</p>
                  <p className="text-xs text-gray-400 mt-1">Send reminder to operators who haven't clocked in</p>
                </div>
                <button
                  onClick={() => setSettings(s => ({ ...s, auto_clock_in_reminder: !s.auto_clock_in_reminder }))}
                  className={`p-1 rounded-lg transition-colors ${settings.auto_clock_in_reminder ? 'text-purple-400' : 'text-gray-600'}`}
                >
                  {settings.auto_clock_in_reminder
                    ? <ToggleRight className="w-8 h-8" />
                    : <ToggleLeft className="w-8 h-8" />
                  }
                </button>
              </div>

              {settings.auto_clock_in_reminder && (
                <div className="pl-4">
                  <label className="text-xs text-gray-400 font-semibold mb-1.5 block">Reminder Time</label>
                  <input
                    type="time"
                    value={settings.clock_in_reminder_time}
                    onChange={e => setSettings(s => ({ ...s, clock_in_reminder_time: e.target.value }))}
                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500/50"
                  />
                </div>
              )}

              {/* Auto Overtime Alert */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-white">Auto Overtime Alert</p>
                  <p className="text-xs text-gray-400 mt-1">Alert when operator approaches overtime threshold</p>
                </div>
                <button
                  onClick={() => setSettings(s => ({ ...s, auto_overtime_alert: !s.auto_overtime_alert }))}
                  className={`p-1 rounded-lg transition-colors ${settings.auto_overtime_alert ? 'text-purple-400' : 'text-gray-600'}`}
                >
                  {settings.auto_overtime_alert
                    ? <ToggleRight className="w-8 h-8" />
                    : <ToggleLeft className="w-8 h-8" />
                  }
                </button>
              </div>

              {settings.auto_overtime_alert && (
                <div className="pl-4">
                  <label className="text-xs text-gray-400 font-semibold mb-1.5 block">OT Threshold (hours)</label>
                  <input
                    type="number"
                    value={settings.overtime_alert_threshold}
                    onChange={e => setSettings(s => ({ ...s, overtime_alert_threshold: parseFloat(e.target.value) || 40 }))}
                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500/50 w-32"
                  />
                </div>
              )}

              {/* Auto Timecard Approval Reminder */}
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-white">Weekly Approval Reminder</p>
                  <p className="text-xs text-gray-400 mt-1">Send weekly reminder to approve pending timecards</p>
                </div>
                <button
                  onClick={() => setSettings(s => ({ ...s, auto_timecard_approval_reminder: !s.auto_timecard_approval_reminder }))}
                  className={`p-1 rounded-lg transition-colors ${settings.auto_timecard_approval_reminder ? 'text-purple-400' : 'text-gray-600'}`}
                >
                  {settings.auto_timecard_approval_reminder
                    ? <ToggleRight className="w-8 h-8" />
                    : <ToggleLeft className="w-8 h-8" />
                  }
                </button>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {settingsSaved ? 'Saved!' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-purple-400" />
                Recently Sent Notifications
              </h3>
            </div>

            {historyLoading ? (
              <div className="py-10 text-center">
                <Loader2 className="w-6 h-6 text-purple-400 animate-spin mx-auto" />
              </div>
            ) : sentNotifications.length === 0 ? (
              <div className="py-10 text-center text-gray-500 text-sm">
                No sent notifications found
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {sentNotifications.map(notif => (
                  <div key={notif.id} className="px-6 py-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{notif.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          To: {profileMap[notif.user_id] || notif.user_id.slice(0, 8)}
                          <span className="mx-2">|</span>
                          Type: <span className="text-purple-400">{notif.type}</span>
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-2">
                          {notif.is_read && (
                            <span className="text-[10px] text-green-400 font-semibold px-2 py-0.5 bg-green-500/10 rounded-full">Read</span>
                          )}
                          {notif.is_email_sent && (
                            <span className="text-[10px] text-blue-400 font-semibold px-2 py-0.5 bg-blue-500/10 rounded-full">Emailed</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-600 mt-1">
                          {new Date(notif.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
