import { supabase } from './supabase';

// Types for weather data
export interface WeatherConditions {
  id?: string;
  location: {
    latitude: number;
    longitude: number;
    city?: string;
    state?: string;
  };
  temperature: number;
  humidity: number;
  wind_speed: number;
  wind_direction?: number;
  precipitation: number;
  conditions: string;
  forecast_data?: WeatherForecast[];
  alerts?: WeatherAlert[];
  fetched_at?: string;
  expires_at?: string;
  source?: string;
}

export interface WeatherForecast {
  time: string;
  temp: number;
  conditions: string;
  precipitation_chance: number;
  wind_speed: number;
  humidity: number;
}

export interface WeatherAlert {
  id: string;
  type: 'warning' | 'watch' | 'advisory';
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  areas: string[];
}

export interface JobWeatherAnalysis {
  job_id: string;
  is_weather_suitable: boolean;
  warnings: string[];
  recommendations: string[];
  current_conditions: WeatherConditions;
  hourly_forecast: WeatherForecast[];
}

// Weather API configuration
const WEATHER_API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY || '';
const WEATHER_API_BASE = 'https://api.openweathermap.org/data/2.5';

// Get weather data for a location
export async function getWeatherData(
  latitude: number,
  longitude: number,
  forceRefresh: boolean = false
): Promise<{ success: boolean; data?: WeatherConditions; error?: string }> {
  try {
    // Check cache first unless force refresh
    if (!forceRefresh) {
      const cached = await getCachedWeatherData(latitude, longitude);
      if (cached.success && cached.data) {
        return cached;
      }
    }

    // Fetch from weather API
    const weatherData = await fetchFromWeatherAPI(latitude, longitude);
    if (!weatherData.success) {
      return weatherData;
    }

    // Cache the result
    await cacheWeatherData(weatherData.data!);

    return weatherData;
  } catch (error: any) {
    console.error('Error getting weather data:', error);
    return { success: false, error: error.message };
  }
}

// Fetch from OpenWeatherMap API
async function fetchFromWeatherAPI(
  latitude: number,
  longitude: number
): Promise<{ success: boolean; data?: WeatherConditions; error?: string }> {
  try {
    if (!WEATHER_API_KEY) {
      throw new Error('Weather API key not configured');
    }

    const [currentResponse, forecastResponse] = await Promise.all([
      fetch(
        `${WEATHER_API_BASE}/weather?lat=${latitude}&lon=${longitude}&appid=${WEATHER_API_KEY}&units=imperial`
      ),
      fetch(
        `${WEATHER_API_BASE}/forecast?lat=${latitude}&lon=${longitude}&appid=${WEATHER_API_KEY}&units=imperial`
      )
    ]);

    if (!currentResponse.ok || !forecastResponse.ok) {
      throw new Error('Weather API request failed');
    }

    const [currentData, forecastData] = await Promise.all([
      currentResponse.json(),
      forecastResponse.json()
    ]);

    // Process current weather
    const weatherConditions: WeatherConditions = {
      location: {
        latitude,
        longitude,
        city: currentData.name,
        state: currentData.sys?.country
      },
      temperature: Math.round(currentData.main.temp),
      humidity: currentData.main.humidity,
      wind_speed: currentData.wind?.speed || 0,
      wind_direction: currentData.wind?.deg,
      precipitation: currentData.rain?.['1h'] || currentData.snow?.['1h'] || 0,
      conditions: currentData.weather[0]?.description || 'Unknown',
      forecast_data: processForecastData(forecastData.list),
      alerts: [], // OpenWeatherMap alerts require separate API call
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour cache
      source: 'openweather'
    };

    return { success: true, data: weatherConditions };
  } catch (error: any) {
    console.error('Error fetching from weather API:', error);
    return { success: false, error: error.message };
  }
}

