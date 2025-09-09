import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pontifex Industry Software',
  description: 'Professional concrete cutting management system for contractors.',
  icons: [
    {
      rel: 'icon',
      url: '/favicon.ico',
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>{children}</body>
    </html>
  );
}
