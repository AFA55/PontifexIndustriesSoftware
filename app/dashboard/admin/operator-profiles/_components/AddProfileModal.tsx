'use client';

import { useState } from 'react';
import { X, UserPlus, Loader2 } from 'lucide-react';

interface AddProfileModalProps {
  onSubmit: (data: { fullName: string; email: string; role: string; dateOfBirth: string | null }) => Promise<void>;
  onClose: () => void;
}

export default function AddProfileModal({ onSubmit, onClose }: AddProfileModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('operator');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim()) {
      setError('Name and email are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ fullName: fullName.trim(), email: email.trim().toLowerCase(), role, dateOfBirth: dateOfBirth || null });
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-500 p-5 rounded-t-2xl text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Add Team Member
                </h2>
                <p className="text-purple-200 text-sm">Create a new operator or helper account</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Full Name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white text-gray-900 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@pontifexindustries.com"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white text-gray-900 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Role *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white text-gray-900 transition-all"
              >
                <option value="operator">Operator</option>
                <option value="apprentice">Helper / Apprentice</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 text-sm font-medium bg-white text-gray-900 transition-all"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !fullName.trim() || !email.trim()}
                className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {submitting ? 'Creating...' : 'Create Account'}
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">Default password: Pontifex2026! — user should change on first login</p>
          </div>
        </div>
      </div>
    </>
  );
}
