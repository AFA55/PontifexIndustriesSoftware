import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pontifexindustries.app',
  appName: 'Pontifex Industries',
  // webDir points to the local fallback build (offline splash).
  // In production the app loads from server.url — no static export needed.
  webDir: 'out',
  server: {
    // Always loads the live Vercel deployment.
    // This means: code changes ship instantly via `git push origin main`
    // with zero App Store re-submission (only native plugin changes need re-review).
    url: 'https://www.pontifexindustries.com',
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
