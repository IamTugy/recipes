import { Link, useNavigate } from 'react-router-dom'

export default function Nav() {
  const navigate = useNavigate()

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-bg/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="font-serif text-xl font-bold text-cream hover:text-amber transition-colors"
        >
          Tugy's Kitchen
        </button>
        <div className="flex items-center gap-1">
          <Link
            to="/"
            className="px-3 py-1.5 text-sm text-cream/60 hover:text-cream transition-colors rounded-lg hover:bg-white/5"
          >
            Recipes
          </Link>
        </div>
      </div>
    </nav>
  )
}
