'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { JobCardData } from './JobCard';

interface DndBoardWrapperProps {
  children: React.ReactNode;
  canDrag: boolean;
  onReorder: (jobId: string, newOperatorId: string | null, sourceOperatorId: string | null) => Promise<boolean>;
}

export default function DndBoardWrapper({ children, canDrag, onReorder }: DndBoardWrapperProps) {
  const [activeJob, setActiveJob] = useState<JobCardData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // require 8px movement before drag starts (prevents accidental drags on click)
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (!canDrag) return;
    const { active } = event;
    const job = active.data?.current?.job as JobCardData | undefined;
    if (job) {
      setActiveJob(job);
    }
  }, [canDrag]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveJob(null);
    if (!canDrag) return;

    const { active, over } = event;
    if (!over) return;

    const draggedJob = active.data?.current?.job as JobCardData | undefined;
    if (!draggedJob) return;

    const overData = over.data?.current;
    if (!overData) return;

    // Determine source and target
    let targetOperatorId: string | null = null;

    if (overData.type === 'operator-row') {
      targetOperatorId = overData.operatorId || null;
    } else if (overData.type === 'job') {
      // Dropped on another job — find its parent operator row
      // The parent info will be resolved by the page's onReorder handler
      // For now, we'll use the over element's droppable container
      targetOperatorId = null; // Will be resolved via closest droppable
    }

    // Find the source operator from the active element
    const sourceContainer = active.data?.current?.sortable?.containerId;
    const sourceOperatorId = sourceContainer
      ? sourceContainer.replace('droppable-', '')
      : null;

    // Call reorder — parent handles optimistic updates
    await onReorder(draggedJob.id, targetOperatorId, sourceOperatorId);
  }, [canDrag, onReorder]);

  if (!canDrag) {
    return <>{children}</>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay>
        {activeJob && (
          <div className="bg-white rounded-xl shadow-2xl border-2 border-purple-400 p-3 max-w-xs opacity-90 rotate-2">
            <p className="font-bold text-gray-900 text-sm">{activeJob.customer_name}</p>
            <p className="text-xs text-purple-600 font-semibold">{activeJob.job_type?.split(',')[0]?.trim()}</p>
            <p className="text-[10px] text-gray-500 mt-1">{activeJob.job_number}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
