'use client';

import { Phone, MessageCircle, Linkedin, TrendingUp, Users, Wrench } from 'lucide-react';
import Image from 'next/image';

export default function AndresDigitalBusinessCard() {
  const handleCall = () => {
    window.location.href = 'tel:4706586313';
  };

  const handleMessage = () => {
    window.location.href = 'sms:4706586313';
  };

  const handleLinkedIn = () => {
    window.open('https://www.linkedin.com/in/andres-altamirano-669231282/', '_blank');
  };

  const handleConnect = () => {
    window.location.href = 'mailto:andres.altamirano1280@gmail.com?subject=Let\'s Connect';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* World of Concrete Badge */}
        <div className="text-center mb-8">
          <span className="inline-block px-6 py-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-sm font-bold rounded-full shadow-lg">
            WORLD OF CONCRETE 2026
          </span>
        </div>

        {/* Profile Section */}
        <div className="text-center mb-8">
          {/* Profile Image */}
          <div className="relative w-48 h-48 mx-auto mb-6">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full opacity-75 blur-xl"></div>
            <div className="relative w-full h-full rounded-full border-4 border-orange-500 shadow-2xl overflow-hidden">
              <Image
                src="/andres-profile.jpeg"
                alt="Andres Altamirano"
                fill
                className="object-cover"
                priority
              />
            </div>
          </div>

          {/* Name & Title */}
          <h1 className="text-5xl font-bold text-white mb-3 drop-shadow-lg">
            Andres Altamirano
          </h1>
          <p className="text-blue-200 text-xl font-semibold mb-2">
            Construction Professional
          </p>
          <p className="text-blue-300 text-md mb-4">
            4 Years in Concrete Industry
          </p>
          <p className="text-orange-400 text-sm font-semibold italic">
            Iron sharpens iron - Proverbs 27:17
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-4 mb-8 max-w-xl mx-auto">
          <button
            onClick={handleCall}
            className="bg-white/10 backdrop-blur-lg hover:bg-white/20 border border-white/20 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl group"
          >
            <Phone className="w-8 h-8 text-green-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-white text-sm font-semibold">Call</p>
          </button>

          <button
            onClick={handleMessage}
            className="bg-white/10 backdrop-blur-lg hover:bg-white/20 border border-white/20 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl group"
          >
            <MessageCircle className="w-8 h-8 text-blue-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-white text-sm font-semibold">Message</p>
          </button>

          <button
            onClick={handleLinkedIn}
            className="bg-white/10 backdrop-blur-lg hover:bg-white/20 border border-white/20 rounded-2xl p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl group"
          >
            <Linkedin className="w-8 h-8 text-blue-500 mx-auto mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-white text-sm font-semibold">LinkedIn</p>
          </button>
        </div>

        {/* Bio */}
        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-3xl p-8 mb-8 shadow-2xl">
          <p className="text-blue-100 text-center leading-relaxed">
            With nearly half a decade in the concrete industry, I'm passionate about leveraging technology to transform construction operations. I specialize in developing innovative tools and systems that drive efficiency, reduce risk, and build stronger teams.
          </p>
        </div>

        {/* Current Focus */}
        <div className="mb-8">
          <h3 className="text-blue-300 text-sm font-bold uppercase tracking-wider text-center mb-6">
            Current Focus
          </h3>

          <div className="space-y-4">
            <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 hover:scale-105">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-xl flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="text-white text-lg font-bold mb-1">Estimating & Risk Management</h4>
                  <p className="text-blue-200 text-sm">Precision-driven approaches to project forecasting</p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 hover:scale-105">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="text-white text-lg font-bold mb-1">Leadership Development</h4>
                  <p className="text-blue-200 text-sm">Navigating difficult conversations with clarity</p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all duration-300 hover:scale-105">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Wrench className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h4 className="text-white text-lg font-bold mb-1">Systems & Technology</h4>
                  <p className="text-blue-200 text-sm">Building tools for the construction of tomorrow</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Connect Button */}
        <button
          onClick={handleConnect}
          className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-bold py-5 px-8 rounded-2xl transition-all duration-300 hover:shadow-2xl hover:scale-105 flex items-center justify-center gap-3 text-lg"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Let's Connect
          <span className="text-2xl">→</span>
        </button>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-blue-300/50 text-sm">
            © 2026 - Built for the future of construction
          </p>
        </div>
      </div>
    </div>
  );
}
