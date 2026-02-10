import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  handleClassName?: string;
}

export const SortableItem: React.FC<SortableItemProps> = ({ id, children, className = "", handleClassName = "" }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-start ${className}`}>
      <div 
        {...attributes} 
        {...listeners} 
        className={`cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 mt-3 mr-2 flex-shrink-0 touch-none ${handleClassName}`}
      >
        <GripVertical className="w-5 h-5" />
      </div>
      <div className="flex-grow min-w-0">
        {children}
      </div>
    </div>
  );
};
