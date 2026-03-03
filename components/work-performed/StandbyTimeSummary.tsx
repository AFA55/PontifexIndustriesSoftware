'use client';

interface StandbyLog {
  id?: string;
  started_at: string;
  ended_at?: string;
  reason?: string;
}

interface StandbyTimeSummaryProps {
  logs: StandbyLog[];
  totalMinutes: number;
}

export default function StandbyTimeSummary({ logs, totalMinutes }: StandbyTimeSummaryProps) {
  if (logs.length === 0) return null;

  return (
    <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-yellow-900 mb-2">⏱️ Standby Time Recorded</h3>
          <div className="space-y-2">
            {logs.map((log, index) => {
              const start = new Date(log.started_at);
              const end = log.ended_at ? new Date(log.ended_at) : null;
              const durationMinutes = end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;
              const hours = Math.floor(durationMinutes / 60);
              const minutes = durationMinutes % 60;

              return (
                <div key={log.id || index} className="bg-white rounded-lg p-3 border border-yellow-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {start.toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                        {end && (
                          <span className="text-gray-500"> → {end.toLocaleString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}</span>
                        )}
                      </p>
                      {log.reason && (
                        <p className="text-xs text-gray-600 mt-1">Reason: {log.reason}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-yellow-700">
                        {hours > 0 ? `${hours}h ` : ''}{minutes}m
                      </p>
                      <p className="text-xs text-gray-500">Duration</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t-2 border-yellow-300">
            <div className="flex items-center justify-between">
              <p className="font-bold text-yellow-900">Total Standby Time:</p>
              <p className="text-2xl font-bold text-yellow-700">
                {Math.floor(totalMinutes / 60) > 0 ? `${Math.floor(totalMinutes / 60)}h ` : ''}
                {totalMinutes % 60}m
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
