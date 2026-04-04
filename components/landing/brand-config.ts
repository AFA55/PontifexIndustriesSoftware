export const BRAND = {
  companyName: 'Pontifex Platform',
  tagline: 'Operations Management for Concrete Cutting',
  shortName: 'Pontifex',
  logoInitials: 'P',
  ctaPrimary: 'Enter Company Code',
  ctaSecondary: 'Explore Features',
  ctaPrimaryHref: '/company',
  ctaSecondaryHref: '#features',
  trustLine: 'Built for concrete cutting operations \u00B7 Field-tested \u00B7 Always evolving',
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'info@pontifexplatform.com',
  industry: 'concrete cutting',
  valueProps: [
    'Multi-tenant white-label platform — each company gets their own branded experience',
    'Complete dispatch-to-invoice workflow built specifically for concrete cutting',
    'Real-time field visibility with GPS tracking, photo capture, and digital signatures',
  ],
} as const;
