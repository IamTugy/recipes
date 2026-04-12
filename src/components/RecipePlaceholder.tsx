import { categoryEmoji } from '../i18n'
import type { Recipe } from '../types'

interface Props {
  recipe: Pick<Recipe, 'category' | 'title'>
  className?: string
}

export default function RecipePlaceholder({ recipe, className = '' }: Props) {
  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center gap-3 select-none ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgb(var(--color-surface)) 0%, rgb(var(--color-card)) 100%)',
      }}
    >
      <span className="text-5xl opacity-40">{categoryEmoji[recipe.category]}</span>
      <span
        className="text-[10px] font-medium tracking-widest uppercase opacity-20"
        style={{ letterSpacing: '0.2em' }}
      >
        no photo
      </span>
    </div>
  )
}
