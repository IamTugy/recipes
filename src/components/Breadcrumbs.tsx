import { useNavigate } from 'react-router-dom'

export interface Crumb {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  crumbs: Crumb[]
}

export default function Breadcrumbs({ crumbs }: BreadcrumbsProps) {
  const navigate = useNavigate()
  return (
    <nav className="print:hidden flex items-center gap-1.5 text-xs text-cream/40 mb-4 flex-wrap">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-cream/20">/</span>}
            {!isLast && crumb.href ? (
              <button type="button" onClick={() => navigate(crumb.href!)} className="hover:text-cream/70 transition-colors">
                {crumb.label}
              </button>
            ) : (
              <span className={isLast ? 'text-cream/60' : ''}>{crumb.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
