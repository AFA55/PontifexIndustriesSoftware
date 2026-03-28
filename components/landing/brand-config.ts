export const BRAND = {
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Your Company',
  tagline: 'Custom Software & Automation for Construction',
  shortName: process.env.NEXT_PUBLIC_COMPANY_SHORT_NAME || 'Platform',
  logoInitials: 'PI',
  ctaPrimary: 'Schedule a Demo',
  ctaSecondary: 'See How It Works',
  ctaPrimaryHref: '#demo',
  ctaSecondaryHref: '#features',
  trustLine: 'Custom-built for your operations \u00B7 Field-tested \u00B7 Always evolving',
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'info@example.com',
  industry: 'construction',
  valueProps: [
    'Personalized software tailored to your workflow',
    'Automation that eliminates paperwork and manual processes',
    'Any customization — built around how you actually work',
  ],
} as const;
