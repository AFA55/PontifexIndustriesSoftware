'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ActionsRedirect() {
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    // Redirect to main job schedule page - actions not needed
    router.replace(`/dashboard/job-schedule/${params.id}`);
  }, [params.id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"></div>
    </div>
  );
}
