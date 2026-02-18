'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, type User } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Settings,
  BarChart3,
  FileText,
  Users,
  CreditCard,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

interface PayPeriod {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string | null;
  status: string;
  operator_count: number;
  total_gross_pay: number;
  total_net_pay: number;
  created_at: string;
}

interface PayrollSettings {
  id: string;
  pay_frequency: string;
  week_start_day: string;
  overtime_threshold_weekly: number;
  overtime_multiplier: number;
  company_name: string;
  require_timecard_approval: boolean;
}

export default function PayrollHubPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPeriod, setCurrentPeriod] = useState<PayPeriod | null>(null);
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    setUser(currentUser);
    fetchData();
  }, [router]);

  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const headers = { Authorization: `Bearer ${session.access_token}` };

      // Fetch current/recent period and settings in parallel
      const [periodsRes, settingsRes] = await Promise.all([
        fetch('/api/admin/payroll/periods?limit=1', { headers }),
        fetch('/api/admin/payroll/settings', { headers }),
      ]);

      if (periodsRes.ok) {
        const periodsData = await periodsRes.json();
        if (periodsData.success && periodsData.data.periods.length > 0) {
          setCurrentPeriod(periodsData.data.periods[0]);
        }
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.success) {
          setSettings(settingsData.data);
        }
      }
    } catch (err) {
      console.error('Error fetching payroll data:', err);
      setError('Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatMoney = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-100 text-blue-800';
      case 'locked': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-purple-100 text-purple-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'paid': return 'bg-emerald-100 text-emerald-800';
      case 'void': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <Clock size={16} />;
      case 'locked': return <AlertCircle size={16} />;
      case 'processing': return <CreditCard size={16} />;
      case 'approved': return <CheckCircle size={16} />;
      case 'paid': return <CheckCircle size={16} />;
      default: return <Clock size={16} />;
    }
  };

  const modules = [
    {
      title: 'Pay Periods',
      description: 'View and manage all pay periods, create new periods, and track status',
      href: '/dashboard/admin/payroll/periods',
      icon: Calendar,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      borderColor: 'border-blue-200',
      hoverBg: 'hover:bg-blue-50',
    },
    {
      title: 'Process Payroll',
      description: 'Calculate pay, review timecards, and process payroll for active periods',
      href: '/dashboard/admin/payroll/periods',
      icon: CreditCard,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600',
      borderColor: 'border-purple-200',
      hoverBg: 'hover:bg-purple-50',
      note: 'Select a period to begin processing',
    },
    {
      title: 'Pay Rates',
      description: 'Manage operator pay rates, overtime rules, and per diem settings',
      href: '/dashboard/admin/payroll/rates',
      icon: DollarSign,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
      borderColor: 'border-green-200',
      hoverBg: 'hover:bg-green-50',
    },
    {
      title: 'Payroll Settings',
      description: 'Configure pay frequency, overtime thresholds, and company details',
      href: '/dashboard/admin/payroll/settings',
      icon: Settings,
      iconBg: 'bg-gray-100',
      iconColor: 'text-gray-600',
      borderColor: 'border-gray-200',
      hoverBg: 'hover:bg-gray-50',
    },
    {
      title: 'Financial Dashboard',
      description: 'View financial overview, revenue tracking, and cost analysis',
      href: '/dashboard/admin/finance',
      icon: BarChart3,
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
      borderColor: 'border-indigo-200',
      hoverBg: 'hover:bg-indigo-50',
    },
    {
      title: 'Invoices',
      description: 'Generate, send, and track customer invoices for completed work',
      href: '/dashboard/admin/invoices',
      icon: FileText,
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600',
      borderColor: 'border-orange-200',
      hoverBg: 'hover:bg-orange-50',
    },
    {
      title: 'Customers',
      description: 'Manage customer accounts, billing info, and payment history',
      href: '/dashboard/admin/customers',
      icon: Users,
      iconBg: 'bg-teal-100',
      iconColor: 'text-teal-600',
      borderColor: 'border-teal-200',
      hoverBg: 'hover:bg-teal-50',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading payroll...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white border-b-2 border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/admin"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md font-medium"
              >
                <ArrowLeft size={20} />
                <span>Back to Admin</span>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Payroll Hub</h1>
                <p className="text-sm text-gray-500">Manage payroll, pay periods, and finances</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-gray-100 px-4 py-2 rounded-xl">
                <p className="text-sm font-bold text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-700 capitalize font-medium">Admin</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Error State */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="text-red-600" size={20} />
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        )}

        {/* Pay Period Hero Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Calendar className="text-blue-600" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {currentPeriod ? 'Current Pay Period' : 'No Active Pay Period'}
                  </h2>
                  {settings?.pay_frequency && (
                    <p className="text-sm text-gray-500 capitalize">
                      {settings.pay_frequency} payroll
                      {settings.company_name ? ` - ${settings.company_name}` : ''}
                    </p>
                  )}
                </div>
              </div>

              {currentPeriod ? (
                <div className="flex flex-wrap items-center gap-4 mt-4">
                  <div>
                    <p className="text-sm text-gray-500">Period</p>
                    <p className="text-lg font-semibold text-gray-800">
                      {formatDate(currentPeriod.period_start)} - {formatDate(currentPeriod.period_end)}
                    </p>
                  </div>
                  {currentPeriod.pay_date && (
                    <div>
                      <p className="text-sm text-gray-500">Pay Date</p>
                      <p className="text-lg font-semibold text-gray-800">
                        {formatDate(currentPeriod.pay_date)}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(currentPeriod.status)}`}>
                      {getStatusIcon(currentPeriod.status)}
                      {currentPeriod.status.charAt(0).toUpperCase() + currentPeriod.status.slice(1)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Operators</p>
                    <p className="text-lg font-semibold text-gray-800">
                      {currentPeriod.operator_count || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Gross Pay</p>
                    <p className="text-lg font-semibold text-gray-800">
                      {formatMoney(currentPeriod.total_gross_pay || 0)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 mt-2">
                  No pay periods have been created yet. Create one from the Pay Periods module below.
                </p>
              )}
            </div>

            {currentPeriod && (
              <Link
                href={`/dashboard/admin/payroll/periods/${currentPeriod.id}`}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md font-medium whitespace-nowrap"
              >
                <span>View Period</span>
                <ChevronRight size={18} />
              </Link>
            )}
          </div>
        </div>

        {/* Settings Summary */}
        {settings && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
                <Calendar className="text-blue-600" size={20} />
              </div>
              <p className="text-2xl font-bold text-gray-800 capitalize">{settings.pay_frequency}</p>
              <p className="text-sm text-gray-500">Pay Frequency</p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center mb-2">
                <Clock className="text-orange-600" size={20} />
              </div>
              <p className="text-2xl font-bold text-gray-800">{settings.overtime_threshold_weekly}h</p>
              <p className="text-sm text-gray-500">OT Threshold (Weekly)</p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mb-2">
                <DollarSign className="text-green-600" size={20} />
              </div>
              <p className="text-2xl font-bold text-gray-800">{settings.overtime_multiplier}x</p>
              <p className="text-sm text-gray-500">OT Multiplier</p>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-2">
                <CheckCircle className="text-purple-600" size={20} />
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {settings.require_timecard_approval ? 'Yes' : 'No'}
              </p>
              <p className="text-sm text-gray-500">Approval Required</p>
            </div>
          </div>
        )}

        {/* Module Cards Grid */}
        <h2 className="text-xl font-bold text-gray-900 mb-4">Payroll Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Link
                key={module.title}
                href={module.href}
                className={`group bg-white rounded-2xl p-6 shadow-lg border ${module.borderColor} ${module.hoverBg} transition-all duration-200 hover:shadow-xl hover:scale-[1.02]`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 ${module.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon className={module.iconColor} size={24} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                        {module.title}
                      </h3>
                      <ChevronRight
                        size={20}
                        className="text-gray-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all flex-shrink-0"
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{module.description}</p>
                    {module.note && (
                      <p className="text-xs text-purple-600 mt-2 font-medium italic">{module.note}</p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
