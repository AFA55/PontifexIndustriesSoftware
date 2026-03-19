'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CustomerAutocomplete } from '@/components/ui/CustomerAutocomplete';
import {
  X,
  Plus,
  Trash2,
  Loader2,
  FileText,
  Save,
  Calculator,
} from 'lucide-react';

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface CompletedJob {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  location?: string;
  address?: string;
  po_number?: string;
  salesman_name?: string;
  estimated_cost?: number;
  work_completed_at?: string;
}

interface CreateInvoiceFormProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateInvoiceForm({ onClose, onCreated }: CreateInvoiceFormProps) {
  // Customer & Job
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Completed jobs dropdown
  const [completedJobs, setCompletedJobs] = useState<CompletedJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Invoice details
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [salesPerson, setSalesPerson] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30');
  const [jobName, setJobName] = useState('');
  const [jobLocation, setJobLocation] = useState('');
  const [workCompletedDate, setWorkCompletedDate] = useState('');

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, rate: 0, amount: 0 },
  ]);
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState('Net 30 — Payment due within 30 days of invoice date');

  // State
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auto-calculate due date when invoice date or payment terms change
  useEffect(() => {
    if (invoiceDate) {
      const date = new Date(invoiceDate + 'T00:00');
      date.setDate(date.getDate() + parseInt(paymentTerms || '30'));
      setDueDate(date.toISOString().split('T')[0]);
    }
  }, [invoiceDate, paymentTerms]);

  // Fetch completed jobs on mount
  useEffect(() => {
    fetchCompletedJobs();
  }, []);

  const fetchCompletedJobs = async () => {
    setLoadingJobs(true);
    try {
      const { data } = await supabase
        .from('job_orders')
        .select('id, job_number, title, customer_name, location, address, po_number, salesman_name, estimated_cost, work_completed_at')
        .eq('status', 'completed')
        .is('deleted_at', null)
        .order('work_completed_at', { ascending: false })
        .limit(100);
      setCompletedJobs(data || []);
    } catch {
      // Silently fail
    } finally {
      setLoadingJobs(false);
    }
  };

  // When a completed job is selected from dropdown
  const handleJobSelect = (jobId: string) => {
    setSelectedJobId(jobId);
    if (!jobId) return;

    const job = completedJobs.find(j => j.id === jobId);
    if (!job) return;

    setCustomerName(job.customer_name || '');
    setCustomerSearch(job.customer_name || '');
    setPoNumber(job.po_number || '');
    setSalesPerson(job.salesman_name || '');
    setJobName(job.title || '');
    setJobLocation(job.location || job.address || '');
    setWorkCompletedDate(job.work_completed_at ? job.work_completed_at.split('T')[0] : '');

    // Pre-fill line items from estimated cost
    if (job.estimated_cost && Number(job.estimated_cost) > 0) {
      setLineItems([{
        description: `${job.title || 'Concrete Cutting Services'}`,
        quantity: 1,
        rate: Number(job.estimated_cost),
        amount: Number(job.estimated_cost),
      }]);
    }
  };

  // When a customer is selected from autocomplete
  const handleCustomerSelect = (customer: any) => {
    setCustomerId(customer.id);
    setCustomerName(customer.company_name);
    setCustomerAddress(customer.address || '');
    setCustomerContact(customer.primary_contact_name || '');
    setCustomerPhone(customer.primary_contact_phone || '');
  };

  // Line item management
  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, rate: 0, amount: 0 }]);
  };

  const removeLineItem = (idx: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const updateLineItem = (idx: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    const item = { ...updated[idx] };

    if (field === 'description') {
      item.description = value as string;
    } else {
      const numVal = Number(value) || 0;
      if (field === 'quantity') {
        item.quantity = numVal;
        item.amount = numVal * item.rate;
      } else if (field === 'rate') {
        item.rate = numVal;
        item.amount = item.quantity * numVal;
      } else if (field === 'amount') {
        item.amount = numVal;
      }
    }

    updated[idx] = item;
    setLineItems(updated);
  };

  // Calculations
  const subtotal = lineItems.reduce((sum, li) => sum + (li.amount || 0), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  // Save invoice
  const handleSave = async () => {
    if (!customerName.trim()) {
      setError('Customer name is required');
      return;
    }

    if (lineItems.every(li => !li.description.trim())) {
      setError('At least one line item is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Session expired. Please refresh.');
        return;
      }

      // Build the invoice data to send to API
      const invoiceData: any = {
        customer_name: customerName.trim(),
        customer_email: customerEmail || null,
        billing_address: customerAddress || null,
        invoice_date: invoiceDate,
        due_date: dueDate,
        po_number: poNumber || null,
        payment_terms: parseInt(paymentTerms || '30'),
        notes: notes || null,
        subtotal: subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: total,
        balance_due: total,
        status: 'draft',
      };

      // If a job was selected, create via the existing POST route
      if (selectedJobId) {
        // Use PATCH on a new invoice to include custom line items
        // First create via POST with job ID
        const createRes = await fetch('/api/admin/invoices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ jobOrderId: selectedJobId }),
        });

        if (!createRes.ok) {
          const errData = await createRes.json();
          // If invoice already exists for job, that's OK for 409
          if (createRes.status !== 409) {
            setError(errData.error || 'Failed to create invoice');
            return;
          }
        }

        const createData = await createRes.json();
        const invoiceId = createData.data?.id || createData.invoiceId;

        if (invoiceId) {
          // Now update with our custom data
          const updatePayload: any = {
            ...invoiceData,
            line_items: lineItems.filter(li => li.description.trim()).map((li, idx) => ({
              line_number: idx + 1,
              description: li.description,
              billing_type: 'flat_rate',
              quantity: li.quantity,
              unit: 'each',
              unit_rate: li.rate,
              amount: li.amount,
              job_order_id: selectedJobId,
              taxable: true,
            })),
          };

          const patchRes = await fetch(`/api/admin/invoices/${invoiceId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(updatePayload),
          });

          if (!patchRes.ok) {
            const errData = await patchRes.json();
            setError(errData.error || 'Failed to update invoice details');
            return;
          }
        }
      } else {
        // Create invoice without a job (standalone invoice)
        // We need to use a direct creation approach
        const createRes = await fetch('/api/admin/invoices/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            ...invoiceData,
            customer_id: customerId,
            job_name: jobName,
            job_location: jobLocation,
            work_completed_date: workCompletedDate || null,
            sales_person: salesPerson,
            line_items: lineItems.filter(li => li.description.trim()).map((li, idx) => ({
              line_number: idx + 1,
              description: li.description,
              billing_type: 'flat_rate',
              quantity: li.quantity,
              unit: 'each',
              unit_rate: li.rate,
              amount: li.amount,
              taxable: true,
            })),
          }),
        });

        if (!createRes.ok) {
          const errData = await createRes.json();
          setError(errData.error || 'Failed to create invoice');
          return;
        }
      }

      onCreated();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-3xl shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <FileText size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Create Invoice</h2>
              <p className="text-xs text-purple-200">Generate a new invoice for billing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Section 1: Customer & Job Selection */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
              Customer & Job
            </h3>
            <div className="space-y-3">
              {/* Customer Autocomplete */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Customer</label>
                <CustomerAutocomplete
                  value={customerSearch}
                  onChange={setCustomerSearch}
                  onSelect={handleCustomerSelect}
                  placeholder="Search customers..."
                />
              </div>

              {/* OR select from completed jobs */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">
                  Or Select Completed Job
                </label>
                <select
                  value={selectedJobId}
                  onChange={(e) => handleJobSelect(e.target.value)}
                  className="w-full px-3 py-2.5 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                >
                  <option value="">-- Select a completed job --</option>
                  {loadingJobs ? (
                    <option disabled>Loading...</option>
                  ) : (
                    completedJobs.map(job => (
                      <option key={job.id} value={job.id}>
                        {job.job_number} — {job.customer_name} — {job.title}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Customer detail fields (auto-filled or manual) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="email@example.com"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Billing Address</label>
                  <input
                    type="text"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    placeholder="Street, City, State ZIP"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Invoice Details */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
              Invoice Details
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Payment Terms</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                >
                  <option value="15">Net 15</option>
                  <option value="30">Net 30</option>
                  <option value="45">Net 45</option>
                  <option value="60">Net 60</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">PO #</label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  placeholder="Purchase Order #"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Sales Person</label>
                <input
                  type="text"
                  value={salesPerson}
                  onChange={(e) => setSalesPerson(e.target.value)}
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  placeholder="Sales person name"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Work Completed</label>
                <input
                  type="date"
                  value={workCompletedDate}
                  onChange={(e) => setWorkCompletedDate(e.target.value)}
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Job Name</label>
                <input
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  placeholder="Job / project name"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Job Location</label>
                <input
                  type="text"
                  value={jobLocation}
                  onChange={(e) => setJobLocation(e.target.value)}
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  placeholder="Job location / address"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                <Calculator size={14} className="text-purple-600" />
                Line Items
              </h3>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold transition-colors border border-purple-200"
              >
                <Plus size={14} />
                Add Line Item
              </button>
            </div>

            {/* Line Items Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-0 bg-slate-100 border-b border-slate-200">
                <div className="col-span-5 px-3 py-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</span>
                </div>
                <div className="col-span-2 px-2 py-2 text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Qty</span>
                </div>
                <div className="col-span-2 px-2 py-2 text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rate</span>
                </div>
                <div className="col-span-2 px-2 py-2 text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Amount</span>
                </div>
                <div className="col-span-1 px-2 py-2"></div>
              </div>

              {/* Table Rows */}
              {lineItems.map((item, idx) => (
                <div
                  key={idx}
                  className={`grid grid-cols-12 gap-0 items-center border-b border-slate-100 ${
                    idx % 2 === 1 ? 'bg-slate-50/50' : ''
                  }`}
                >
                  <div className="col-span-5 px-2 py-1">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                      className="w-full px-2 py-1.5 text-gray-900 bg-white border border-slate-200 rounded-lg text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all"
                      placeholder="Description of work"
                    />
                  </div>
                  <div className="col-span-2 px-2 py-1">
                    <input
                      type="number"
                      value={item.quantity || ''}
                      onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                      className="w-full px-2 py-1.5 text-gray-900 bg-white border border-slate-200 rounded-lg text-sm text-right focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all"
                      min="0"
                      step="any"
                    />
                  </div>
                  <div className="col-span-2 px-2 py-1">
                    <input
                      type="number"
                      value={item.rate || ''}
                      onChange={(e) => updateLineItem(idx, 'rate', e.target.value)}
                      className="w-full px-2 py-1.5 text-gray-900 bg-white border border-slate-200 rounded-lg text-sm text-right focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="col-span-2 px-2 py-1">
                    <div className="px-2 py-1.5 text-sm font-semibold text-gray-900 text-right">
                      ${item.amount.toFixed(2)}
                    </div>
                  </div>
                  <div className="col-span-1 px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeLineItem(idx)}
                      disabled={lineItems.length <= 1}
                      className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="flex justify-end mt-4">
              <div className="w-72 space-y-2">
                <div className="flex justify-between text-sm px-3">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold text-gray-900">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Tax</span>
                    <input
                      type="number"
                      value={taxRate || ''}
                      onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                      className="w-16 px-2 py-1 text-gray-900 bg-white border border-slate-200 rounded text-xs text-right focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 transition-all"
                      placeholder="0"
                      min="0"
                      step="0.01"
                    />
                    <span className="text-gray-400 text-xs">%</span>
                  </div>
                  <span className="font-semibold text-gray-900">${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold px-3 pt-2 border-t-2 border-purple-600">
                  <span className="text-purple-700">Total</span>
                  <span className="text-purple-700">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Notes */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
              Notes & Terms
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-gray-900 bg-white border border-slate-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all resize-none"
              placeholder="Payment terms, notes, or special instructions..."
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-lg shadow-purple-500/25"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save as Draft
          </button>
        </div>
      </div>
    </div>
  );
}