// Process forecast data from API
function processForecastData(forecastList: any[]): WeatherForecast[] {
  return forecastList.slice(0, 24).map(item => ({
    time: item.dt_txt,
    temp: Math.round(item.main.temp),
    conditions: item.weather[0]?.description || 'Unknown',
    precipitation_chance: Math.round((item.pop || 0) * 100),
    wind_speed: item.wind?.speed || 0,
    humidity: item.main.humidity
  }));
}

// Cache weather data in database
async function cacheWeatherData(weatherData: WeatherConditions) {
  try {
    const { error } = await supabase
      .from('weather_data')
      .upsert({
        location: weatherData.location,
        temperature: weatherData.temperature,
        humidity: weatherData.humidity,
        wind_speed: weatherData.wind_speed,
        wind_direction: weatherData.wind_direction,
        precipitation: weatherData.precipitation,
        conditions: weatherData.conditions,
        forecast_data: weatherData.forecast_data,
        alerts: weatherData.alerts,
        fetched_at: weatherData.fetched_at,
        expires_at: weatherData.expires_at,
        source: weatherData.source
      }, {
        onConflict: 'location'
      });

    if (error) throw error;
  } catch (error: any) {
    console.error('Error caching weather data:', error);
  }
}

// Get cached weather data
async function getCachedWeatherData(
  latitude: number,
  longitude: number
): Promise<{ success: boolean; data?: WeatherConditions; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('weather_data')
      .select('*')
      .filter('location->>latitude', 'eq', latitude.toString())
      .filter('location->>longitude', 'eq', longitude.toString())
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return { success: false, error: 'No cached data found' };
    }

    const weatherConditions: WeatherConditions = {
      id: data.id,
      location: data.location,
      temperature: data.temperature,
      humidity: data.humidity,
      wind_speed: data.wind_speed,
      wind_direction: data.wind_direction,
      precipitation: data.precipitation,
      conditions: data.conditions,
      forecast_data: data.forecast_data,
      alerts: data.alerts,
      fetched_at: data.fetched_at,
      expires_at: data.expires_at,
      source: data.source
    };

    return { success: true, data: weatherConditions };
  } catch (error: any) {
    console.error('Error getting cached weather data:', error);
    return { success: false, error: error.message };
  }
}

// Analyze weather conditions for a job
export async function analyzeJobWeatherConditions(
  jobId: string
): Promise<{ success: boolean; data?: JobWeatherAnalysis; error?: string }> {
  try {
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      throw new Error('Job not found');
    }

    // Get job site coordinates
    let coordinates;
    if (job.site_coordinates) {
      coordinates = job.site_coordinates;
    } else {
      // Geocode the address if coordinates not available
      coordinates = await geocodeAddress(job.address);
      if (!coordinates) {
        throw new Error('Could not determine job location');
      }
    }

    // Get weather data
    const weatherResult = await getWeatherData(
      coordinates.latitude,
      coordinates.longitude
    );

    if (!weatherResult.success || !weatherResult.data) {
      throw new Error('Could not fetch weather data');
    }

    const weather = weatherResult.data;
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Analyze weather conditions based on job requirements
    let isWeatherSuitable = true;

    // Temperature check
    if (job.min_temperature && weather.temperature < job.min_temperature) {
      isWeatherSuitable = false;
      warnings.push(`Temperature too low: ${weather.temperature}°F (minimum: ${job.min_temperature}°F)`);
      recommendations.push('Consider rescheduling for warmer weather');
    }

    // Wind speed check
    if (job.max_wind_speed && weather.wind_speed > job.max_wind_speed) {
      isWeatherSuitable = false;
      warnings.push(`Wind speed too high: ${weather.wind_speed} mph (maximum: ${job.max_wind_speed} mph)`);
      recommendations.push('Wait for calmer weather conditions');
    }

    // Precipitation check
    if (job.no_rain && weather.precipitation > 0) {
      isWeatherSuitable = false;
      warnings.push(`Active precipitation: ${weather.precipitation} inches`);
      recommendations.push('Wait for dry conditions');
    }

    // Check forecast for upcoming precipitation
    if (job.no_rain && weather.forecast_data) {
      const upcomingRain = weather.forecast_data
        .slice(0, 8) // Next 8 hours
        .some(forecast => forecast.precipitation_chance > 50);

      if (upcomingRain) {
        warnings.push('High chance of rain in next 8 hours');
        recommendations.push('Consider starting early or postponing');
      }
    }

    // General conditions analysis
    const conditions = weather.conditions.toLowerCase();
    if (conditions.includes('severe') || conditions.includes('storm')) {
      isWeatherSuitable = false;
      warnings.push('Severe weather conditions present');
      recommendations.push('Do not proceed with outdoor work');
    }

    // Add positive recommendations
    if (isWeatherSuitable) {
      recommendations.push('Weather conditions are suitable for concrete cutting work');
    }

    const analysis: JobWeatherAnalysis = {
      job_id: jobId,
      is_weather_suitable: isWeatherSuitable,
      warnings,
      recommendations,
      current_conditions: weather,
      hourly_forecast: weather.forecast_data?.slice(0, 12) || []
    };

    return { success: true, data: analysis };
  } catch (error: any) {
    console.error('Error analyzing job weather conditions:', error);
    return { success: false, error: error.message };
  }
}

