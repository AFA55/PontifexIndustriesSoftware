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
  AlertCircle,
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

const inputClass =
  'w-full px-3 py-2 rounded-lg text-sm transition-all ' +
  'bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 ' +
  'focus:border-violet-500 focus:ring-1 focus:ring-violet-200 ' +
  'dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/40 ' +
  'dark:focus:border-violet-400 dark:focus:ring-violet-500/30';
const labelClass = 'block text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider mb-1';

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

  // Auto-calculate due date
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

    if (job.estimated_cost && Number(job.estimated_cost) > 0) {
      setLineItems([{
        description: `${job.title || 'Concrete Cutting Services'}`,
        quantity: 1,
        rate: Number(job.estimated_cost),
        amount: Number(job.estimated_cost),
      }]);
    }
  };

  const handleCustomerSelect = (customer: any) => {
    setCustomerId(customer.id);
    setCustomerName(customer.company_name);
    setCustomerAddress(customer.address || '');
    setCustomerContact(customer.primary_contact_name || '');
    setCustomerPhone(customer.primary_contact_phone || '');
  };

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

  const subtotal = lineItems.reduce((sum, li) => sum + (li.amount || 0), 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleSave = async () => {
    if (!customerName.trim()) {
      setError('Customer name is required.');
      return;
    }

    if (lineItems.every(li => !li.description.trim())) {
      setError('At least one line item with a description is required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Session expired. Please refresh the page.');
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };

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

      const filteredLineItems = lineItems.filter(li => li.description.trim()).map((li, idx) => ({
        line_number: idx + 1,
        description: li.description,
        billing_type: 'flat_rate',
        quantity: li.quantity,
        unit: 'each',
        unit_rate: li.rate,
        amount: li.amount,
        job_order_id: selectedJobId || null,
        taxable: true,
      }));

      if (selectedJobId) {
        // Create from job
        const createRes = await fetch('/api/admin/invoices', {
          method: 'POST',
          headers,
          body: JSON.stringify({ jobOrderId: selectedJobId }),
        });

        const createData = await createRes.json();

        if (!createRes.ok && createRes.status !== 409) {
          setError(createData.error || 'Failed to create invoice.');
          return;
        }

        const invoiceId = createData.data?.id || createData.invoiceId;

        if (invoiceId) {
          // Update with custom data
          const patchRes = await fetch(`/api/admin/invoices/${invoiceId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              ...invoiceData,
              line_items: filteredLineItems,
            }),
          });

          if (!patchRes.ok) {
            const errData = await patchRes.json();
            setError(errData.error || 'Failed to update invoice details.');
            return;
          }
        }
      } else {
        // Create standalone invoice
        const createRes = await fetch('/api/admin/invoices/create', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...invoiceData,
            customer_id: customerId,
            job_name: jobName,
            job_location: jobLocation,
            work_completed_date: workCompletedDate || null,
            sales_person: salesPerson,
            line_items: filteredLineItems,
          }),
        });

        if (!createRes.ok) {
          const errData = await createRes.json();
          setError(errData.error || 'Failed to create invoice.');
          return;
        }
      }

      onCreated();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-8">
      <div className="
        w-full max-w-3xl mx-4 rounded-2xl shadow-2xl ring-1
        bg-white ring-slate-200
        dark:bg-[#120826] dark:ring-white/10
      ">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
              <FileText size={16} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create Invoice</h2>
              <p className="text-xs text-slate-500 dark:text-white/60">Generate a new invoice for billing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="
              p-2 rounded-lg transition-colors
              hover:bg-slate-100 text-slate-500
              dark:hover:bg-white/10 dark:text-white/70
            "
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Error */}
          {error && (
            <div className="
              text-sm px-4 py-3 rounded-xl flex items-center gap-2 ring-1
              bg-rose-50 ring-rose-200 text-rose-700
              dark:bg-rose-500/10 dark:ring-rose-400/30 dark:text-rose-200
            ">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Section 1: Customer & Job Selection */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider mb-3">
              Customer & Job
            </h3>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Customer</label>
                <CustomerAutocomplete
                  value={customerSearch}
                  onChange={setCustomerSearch}
                  onSelect={handleCustomerSelect}
                  placeholder="Search customers..."
                />
              </div>

              <div>
                <label className={labelClass}>Or Select Completed Job</label>
                <select
                  value={selectedJobId}
                  onChange={(e) => handleJobSelect(e.target.value)}
                  className={inputClass}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={inputClass}
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className={labelClass}>Contact Email</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className={inputClass}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Billing Address</label>
                  <input
                    type="text"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className={inputClass}
                    placeholder="Street, City, State ZIP"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Invoice Details */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider mb-3">
              Invoice Details
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Invoice Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Payment Terms</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className={inputClass}
                >
                  <option value="15">Net 15</option>
                  <option value="30">Net 30</option>
                  <option value="45">Net 45</option>
                  <option value="60">Net 60</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>PO #</label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className={inputClass}
                  placeholder="Purchase Order #"
                />
              </div>
              <div>
                <label className={labelClass}>Sales Person</label>
                <input
                  type="text"
                  value={salesPerson}
                  onChange={(e) => setSalesPerson(e.target.value)}
                  className={inputClass}
                  placeholder="Sales person name"
                />
              </div>
              <div>
                <label className={labelClass}>Work Completed</label>
                <input
                  type="date"
                  value={workCompletedDate}
                  onChange={(e) => setWorkCompletedDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className={labelClass}>Job Name</label>
                <input
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  className={inputClass}
                  placeholder="Job / project name"
                />
              </div>
              <div>
                <label className={labelClass}>Job Location</label>
                <input
                  type="text"
                  value={jobLocation}
                  onChange={(e) => setJobLocation(e.target.value)}
                  className={inputClass}
                  placeholder="Job location / address"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider flex items-center gap-2">
                <Calculator size={14} className="text-violet-600 dark:text-violet-300" />
                Line Items
              </h3>
              <button
                type="button"
                onClick={addLineItem}
                className="
                  flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ring-1
                  bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100
                  dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-400/30 dark:hover:bg-violet-500/25
                "
              >
                <Plus size={14} />
                Add Line Item
              </button>
            </div>

            <div className="rounded-xl ring-1 ring-slate-200 dark:ring-white/10 overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-0 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10">
                <div className="col-span-5 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Description</span>
                </div>
                <div className="col-span-2 px-2 py-2 text-right">
                  <span className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Qty</span>
                </div>
                <div className="col-span-2 px-2 py-2 text-right">
                  <span className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Rate</span>
                </div>
                <div className="col-span-2 px-2 py-2 text-right">
                  <span className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider">Amount</span>
                </div>
                <div className="col-span-1 px-2 py-2"></div>
              </div>

              {lineItems.map((item, idx) => (
                <div
                  key={idx}
                  className={`grid grid-cols-12 gap-0 items-center border-b border-slate-100 dark:border-white/5 ${
                    idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-white/[0.02]' : ''
                  }`}
                >
                  <div className="col-span-5 px-2 py-1.5">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                      className="
                        w-full px-2 py-1.5 rounded-lg text-sm transition-all
                        bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400
                        focus:border-violet-500 focus:ring-1 focus:ring-violet-200
                        dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/40
                        dark:focus:border-violet-400 dark:focus:ring-violet-500/30
                      "
                      placeholder="Description of work"
                    />
                  </div>
                  <div className="col-span-2 px-2 py-1.5">
                    <input
                      type="number"
                      value={item.quantity || ''}
                      onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                      className="
                        w-full px-2 py-1.5 rounded-lg text-sm text-right transition-all tabular-nums
                        bg-white border border-slate-200 text-slate-900
                        focus:border-violet-500 focus:ring-1 focus:ring-violet-200
                        dark:bg-white/5 dark:border-white/10 dark:text-white
                        dark:focus:border-violet-400 dark:focus:ring-violet-500/30
                      "
                      min="0"
                      step="any"
                    />
                  </div>
                  <div className="col-span-2 px-2 py-1.5">
                    <input
                      type="number"
                      value={item.rate || ''}
                      onChange={(e) => updateLineItem(idx, 'rate', e.target.value)}
                      className="
                        w-full px-2 py-1.5 rounded-lg text-sm text-right transition-all tabular-nums
                        bg-white border border-slate-200 text-slate-900
                        focus:border-violet-500 focus:ring-1 focus:ring-violet-200
                        dark:bg-white/5 dark:border-white/10 dark:text-white
                        dark:focus:border-violet-400 dark:focus:ring-violet-500/30
                      "
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="col-span-2 px-2 py-1.5">
                    <div className="px-2 py-1.5 text-sm font-semibold text-slate-900 dark:text-white text-right tabular-nums">
                      ${item.amount.toFixed(2)}
                    </div>
                  </div>
                  <div className="col-span-1 px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeLineItem(idx)}
                      disabled={lineItems.length <= 1}
                      className="
                        p-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                        text-slate-400 hover:text-rose-500 hover:bg-rose-50
                        dark:text-white/40 dark:hover:text-rose-300 dark:hover:bg-rose-500/15
                      "
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
                  <span className="text-slate-500 dark:text-white/60">Subtotal</span>
                  <span className="font-semibold text-slate-900 dark:text-white tabular-nums">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm px-3">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 dark:text-white/60">Tax</span>
                    <input
                      type="number"
                      value={taxRate || ''}
                      onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                      className="
                        w-16 px-2 py-1 rounded text-xs text-right transition-all tabular-nums
                        bg-white border border-slate-200 text-slate-900
                        focus:border-violet-500 focus:ring-1 focus:ring-violet-200
                        dark:bg-white/5 dark:border-white/10 dark:text-white
                        dark:focus:border-violet-400 dark:focus:ring-violet-500/30
                      "
                      placeholder="0"
                      min="0"
                      step="0.01"
                    />
                    <span className="text-slate-400 dark:text-white/40 text-xs">%</span>
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-white tabular-nums">${taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold px-3 pt-2 border-t-2 border-violet-600 dark:border-violet-400">
                  <span className="text-slate-900 dark:text-white">Total</span>
                  <span className="tabular-nums bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Notes */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-white/60 uppercase tracking-wider mb-3">
              Notes & Terms
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="
                w-full px-3 py-2 rounded-lg text-sm transition-all resize-none
                bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400
                focus:border-violet-500 focus:ring-1 focus:ring-violet-200
                dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder:text-white/40
                dark:focus:border-violet-400 dark:focus:ring-violet-500/30
              "
              placeholder="Payment terms, notes, or special instructions..."
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={saving}
            className="
              px-4 py-2 rounded-lg text-sm font-semibold transition-colors
              text-slate-600 hover:text-slate-900 hover:bg-slate-100
              dark:text-white/70 dark:hover:text-white dark:hover:bg-white/10
            "
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="
              flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50
              bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white
              shadow-md shadow-violet-500/20 hover:shadow-lg hover:shadow-violet-500/30
            "
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
