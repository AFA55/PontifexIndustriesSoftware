import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pontifexindustries.app',
  appName: 'Pontifex Industries',
  // webDir points to the local fallback build (offline splash).
  // In production the app loads from server.url — no static export needed.
  webDir: 'out',
  server: {
    // Always loads the live Vercel deployment.
    // Points directly to /login so the app never shows the marketing landing page.
    // Code changes ship instantly via Vercel — no App Store re-submission needed.
    url: 'https://www.pontifexindustries.com/login',
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1e1b4b',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1e1b4b',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
