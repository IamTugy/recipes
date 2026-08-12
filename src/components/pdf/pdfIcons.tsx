import { Svg, Path, Circle } from '@react-pdf/renderer'

interface PdfIconProps {
  color: string
  size?: number
}

export function ClockPdfIcon({ color, size = 10 }: PdfIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M12 7v5l3 3" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function ServingsPdfIcon({ color, size = 10 }: PdfIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 3v7a3 3 0 003 3v8M6 3v7M9 3v7M18 3c-2 0-3 2-3 5s1 4 3 4v9"
        stroke={color}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function DifficultyPdfIcon({ color, size = 10 }: PdfIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 20h4v-6H3v6zM10 20h4V9h-4v11zM17 20h4V4h-4v16z" fill={color} />
    </Svg>
  )
}
