'use client';

import { useState, useEffect } from 'react';
import { Clock, MapPin, Loader2 } from 'lucide-react';

interface ClockStatus {
  isClockedIn: boolean;
  clockRecord: any;
}

export default function ClockInOutButton() {
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchClockStatus();

    // Update clock every second
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const fetchClockStatus = async () => {
    try {
      const response = await fetch('/api/time-clock');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Error fetching clock status:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLocation = (): Promise<{ lat: number; lng: number; accuracy: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.warn('Geolocation not supported');
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          console.error('Error getting location:', error);
          resolve(null);
        }
      );
    });
  };

  const handleClockAction = async () => {
    setActionLoading(true);

    try {
      const location = await getLocation();
      const action = status?.isClockedIn ? 'clock-out' : 'clock-in';

      const response = await fetch('/api/time-clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, location })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to perform action');
        return;
      }

      // Refresh status
      await fetchClockStatus();

      alert(data.message);
    } catch (error) {
      console.error('Error performing clock action:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const calculateHoursWorked = () => {
    if (!status?.clockRecord?.clock_in_time) return '0:00';

    const clockIn = new Date(status.clockRecord.clock_in_time);
    const now = new Date();
    const diff = now.getTime() - clockIn.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-xl border-2 border-blue-200 p-6">
      {/* Current Date and Time */}
      <div className="text-center mb-6">
        <div className="text-3xl font-bold text-gray-900 mb-1">
          {formatTime(currentTime)}
        </div>
        <div className="text-sm text-gray-600">
          {formatDate(currentTime)}
        </div>
      </div>

      {/* Status */}
      <div className="mb-6">
        {status?.isClockedIn ? (
          <div className="bg-green-100 border-2 border-green-300 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-bold text-green-900">Clocked In</span>
            </div>
            <div className="text-sm text-green-700">
              Started: {new Date(status.clockRecord.clock_in_time).toLocaleTimeString()}
            </div>
            <div className="text-2xl font-bold text-green-900 mt-2">
              {calculateHoursWorked()}
            </div>
            <div className="text-xs text-green-600">hours worked today</div>
            {status.clockRecord.clock_in_location && (
              <div className="flex items-center justify-center gap-1 mt-2 text-xs text-green-600">
                <MapPin className="w-3 h-3" />
                <span>Location tracked</span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-100 border-2 border-gray-300 rounded-xl p-4 text-center">
            <div className="font-bold text-gray-700 mb-1">Not Clocked In</div>
            <div className="text-sm text-gray-600">
              Click below to start your shift
            </div>
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        onClick={handleClockAction}
        disabled={actionLoading}
        className={`w-full py-4 px-6 rounded-xl font-bold text-white transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed ${
          status?.isClockedIn
            ? 'bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600'
            : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
        }`}
      >
        {actionLoading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Processing...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-5 h-5" />
            <span>{status?.isClockedIn ? 'Clock Out' : 'Clock In'}</span>
          </div>
        )}
      </button>

      {/* Info */}
      <div className="mt-4 text-xs text-center text-gray-500">
        {status?.isClockedIn
          ? 'Clock out when you finish your shift'
          : 'GPS location will be recorded'}
      </div>
    </div>
  );
}
