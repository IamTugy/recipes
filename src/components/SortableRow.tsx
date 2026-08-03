import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

interface SortableRowProps {
  id: string
  className?: string
  children: (handleProps: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners }) => ReactNode
}

export default function SortableRow({ id, className, children }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ attributes, listeners })}
    </div>
  )
}
