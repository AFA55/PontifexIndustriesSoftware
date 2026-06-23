/**
 * CTAButton — bulletproof email CTA using react-email's <Button>.
 *
 * Explicit inline colors + block display ensure the button renders in all
 * major clients (Gmail, Apple Mail, Outlook) even when external CSS is stripped.
 */

import React from 'react';
import { Button } from '@react-email/components';

interface CTAButtonProps {
  href: string;
  label: string;
  color: string;
}

export default function CTAButton({ href, label, color }: CTAButtonProps) {
  return (
    <Button
      href={href}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'center',
        padding: '16px 32px',
        backgroundColor: color,
        color: '#ffffff',
        textDecoration: 'none',
        borderRadius: '6px',
        fontSize: '16px',
        fontWeight: '600',
        lineHeight: '1.2',
        boxSizing: 'border-box',
      }}
    >
      {label}
    </Button>
  );
}
