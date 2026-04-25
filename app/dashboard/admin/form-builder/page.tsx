'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, Plus, Trash2, GripVertical, Eye, Save,
  FileText, CheckSquare, Type, AlignLeft, Calendar,
  Hash, ChevronDown, PenTool, Loader2, Check, X,
  ClipboardList, Settings2,
} from 'lucide-react';

interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'checkbox' | 'signature' | 'select' | 'date' | 'number';
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

interface FormTemplate {
  id: string;
  name: string;
  description: string;
  form_type: 'pre_work' | 'post_work' | 'custom';
  fields: FormField[];
  requires_signature: boolean;
  is_active: boolean;
  created_at: string;
}

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text Input', icon: Type },
  { value: 'textarea', label: 'Text Area', icon: AlignLeft },
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { value: 'signature', label: 'Signature', icon: PenTool },
  { value: 'select', label: 'Dropdown', icon: ChevronDown },
  { value: 'date', label: 'Date', icon: Calendar },
  { value: 'number', label: 'Number', icon: Hash },
];

const FORM_TYPE_OPTIONS = [
  { value: 'pre_work', label: 'Pre-Work', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'post_work', label: 'Post-Work', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'custom', label: 'Custom', color: 'bg-purple-100 text-purple-700 border-purple-200' },
];

