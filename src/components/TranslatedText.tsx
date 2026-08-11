import { useTranslatedText } from '../hooks/useTranslatedText'

interface TranslatedTextProps {
  // Field in the current UI language and its counterpart in the other
  // language - see useTranslatedText for exactly how these are used.
  primary: string | undefined
  secondary: string | undefined
  className?: string
  as?: 'span' | 'p'
}

// Shows a pulsing placeholder instead of the untranslated text while a
// translation is in flight - the whole point is to never show the wrong
// language on screen, even briefly.
export default function TranslatedText({ primary, secondary, className, as: Tag = 'span' }: TranslatedTextProps) {
  const { text, loading } = useTranslatedText(primary, secondary)

  if (loading) {
    return <Tag className={`inline-block bg-tint/10 rounded animate-pulse ${className ?? ''}`}>&nbsp;</Tag>
  }
  if (!text) return null
  return <Tag className={className}>{text}</Tag>
}
