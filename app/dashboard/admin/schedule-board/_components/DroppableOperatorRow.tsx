'use client';

import { useDroppable } from '@dnd-kit/core';

interface DroppableOperatorRowProps {
  operatorId: string;
  operatorName: string;
  children: React.ReactNode;
}

export default function DroppableOperatorRow({ operatorId, operatorName, children }: DroppableOperatorRowProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `droppable-${operatorId}`,
    data: { type: 'operator-row', operatorId, operatorName },
  });

  return (
    <div
      ref={setNodeRef}
      className={`transition-all rounded-xl ${
        isOver
          ? 'ring-2 ring-purple-400 ring-offset-2 bg-purple-50/40 shadow-lg scale-[1.005]'
          : ''
      }`}
    >
      {children}
    </div>
  );
}
