'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, AlertTriangle, CheckCircle, Clock, Wrench } from 'lucide-react';

interface MaintenanceAlert {
  id: string;
  equipment_id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  due_date: string | null;
  hours_until_due: number | null;
  feet_until_due: number | null;
  is_read: boolean;
  is_acknowledged: boolean;
  is_resolved: boolean;
  created_at: string;
  equipment: {
    id: string;
    name: string;
    brand: string;
    model: string;
    qr_code: string;
  };
}

export default function MaintenanceAlertsPage() {
  const [alerts, setAlerts] = useState<MaintenanceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'unresolved'>('unresolved');

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('status', filter);
      }

      const response = await fetch(`/api/equipment/maintenance-alerts?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        setAlerts(data.alerts || []);
      } else {
        console.error('Error fetching alerts:', data.error);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (alertId: string) => {
    try {
      const response = await fetch('/api/equipment/maintenance-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action: 'mark_read' })
      });

      if (response.ok) {
        fetchAlerts(); // Refresh alerts
      }
    } catch (error) {
      console.error('Error marking alert as read:', error);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      const response = await fetch('/api/equipment/maintenance-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, action: 'acknowledge' })
      });

      if (response.ok) {
        fetchAlerts(); // Refresh alerts
      }
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 border-red-500 text-red-900';
      case 'warning':
        return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      case 'info':
        return 'bg-blue-100 border-blue-500 text-blue-900';
      default:
        return 'bg-gray-100 border-gray-500 text-gray-900';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-6 h-6 text-red-600" />;
      case 'warning':
        return <Clock className="w-6 h-6 text-yellow-600" />;
      case 'info':
        return <Bell className="w-6 h-6 text-blue-600" />;
      default:
        return <Bell className="w-6 h-6 text-gray-600" />;
    }
  };

  const unresolvedCount = alerts.filter(a => !a.is_resolved).length;
  const unreadCount = alerts.filter(a => !a.is_read).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
              <Bell className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-red-600 bg-clip-text text-transparent">
                Maintenance Alerts
              </h1>
              <p className="text-gray-600">Equipment maintenance reminders and notifications</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{unresolvedCount}</div>
              <div className="text-sm text-gray-600">Unresolved Alerts</div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{unreadCount}</div>
              <div className="text-sm text-gray-600">Unread Alerts</div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter('unresolved')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'unresolved'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                : 'bg-white/60 text-gray-700 hover:bg-white'
            }`}
          >
            Unresolved
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'unread'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                : 'bg-white/60 text-gray-700 hover:bg-white'
            }`}
          >
            Unread
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'all'
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg'
                : 'bg-white/60 text-gray-700 hover:bg-white'
            }`}
          >
            All Alerts
          </button>
        </div>

        {/* Alerts List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading alerts...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-white/60 backdrop-blur-sm border border-gray-200 rounded-xl p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">No Alerts</h3>
            <p className="text-gray-600">
              {filter === 'unresolved'
                ? 'All caught up! No unresolved maintenance alerts.'
                : filter === 'unread'
                ? 'No unread alerts at this time.'
                : 'No maintenance alerts found.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`border-l-4 rounded-xl p-6 shadow-sm transition-all ${getSeverityColor(
                  alert.severity
                )} ${!alert.is_read ? 'shadow-lg' : ''}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">{getSeverityIcon(alert.severity)}</div>

                  <div className="flex-1">
                    {/* Title and Equipment */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-bold mb-1">{alert.title}</h3>
                        <div className="flex items-center gap-2 text-sm">
                          <Wrench className="w-4 h-4" />
                          <span className="font-medium">
                            {alert.equipment.brand} {alert.equipment.model}
                          </span>
                          <span className="text-gray-600">({alert.equipment.name})</span>
                        </div>
                      </div>
                      {!alert.is_read && (
                        <span className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                          NEW
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    <p className="text-sm mb-4">{alert.message}</p>

                    {/* Due Information */}
                    {(alert.hours_until_due || alert.feet_until_due || alert.due_date) && (
                      <div className="bg-white/50 rounded-lg p-3 mb-4 text-sm">
                        <div className="font-medium mb-1">Due Information:</div>
                        {alert.hours_until_due !== null && (
                          <div>Hours until due: {alert.hours_until_due.toFixed(1)} hrs</div>
                        )}
                        {alert.feet_until_due !== null && (
                          <div>Feet until due: {alert.feet_until_due.toFixed(0)} ft</div>
                        )}
                        {alert.due_date && (
                          <div>
                            Due date: {new Date(alert.due_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                      {!alert.is_read && (
                        <button
                          onClick={() => handleMarkRead(alert.id)}
                          className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                        >
                          Mark as Read
                        </button>
                      )}
                      {!alert.is_acknowledged && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all text-sm font-medium"
                        >
                          Acknowledge
                        </button>
                      )}
                      {alert.is_acknowledged && !alert.is_resolved && (
                        <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          Acknowledged
                        </span>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="mt-4 text-xs text-gray-600">
                      {new Date(alert.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
