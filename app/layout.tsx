import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { GoogleMapsProvider } from '@/components/providers/GoogleMapsProvider';
import { BrandingProvider } from '@/lib/branding-context';
import { NotificationProvider } from '@/contexts/NotificationContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import NetworkMonitor from '@/components/NetworkMonitor';

export const metadata: Metadata = {
  title: 'Pontifex Industries - Field Operations Platform',
  description: 'Complete field operations platform for concrete cutting and construction crews. GPS time tracking, digital signatures, job scheduling, and automated documentation. Setup in 5 minutes.',
  keywords: [
    'concrete cutting software',
    'field operations platform',
    'construction management software',
    'OSHA compliance',
    'job tracking software',
    'contractor software',
    'GPS time tracking',
    'construction profitability tracking',
    'job management system',
    'crew management',
  ],
  authors: [{ name: 'Pontifex Industries' }],
  creator: 'Pontifex Industries',
  publisher: 'Pontifex Industries',
  metadataBase: new URL('https://www.pontifexindustries.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.pontifexindustries.com',
    title: 'Pontifex Industries - Field Operations Platform',
    description: 'Run your field crew like a Fortune 500 company. Track jobs, profitability, and OSHA compliance in real-time.',
    siteName: 'Pontifex Industries',
    images: [
      {
        url: '/icon-512.png',
        width: 512,
        height: 512,
        alt: 'Pontifex Industries - Field Operations Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pontifex Industries - Field Operations Platform',
    description: 'Complete field operations platform for concrete cutting and construction crews.',
    images: ['/icon-512.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/favicon.svg', color: '#7c3aed' },
    ],
  },
  manifest: '/manifest.json',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className="transition-colors duration-200">
        <ThemeProvider>
          <BrandingProvider>
            <NotificationProvider>
              <ErrorBoundary>
                <NetworkMonitor />
                <GoogleMapsProvider>{children}</GoogleMapsProvider>
              </ErrorBoundary>
            </NotificationProvider>
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
