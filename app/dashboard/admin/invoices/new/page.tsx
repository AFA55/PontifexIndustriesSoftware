'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, type User } from '@/lib/auth';
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  ChevronDown,
} from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  display_name: string;
  primary_contact_email: string;
  billing_address_line1: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  payment_terms: number;
  default_billing_type: string;
  tax_exempt: boolean;
}

interface LineItem {
  id: string;
  description: string;
  billing_type: string;
  quantity: number;
  unit: string;
  unit_rate: number;
}

const BILLING_TYPES = [
  { value: 'labor', label: 'Labor' },
  { value: 'material', label: 'Material' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'flat_rate', label: 'Flat Rate' },
  { value: 'mobilization', label: 'Mobilization' },
  { value: 'standby', label: 'Standby' },
  { value: 'travel', label: 'Travel' },
  { value: 'fuel_surcharge', label: 'Fuel Surcharge' },
  { value: 'other', label: 'Other' },
];

const UNIT_OPTIONS = ['hrs', 'ea', 'ft', 'lot', 'day', 'mi', 'gal', 'yd', 'ton', 'lf', 'sf', 'cy'];

function generateTempId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [poNumber, setPoNumber] = useState('');
  const [taxRate, setTaxRate] = useState(8.25);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [useExistingCustomer, setUseExistingCustomer] = useState(true);

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: generateTempId(),
      description: '',
      billing_type: 'labor',
      quantity: 1,
      unit: 'hrs',
      unit_rate: 0,
    },
  ]);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    setCurrentUser(user);
    loadCustomers();
  }, []);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    };
  };

  const loadCustomers = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/admin/customers', { headers });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load customers');
      }

      setCustomers(result.data?.customers || []);
    } catch (error: any) {
      if (error?.message) {
        console.error('Failed to load customers:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      setCustomerName(customer.display_name || customer.name);
      setCustomerEmail(customer.primary_contact_email || '');
      const addressParts = [
        customer.billing_address_line1,
        customer.billing_city,
        customer.billing_state,
        customer.billing_zip,
      ].filter(Boolean);
      setBillingAddress(addressParts.join(', '));
      if (customer.payment_terms) {
        setPaymentTerms(customer.payment_terms);
      }
      if (customer.tax_exempt) {
        setTaxRate(0);
      }
    }
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: generateTempId(),
        description: '',
        billing_type: 'labor',
        quantity: 1,
        unit: 'hrs',
        unit_rate: 0,
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter((item) => item.id !== id));
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: string | number) => {
    setLineItems(
      lineItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_rate,
    0
  );
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount - discountAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const effectiveCustomerName = useExistingCustomer
      ? customers.find((c) => c.id === selectedCustomerId)?.name || customerName
      : customerName;

    if (!effectiveCustomerName.trim()) {
      setError('Customer name is required.');
      return;
    }

    const validLineItems = lineItems.filter(
      (item) => item.description.trim() && item.unit_rate > 0
    );

    if (validLineItems.length === 0) {
      setError('At least one line item with a description and rate is required.');
      return;
    }

    setSubmitting(true);

    try {
      const headers = await getAuthHeaders();
      const body = {
        customer_name: effectiveCustomerName,
        customer_id: useExistingCustomer && selectedCustomerId ? selectedCustomerId : undefined,
        customer_email: customerEmail || undefined,
        billing_address: billingAddress || undefined,
        payment_terms: paymentTerms,
        po_number: poNumber || undefined,
        tax_rate: taxRate / 100,
        discount_amount: discountAmount || undefined,
        notes: notes || undefined,
        line_items: validLineItems.map(({ description, billing_type, quantity, unit, unit_rate }) => ({
          description,
          billing_type,
          quantity,
          unit,
          unit_rate,
        })),
      };

      const response = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create invoice');
      }

      setSuccess('Invoice created successfully!');
      setTimeout(() => {
        router.push('/dashboard/admin/invoices');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/90 border-b border-gray-200 sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/admin/invoices"
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Create Invoice</h1>
              <p className="text-sm text-gray-600">Create a new customer invoice</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <form onSubmit={handleSubmit}>
          {/* Error / Success Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
              {success}
            </div>
          )}

          {/* Customer Section */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Customer</h2>

            {/* Toggle: Existing vs New */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setUseExistingCustomer(true)}
                className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                  useExistingCustomer
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Existing Customer
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseExistingCustomer(false);
                  setSelectedCustomerId('');
                }}
                className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                  !useExistingCustomer
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                New Customer
              </button>
            </div>

            {useExistingCustomer ? (
              <div className="relative">
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
                >
                  <option value="">Select a customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name || c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Acme Construction"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    required={!useExistingCustomer}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Email
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="billing@example.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
              </div>
            )}

            {/* Billing Address (shown for both modes) */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Billing Address
              </label>
              <input
                type="text"
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                placeholder="123 Main St, Houston, TX 77001"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              />
            </div>
          </div>

          {/* Invoice Details */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Invoice Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Terms (days)
                </label>
                <input
                  type="number"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(parseInt(e.target.value) || 0)}
                  min={0}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PO Number
                </label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  step="0.01"
                  min={0}
                  max={100}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Line Items</h2>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>

            {/* Desktop Header */}
            <div className="hidden md:grid md:grid-cols-12 gap-3 mb-2 px-1">
              <div className="col-span-3 text-xs font-semibold text-gray-500 uppercase">
                Description
              </div>
              <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase">
                Type
              </div>
              <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase">
                Qty
              </div>
              <div className="col-span-1 text-xs font-semibold text-gray-500 uppercase">
                Unit
              </div>
              <div className="col-span-2 text-xs font-semibold text-gray-500 uppercase">
                Rate
              </div>
              <div className="col-span-1 text-xs font-semibold text-gray-500 uppercase text-right">
                Amount
              </div>
              <div className="col-span-1"></div>
            </div>

            <div className="space-y-3">
              {lineItems.map((item, index) => {
                const lineTotal = item.quantity * item.unit_rate;
                return (
                  <div key={item.id} className="border border-gray-200 rounded-xl p-3">
                    {/* Desktop Row */}
                    <div className="hidden md:grid md:grid-cols-12 gap-3 items-center">
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            updateLineItem(item.id, 'description', e.target.value)
                          }
                          placeholder="Description"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                        />
                      </div>
                      <div className="col-span-2">
                        <select
                          value={item.billing_type}
                          onChange={(e) =>
                            updateLineItem(item.id, 'billing_type', e.target.value)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                        >
                          {BILLING_TYPES.map((bt) => (
                            <option key={bt.value} value={bt.value}>
                              {bt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              'quantity',
                              parseFloat(e.target.value) || 0
                            )
                          }
                          min={0}
                          step="0.01"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                        />
                      </div>
                      <div className="col-span-1">
                        <select
                          value={item.unit}
                          onChange={(e) =>
                            updateLineItem(item.id, 'unit', e.target.value)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                            $
                          </span>
                          <input
                            type="number"
                            value={item.unit_rate}
                            onChange={(e) =>
                              updateLineItem(
                                item.id,
                                'unit_rate',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            min={0}
                            step="0.01"
                            className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                          />
                        </div>
                      </div>
                      <div className="col-span-1 text-right text-sm font-semibold text-gray-900">
                        {formatMoney(lineTotal)}
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeLineItem(item.id)}
                          disabled={lineItems.length === 1}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Mobile Layout */}
                    <div className="md:hidden space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500">
                          Item {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLineItem(item.id)}
                          disabled={lineItems.length === 1}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          updateLineItem(item.id, 'description', e.target.value)
                        }
                        placeholder="Description"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={item.billing_type}
                          onChange={(e) =>
                            updateLineItem(item.id, 'billing_type', e.target.value)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                        >
                          {BILLING_TYPES.map((bt) => (
                            <option key={bt.value} value={bt.value}>
                              {bt.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={item.unit}
                          onChange={(e) =>
                            updateLineItem(item.id, 'unit', e.target.value)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Qty</label>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              updateLineItem(
                                item.id,
                                'quantity',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            min={0}
                            step="0.01"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Rate</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                              $
                            </span>
                            <input
                              type="number"
                              value={item.unit_rate}
                              onChange={(e) =>
                                updateLineItem(
                                  item.id,
                                  'unit_rate',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              min={0}
                              step="0.01"
                              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-sm font-semibold text-gray-900">
                        Line Total: {formatMoney(lineTotal)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Totals + Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Notes */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Notes</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                placeholder="Additional notes for the invoice..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Totals */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-semibold text-gray-900">{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax ({taxRate}%)</span>
                  <span className="font-semibold text-gray-900">{formatMoney(taxAmount)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Discount</span>
                    <span className="font-semibold text-red-600">
                      -{formatMoney(discountAmount)}
                    </span>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Discount ($)</label>
                  <input
                    type="number"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                    min={0}
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                  />
                </div>
                <div className="border-t border-gray-200 pt-3 flex justify-between">
                  <span className="text-lg font-bold text-gray-900">Total</span>
                  <span className="text-lg font-bold text-blue-600">{formatMoney(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {submitting ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
                  Creating...
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5" />
                  Create Invoice
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
