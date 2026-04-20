interface HighlightProps {
  text: string
  query: string
}

export default function Highlight({ text, query }: HighlightProps) {
  if (!query.trim()) return <>{text}</>

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)

  // Use a fresh non-global regex for matching — reusing the 'g' regex breaks due to stateful lastIndex
  const matchRegex = new RegExp(`^${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')

  return (
    <>
      {parts.map((part, i) =>
        matchRegex.test(part) ? (
          <mark key={i} className="bg-amber/30 text-cream rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}
