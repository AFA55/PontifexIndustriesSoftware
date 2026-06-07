import './globals.css';
import type { Metadata, Viewport } from 'next';

// viewport-fit=cover lets the WebView extend to the full screen (including under
// the iPhone notch / Dynamic Island / status bar) so that env(safe-area-inset-top)
// returns the correct clearance value in CSS.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};
import { ThemeProvider } from '@/contexts/ThemeContext';
import { BrandingProvider } from '@/lib/branding-context';
import { NotificationProvider } from '@/contexts/NotificationContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import NetworkMonitor from '@/components/NetworkMonitor';
import DevWarningFilter from '@/components/DevWarningFilter';

export const metadata: Metadata = {
  title: {
    default: 'Custom Software & AI Automations | Pontifex Industries',
    template: '%s | Pontifex Industries',
  },
  description:
    'Pontifex Industries builds adaptable custom software and AI automations around how construction, trades, and field-service companies actually work — so you own the digital tools that run your business. Based in Upstate South Carolina.',
  keywords: [
    'custom software development',
    'custom business software',
    'bespoke software development',
    'operations software',
    'workflow software',
    'field service software',
    'construction software',
    'AI workflow automation',
    'agentic automation',
    'custom software developer Upstate SC',
    'custom software development Greenville SC',
  ],
  authors: [{ name: 'Pontifex Industries' }],
  creator: 'Pontifex Industries',
  publisher: 'Pontifex Industries',
  metadataBase: new URL('https://www.pontifexindustries.com'),
  alternates: {
    canonical: 'https://www.pontifexindustries.com',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.pontifexindustries.com',
    title: 'Custom Software & AI Automations | Pontifex Industries',
    description:
      'You already own the tools and skills that get the job done — now own the digital tools too. Adaptable software built around how you work.',
    siteName: 'Pontifex Industries',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Custom Software & AI Automations | Pontifex Industries',
    description:
      'Adaptable custom software and AI automations built around how your company already works.',
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
      <head>
        {/* Blocking pre-paint theme sync to prevent flash-of-wrong-theme (FOUC).
            Only ADDS the `dark` class when an explicit 'dark' preference is saved.
            ThemeContext still owns removal + the 'theme.factory-reset=v1' sentinel on mount. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="transition-colors duration-200">
        <DevWarningFilter />
        <ThemeProvider>
          <BrandingProvider>
            <NotificationProvider>
              <ErrorBoundary>
                <NetworkMonitor />
                {children}
              </ErrorBoundary>
            </NotificationProvider>
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
