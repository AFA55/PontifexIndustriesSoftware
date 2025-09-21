'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  MapPin,
  Clock,
  Thermometer,
  Wind,
  CloudRain,
  AlertTriangle,
  Users,
  Wrench,
  MessageSquare,
  TrendingUp,
  Battery,
  Signal,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { getRealtimeDashboardData, RealtimeJobTracker } from '@/lib/realtime-service';
import { getWeatherData } from '@/lib/weather-service';
import { getNotificationHistory } from '@/lib/notifications-service';

interface DashboardMetrics {
  activeJobs: number;
  crewsOnSite: number;
  equipmentInUse: number;
  weatherAlerts: number;
  pendingNotifications: number;
}

interface CrewLocation {
  id: string;
  name: string;
  status: 'traveling' | 'on_site' | 'break' | 'offline';
  location?: { latitude: number; longitude: number };
  job?: { id: string; title: string; address: string };
  lastUpdate: string;
}

interface EquipmentStatus {
  id: string;
  name: string;
  type: string;
  status: 'idle' | 'in_use' | 'maintenance' | 'offline';
  location?: { latitude: number; longitude: number };
  operator?: { id: string; name: string };
  fuelLevel?: number;
  lastUpdate: string;
}

export default function RealtimeDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    activeJobs: 0,
    crewsOnSite: 0,
    equipmentInUse: 0,
    weatherAlerts: 0,
    pendingNotifications: 0
  });

  const [crewLocations, setCrewLocations] = useState<CrewLocation[]>([]);
  const [equipmentStatuses, setEquipmentStatuses] = useState<EquipmentStatus[]>([]);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [realtimeTracker] = useState(() => new RealtimeJobTracker());

  useEffect(() => {
    loadDashboardData();
    setupRealtimeSubscriptions();

    // Refresh data every 30 seconds
    const interval = setInterval(() => {
      loadDashboardData();
      setLastUpdate(new Date());
    }, 30000);

    return () => {
      clearInterval(interval);
      realtimeTracker.unsubscribeAll();
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const [dashboardResult, weatherResult, notificationsResult] = await Promise.all([
        getRealtimeDashboardData(),
        getWeatherData(40.7128, -74.0060), // Default to NYC, should get from company settings
        getNotificationHistory('crew_member', 'all', 10)
      ]);

      if (dashboardResult.success) {
        const data = dashboardResult.data;

        // Calculate metrics
        const activeJobs = data.activeJobs.length;
        const crewsOnSite = data.crewMembers.filter(crew => crew.current_status === 'on_site').length;
        const equipmentInUse = data.equipment.filter(eq => eq.status === 'In Use').length;

        setMetrics({
          activeJobs,
          crewsOnSite,
          equipmentInUse,
          weatherAlerts: 0, // TODO: Implement weather alerts
          pendingNotifications: 0 // TODO: Count pending notifications
        });

        // Process crew locations
        const crewData = data.crewMembers.map(crew => ({
          id: crew.id,
          name: crew.name,
          status: crew.current_status || 'offline',
          location: crew.current_location,
          lastUpdate: crew.last_location_update || new Date().toISOString()
        }));
        setCrewLocations(crewData);

        // Process equipment statuses
        const equipmentData = data.equipment.map(eq => ({
          id: eq.id,
          name: eq.name,
          type: eq.type,
          status: eq.status === 'In Use' ? 'in_use' :
                  eq.status === 'Maintenance' ? 'maintenance' :
                  eq.status === 'Offline' ? 'offline' : 'idle',
          location: eq.current_location,
          operator: eq.current_operator ? { id: eq.current_operator, name: 'Unknown' } : undefined,
          lastUpdate: eq.last_status_update || new Date().toISOString()
        }));
        setEquipmentStatuses(equipmentData);
      }

      if (weatherResult.success) {
        setWeatherData(weatherResult.data);
      }

      if (notificationsResult.success) {
        setRecentNotifications(notificationsResult.data.slice(0, 5));
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscriptions = () => {
    // Subscribe to job updates
    realtimeTracker.subscribeToJobUpdates((update) => {
      console.log('Job status update:', update);
      loadDashboardData(); // Refresh data when jobs change
    });

    // Subscribe to crew location updates
    realtimeTracker.subscribeToCrewLocations((update) => {
      console.log('Crew location update:', update);
      setCrewLocations(prev =>
        prev.map(crew =>
          crew.id === update.crew_member_id
            ? { ...crew, location: update.location, status: update.activity_status, lastUpdate: update.timestamp }
            : crew
        )
      );
    });

    // Subscribe to equipment status updates
    realtimeTracker.subscribeToEquipmentStatus((update) => {
      console.log('Equipment status update:', update);
      setEquipmentStatuses(prev =>
        prev.map(eq =>
          eq.id === update.equipment_id
            ? { ...eq, status: update.status, location: update.location, lastUpdate: update.timestamp }
            : eq
        )
      );
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_site':
      case 'in_use':
        return 'bg-green-500';
      case 'traveling':
        return 'bg-blue-500';
      case 'break':
        return 'bg-yellow-500';
      case 'maintenance':
        return 'bg-orange-500';
      case 'offline':
        return 'bg-gray-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'on_site': return 'On Site';
      case 'in_use': return 'In Use';
      case 'traveling': return 'Traveling';
      case 'break': return 'On Break';
      case 'maintenance': return 'Maintenance';
      case 'offline': return 'Offline';
      case 'idle': return 'Idle';
      default: return status;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return time.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-blue-200">Loading real-time data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950">
      {/* Header */}
      <div className="backdrop-blur-xl bg-white/5 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Activity className="w-6 h-6 text-cyan-400" />
                  Real-Time Operations
                </h1>
                <p className="text-blue-200/70 text-sm">
                  Last updated: {lastUpdate.toLocaleTimeString()}
                </p>
              </div>
            </div>

            <button
              onClick={loadDashboardData}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors border border-white/10"
            >
              <RefreshCw className="w-4 h-4 text-white" />
              <span className="text-white text-sm">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Active Jobs', value: metrics.activeJobs, icon: Activity, color: 'from-blue-500 to-cyan-500' },
            { label: 'Crews On Site', value: metrics.crewsOnSite, icon: Users, color: 'from-green-500 to-emerald-500' },
            { label: 'Equipment In Use', value: metrics.equipmentInUse, icon: Wrench, color: 'from-purple-500 to-indigo-500' },
            { label: 'Weather Alerts', value: metrics.weatherAlerts, icon: AlertTriangle, color: 'from-yellow-500 to-orange-500' },
            { label: 'Notifications', value: metrics.pendingNotifications, icon: MessageSquare, color: 'from-pink-500 to-rose-500' }
          ].map((metric, index) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4"
            >
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${metric.color} flex items-center justify-center mb-3`}>
                <metric.icon className="w-5 h-5 text-white" />
              </div>
              <div className="text-2xl font-bold text-white">{metric.value}</div>
              <div className="text-xs text-blue-200/70">{metric.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Crew Locations */}
          <div className="lg:col-span-1">
            <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4 h-fit">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                Crew Status
              </h2>
              <div className="space-y-3">
                <AnimatePresence>
                  {crewLocations.slice(0, 8).map((crew) => (
                    <motion.div
                      key={crew.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(crew.status)} animate-pulse`} />
                        <div>
                          <div className="text-white font-medium text-sm">{crew.name}</div>
                          <div className="text-blue-200/60 text-xs">{getStatusText(crew.status)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        {crew.location && (
                          <MapPin className="w-3 h-3 text-cyan-400 mb-1" />
                        )}
                        <div className="text-xs text-blue-200/60">
                          {formatTimeAgo(crew.lastUpdate)}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Weather & Equipment */}
          <div className="lg:col-span-2 space-y-6">
            {/* Weather */}
            {weatherData && (
              <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Thermometer className="w-5 h-5 text-cyan-400" />
                  Current Weather
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{weatherData.temperature}°F</div>
                    <div className="text-sm text-blue-200/70">Temperature</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-white flex items-center justify-center gap-1">
                      <Wind className="w-4 h-4" />
                      {weatherData.wind_speed}
                    </div>
                    <div className="text-sm text-blue-200/70">Wind (mph)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-white">{weatherData.humidity}%</div>
                    <div className="text-sm text-blue-200/70">Humidity</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-white flex items-center justify-center gap-1">
                      <CloudRain className="w-4 h-4" />
                      {weatherData.precipitation}"
                    </div>
                    <div className="text-sm text-blue-200/70">Precipitation</div>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <div className="text-cyan-400 font-medium">{weatherData.conditions}</div>
                  <div className="text-xs text-blue-200/60 mt-1">
                    {weatherData.location?.city}, {weatherData.location?.state}
                  </div>
                </div>
              </div>
            )}

            {/* Equipment Status */}
            <div className="backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-cyan-400" />
                Equipment Status
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <AnimatePresence>
                  {equipmentStatuses.slice(0, 6).map((equipment) => (
                    <motion.div
                      key={equipment.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(equipment.status)}`} />
                          <span className="text-white font-medium text-sm">{equipment.name}</span>
                        </div>
                        {equipment.fuelLevel && (
                          <div className="flex items-center gap-1">
                            <Battery className="w-3 h-3 text-cyan-400" />
                            <span className="text-xs text-blue-200/60">{equipment.fuelLevel}%</span>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-blue-200/60 mb-1">{equipment.type}</div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-cyan-400">{getStatusText(equipment.status)}</span>
                        <span className="text-xs text-blue-200/60">
                          {formatTimeAgo(equipment.lastUpdate)}
                        </span>
                      </div>
                      {equipment.operator && (
                        <div className="text-xs text-blue-200/60 mt-1">
                          Operator: {equipment.operator.name}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-6 backdrop-blur-xl bg-white/5 rounded-xl border border-white/10 p-4">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Recent Activity
          </h2>
          <div className="space-y-3">
            {recentNotifications.map((notification, index) => (
              <div
                key={notification.id || index}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/5"
              >
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <div className="flex-1">
                  <div className="text-white text-sm">{notification.message || 'System activity'}</div>
                  <div className="text-blue-200/60 text-xs">
                    {formatTimeAgo(notification.created_at || new Date().toISOString())}
                  </div>
                </div>
                {notification.status && (
                  <div className={`px-2 py-1 rounded text-xs ${
                    notification.status === 'sent' ? 'bg-green-500/10 text-green-400' :
                    notification.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                    'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    {notification.status}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}