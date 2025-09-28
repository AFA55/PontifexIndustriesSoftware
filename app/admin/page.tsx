'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, logout, isAdmin, type User } from '@/lib/auth';

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    console.log('🔍 Checking admin authentication status...');
    const currentUser = getCurrentUser();

    if (!currentUser) {
      console.log('❌ No authenticated user found, redirecting to login...');
      router.push('/login');
      return;
    }

    if (currentUser.role !== 'admin') {
      console.log('❌ User is not admin, redirecting to operator dashboard...');
      router.push('/dashboard');
      return;
    }

    console.log('✅ Admin user authenticated:', currentUser);
    setUser(currentUser);
    setLoading(false);
  }, [router]);

  const handleLogout = () => {
    console.log('🚪 Logging out admin user...');
    logout();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-foreground">Loading Admin Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        {/* Header with User Info */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-gradient-to-r from-error to-warning rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">{user?.name?.charAt(0) || 'A'}</span>
            </div>
            <div>
              <p className="text-foreground font-medium">Welcome, {user?.name || 'Admin'}</p>
              <p className="text-text-secondary text-sm flex items-center gap-2">
                <span className="px-2 py-1 bg-error/10 text-error text-xs rounded-full font-medium">ADMIN</span>
                {user?.email}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="bg-surface hover:bg-gray-50 border border-border text-foreground py-2 px-4 rounded-xl transition-all duration-200 hover:shadow-md flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-foreground mb-4">
            Admin Dashboard
          </h1>
          <p className="text-text-secondary text-xl">
            System Administration & Management
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* User Management */}
          <Link
            href="/admin/users"
            className="group relative overflow-hidden rounded-2xl bg-surface border border-border p-8 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:border-error/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-error/5 to-warning/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-error/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-error/20 transition-colors">
                <svg className="w-8 h-8 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">User Management</h3>
              <p className="text-text-secondary">Manage operator accounts, permissions, and access levels</p>
            </div>
          </Link>

          {/* Equipment Oversight */}
          <Link
            href="/admin/equipment"
            className="group relative overflow-hidden rounded-2xl bg-surface border border-border p-8 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:border-primary/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Equipment Oversight</h3>
              <p className="text-text-secondary">Monitor all equipment across the organization and system-wide metrics</p>
            </div>
          </Link>

          {/* System Reports */}
          <Link
            href="/admin/reports"
            className="group relative overflow-hidden rounded-2xl bg-surface border border-border p-8 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:border-success/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-success/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-success/20 transition-colors">
                <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">System Reports</h3>
              <p className="text-text-secondary">Generate analytics, usage reports, and performance metrics</p>
            </div>
          </Link>

          {/* System Settings */}
          <Link
            href="/admin/settings"
            className="group relative overflow-hidden rounded-2xl bg-surface border border-border p-8 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:border-accent/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-accent/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-accent/20 transition-colors">
                <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">System Settings</h3>
              <p className="text-text-secondary">Configure system-wide settings, integrations, and preferences</p>
            </div>
          </Link>

          {/* Audit Logs */}
          <Link
            href="/admin/audit"
            className="group relative overflow-hidden rounded-2xl bg-surface border border-border p-8 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:border-warning/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-warning/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-warning/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-warning/20 transition-colors">
                <svg className="w-8 h-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Audit Logs</h3>
              <p className="text-text-secondary">View system activity, security logs, and user actions</p>
            </div>
          </Link>

          {/* Operator Dashboard Access */}
          <Link
            href="/dashboard"
            className="group relative overflow-hidden rounded-2xl bg-surface border border-border p-8 hover:bg-gray-50 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:border-accent/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-success/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative z-10">
              <div className="w-16 h-16 bg-accent/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-accent/20 transition-colors">
                <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">Operator View</h3>
              <p className="text-text-secondary">Access the operator dashboard for hands-on equipment management</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}