// Geocode address to coordinates
async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    if (!WEATHER_API_KEY) {
      throw new Error('Weather API key not configured');
    }

    const response = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(address)}&limit=1&appid=${WEATHER_API_KEY}`
    );

    if (!response.ok) {
      throw new Error('Geocoding request failed');
    }

    const data = await response.json();
    if (data.length === 0) {
      return null;
    }

    return {
      latitude: data[0].lat,
      longitude: data[0].lon
    };
  } catch (error: any) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

// Get weather alerts for job locations
export async function getWeatherAlertsForJobs(jobIds: string[]) {
  try {
    const alerts: { [jobId: string]: WeatherAlert[] } = {};

    for (const jobId of jobIds) {
      const analysis = await analyzeJobWeatherConditions(jobId);
      if (analysis.success && analysis.data?.current_conditions.alerts) {
        alerts[jobId] = analysis.data.current_conditions.alerts;
      }
    }

    return { success: true, data: alerts };
  } catch (error: any) {
    console.error('Error getting weather alerts for jobs:', error);
    return { success: false, error: error.message };
  }
}

// Check if weather conditions require job rescheduling
export async function checkJobsForWeatherRescheduling() {
  try {
    // Get all jobs scheduled for today and tomorrow that are weather dependent
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('weather_dependent', true)
      .in('status', ['scheduled', 'dispatched'])
      .gte('scheduled_date', new Date().toISOString().split('T')[0])
      .lte('scheduled_date', tomorrow.toISOString().split('T')[0]);

    if (error) throw error;

    const rescheduleRecommendations = [];

    for (const job of jobs || []) {
      const analysis = await analyzeJobWeatherConditions(job.id);
      if (analysis.success && analysis.data && !analysis.data.is_weather_suitable) {
        rescheduleRecommendations.push({
          job_id: job.id,
          job_number: job.job_number,
          title: job.title,
          scheduled_date: job.scheduled_date,
          warnings: analysis.data.warnings,
          recommendations: analysis.data.recommendations
        });
      }
    }

    return { success: true, data: rescheduleRecommendations };
  } catch (error: any) {
    console.error('Error checking jobs for weather rescheduling:', error);
    return { success: false, error: error.message };
  }
}

// Update job with weather requirements
export async function updateJobWeatherRequirements(
  jobId: string,
  requirements: {
    weather_dependent?: boolean;
    min_temperature?: number;
    max_wind_speed?: number;
    no_rain?: boolean;
  }
) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .update(requirements)
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating job weather requirements:', error);
    return { success: false, error: error.message };
  }
}

export default {
  getWeatherData,
  analyzeJobWeatherConditions,
  getWeatherAlertsForJobs,
  checkJobsForWeatherRescheduling,
  updateJobWeatherRequirements
};