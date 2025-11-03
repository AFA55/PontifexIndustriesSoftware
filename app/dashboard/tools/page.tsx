'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getCurrentUser, type User } from '@/lib/auth';

export default function ToolsPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300 rounded-full opacity-10 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-red-300 rounded-full opacity-10 blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-200 rounded-full opacity-5 blur-3xl animate-pulse delay-2000"></div>
      </div>

      <div className="container mx-auto px-6 py-8 relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center space-x-4">
            <Link
              href="/dashboard"
              className="group p-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 text-gray-700 hover:bg-white transition-all duration-300 hover:scale-105 shadow-sm"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-red-600 bg-clip-text text-transparent">
                Tools & Equipment
              </h1>
              <p className="text-gray-600 text-lg font-medium mt-1">Manage your equipment and maintenance</p>
            </div>
          </div>

          {/* User Info Badge */}
          {user && (
            <div className="hidden sm:flex items-center space-x-3 bg-white/70 backdrop-blur-xl rounded-xl border border-gray-200 px-4 py-2 shadow-sm">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                {user.name?.charAt(0) || 'O'}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{user.name || 'Operator'}</p>
                <p className="text-xs text-gray-500 capitalize">{user.role}</p>
              </div>
            </div>
          )}
        </div>

        {/* Main Action Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {/* Scan Equipment - Primary Action */}
          <Link
            href="/dashboard/tools/scan"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-cyan-50 p-1 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] animate-fade-in-up"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative bg-white rounded-[22px] p-8 group-hover:bg-transparent transition-colors duration-500">
              {/* Icon with pulsing effect */}
              <div className="relative mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transform group-hover:rotate-6 transition-all duration-300">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M12 12h-4.01M12 12v4m6-7h-2V4h-5.01M7 7h.01" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-400 rounded-full animate-ping"></div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-400 rounded-full"></div>
              </div>

              <h3 className="text-3xl font-bold text-gray-800 mb-3 group-hover:text-white transition-colors">Scan Equipment</h3>
              <p className="text-gray-600 group-hover:text-white/90 leading-relaxed text-lg mb-6 font-medium transition-colors">
                Use your camera to scan QR codes and quickly manage equipment status
              </p>

              <div className="flex items-center text-cyan-600 group-hover:text-white text-sm font-bold tracking-wide transition-colors">
                <span>OPEN SCANNER</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* View My Equipment */}
          <Link
            href="/dashboard/tools/my-equipment"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-orange-50 p-1 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] animate-fade-in-up delay-100"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-red-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative bg-white rounded-[22px] p-8 group-hover:bg-transparent transition-colors duration-500">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:shadow-xl transform group-hover:rotate-6 transition-all duration-300">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>

              <h3 className="text-3xl font-bold text-gray-800 mb-3 group-hover:text-white transition-colors">View My Equipment</h3>
              <p className="text-gray-600 group-hover:text-white/90 leading-relaxed text-lg mb-6 font-medium transition-colors">
                See all equipment assigned to you and manage your inventory
              </p>

              <div className="flex items-center text-orange-600 group-hover:text-white text-sm font-bold tracking-wide transition-colors">
                <span>VIEW EQUIPMENT</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Maintenance Request */}
          <Link
            href="/dashboard/tools/maintenance-request"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-red-50 p-1 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] animate-fade-in-up delay-200"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-red-400 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative bg-white rounded-[22px] p-8 group-hover:bg-transparent transition-colors duration-500">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:shadow-xl transform group-hover:rotate-6 transition-all duration-300">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <h3 className="text-3xl font-bold text-gray-800 mb-3 group-hover:text-white transition-colors">Maintenance Request</h3>
              <p className="text-gray-600 group-hover:text-white/90 leading-relaxed text-lg mb-6 font-medium transition-colors">
                Report equipment issues and request repairs or maintenance
              </p>

              <div className="flex items-center text-red-600 group-hover:text-white text-sm font-bold tracking-wide transition-colors">
                <span>CREATE REQUEST</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Add Equipment */}
          <Link
            href="/dashboard/tools/add-equipment"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-white to-green-50 p-1 shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-[1.02] animate-fade-in-up delay-300"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-400 to-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl"></div>
            <div className="relative bg-white rounded-[22px] p-8 group-hover:bg-transparent transition-colors duration-500">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg group-hover:shadow-xl transform group-hover:rotate-6 transition-all duration-300">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>

              <h3 className="text-3xl font-bold text-gray-800 mb-3 group-hover:text-white transition-colors">Add Equipment</h3>
              <p className="text-gray-600 group-hover:text-white/90 leading-relaxed text-lg mb-6 font-medium transition-colors">
                Register new equipment in the system and generate QR codes
              </p>

              <div className="flex items-center text-green-600 group-hover:text-white text-sm font-bold tracking-wide transition-colors">
                <span>ADD NEW ITEM</span>
                <svg className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-gray-600 text-sm font-semibold">Available</p>
                <p className="text-green-600 text-3xl font-bold">24</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-gray-600 text-sm font-semibold">Assigned</p>
                <p className="text-blue-600 text-3xl font-bold">18</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-gray-600 text-sm font-semibold">In Service</p>
                <p className="text-orange-600 text-3xl font-bold">3</p>
              </div>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div>
                <p className="text-gray-600 text-sm font-semibold">Total Items</p>
                <p className="text-indigo-600 text-3xl font-bold">45</p>
              </div>
            </div>
          </div>
        </div>

        {/* Info Footer */}
        <div className="mt-12 text-center">
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-gray-200 p-6 max-w-2xl mx-auto shadow-lg">
            <h4 className="text-gray-800 font-semibold mb-2 text-lg">Equipment Management System</h4>
            <p className="text-gray-600 text-sm leading-relaxed font-medium">
              Designed for field use with large touch targets and high contrast display.
              All functions work offline and sync when connection is restored.
            </p>
          </div>
        </div>
      </div>

      {/* Add custom animations */}
      <style jsx>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.8s ease-out forwards;
          opacity: 0;
        }

        .delay-100 {
          animation-delay: 100ms;
        }

        .delay-200 {
          animation-delay: 200ms;
        }

        .delay-1000 {
          animation-delay: 1s;
        }

        .delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </div>
  );
}