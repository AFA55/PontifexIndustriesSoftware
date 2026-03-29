'use client';

import {
  Navigation,
  Hero,
  FeatureShowcase,
  ComparisonTable,
  HowItWorks,
  Footer,
} from '@/components/landing';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <Navigation />
      <Hero />
      <FeatureShowcase />
      <ComparisonTable />
      <HowItWorks />
      <Footer />
    </div>
  );
}
