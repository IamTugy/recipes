import type { ReactNode } from 'react'
import { Select } from '@base-ui/react/select'

export interface AppSelectOption<T extends string> {
  value: T
  label: ReactNode
}

interface AppSelectProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: AppSelectOption<T>[]
  /** className applied to the trigger button - should match the visual style of the native <select> it replaces */
  triggerClassName: string
  /** extra classes merged onto the popup listbox, e.g. to cap height for long lists */
  popupClassName?: string
  'aria-label'?: string
}

function ChevronDownIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

/**
 * Base UI Select wired up to look like the app's native <select> inputs.
 * Keeps the same controlled value / onValueChange contract as a plain string state setter.
 */
export default function AppSelect<T extends string>({
  value,
  onValueChange,
  options,
  triggerClassName,
  popupClassName = '',
  'aria-label': ariaLabel,
}: AppSelectProps<T>) {
  return (
    <Select.Root value={value} onValueChange={next => onValueChange(next as T)}>
      <Select.Trigger aria-label={ariaLabel} className={`${triggerClassName} flex items-center justify-between gap-2`}>
        {/* Base UI's Select.Value shows the raw `value` (not its label) unless
            given a children render function - without this every AppSelect
            displayed e.g. "rating" instead of "Top rated". */}
        <Select.Value>{(value: T) => options.find(opt => opt.value === value)?.label ?? value}</Select.Value>
        <Select.Icon>
          <ChevronDownIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} className="z-50">
          <Select.Popup
            className={`bg-card border border-tint/10 rounded-lg shadow-xl py-1 outline-none max-h-72 overflow-auto ${popupClassName}`}
          >
            {options.map(opt => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="px-3 py-1.5 text-xs text-cream/80 rounded-md mx-1 cursor-pointer outline-none data-[highlighted]:bg-amber/10 data-[selected]:text-amber"
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
