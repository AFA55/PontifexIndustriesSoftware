import Link from 'next/link';
import { PRIVACY_POLICY_FULL } from '@/lib/legal/privacy-policy';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPolicyPage() {
  // Simple markdown-to-sections renderer
  const sections = PRIVACY_POLICY_FULL.trim().split('\n').map((line, i) => {
    if (line.startsWith('# ')) return <h1 key={i} className="text-3xl font-bold text-gray-900 mb-4">{line.replace('# ', '')}</h1>;
    if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-bold text-gray-800 mt-8 mb-3">{line.replace('## ', '')}</h2>;
    if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-semibold text-gray-700 mt-4 mb-2">{line.replace('### ', '')}</h3>;
    if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-gray-600 mb-2">{line.replace(/\*\*/g, '')}</p>;
    if (line.startsWith('- ')) return <li key={i} className="ml-6 text-gray-600 list-disc">{line.replace('- ', '')}</li>;
    if (line.startsWith('| ') && line.includes('---')) return null;
    if (line.startsWith('| ')) {
      const cells = line.split('|').filter(c => c.trim());
      if (cells.some(c => c.includes('---'))) return null;
      return (
        <div key={i} className="grid grid-cols-3 gap-2 text-sm text-gray-600 py-1 border-b border-gray-100">
          {cells.map((cell, j) => <span key={j} className={j === 0 ? 'font-medium' : ''}>{cell.trim()}</span>)}
        </div>
      );
    }
    if (line === '---') return <hr key={i} className="my-6 border-gray-200" />;
    if (line.trim() === '') return <div key={i} className="h-2" />;
    return <p key={i} className="text-gray-600 leading-relaxed mb-2">{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-slate-900 via-purple-900 to-indigo-900 text-white py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <Link href="/" className="inline-flex items-center gap-2 text-purple-200 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-purple-300" />
            <h1 className="text-2xl font-bold">Privacy Policy</h1>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 max-w-4xl py-8">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          {sections}
        </div>
      </div>
    </div>
  );
}
