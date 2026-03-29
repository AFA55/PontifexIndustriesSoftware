'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  HardHat,
  Wrench,
  Layers,
  Users,
  UserCheck,
  UsersRound,
  Building,
  CalendarCheck,
  Truck,
  Receipt,
  LayoutGrid,
  CheckCircle2,
  Shield,
  Clock,
  Sparkles,
  Loader2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────
type CompanyType = 'concrete_cutting' | 'general_contractor' | 'specialty_contractor' | 'other';
type TeamSize = '1-5' | '6-15' | '16-50' | '50+';
type Challenge = 'scheduling' | 'dispatching' | 'invoicing' | 'all';

interface FormData {
  companyType: CompanyType | null;
  teamSize: TeamSize | null;
  challenge: Challenge | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
}

const INITIAL_FORM: FormData = {
  companyType: null,
  teamSize: null,
  challenge: null,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  companyName: '',
};

// ─── Step Config ─────────────────────────────────────────────
const COMPANY_OPTIONS: { value: CompanyType; label: string; icon: React.ElementType; desc: string }[] = [
  { value: 'concrete_cutting', label: 'Concrete Cutting', icon: HardHat, desc: 'Slab sawing, wall sawing, core drilling' },
  { value: 'general_contractor', label: 'General Contractor', icon: Building2, desc: 'Commercial or residential GC' },
  { value: 'specialty_contractor', label: 'Specialty Contractor', icon: Wrench, desc: 'Demolition, scanning, GPR' },
  { value: 'other', label: 'Other', icon: Layers, desc: 'Tell us more during the demo' },
];

const TEAM_OPTIONS: { value: TeamSize; label: string; icon: React.ElementType }[] = [
  { value: '1-5', label: '1 – 5 people', icon: Users },
  { value: '6-15', label: '6 – 15 people', icon: UserCheck },
  { value: '16-50', label: '16 – 50 people', icon: UsersRound },
  { value: '50+', label: '50+ people', icon: Building },
];

const CHALLENGE_OPTIONS: { value: Challenge; label: string; icon: React.ElementType }[] = [
  { value: 'scheduling', label: 'Scheduling & Planning', icon: CalendarCheck },
  { value: 'dispatching', label: 'Dispatching & Tracking', icon: Truck },
  { value: 'invoicing', label: 'Invoicing & Billing', icon: Receipt },
  { value: 'all', label: 'All of the Above', icon: LayoutGrid },
];

const TOTAL_STEPS = 3;

