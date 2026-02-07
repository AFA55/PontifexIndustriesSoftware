/**
 * Drive Time Calculator
 * Calculates shop arrival times based on jobsite arrival, drive time, and buffer
 */

export interface DriveTimeCalculation {
  jobsiteArrival: Date;
  driveTimeHours: number;
  bufferHours: number;
  shopArrival: Date;
  totalTimeNeeded: number;
}

/**
 * Calculate shop arrival time based on jobsite arrival and drive time
 *
 * Example: If jobsite arrival is 8:00 AM, drive time is 4 hours, and buffer is 1 hour,
 * then shop arrival should be 3:00 AM (8am - 4hrs - 1hr = 3am)
 *
 * @param jobsiteArrivalTime - Time to arrive at jobsite (e.g., "08:00")
 * @param driveTimeHours - Estimated drive time in hours
 * @param bufferHours - Buffer time before arrival (0, 0.5, 1, 1.5, 2)
 * @returns Calculation details including shop arrival time
 */
export function calculateShopArrival(
  jobsiteArrivalTime: string,
  driveTimeHours: number,
  bufferHours: number = 0
): DriveTimeCalculation {
  // Parse jobsite arrival time (format: "HH:MM" or "HH:MM AM/PM")
  const jobsiteArrival = parseTimeString(jobsiteArrivalTime);

  // Calculate total time needed (drive + buffer)
  const totalTimeNeeded = driveTimeHours + bufferHours;

  // Subtract from jobsite arrival to get shop arrival
  const shopArrival = new Date(jobsiteArrival);
  shopArrival.setHours(shopArrival.getHours() - Math.floor(totalTimeNeeded));
  shopArrival.setMinutes(shopArrival.getMinutes() - Math.round((totalTimeNeeded % 1) * 60));

  return {
    jobsiteArrival,
    driveTimeHours,
    bufferHours,
    shopArrival,
    totalTimeNeeded,
  };
}

/**
 * Parse time string to Date object
 * Supports formats: "08:00", "8:00 AM", "13:30", etc.
 */
export function parseTimeString(timeString: string): Date {
  const now = new Date();
  const cleanTime = timeString.trim().toUpperCase();

  // Check for AM/PM
  const hasAMPM = cleanTime.includes('AM') || cleanTime.includes('PM');
  const isPM = cleanTime.includes('PM');

  // Extract hours and minutes
  const timeOnly = cleanTime.replace(/\s*(AM|PM)/g, '');
  const [hoursStr, minutesStr] = timeOnly.split(':');

  let hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr || '0', 10);

  // Convert to 24-hour format if needed
  if (hasAMPM) {
    if (isPM && hours !== 12) {
      hours += 12;
    } else if (!isPM && hours === 12) {
      hours = 0;
    }
  }

  now.setHours(hours);
  now.setMinutes(minutes);
  now.setSeconds(0);
  now.setMilliseconds(0);

  return now;
}

/**
 * Format Date object to readable time string
 */
export function formatTimeString(date: Date, use12Hour: boolean = true): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();

  if (use12Hour) {
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${period}`;
  } else {
    const displayHours = hours.toString().padStart(2, '0');
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes}`;
  }
}

/**
 * Calculate drive time between two addresses using Google Maps Distance Matrix
 *
 * @param origin - Starting address
 * @param destination - Destination address
 * @returns Drive time in hours
 */
export async function calculateDriveTime(
  origin: string,
  destination: string
): Promise<{ hours: number; minutes: number; distance: string } | null> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
      console.warn('⚠️ Google Maps API key not configured. Drive time calculation disabled.');
      return null;
    }

    // Call Google Distance Matrix API
    const response = await fetch(
      `/api/google-maps/distance?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`
    );

    if (!response.ok) {
      throw new Error('Failed to calculate drive time');
    }

    const data = await response.json();

    if (data.error) {
      console.error('Drive time calculation error:', data.error);
      return null;
    }

    return {
      hours: data.hours,
      minutes: data.minutes,
      distance: data.distance,
    };
  } catch (error) {
    console.error('Error calculating drive time:', error);
    return null;
  }
}

/**
 * Get buffer options for UI
 */
export const BUFFER_OPTIONS = [
  { label: 'No Buffer', value: 0 },
  { label: '30 Minutes Before', value: 0.5 },
  { label: '1 Hour Before', value: 1 },
  { label: '1.5 Hours Before', value: 1.5 },
  { label: '2 Hours Before', value: 2 },
];

/**
 * Example usage:
 *
 * const result = calculateShopArrival("08:00 AM", 4, 1);
 * console.log(formatTimeString(result.shopArrival));
 * // Output: "3:00 AM"
 */
