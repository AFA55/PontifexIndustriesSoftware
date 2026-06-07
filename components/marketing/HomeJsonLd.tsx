/**
 * Server component: structured data for the marketing homepage.
 * Emits Organization, ProfessionalService (custom software dev), SoftwareApplication,
 * and FAQPage JSON-LD so search + AI engines understand the brand and answers.
 */
const SITE = 'https://www.pontifexindustries.com';

export default function HomeJsonLd({ faqs }: { faqs: { q: string; a: string }[] }) {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organization`,
        name: 'Pontifex Industries',
        url: SITE,
        logo: `${SITE}/icon-512.png`,
        description:
          'Pontifex Industries builds adaptable, custom software and AI automations designed around how construction, trades, and field-service companies actually work.',
        email: 'pontifexindustries@gmail.com',
        areaServed: [
          'Greenville SC',
          'Spartanburg SC',
          'Anderson SC',
          'Greer SC',
          'Mauldin SC',
          'Easley SC',
          'Upstate South Carolina',
          'United States',
        ],
        sameAs: [] as string[],
      },
      {
        '@type': 'ProfessionalService',
        '@id': `${SITE}/#service`,
        name: 'Pontifex Industries — Custom Software & Operations Platforms',
        url: SITE,
        image: `${SITE}/icon-512.png`,
        description:
          'Custom operations software, field/crew apps, scheduling & dispatch, GPS timecards, and agentic automations built around your existing workflow.',
        serviceType: 'Custom Software Development',
        provider: { '@id': `${SITE}/#organization` },
        areaServed: 'Upstate South Carolina',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE}/#software`,
        name: 'Pontifex Industries Operations Platform',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, iOS',
        url: SITE,
        offers: { '@type': 'AggregateOffer', availability: 'https://schema.org/InStock' },
        description:
          'An end-to-end operations platform — schedule board, GPS/NFC timecards, field execution, equipment tracking, invoicing, and a customer portal — built around field-service operations.',
        publisher: { '@id': `${SITE}/#organization` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE}/#faq`,
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Server-rendered: safe, static content (no user input).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
