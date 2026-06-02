import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pontifexindustries.app',
  appName: 'Pontifex Industries',
  // webDir points to the local fallback build (offline splash).
  // In production the app loads from server.url — no static export needed.
  webDir: 'out',
  // Dark webview background so there's no white flash before the (dark) page paints —
  // matches the splash + LaunchScreen for a seamless launch.
  backgroundColor: '#1e1b4b',
  ios: { backgroundColor: '#1e1b4b' },
  android: { backgroundColor: '#1e1b4b' },
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
      // Shorter hold + a fade-out (instead of a hard snap) → smooth launch into the app.
      launchShowDuration: 1200,
      launchAutoHide: true,
      launchFadeOutDuration: 600,
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
