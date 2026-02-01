import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { GoogleMapsProvider } from '@/components/providers/GoogleMapsProvider';

export const metadata: Metadata = {
  title: 'Pontifex Industries - Concrete Cutting Management Software',
  description: 'Complete job workflow, real-time profitability tracking, and OSHA compliance for concrete cutting contractors. GPS time tracking, digital signatures, and automated documentation. Setup in 5 minutes.',
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
  authors: [{ name: 'Pontifex Industries' }],
  creator: 'Pontifex Industries',
  publisher: 'Pontifex Industries',
  metadataBase: new URL('https://pontifex.com'), // Update with your actual domain
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://pontifex.com', // Update with your actual domain
    title: 'Pontifex Industries - Concrete Cutting Management Software',
    description: 'Run your concrete cutting business like a Fortune 500 company. Track jobs, profitability, and OSHA compliance in real-time.',
    siteName: 'Pontifex Industries',
    images: [
      {
        url: '/og-image.jpg', // You'll need to create this
        width: 1200,
        height: 630,
        alt: 'Pontifex Industries - Concrete Management Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pontifex Industries - Concrete Cutting Management Software',
    description: 'Complete job workflow, real-time profitability, and OSHA compliance for concrete contractors.',
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
          <GoogleMapsProvider>{children}</GoogleMapsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
