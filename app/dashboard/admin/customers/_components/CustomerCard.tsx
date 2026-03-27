'use client';

import { Building2, Phone, User, Briefcase, DollarSign, CreditCard, ArrowUpRight } from 'lucide-react';

interface CustomerCardProps {
  customer: {
    id: string;
    name: string;
    primary_contact_name?: string | null;
    primary_contact_phone?: string | null;
    customer_type?: string | null;
    payment_terms?: number | string | null;
    job_count: number;
    total_revenue: number;
    is_active?: boolean;
  };
  onClick: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  general_contractor: 'GC',
  subcontractor: 'Sub',
  direct_client: 'Direct',
  government: 'Gov',
  property_manager: 'PM',
  homeowner: 'Home',
  other: 'Other',
};

const TYPE_COLORS: Record<string, string> = {
  general_contractor: 'bg-indigo-500/20 text-indigo-300',
  subcontractor: 'bg-blue-500/20 text-blue-300',
  direct_client: 'bg-cyan-500/20 text-cyan-300',
  government: 'bg-yellow-500/20 text-yellow-300',
  property_manager: 'bg-orange-500/20 text-orange-300',
  homeowner: 'bg-green-500/20 text-green-300',
  other: 'bg-gray-500/20 text-gray-300',
};

function formatTerms(terms: number | string | null | undefined): string | null {
  if (terms === null || terms === undefined || terms === '') return null;
  const t = String(terms);
  if (t === 'cod') return 'COD';
  if (t === '0') return 'Due on Receipt';
  return `Net ${t}`;
}

export default function CustomerCard({ customer, onClick }: CustomerCardProps) {
  const initials = customer.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const termsLabel = formatTerms(customer.payment_terms);

  return (
    <button
      onClick={onClick}
      className="w-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/30 rounded-xl p-5 transition-all text-left group relative"
    >
      {/* Inactive indicator */}
      {customer.is_active === false && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-red-500/20 rounded text-[9px] font-bold text-red-400">
          Inactive
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg">
          <span className="text-white font-bold text-sm">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white text-sm truncate group-hover:text-purple-300 transition-colors flex items-center gap-1">
            {customer.name}
            <ArrowUpRight className="w-3 h-3 text-gray-600 group-hover:text-purple-400 transition-colors" />
          </h3>
          {customer.primary_contact_name && (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
              <User className="w-3 h-3" />
              {customer.primary_contact_name}
            </p>
          )}
          {customer.primary_contact_phone && (
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3" />
              {customer.primary_contact_phone}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 flex-wrap">
        {customer.customer_type && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TYPE_COLORS[customer.customer_type] || 'bg-gray-500/20 text-gray-300'}`}>
            {TYPE_LABELS[customer.customer_type] || customer.customer_type}
          </span>
        )}
        {termsLabel && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
            <CreditCard className="w-3 h-3" />
            {termsLabel}
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 flex items-center gap-1">
          <Briefcase className="w-3 h-3" />
          {customer.job_count} job{customer.job_count !== 1 ? 's' : ''}
        </span>
        {customer.total_revenue > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            ${customer.total_revenue.toLocaleString()}
          </span>
        )}
      </div>
    </button>
  );
}
