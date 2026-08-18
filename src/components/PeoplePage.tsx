import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUserSearch } from '../hooks/useUserSearch'
import { useFollow } from '../hooks/useFollow'
import { useLanguage } from '../hooks/useLanguage'
import Avatar from './Avatar'
import { t } from "../i18n";
import type { UserSearchResult } from '../hooks/useUserSearch'

function PersonRow({ user, tx }: { user: UserSearchResult; tx: typeof t.en }) {
  const { following, toggle, loading, isSelf } = useFollow(user.userId)
  const displayName = user.name ?? tx.chef

  return (
    <div className="flex items-center gap-3 py-3 border-b border-tint/[0.08] last:border-b-0">
      <Link to={`/chef/${user.userId}`} className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar name={displayName} imageUrl={user.imageUrl ?? null} size="md" />
        <span className="font-medium text-cream truncate">{displayName}</span>
      </Link>
      {!isSelf && (
        <button type="button"
          onClick={toggle}
          disabled={loading}
          className={`shrink-0 px-4 h-9 rounded-full text-sm font-medium transition-colors ${
            following
              ? 'border border-tint/[0.12] text-cream/60 hover:border-amber/40 hover:text-amber bg-transparent'
              : 'bg-amber text-bg hover:bg-amber/90'
          }`}
        >
          {following ? tx.following : tx.follow}
        </button>
      )}
    </div>
  )
}

export default function PeoplePage() {
  const { lang } = useLanguage()
  const tx = t[lang]
  const [query, setQuery] = useState('')
  const { results, loading } = useUserSearch(query)

  return (
    <div className="min-h-dvh bg-bg pt-20 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-2xl font-bold text-cream mb-1">
          {tx.findPeople}
        </h1>
        <p className="text-cream/30 text-xs mb-6">
          {tx.findPeopleSubtitle}
        </p>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={tx.searchPeoplePlaceholder}
          className="w-full h-11 px-4 rounded-full bg-tint/[0.05] border border-tint/[0.12] text-cream placeholder:text-cream/30 text-sm focus:outline-none focus:border-amber/40 mb-6"
        />

        {loading ? (
          <p className="text-cream/30 text-sm">{tx.loading}</p>
        ) : query.trim() && results.length === 0 ? (
          <p className="text-cream/30 text-sm">{tx.noUsersFound}</p>
        ) : (
          results.map(user => <PersonRow key={user.userId} user={user} tx={tx} />)
        )}
      </div>
    </div>
  )
}
