import { Popover } from '@base-ui/react/popover'

interface FilterInfoPopoverProps {
  text: string
}

// Tap/click-to-open explanation for a filter chip - not hover-only, so it
// works identically on mobile touch and desktop.
export default function FilterInfoPopover({ text }: FilterInfoPopoverProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        onClick={e => e.stopPropagation()}
        aria-label="Filter info"
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-cream/30 hover:text-cream/60 transition-colors"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-9a1 1 0 112 0v4a1 1 0 11-2 0V9zm1-4a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
        </svg>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-50">
          <Popover.Popup className="max-w-56 rounded-lg border border-tint/10 bg-card px-3 py-2 text-xs text-cream/70 shadow-xl">
            {text}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
