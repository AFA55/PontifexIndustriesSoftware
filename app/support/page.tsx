import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, LifeBuoy, Mail, Clock, ShieldCheck, FileText, Trash2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Support — Pontifex Industries',
  description: 'Get help with the Pontifex Industries field operations platform — contact support, account help, and resources.',
  alternates: {
    canonical: 'https://www.pontifexindustries.com/support',
  },
};

const SUPPORT_EMAIL = 'pontifexindustries@gmail.com';

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-900 to-indigo-900 text-white py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <Link href="/" className="inline-flex items-center gap-2 text-purple-200 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center gap-3">
            <LifeBuoy className="w-8 h-8 text-purple-300" />
            <h1 className="text-2xl font-bold">Support</h1>
          </div>
          <p className="mt-2 text-purple-200 text-sm">
            We&apos;re here to help you get the most out of Pontifex Industries.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-4xl py-8 space-y-6">
        {/* Contact */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Contact Us</h2>
          <p className="text-gray-600 leading-relaxed mb-5">
            Have a question, found a bug, or need help with your account? Email our support team and
            we&apos;ll get back to you as soon as we can.
          </p>

          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Pontifex%20Support%20Request`}
            className="inline-flex items-center gap-3 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold px-5 py-3 min-h-[44px] transition-colors"
          >
            <Mail className="w-5 h-5" />
            {SUPPORT_EMAIL}
          </a>

          <div className="mt-6 flex items-start gap-3 text-gray-600">
            <Clock className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              <span className="font-semibold text-gray-800">Response time:</span> We typically reply
              within one business day (Monday–Friday).
            </p>
          </div>
        </section>

        {/* Common help */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Common Questions</h2>
          <div className="space-y-5">
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">I can&apos;t sign in</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Make sure you&apos;re using your company code, work email, and password. If you forgot
                your password, use the &quot;Forgot password?&quot; link on the sign-in screen, or ask
                your company administrator to reset access.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">I need an account</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Accounts are created by your company administrator. Contact your administrator, or
                email us and we&apos;ll point you in the right direction.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1">Location, camera, or notifications aren&apos;t working</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Pontifex asks for location only to verify you&apos;re at the job site when you clock in,
                camera to capture job photos, and notifications for dispatch alerts. You can enable or
                disable these anytime in your device Settings under Pontifex Industries.
              </p>
            </div>
          </div>
        </section>

        {/* Account & data */}
        <section className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Account &amp; Data</h2>
          <div className="flex items-start gap-3 text-gray-600 mb-3">
            <Trash2 className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              <span className="font-semibold text-gray-800">Delete your account:</span> Sign in, then go
              to <span className="font-medium">My Profile → Delete My Account</span> to permanently
              remove your account and personal data.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            <Link href="/privacy" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2.5 min-h-[44px] text-sm transition-colors">
              <ShieldCheck className="w-4 h-4 text-purple-500" />
              Privacy Policy
            </Link>
            <Link href="/terms" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2.5 min-h-[44px] text-sm transition-colors">
              <FileText className="w-4 h-4 text-purple-500" />
              Terms of Service
            </Link>
          </div>
        </section>

        <p className="text-center text-xs text-gray-400 pb-4">
          © {new Date().getFullYear()} Pontifex Industries. All rights reserved.
        </p>
      </div>
    </div>
  );
}