export default function FormBuilderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state for create/edit
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<'pre_work' | 'post_work' | 'custom'>('custom');
  const [requiresSignature, setRequiresSignature] = useState(true);
  const [fields, setFields] = useState<FormField[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const user = await getCurrentUser();
    if (!user || !['admin', 'super_admin', 'operations_manager'].includes(user.role)) {
      router.push('/dashboard');
      return;
    }
    fetchTemplates();
  };

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  };

  const fetchTemplates = async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/admin/form-templates?is_active=true', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const result = await res.json();
        setTemplates(result.data || []);
      }
    } catch (err) {
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const showNotif = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormType('custom');
    setRequiresSignature(true);
    setFields([]);
    setSelectedTemplate(null);
    setIsEditing(false);
    setShowPreview(false);
  };

  const loadTemplate = (template: FormTemplate) => {
    setSelectedTemplate(template);
    setFormName(template.name);
    setFormDescription(template.description || '');
    setFormType(template.form_type);
    setRequiresSignature(template.requires_signature);
    setFields(template.fields || []);
    setIsEditing(true);
    setShowPreview(false);
  };

  const addField = () => {
    setFields([
      ...fields,
      {
        id: crypto.randomUUID(),
        type: 'text',
        label: '',
        required: false,
        placeholder: '',
        options: [],
      },
    ]);
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFields(newFields);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const moveField = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= fields.length) return;
    const newFields = [...fields];
    const [moved] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, moved);
    setFields(newFields);
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      moveField(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      showNotif('Template name is required', 'error');
      return;
    }

    const validFields = fields.filter(f => f.label.trim());
    if (validFields.length === 0) {
      showNotif('Add at least one field with a label', 'error');
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;

      const payload = {
        name: formName.trim(),
        description: formDescription.trim(),
        form_type: formType,
        fields: validFields,
        requires_signature: requiresSignature,
      };

      let res;
      if (isEditing && selectedTemplate) {
        res = await fetch(`/api/admin/form-templates/${selectedTemplate.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/form-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        showNotif(isEditing ? 'Template updated!' : 'Template created!', 'success');
        resetForm();
        fetchTemplates();
      } else {
        const data = await res.json();
        showNotif(data.error || 'Failed to save template', 'error');
      }
    } catch (err) {
      showNotif('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const token = await getToken();
    if (!token) return;

    const res = await fetch(`/api/admin/form-templates/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      showNotif('Template archived', 'success');
      if (selectedTemplate?.id === id) resetForm();
      fetchTemplates();
    }
  };

  const groupedTemplates = {
    pre_work: templates.filter(t => t.form_type === 'pre_work'),
    post_work: templates.filter(t => t.form_type === 'post_work'),
    custom: templates.filter(t => t.form_type === 'custom'),
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0618] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-[#0b0618] dark:to-[#0e0720]">
      {/* Header */}
      <div className="bg-white dark:bg-[#0e0720] border-b border-gray-200 dark:border-white/10 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="p-2 bg-gray-100 rounded-xl border border-gray-200 hover:bg-gray-200 transition-all dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10">
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-white/60" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Form Builder</h1>
              <p className="text-sm text-gray-500 dark:text-white/40">Create custom forms for waivers, completion, and more</p>
            </div>
          </div>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`fixed top-20 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium text-center max-w-md ${
          notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sidebar — Template List */}
          <div className="lg:col-span-3 space-y-4">
            <button
              onClick={resetForm}
              className="w-full flex items-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              New Template
            </button>

            {(['pre_work', 'post_work', 'custom'] as const).map(type => {
              const group = groupedTemplates[type];
              if (group.length === 0) return null;
              const typeInfo = FORM_TYPE_OPTIONS.find(o => o.value === type)!;
              return (
                <div key={type} className="space-y-2">
                  <p className="text-xs font-bold text-gray-500 dark:text-white/40 uppercase tracking-wider px-1">
                    {typeInfo.label} ({group.length})
                  </p>
                  {group.map(t => (
                    <button
                      key={t.id}
                      onClick={() => loadTemplate(t)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all text-sm ${
                        selectedTemplate?.id === t.id
                          ? 'bg-purple-50 border-purple-300 text-purple-900 dark:bg-purple-500/15 dark:border-purple-400/30 dark:text-purple-300'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-white/5 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/8'
                      }`}
                    >
                      <p className="font-semibold truncate">{t.name}</p>
                      <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">{(t.fields || []).length} fields</p>
                    </button>
                  ))}
                </div>
              );
            })}

            {templates.length === 0 && (
              <div className="text-center py-8">
                <ClipboardList className="w-10 h-10 text-gray-300 dark:text-white/20 mx-auto mb-2" />
                <p className="text-sm text-gray-500 dark:text-white/40">No templates yet</p>
                <p className="text-xs text-gray-400 dark:text-white/30">Create your first form template</p>
              </div>
            )}
          </div>

          {/* Main Area — Form Builder */}
          <div className="lg:col-span-9 space-y-6">
            {/* Form Meta */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-4 dark:bg-white/5 dark:border-white/10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  {isEditing ? 'Edit Template' : 'New Template'}
                </h2>
                {isEditing && selectedTemplate && (
                  <button
                    onClick={() => handleDelete(selectedTemplate.id)}
                    className="px-3 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition-all dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/15 dark:border-red-400/30"
                  >
                    <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                    Archive
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-1">Template Name *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. Utility Waiver Form"
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-1">Form Type *</label>
                  <div className="flex gap-2">
                    {FORM_TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setFormType(opt.value as typeof formType)}
                        className={`flex-1 px-3 py-3 rounded-xl text-sm font-semibold border transition-all ${
                          formType === opt.value
                            ? opt.color + ' ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#0e0720] ring-current'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-white/5 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-1">Description</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="What is this form for?"
                  rows={2}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all resize-none dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/30"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setRequiresSignature(!requiresSignature)}
                  className={`w-10 h-6 rounded-full relative transition-colors ${
                    requiresSignature ? 'bg-purple-600' : 'bg-gray-300 dark:bg-white/20'
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${
                    requiresSignature ? 'translate-x-4' : ''
                  }`} />
                </div>
                <span className="text-sm text-gray-700 dark:text-white/80">Requires signature</span>
              </label>
            </div>

            {/* Fields */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 space-y-4 dark:bg-white/5 dark:border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Fields ({fields.length})</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-all dark:text-white/60 dark:hover:text-white dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {showPreview ? 'Hide Preview' : 'Preview'}
                  </button>
                  <button
                    onClick={addField}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Field
                  </button>
                </div>
              </div>

              {fields.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-xl dark:bg-white/3">
                  <FileText className="w-10 h-10 text-gray-300 dark:text-white/20 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-white/40">No fields yet</p>
                  <p className="text-xs text-gray-400 dark:text-white/30">Click &quot;Add Field&quot; to start building</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={e => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`bg-gray-50 border border-gray-200 rounded-xl p-4 transition-all dark:bg-white/5 dark:border-white/10 ${
                        dragIndex === index ? 'opacity-50 scale-95' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="cursor-grab active:cursor-grabbing pt-2 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70">
                          <GripVertical className="w-4 h-4" />
                        </div>

                        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3">
                          {/* Type selector */}
                          <div className="md:col-span-3">
                            <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1">Type</label>
                            <select
                              value={field.type}
                              onChange={e => updateField(index, { type: e.target.value as FormField['type'] })}
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 dark:bg-white/5 dark:border-white/10 dark:text-white"
                            >
                              {FIELD_TYPE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Label */}
                          <div className="md:col-span-4">
                            <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1">Label *</label>
                            <input
                              type="text"
                              value={field.label}
                              onChange={e => updateField(index, { label: e.target.value })}
                              placeholder="Field label"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/30"
                            />
                          </div>

                          {/* Placeholder */}
                          <div className="md:col-span-3">
                            <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1">Placeholder</label>
                            <input
                              type="text"
                              value={field.placeholder || ''}
                              onChange={e => updateField(index, { placeholder: e.target.value })}
                              placeholder="Placeholder text"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/30"
                            />
                          </div>

                          {/* Required toggle */}
                          <div className="md:col-span-2 flex items-end pb-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={e => updateField(index, { required: e.target.checked })}
                                className="w-4 h-4 rounded border-gray-300 bg-white text-purple-600 focus:ring-purple-500"
                              />
                              <span className="text-xs text-gray-600 dark:text-white/60">Required</span>
                            </label>
                          </div>
                        </div>

                        <button
                          onClick={() => removeField(index)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all mt-5 dark:text-red-400/60 dark:hover:text-red-400 dark:hover:bg-red-500/15"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Options for select type */}
                      {field.type === 'select' && (
                        <div className="mt-3 ml-7 space-y-2">
                          <label className="block text-xs font-medium text-gray-600 dark:text-white/60">Options (one per line)</label>
                          <textarea
                            value={(field.options || []).join('\n')}
                            onChange={e => updateField(index, { options: e.target.value.split('\n').filter(Boolean) })}
                            placeholder={"Option 1\nOption 2\nOption 3"}
                            rows={3}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 resize-none dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-white/30"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            {showPreview && fields.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4 dark:bg-white/5 dark:border-white/10">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Preview: {formName || 'Untitled Form'}</h3>
                {formDescription && <p className="text-sm text-gray-500 dark:text-white/40">{formDescription}</p>}

                {fields.filter(f => f.label.trim()).map(field => (
                  <div key={field.id}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {field.type === 'text' && (
                      <input type="text" disabled placeholder={field.placeholder} className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50 text-gray-400 dark:bg-white/5 dark:border-white/10 dark:text-white/30" />
                    )}
                    {field.type === 'textarea' && (
                      <textarea disabled placeholder={field.placeholder} rows={3} className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50 text-gray-400 resize-none dark:bg-white/5 dark:border-white/10 dark:text-white/30" />
                    )}
                    {field.type === 'number' && (
                      <input type="number" disabled placeholder={field.placeholder} className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50 text-gray-400 dark:bg-white/5 dark:border-white/10 dark:text-white/30" />
                    )}
                    {field.type === 'date' && (
                      <input type="date" disabled className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50 text-gray-400 dark:bg-white/5 dark:border-white/10 dark:text-white/30" />
                    )}
                    {field.type === 'checkbox' && (
                      <label className="flex items-center gap-2">
                        <input type="checkbox" disabled className="w-4 h-4 rounded" />
                        <span className="text-sm text-gray-500 dark:text-white/40">{field.placeholder || field.label}</span>
                      </label>
                    )}
                    {field.type === 'select' && (
                      <select disabled className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50 text-gray-400 dark:bg-white/5 dark:border-white/10 dark:text-white/30">
                        <option>{field.placeholder || 'Select...'}</option>
                        {(field.options || []).map((opt, i) => <option key={i}>{opt}</option>)}
                      </select>
                    )}
                    {field.type === 'signature' && (
                      <div className="border-2 border-dashed border-gray-300 rounded-xl h-24 flex items-center justify-center bg-gray-50 dark:border-white/10 dark:bg-white/3">
                        <PenTool className="w-5 h-5 text-gray-300 dark:text-white/20 mr-2" />
                        <span className="text-sm text-gray-400 dark:text-white/30">Signature pad</span>
                      </div>
                    )}
                  </div>
                ))}

                {requiresSignature && !fields.some(f => f.type === 'signature') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/80 mb-1">
                      Signature <span className="text-red-500">*</span>
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-xl h-24 flex items-center justify-center bg-gray-50 dark:border-white/10 dark:bg-white/3">
                      <PenTool className="w-5 h-5 text-gray-300 dark:text-white/20 mr-2" />
                      <span className="text-sm text-gray-400 dark:text-white/30">Signature pad (auto-added)</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Save Button */}
            <div className="flex gap-3">
              {isEditing && (
                <button
                  onClick={resetForm}
                  className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-xl font-semibold text-sm border border-gray-200 transition-all dark:bg-white/5 dark:hover:bg-white/10 dark:text-white/80 dark:border-white/10"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : isEditing ? 'Update Template' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
