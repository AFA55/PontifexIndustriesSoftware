'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Calendar, Users, BarChart3, FileCheck, Shield, Zap, Clock, TrendingUp, Star, Target, Phone, Mail, MapPin, ChevronRight, Play } from 'lucide-react';

export default function LandingPage() {
  const [videoPlaying, setVideoPlaying] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 backdrop-blur-xl bg-white/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-blue-700 flex items-center justify-center shadow-lg">
                  <span className="text-white font-bold text-xl">P</span>
                </div>
                <div>
                  <div className="font-bold text-xl text-gray-900">
                    Patriot Concrete Cutting
                  </div>
                  <div className="text-xs text-gray-500 font-medium">Management Platform</div>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-700 hover:text-red-600 font-medium transition-colors">Features</a>
              <a href="#how-it-works" className="text-gray-700 hover:text-red-600 font-medium transition-colors">How It Works</a>
              <a href="#roi" className="text-gray-700 hover:text-red-600 font-medium transition-colors">ROI</a>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="px-5 py-2.5 text-gray-700 hover:text-gray-900 font-semibold transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/request-access"
                className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-blue-700 hover:from-red-700 hover:to-blue-800 text-white rounded-lg font-bold transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Personalized for Doug */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50">
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-red-100 to-blue-100 rounded-full opacity-30 blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-blue-100 to-red-100 rounded-full opacity-30 blur-3xl transform -translate-x-1/2 translate-y-1/2"></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Copy */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-full text-sm font-bold border border-red-200">
                <Zap className="w-4 h-4" />
                Built for Patriot Concrete Cutting
              </div>

              <div className="space-y-4">
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight">
                  <span className="text-gray-900">Hey Doug,</span>
                  <br />
                  <span className="bg-gradient-to-r from-red-600 via-blue-600 to-red-700 bg-clip-text text-transparent">
                    Ready to Scale Patriot?
                  </span>
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-xl">
                  Stop losing money on paperwork and manual processes. Track every job, every dollar, and every crew member in real-time—from your phone or desktop.
                </p>
              </div>

              {/* Value Props */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-gray-700">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                  <span className="font-semibold text-lg">Know your profit before leaving the job site</span>
                </div>
                <div className="flex items-center gap-3 text-gray-700">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                  <span className="font-semibold text-lg">Digital signatures & OSHA compliance built-in</span>
                </div>
                <div className="flex items-center gap-3 text-gray-700">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                  <span className="font-semibold text-lg">Setup in 5 minutes, no credit card required</span>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link
                  href="/request-access"
                  className="group px-8 py-4 bg-gradient-to-r from-red-600 to-blue-700 hover:from-red-700 hover:to-blue-800 text-white rounded-xl font-bold text-lg transition-all shadow-xl hover:shadow-2xl transform hover:scale-105 flex items-center justify-center gap-2"
                >
                  Schedule a Personal Demo
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  href="/login"
                  className="group px-8 py-4 bg-white hover:bg-gray-50 text-gray-900 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl border-2 border-gray-200 flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Try Demo Now
                </Link>
              </div>

              <p className="text-sm text-gray-500 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                No commitment • Cancel anytime • Free support included
              </p>
            </div>

            {/* Right Column - Visual */}
            <div className="relative">
              <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-red-600 to-blue-700 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-200"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-200"></div>
                    <div className="w-3 h-3 rounded-full bg-green-200"></div>
                  </div>
                  <span className="text-white text-sm font-semibold">Patriot Dashboard</span>
                </div>
                <div className="p-6 space-y-4 bg-gradient-to-br from-gray-50 to-white">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
                      <div className="text-3xl font-bold text-gray-900">12</div>
                      <div className="text-sm text-gray-600">Active Jobs Today</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
                      <div className="text-3xl font-bold text-green-600">$8.2K</div>
                      <div className="text-sm text-gray-600">Today's Revenue</div>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-md border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700">Crew Performance</span>
                      <span className="text-xs text-green-600 font-bold">+15% vs Last Week</span>
                    </div>
                    <div className="space-y-2">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-red-600 to-blue-700 rounded-full" style={{width: '85%'}}></div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-3 text-center border border-red-200">
                      <div className="text-xl font-bold text-red-700">5</div>
                      <div className="text-xs text-red-600">Crews Out</div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3 text-center border border-blue-200">
                      <div className="text-xl font-bold text-blue-700">98%</div>
                      <div className="text-xs text-blue-600">On Time</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3 text-center border border-green-200">
                      <div className="text-xl font-bold text-green-700">4.8</div>
                      <div className="text-xs text-green-600">Avg Rating</div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Floating badge */}
              <div className="absolute -top-4 -right-4 bg-red-600 text-white px-6 py-3 rounded-xl shadow-xl transform rotate-3">
                <div className="text-sm font-bold">Live Demo</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 py-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-5xl font-bold text-white mb-2 bg-gradient-to-r from-red-400 to-blue-400 bg-clip-text text-transparent">15hrs</div>
              <div className="text-gray-300 text-sm font-medium">Saved Weekly</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-white mb-2 bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">$2.5K</div>
              <div className="text-gray-300 text-sm font-medium">Monthly Savings</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-white mb-2 bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">99%</div>
              <div className="text-gray-300 text-sm font-medium">OSHA Compliant</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-white mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">30sec</div>
              <div className="text-gray-300 text-sm font-medium">Job Completion</div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem/Solution Section - Personalized */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              Doug, Is This Your Day-to-Day?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Running Patriot Concrete Cutting shouldn't mean drowning in paperwork
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Problems */}
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-3xl p-8 border-2 border-red-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center">
                  <span className="text-2xl">😤</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">The Old Way</h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✗</span>
                  </div>
                  <div className="text-gray-800">
                    <strong className="text-gray-900">Lost signatures</strong> = disputes and delayed payments
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✗</span>
                  </div>
                  <div className="text-gray-800">
                    <strong className="text-gray-900">Guessing profitability</strong> until invoices are paid
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✗</span>
                  </div>
                  <div className="text-gray-800">
                    <strong className="text-gray-900">Hours on the phone</strong> coordinating schedules
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✗</span>
                  </div>
                  <div className="text-gray-800">
                    <strong className="text-gray-900">OSHA nightmares</strong> scrambling for documentation
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✗</span>
                  </div>
                  <div className="text-gray-800">
                    <strong className="text-gray-900">No visibility</strong> into who's where and doing what
                  </div>
                </div>
              </div>
            </div>

            {/* Solutions */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-3xl p-8 border-2 border-blue-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-blue-700 flex items-center justify-center">
                  <span className="text-2xl">🚀</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">The Patriot Way</h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <CheckCircle className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                  <div className="text-gray-800">
                    <strong className="text-gray-900">Digital signatures</strong> stored forever, searchable instantly
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <CheckCircle className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                  <div className="text-gray-800">
                    <strong className="text-gray-900">Real-time profit tracking</strong> on every job, every crew
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <CheckCircle className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                  <div className="text-gray-800">
                    <strong className="text-gray-900">Automated scheduling</strong> with SMS notifications
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <CheckCircle className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                  <div className="text-gray-800">
                    <strong className="text-gray-900">OSHA-ready documentation</strong> at your fingertips
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-1">
                    <CheckCircle className="w-4 h-4 text-white" strokeWidth={3} />
                  </div>
                  <div className="text-gray-800">
                    <strong className="text-gray-900">Live GPS tracking</strong> see every crew in real-time
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-gradient-to-br from-slate-50 to-blue-50" id="features">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              Everything Patriot Needs to Scale
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Built specifically for concrete cutting contractors who want to grow
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature Cards */}
            {[
              {
                icon: <Calendar className="w-8 h-8" />,
                title: "Smart Scheduling",
                description: "Drag-and-drop job assignment. Auto-calculate drive times. Send SMS notifications.",
                gradient: "from-orange-500 to-red-600",
                bgGradient: "from-orange-50 to-red-50"
              },
              {
                icon: <Clock className="w-8 h-8" />,
                title: "Time & GPS Tracking",
                description: "GPS clock-in verification. Real-time crew locations. Automatic timesheet generation.",
                gradient: "from-purple-500 to-indigo-600",
                bgGradient: "from-purple-50 to-indigo-50"
              },
              {
                icon: <BarChart3 className="w-8 h-8" />,
                title: "Live Job Board",
                description: "Color-coded status updates. See what's scheduled, in-progress, and completed.",
                gradient: "from-red-500 to-red-700",
                bgGradient: "from-red-50 to-red-100"
              },
              {
                icon: <FileCheck className="w-8 h-8" />,
                title: "Digital Signatures",
                description: "Customer signs on mobile. Liability releases included. Stored forever in cloud.",
                gradient: "from-green-500 to-emerald-600",
                bgGradient: "from-green-50 to-emerald-50"
              },
              {
                icon: <Users className="w-8 h-8" />,
                title: "Crew Management",
                description: "Track skills, certifications, and performance. Know who can run what equipment.",
                gradient: "from-blue-500 to-blue-700",
                bgGradient: "from-blue-50 to-blue-100"
              },
              {
                icon: <TrendingUp className="w-8 h-8" />,
                title: "Instant Profitability",
                description: "Know your profit margin before leaving the job site. Track costs in real-time.",
                gradient: "from-yellow-500 to-orange-600",
                bgGradient: "from-yellow-50 to-orange-50"
              }
            ].map((feature, idx) => (
              <div
                key={idx}
                className={`group bg-gradient-to-br ${feature.bgGradient} rounded-2xl p-8 border-2 border-gray-100 hover:border-gray-200 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1`}
              >
                <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 text-white shadow-lg group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-700 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-white" id="how-it-works">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              From Job Creation to Payment in 4 Steps
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Streamlined workflow that saves time and makes money
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: "1", title: "Create Job", desc: "Enter job details, assign crew, set schedule", color: "blue" },
              { num: "2", title: "Crew Executes", desc: "GPS check-in, work documentation, photos", color: "purple" },
              { num: "3", title: "Get Signature", desc: "Customer signs digitally on-site", color: "red" },
              { num: "4", title: "See Profit", desc: "Instant analytics and invoice generation", color: "green" }
            ].map((step, idx) => (
              <div key={idx} className="relative">
                <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all border border-gray-100">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br from-${step.color}-600 to-${step.color}-700 text-white flex items-center justify-center text-2xl font-bold mb-4 shadow-lg`}>
                    {step.num}
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h4>
                  <p className="text-gray-600">{step.desc}</p>
                </div>
                {idx < 3 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <ChevronRight className="w-8 h-8 text-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI Section */}
      <section className="py-24 bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white relative overflow-hidden" id="roi">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">
              Your ROI in Real Numbers, Doug
            </h2>
            <p className="text-xl text-blue-200 max-w-2xl mx-auto">
              Here's what Patriot Concrete Cutting could save every month
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:bg-white/15 transition-all">
              <TrendingUp className="w-12 h-12 text-green-400 mb-4" />
              <div className="text-5xl font-bold mb-2">$30K+</div>
              <div className="text-blue-200 text-lg">Annual admin time savings</div>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:bg-white/15 transition-all">
              <Clock className="w-12 h-12 text-blue-400 mb-4" />
              <div className="text-5xl font-bold mb-2">780hrs</div>
              <div className="text-blue-200 text-lg">Time saved per year</div>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 hover:bg-white/15 transition-all">
              <Star className="w-12 h-12 text-yellow-400 mb-4" />
              <div className="text-5xl font-bold mb-2">100%</div>
              <div className="text-blue-200 text-lg">Digital documentation</div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10">
            <h3 className="text-2xl font-bold mb-6 text-center">Monthly Savings Breakdown</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex justify-between items-center py-3 border-b border-white/10">
                <span className="text-blue-200">Paperwork reduction (10hrs × $50/hr)</span>
                <span className="font-bold text-green-400">$500</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/10">
                <span className="text-blue-200">Scheduling efficiency (8hrs × $50/hr)</span>
                <span className="font-bold text-green-400">$400</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/10">
                <span className="text-blue-200">Faster invoicing (5hrs × $50/hr)</span>
                <span className="font-bold text-green-400">$250</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/10">
                <span className="text-blue-200">Reduced disputes (saved legal fees)</span>
                <span className="font-bold text-green-400">$800</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/10">
                <span className="text-blue-200">Better resource allocation</span>
                <span className="font-bold text-green-400">$300</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-white/10">
                <span className="text-blue-200">Improved cash flow</span>
                <span className="font-bold text-green-400">$250</span>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t-2 border-white/20 flex justify-between items-center">
              <span className="text-xl font-bold">Total Monthly Savings</span>
              <span className="text-4xl font-bold text-green-400">$2,500</span>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA - Personalized */}
      <section className="py-24 bg-gradient-to-br from-red-600 via-red-700 to-blue-800 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <h2 className="text-4xl sm:text-5xl font-bold mb-6">
            Ready to Scale Patriot Concrete Cutting, Doug?
          </h2>
          <p className="text-xl text-red-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            Let's get you set up with a personalized demo. See exactly how this works for your business in under 15 minutes.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <Link
              href="/request-access"
              className="group px-10 py-5 bg-white hover:bg-gray-50 text-red-700 rounded-xl font-bold text-xl transition-all shadow-2xl hover:shadow-3xl transform hover:scale-105 flex items-center justify-center gap-2"
            >
              Schedule My Personal Demo
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/login"
              className="px-10 py-5 bg-white/10 backdrop-blur-lg hover:bg-white/20 text-white rounded-xl font-bold text-xl transition-all border-2 border-white/30 flex items-center justify-center gap-2"
            >
              Try Demo Now
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-red-100">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              <span>No credit card</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              <span>5-minute setup</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              <span>Free support</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-600 to-blue-700 flex items-center justify-center">
                  <span className="text-white font-bold">P</span>
                </div>
                <div>
                  <div className="font-bold text-lg text-white">Patriot Concrete Cutting</div>
                  <div className="text-xs text-gray-400">Management Platform</div>
                </div>
              </div>
              <p className="text-gray-400 text-sm max-w-md">
                Built specifically for concrete cutting contractors who want to scale their operations and increase profitability.
              </p>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Quick Links</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="text-gray-400 hover:text-white transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="text-gray-400 hover:text-white transition-colors">How It Works</a></li>
                <li><a href="#roi" className="text-gray-400 hover:text-white transition-colors">ROI Calculator</a></li>
                <li><Link href="/login" className="text-gray-400 hover:text-white transition-colors">Sign In</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-bold mb-4">Get Started</h3>
              <p className="text-gray-400 text-sm mb-4">
                Ready to see it in action? Schedule a personalized demo with our team.
              </p>
              <Link
                href="/request-access"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-all"
              >
                Request Demo
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="pt-8 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">
              © {new Date().getFullYear()} Patriot Concrete Cutting Platform. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">Privacy</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
