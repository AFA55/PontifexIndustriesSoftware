'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Calendar, Users, BarChart3, FileCheck, Shield, Zap, Clock, TrendingUp, Star, Target } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-lg border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Logo />
              <div>
                <div className="font-bold text-xl bg-gradient-to-r from-blue-600 to-red-600 bg-clip-text text-transparent">
                  Pontifex Industries
                </div>
                <div className="text-xs text-gray-600">Concrete Management Platform</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/request-access"
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-700 hover:to-red-700 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl"
              >
                Request Demo
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-32">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full opacity-20 blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full opacity-20 blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold mb-6">
              <Zap className="w-4 h-4" />
              Live at World of Concrete 2026
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6">
              <span className="bg-gradient-to-r from-gray-900 via-blue-900 to-gray-900 bg-clip-text text-transparent">
                Run Your Concrete Cutting
              </span>
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-red-600 bg-clip-text text-transparent">
                Business Like a Fortune 500 Company
              </span>
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8 leading-relaxed">
              From dispatch to signature—track jobs, profitability, and OSHA compliance in real-time.
              Know what you made <strong>before you leave the job site.</strong>
            </p>

            {/* Value Props */}
            <div className="flex flex-wrap justify-center gap-6 mb-10">
              <div className="flex items-center gap-2 text-gray-700">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-semibold">Setup in 5 minutes</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-semibold">No credit card required</span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-semibold">Mobile ready</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/request-access"
                className="group px-8 py-4 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 text-white rounded-xl font-bold text-lg transition-all shadow-xl hover:shadow-2xl flex items-center justify-center gap-2"
              >
                Request Live Demo
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/login"
                className="px-8 py-4 bg-white hover:bg-gray-50 text-gray-900 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl border-2 border-gray-200 flex items-center justify-center gap-2"
              >
                <span className="text-2xl">▶</span>
                Try Demo Now
              </Link>
            </div>

            <p className="text-sm text-gray-500 mt-6">
              Join contractors already tracking <strong>500+ jobs monthly</strong>
            </p>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="py-12 bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-2">15hrs</div>
              <div className="text-blue-200 text-sm">Saved per week</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-2">$2.5K</div>
              <div className="text-blue-200 text-sm">Avg. monthly savings</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-2">99%</div>
              <div className="text-blue-200 text-sm">OSHA compliance</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white mb-2">30sec</div>
              <div className="text-blue-200 text-sm">Job completion time</div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Problem */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                Still Managing Jobs on <span className="text-red-600">Paper & Spreadsheets?</span>
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-red-600 text-sm">✗</span>
                  </div>
                  <div>
                    <strong>Lost paperwork</strong> means lost invoices and disputes
                  </div>
                </div>
                <div className="flex items-start gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-red-600 text-sm">✗</span>
                  </div>
                  <div>
                    <strong>No visibility</strong> into crew productivity or job profitability
                  </div>
                </div>
                <div className="flex items-start gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-red-600 text-sm">✗</span>
                  </div>
                  <div>
                    <strong>Hours wasted</strong> on manual scheduling and time tracking
                  </div>
                </div>
                <div className="flex items-start gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-red-600 text-sm">✗</span>
                  </div>
                  <div>
                    <strong>OSHA compliance nightmares</strong> with missing documentation
                  </div>
                </div>
              </div>
            </div>

            {/* Solution */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-8 border-2 border-blue-200">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">
                Pontifex Changes Everything
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3 text-gray-800">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <strong>Digital signatures & documents</strong> stored forever
                  </div>
                </div>
                <div className="flex items-start gap-3 text-gray-800">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <strong>Real-time analytics</strong> on every job, crew, and piece of equipment
                  </div>
                </div>
                <div className="flex items-start gap-3 text-gray-800">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <strong>Automated scheduling</strong> with GPS tracking and notifications
                  </div>
                </div>
                <div className="flex items-start gap-3 text-gray-800">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <strong>OSHA-compliant documentation</strong> at your fingertips
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Showcase - Admin & Operator */}
      <section className="py-20 bg-white" id="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Powerful Tools for <span className="bg-gradient-to-r from-blue-600 to-red-600 bg-clip-text text-transparent">Admins & Operators</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Everything you need to run a professional concrete cutting operation
            </p>
          </div>

          {/* Admin Features */}
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900">Admin Control Center</h3>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Dispatch & Scheduling */}
              <div className="bg-gradient-to-br from-white to-orange-50 rounded-2xl p-6 border-2 border-orange-200 hover:shadow-xl transition-shadow">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center mb-4">
                  <Calendar className="w-7 h-7 text-white" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">Dispatch & Scheduling</h4>
                <p className="text-gray-600 mb-4">Create job orders, assign crews, and manage equipment—all in one place.</p>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Drag-and-drop scheduling
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Auto-assign operators
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Equipment tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Real-time job status
                  </li>
                </ul>
              </div>

              {/* Schedule Board */}
              <div className="bg-gradient-to-br from-white to-purple-50 rounded-2xl p-6 border-2 border-purple-200 hover:shadow-xl transition-shadow">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mb-4">
                  <Clock className="w-7 h-7 text-white" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">Schedule Board</h4>
                <p className="text-gray-600 mb-4">Visualize daily schedules and send automated notifications to crews.</p>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Daily/weekly views
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Email notifications
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Shop arrival times
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Availability tracking
                  </li>
                </ul>
              </div>

              {/* Project Board */}
              <div className="bg-gradient-to-br from-white to-red-50 rounded-2xl p-6 border-2 border-red-200 hover:shadow-xl transition-shadow">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center mb-4">
                  <BarChart3 className="w-7 h-7 text-white" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">Project Status Board</h4>
                <p className="text-gray-600 mb-4">Monitor live job status with color-coded progress tracking.</p>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Live status updates
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Upcoming jobs view
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Performance analytics
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Timeline tracking
                  </li>
                </ul>
              </div>

              {/* Team Management */}
              <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-6 border-2 border-blue-200 hover:shadow-xl transition-shadow">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4">
                  <Users className="w-7 h-7 text-white" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">Team Management</h4>
                <p className="text-gray-600 mb-4">Manage operator profiles, skills, and system access controls.</p>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Skill tracking
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Certifications
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Role-based access
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Performance ratings
                  </li>
                </ul>
              </div>

              {/* Completed Jobs */}
              <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl p-6 border-2 border-green-200 hover:shadow-xl transition-shadow">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mb-4">
                  <FileCheck className="w-7 h-7 text-white" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">Completed Job Tickets</h4>
                <p className="text-gray-600 mb-4">Review finished work with customer signatures and documentation.</p>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Digital signatures
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Liability releases
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Photo documentation
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Job feedback
                  </li>
                </ul>
              </div>

              {/* Access Control */}
              <div className="bg-gradient-to-br from-white to-cyan-50 rounded-2xl p-6 border-2 border-cyan-200 hover:shadow-xl transition-shadow">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mb-4">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">Access Requests</h4>
                <p className="text-gray-600 mb-4">Review and approve user access with role-based permissions.</p>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Pending requests
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Approve/deny access
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Role assignment
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Request history
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Operator Features */}
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900">Operator Mobile Experience</h3>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-6 border-2 border-blue-200">
                <div className="text-3xl mb-3">⏰</div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">Clock In/Out</h4>
                <p className="text-sm text-gray-600">GPS-verified time tracking with 20ft location accuracy</p>
              </div>

              <div className="bg-gradient-to-br from-white to-green-50 rounded-2xl p-6 border-2 border-green-200">
                <div className="text-3xl mb-3">📋</div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">Job Workflow</h4>
                <p className="text-sm text-gray-600">Step-by-step guidance from route to signature</p>
              </div>

              <div className="bg-gradient-to-br from-white to-purple-50 rounded-2xl p-6 border-2 border-purple-200">
                <div className="text-3xl mb-3">📸</div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">Photo Documentation</h4>
                <p className="text-sm text-gray-600">Before/after photos with automatic upload</p>
              </div>

              <div className="bg-gradient-to-br from-white to-orange-50 rounded-2xl p-6 border-2 border-orange-200">
                <div className="text-3xl mb-3">✍️</div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">Digital Signatures</h4>
                <p className="text-sm text-gray-600">Customer signatures with liability releases</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-gradient-to-br from-slate-50 to-blue-50" id="how-it-works">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              How It Works: <span className="bg-gradient-to-r from-blue-600 to-red-600 bg-clip-text text-transparent">From Dispatch to Payment</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Complete job lifecycle management in 4 simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <div className="relative">
              <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white flex items-center justify-center text-xl font-bold mb-4">
                  1
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">Create & Assign</h4>
                <p className="text-gray-600">Admin creates job order, assigns operator and equipment, sets schedule</p>
              </div>
              <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600"></div>
            </div>

            <div className="relative">
              <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 text-white flex items-center justify-center text-xl font-bold mb-4">
                  2
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">Execute Job</h4>
                <p className="text-gray-600">Operator clocks in, navigates to site, performs work with photo documentation</p>
              </div>
              <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-gradient-to-r from-purple-600 to-red-600"></div>
            </div>

            <div className="relative">
              <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-red-700 text-white flex items-center justify-center text-xl font-bold mb-4">
                  3
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">Get Signature</h4>
                <p className="text-gray-600">Customer signs liability release and work completion agreement on-site</p>
              </div>
              <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-0.5 bg-gradient-to-r from-red-600 to-green-600"></div>
            </div>

            <div>
              <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-600 to-green-700 text-white flex items-center justify-center text-xl font-bold mb-4">
                  4
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-3">Instant Analytics</h4>
                <p className="text-gray-600">View profitability, operator performance, and generate invoices immediately</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ROI Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 rounded-3xl p-12 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
            <div className="relative z-10">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-4">See Your ROI in Real Numbers</h2>
                <p className="text-blue-200 text-xl">Average contractor saves $2,500/month and 15 hours/week</p>
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                  <TrendingUp className="w-10 h-10 text-green-400 mb-4" />
                  <div className="text-3xl font-bold mb-2">$30K+</div>
                  <div className="text-blue-200">Annual savings on admin time</div>
                </div>

                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                  <Clock className="w-10 h-10 text-blue-400 mb-4" />
                  <div className="text-3xl font-bold mb-2">780hrs</div>
                  <div className="text-blue-200">Time saved per year</div>
                </div>

                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
                  <Star className="w-10 h-10 text-yellow-400 mb-4" />
                  <div className="text-3xl font-bold mb-2">100%</div>
                  <div className="text-blue-200">Digital documentation coverage</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl sm:text-5xl font-bold mb-6">
            Ready to Transform Your Concrete Business?
          </h2>
          <p className="text-xl text-blue-200 mb-10 max-w-2xl mx-auto">
            Join hundreds of contractors who have eliminated paperwork and maximized profitability with Pontifex
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link
              href="/request-access"
              className="group px-8 py-4 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 text-white rounded-xl font-bold text-lg transition-all shadow-xl hover:shadow-2xl flex items-center justify-center gap-2"
            >
              Schedule Live Demo
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 bg-white/10 backdrop-blur-lg hover:bg-white/20 text-white rounded-xl font-bold text-lg transition-all border-2 border-white/30 flex items-center justify-center gap-2"
            >
              Try Demo Now
            </Link>
          </div>

          <p className="text-sm text-blue-300">
            ✓ No credit card required  •  ✓ Setup in 5 minutes  •  ✓ Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Logo />
                <div>
                  <div className="font-bold text-lg bg-gradient-to-r from-blue-400 to-red-400 bg-clip-text text-transparent">
                    Pontifex Industries
                  </div>
                  <div className="text-xs text-gray-400">Concrete Management Platform</div>
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                The complete job management solution for concrete cutting contractors.
              </p>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Quick Links</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="text-gray-400 hover:text-white transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="text-gray-400 hover:text-white transition-colors">How It Works</a></li>
                <li><Link href="/login" className="text-gray-400 hover:text-white transition-colors">Sign In</Link></li>
                <li><Link href="/request-access" className="text-gray-400 hover:text-white transition-colors">Request Demo</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Contact</h3>
              <p className="text-gray-400 text-sm">
                Ready to see Pontifex in action? Request a personalized demo with our team.
              </p>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-800 text-center text-gray-400 text-sm">
            © {new Date().getFullYear()} Pontifex Industries. All rights reserved.
          </div>
        </div>
      </footer>

      <style jsx>{`
        .bg-grid-pattern {
          background-image: linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px);
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
}

function Logo() {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#EF4444" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#logo-gradient)" />
      <path d="M14 34V14h12a8 8 0 1 1 0 16H22v4" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
