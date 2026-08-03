import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core'

interface DragHandleProps {
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  className?: string
}

export default function DragHandle({ attributes, listeners, className }: DragHandleProps) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className={`shrink-0 cursor-grab active:cursor-grabbing text-cream/25 hover:text-cream/50 touch-none ${className ?? ''}`}
      aria-label="Drag to reorder"
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <circle cx="7" cy="5" r="1.4" />
        <circle cx="13" cy="5" r="1.4" />
        <circle cx="7" cy="10" r="1.4" />
        <circle cx="13" cy="10" r="1.4" />
        <circle cx="7" cy="15" r="1.4" />
        <circle cx="13" cy="15" r="1.4" />
      </svg>
    </button>
  )
}
