'use client';

import {
  Navigation,
  Hero,
  StatsBar,
  ProblemSolution,
  FeatureShowcase,
  HowItWorks,
  ROISection,
  CTASection,
  Footer,
} from '@/components/landing';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <Navigation />
      <Hero />
      <StatsBar />
      <ProblemSolution />
      <FeatureShowcase />
      <HowItWorks />
      <ROISection />
      <CTASection />
      <Footer />
    </div>
  );
}
