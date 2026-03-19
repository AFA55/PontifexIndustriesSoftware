'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { JobCardData } from './JobCard';

interface DraggableJobCardProps {
  job: JobCardData;
  canDrag: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export default function DraggableJobCard({ job, canDrag, onClick, children }: DraggableJobCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: job.id,
    disabled: !canDrag,
    data: { type: 'job', job },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto' as number | 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${
        isDragging ? 'ring-2 ring-purple-500 ring-offset-2 rounded-xl shadow-2xl' : ''
      }`}
      onClick={onClick}
    >
      {canDrag && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center z-10 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
      )}
      <div className={canDrag ? 'pl-4' : ''}>
        {children}
      </div>
    </div>
  );
}
