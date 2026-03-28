import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { GoogleMapsProvider } from '@/components/providers/GoogleMapsProvider';
import { BrandingProvider } from '@/lib/branding-context';
import { NotificationProvider } from '@/contexts/NotificationContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import NetworkMonitor from '@/components/NetworkMonitor';

export const metadata: Metadata = {
  title: 'Operations Management Platform',
  description: 'Professional concrete cutting operations management software',
  keywords: [
    'concrete cutting software',
    'construction management software',
    'OSHA compliance',
    'job tracking software',
    'contractor software',
    'concrete contractor management',
    'GPS time tracking',
    'construction profitability tracking',
    'silica exposure tracking',
    'job management system',
  ],
  authors: [{ name: 'Operations Platform' }],
  creator: 'Operations Platform',
  publisher: 'Operations Platform',
  metadataBase: new URL('https://pontifex.com'), // Update with your actual domain
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://pontifex.com', // Update with your actual domain
    title: 'Operations Management Platform',
    description: 'Professional concrete cutting operations management software',
    siteName: 'Operations Management Platform',
    images: [
      {
        url: '/og-image.jpg', // You'll need to create this
        width: 1200,
        height: 630,
        alt: 'Operations Management Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Operations Management Platform',
    description: 'Professional concrete cutting operations management software',
    images: ['/og-image.jpg'], // You'll need to create this
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
  icons: [
    {
      rel: 'icon',
      url: '/favicon.ico',
    },
  ],
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