// ─── Page ────────────────────────────────────────────────────
export default function RequestDemoPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);

  const canProceed = useCallback(() => {
    if (step === 1) return form.companyType !== null;
    if (step === 2) return form.teamSize !== null && form.challenge !== null;
    if (step === 3) return form.firstName.trim() && form.email.trim() && form.companyName.trim();
    return false;
  }, [step, form]);

  const goNext = () => {
    if (!canProceed()) return;
    setDirection(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSubmit = async () => {
    if (!canProceed()) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_type: form.companyType,
          team_size: form.teamSize,
          biggest_challenge: form.challenge,
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          company_name: form.companyName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        setSubmitted(true);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Thank-you Screen ───────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center px-4">
        <BackgroundOrbs />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 max-w-lg w-full text-center"
        >
          <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-8">
            <CheckCircle2 className="text-emerald-400" size={40} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">
            You&apos;re on the list!
          </h1>
          <p className="text-zinc-400 text-lg mb-8 leading-relaxed">
            We&apos;ll reach out within 24 hours to schedule your personalized demo.
            In the meantime, explore the platform.
          </p>
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 mb-8">
            <h3 className="text-sm uppercase tracking-wider text-zinc-500 font-semibold mb-4">What to expect</h3>
            <div className="space-y-3 text-left">
              {[
                { icon: Clock, text: 'A quick 15-minute intro call to understand your workflow' },
                { icon: Sparkles, text: 'A live walkthrough of the platform tailored to your needs' },
                { icon: Shield, text: 'No commitment — just see if it fits your operation' },
              ].map((item) => (
                <div key={item.text} className="flex items-start gap-3">
                  <item.icon className="text-blue-400 flex-shrink-0 mt-0.5" size={18} />
                  <span className="text-zinc-300 text-sm">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/#features"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 hover:scale-[1.03] flex items-center justify-center gap-2"
            >
              Explore Features
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/"
              className="px-6 py-3 rounded-xl bg-white/10 backdrop-blur-md hover:bg-white/[0.15] text-white font-semibold border border-white/10 hover:border-white/20 transition-all duration-300"
            >
              Back to Home
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Main Funnel ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      <BackgroundOrbs />

      {/* Top Bar */}
      <div className="relative z-10 max-w-3xl w-full mx-auto px-4 pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          Back to homepage
        </Link>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="max-w-2xl w-full">
          {/* Progress Bar */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-500 text-sm font-medium">
                Step {step} of {TOTAL_STEPS}
              </span>
              <span className="text-zinc-500 text-sm">
                {step === TOTAL_STEPS ? 'Almost done!' : `${Math.round((step / TOTAL_STEPS) * 100)}% complete`}
              </span>
            </div>
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Step Content (Animated) */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -60 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              {step === 1 && <Step1 form={form} setForm={setForm} />}
              {step === 2 && <Step2 form={form} setForm={setForm} />}
              {step === 3 && <Step3 form={form} setForm={setForm} error={error} />}
            </motion.div>
          </AnimatePresence>

          {/* Navigation Buttons */}
          <div className="mt-10 flex items-center justify-between">
            {step > 1 ? (
              <button
                onClick={goBack}
                className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-medium"
              >
                <ArrowLeft size={16} />
                Back
              </button>
            ) : (
              <div />
            )}

            {step < TOTAL_STEPS ? (
              <button
                onClick={goNext}
                disabled={!canProceed()}
                className="group px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 hover:scale-[1.03] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-blue-500/25 flex items-center gap-2"
              >
                Continue
                <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canProceed() || submitting}
                className="group px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 hover:scale-[1.03] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-blue-500/25 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Submitting...
                  </>
                ) : (
                  <>
                    Book My Demo
                    <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
                  </>
                )}
              </button>
            )}
          </div>

          {/* Social Proof */}
          <div className="mt-12 text-center">
            <p className="text-zinc-600 text-xs">
              Trusted by concrete cutting professionals &middot; No credit card required &middot; 15-minute setup
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step Components ─────────────────────────────────────────

function Step1({ form, setForm }: { form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>> }) {
  return (
    <div>
      <h2 className="text-2xl sm:text-3xl font-bold mb-2">What best describes your company?</h2>
      <p className="text-zinc-400 mb-8">We&apos;ll tailor your demo to your specific industry.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COMPANY_OPTIONS.map((opt) => (
          <SelectionCard
            key={opt.value}
            selected={form.companyType === opt.value}
            onClick={() => setForm((f) => ({ ...f, companyType: opt.value }))}
            icon={opt.icon}
            label={opt.label}
            description={opt.desc}
          />
        ))}
      </div>
    </div>
  );
}

function Step2({ form, setForm }: { form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>> }) {
  return (
    <div>
      <h2 className="text-2xl sm:text-3xl font-bold mb-2">Tell us about your operation</h2>
      <p className="text-zinc-400 mb-8">This helps us show you the most relevant features.</p>

      <div className="mb-8">
        <label className="block text-sm font-semibold text-zinc-300 mb-3">How big is your team?</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TEAM_OPTIONS.map((opt) => (
            <SelectionCard
              key={opt.value}
              selected={form.teamSize === opt.value}
              onClick={() => setForm((f) => ({ ...f, teamSize: opt.value }))}
              icon={opt.icon}
              label={opt.label}
              compact
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-zinc-300 mb-3">Biggest operational challenge?</label>
        <div className="grid grid-cols-2 gap-3">
          {CHALLENGE_OPTIONS.map((opt) => (
            <SelectionCard
              key={opt.value}
              selected={form.challenge === opt.value}
              onClick={() => setForm((f) => ({ ...f, challenge: opt.value }))}
              icon={opt.icon}
              label={opt.label}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Step3({
  form,
  setForm,
  error,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  error: string | null;
}) {
  const update = (field: keyof FormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <div>
      <h2 className="text-2xl sm:text-3xl font-bold mb-2">Last step — where should we reach you?</h2>
      <p className="text-zinc-400 mb-8">We&apos;ll contact you to schedule a personalized demo.</p>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InputField
            label="First name *"
            value={form.firstName}
            onChange={(v) => update('firstName', v)}
            placeholder="John"
          />
          <InputField
            label="Last name"
            value={form.lastName}
            onChange={(v) => update('lastName', v)}
            placeholder="Smith"
          />
        </div>
        <InputField
          label="Work email *"
          value={form.email}
          onChange={(v) => update('email', v)}
          placeholder="john@company.com"
          type="email"
        />
        <InputField
          label="Phone"
          value={form.phone}
          onChange={(v) => update('phone', v)}
          placeholder="(555) 123-4567"
          type="tel"
        />
        <InputField
          label="Company name *"
          value={form.companyName}
          onChange={(v) => update('companyName', v)}
          placeholder="Your Company LLC"
        />
      </div>

      <div className="mt-6 flex items-start gap-3 p-4 bg-white/[0.03] rounded-xl border border-white/[0.06]">
        <Shield className="text-blue-400 flex-shrink-0 mt-0.5" size={18} />
        <p className="text-zinc-500 text-xs leading-relaxed">
          Your information is secure and will only be used to schedule your demo.
          We never share your data with third parties.
        </p>
      </div>
    </div>
  );
}

// ─── Shared UI Components ────────────────────────────────────

function SelectionCard({
  selected,
  onClick,
  icon: Icon,
  label,
  description,
  compact,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group text-left rounded-xl border transition-all duration-200 ${
        compact ? 'p-4' : 'p-5'
      } ${
        selected
          ? 'bg-blue-500/10 border-blue-500/40 shadow-lg shadow-blue-500/10'
          : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.15]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            selected
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-white/[0.06] text-zinc-500 group-hover:text-zinc-300'
          } ${compact ? 'w-8 h-8' : ''}`}
        >
          <Icon size={compact ? 16 : 20} />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={`font-semibold transition-colors ${
              selected ? 'text-white' : 'text-zinc-300 group-hover:text-white'
            } ${compact ? 'text-sm' : ''}`}
          >
            {label}
          </div>
          {description && (
            <div className="text-zinc-500 text-xs mt-0.5">{description}</div>
          )}
        </div>
        {selected && (
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={14} className="text-white" />
          </div>
        )}
      </div>
    </button>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm"
      />
    </div>
  );
}

function BackgroundOrbs() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
      <div className="absolute -bottom-40 -left-32 w-[500px] h-[500px] bg-cyan-500/8 rounded-full blur-[120px]" />
      <div className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-violet-500/8 rounded-full blur-[120px]" />
    </div>
  );
}
