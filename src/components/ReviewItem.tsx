import { useState } from 'react'
import { resizedImage } from '../lib/image'
import SkeletonImage from './SkeletonImage'
import Avatar from './Avatar'

export interface Review {
  id: string
  userId: string
  userName: string | null
  userImageUrl: string | null
  score: number
  comment: string
  photoUrl: string | null
  upvoteCount: number
  upvotedByMe: boolean
  replyCount: number
  createdAt: string
  recipeRevision: number
}

interface Reply {
  id: string
  userId: string
  userName: string | null
  userImageUrl: string | null
  text: string
  mentionedUserId: string | null
  mentionedName: string | null
  upvoteCount: number
  upvotedByMe: boolean
  createdAt: string
}

interface ReviewItemProps {
  recipeId: string
  review: Review
  lang: 'he' | 'en'
  getToken: () => Promise<string | null>
  onOpenLightbox: (url: string) => void
  translation?: { text: string; showing: boolean; loading: boolean }
  onToggleTranslate?: () => void
  liveRevision?: number
}

function displayName(userName: string | null, lang: 'he' | 'en'): string {
  return userName ?? (lang === 'he' ? 'משתמש' : 'User')
}

function UpvoteButton({ upvoted, count, onToggle, lang }: { upvoted: boolean; count: number; onToggle: () => void; lang: 'he' | 'en' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={upvoted}
      aria-label={lang === 'he' ? 'הצבע בעד' : 'Upvote'}
      className={`flex items-center gap-1 text-xs font-medium transition-colors ${
        upvoted ? 'text-amber' : 'text-cream/35 hover:text-cream/60'
      }`}
    >
      <svg className="w-3.5 h-3.5" fill={upvoted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-7m0 10H5a2 2 0 01-2-2v-6a2 2 0 012-2h2" />
      </svg>
      {count > 0 && <span>{count}</span>}
    </button>
  )
}

export default function ReviewItem({ recipeId, review, lang, getToken, onOpenLightbox, translation, onToggleTranslate, liveRevision }: ReviewItemProps) {
  const showingTranslation = !!translation?.showing
  const [upvoted, setUpvoted] = useState(review.upvotedByMe)
  const [upvoteCount, setUpvoteCount] = useState(review.upvoteCount)
  const [repliesOpen, setRepliesOpen] = useState(false)
  const [replies, setReplies] = useState<Reply[] | null>(null)
  const [replyCount, setReplyCount] = useState(review.replyCount)
  const [replyBoxOpen, setReplyBoxOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [mention, setMention] = useState<{ userId: string; name: string } | null>(null)
  const [posting, setPosting] = useState(false)

  async function authedFetch(path: string, init?: RequestInit) {
    const token = await getToken()
    return fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
  }

  async function toggleReviewUpvote() {
    const prevUpvoted = upvoted
    const prevCount = upvoteCount
    const nextUpvoted = !upvoted
    setUpvoted(nextUpvoted)
    setUpvoteCount(c => c + (nextUpvoted ? 1 : -1))
    const res = await authedFetch(`/api/ratings/${recipeId}/${review.id}/upvote`, { method: 'POST' })
    if (res.ok) {
      const data: { upvoted: boolean; count: number } = await res.json()
      setUpvoted(data.upvoted)
      setUpvoteCount(data.count)
    } else {
      setUpvoted(prevUpvoted)
      setUpvoteCount(prevCount)
    }
  }

  async function toggleReplyUpvote(replyId: string) {
    setReplies(current =>
      current?.map(r => (r.id === replyId ? { ...r, upvotedByMe: !r.upvotedByMe, upvoteCount: r.upvoteCount + (r.upvotedByMe ? -1 : 1) } : r)) ?? current
    )
    const res = await authedFetch(`/api/ratings/${recipeId}/replies/${replyId}/upvote`, { method: 'POST' })
    if (res.ok) {
      const data: { upvoted: boolean; count: number } = await res.json()
      setReplies(current => current?.map(r => (r.id === replyId ? { ...r, upvotedByMe: data.upvoted, upvoteCount: data.count } : r)) ?? current)
    } else {
      setReplies(current =>
        current?.map(r => (r.id === replyId ? { ...r, upvotedByMe: !r.upvotedByMe, upvoteCount: r.upvoteCount + (r.upvotedByMe ? -1 : 1) } : r)) ?? current
      )
    }
  }

  async function loadReplies() {
    const res = await authedFetch(`/api/ratings/${recipeId}/${review.id}/replies`)
    if (res.ok) setReplies(await res.json())
  }

  async function toggleReplies() {
    const opening = !repliesOpen
    setRepliesOpen(opening)
    if (opening && replies === null) await loadReplies()
  }

  function startReply(target?: { userId: string; name: string }) {
    setReplyBoxOpen(true)
    setMention(target ?? null)
    setReplyText(target ? `@${target.name} ` : '')
    if (!repliesOpen) void toggleReplies()
  }

  async function postReply() {
    const text = replyText.trim()
    if (!text || posting) return
    setPosting(true)
    const res = await authedFetch(`/api/ratings/${recipeId}/${review.id}/replies`, {
      method: 'POST',
      body: JSON.stringify({ text, mentionedUserId: mention?.userId }),
    })
    setPosting(false)
    if (res.ok) {
      const reply: Reply = await res.json()
      setReplies(current => [...(current ?? []), reply])
      setReplyCount(c => c + 1)
      setReplyText('')
      setMention(null)
      setReplyBoxOpen(false)
      setRepliesOpen(true)
    }
  }

  return (
    <li className="border-t border-tint/[0.06] pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2 mb-1">
        <Avatar name={displayName(review.userName, lang)} imageUrl={review.userImageUrl} />
        <span className="text-xs font-semibold text-cream/60">{displayName(review.userName, lang)}</span>
        <span className="text-amber text-sm leading-none">
          {'★'.repeat(review.score)}
          <span className="text-cream/15">{'★'.repeat(5 - review.score)}</span>
        </span>
        <span className="text-cream/25 text-[11px]">
          {new Date(review.createdAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
        </span>
        {liveRevision !== undefined && review.recipeRevision < liveRevision && (
          <span className="text-cream/25 text-[10px] italic">
            {lang === 'he' ? `לגבי גרסה קודמת (v${review.recipeRevision})` : `about an earlier version (v${review.recipeRevision})`}
          </span>
        )}
      </div>
      <p className="text-sm text-cream/70 leading-relaxed" dir={showingTranslation ? (lang === 'he' ? 'rtl' : 'ltr') : undefined}>
        {showingTranslation ? (translation?.loading ? (lang === 'he' ? 'מתרגם...' : 'Translating...') : translation?.text) : review.comment}
      </p>
      {review.comment.trim() && onToggleTranslate && (
        <button
          type="button"
          onClick={onToggleTranslate}
          disabled={translation?.loading}
          className="mt-1 text-[11px] text-cream/40 hover:text-cream/70 underline underline-offset-2 disabled:opacity-50"
        >
          {showingTranslation
            ? (lang === 'he' ? 'הצג מקור' : 'Show original')
            : (lang === 'he' ? 'תרגם' : 'Translate')}
        </button>
      )}
      {review.photoUrl && (
        <div className="relative mt-2 w-28 h-28 rounded-lg overflow-hidden">
          <SkeletonImage
            src={resizedImage(review.photoUrl, 320)}
            alt=""
            onClick={() => onOpenLightbox(review.photoUrl!)}
            className="w-full h-full object-cover cursor-zoom-in"
          />
        </div>
      )}
      <div className="flex items-center gap-4 mt-2">
        <UpvoteButton upvoted={upvoted} count={upvoteCount} onToggle={toggleReviewUpvote} lang={lang} />
        <button
          type="button"
          onClick={() => startReply()}
          className="text-xs font-medium text-cream/35 hover:text-cream/60 transition-colors"
        >
          {lang === 'he' ? 'הגב' : 'Reply'}
        </button>
        {replyCount > 0 && (
          <button
            type="button"
            onClick={toggleReplies}
            className="text-xs font-medium text-cream/35 hover:text-cream/60 transition-colors"
          >
            {repliesOpen
              ? (lang === 'he' ? 'הסתר תגובות' : 'Hide replies')
              : (lang === 'he' ? `הצג ${replyCount} תגובות` : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`)}
          </button>
        )}
      </div>

      {repliesOpen && replies && replies.length > 0 && (
        <ul className={`mt-3 space-y-3 ${lang === 'he' ? 'pr-5 border-r' : 'pl-5 border-l'} border-tint/[0.08]`}>
          {replies.map(reply => (
            <li key={reply.id}>
              <div className="flex items-center gap-2 mb-1">
                <Avatar name={displayName(reply.userName, lang)} imageUrl={reply.userImageUrl} />
                <span className="text-xs font-semibold text-cream/60">{displayName(reply.userName, lang)}</span>
                <span className="text-cream/25 text-[11px]">
                  {new Date(reply.createdAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
                </span>
              </div>
              <p className="text-sm text-cream/70 leading-relaxed" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                {reply.mentionedName && <span className="text-amber/80 font-medium">@{reply.mentionedName} </span>}
                {reply.text}
              </p>
              <div className="flex items-center gap-4 mt-1">
                <UpvoteButton
                  upvoted={reply.upvotedByMe}
                  count={reply.upvoteCount}
                  onToggle={() => toggleReplyUpvote(reply.id)}
                  lang={lang}
                />
                <button
                  type="button"
                  onClick={() => startReply({ userId: reply.userId, name: displayName(reply.userName, lang) })}
                  className="text-xs font-medium text-cream/35 hover:text-cream/60 transition-colors"
                >
                  {lang === 'he' ? 'הגב' : 'Reply'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {replyBoxOpen && (
        <div className={`mt-3 flex flex-col gap-2 ${lang === 'he' ? 'pr-5' : 'pl-5'}`}>
          <textarea
            autoFocus
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder={lang === 'he' ? 'כתבו תגובה...' : 'Write a reply...'}
            rows={2}
            maxLength={500}
            className="w-full bg-tint/[0.03] border border-tint/10 rounded-lg p-2.5 text-sm text-cream/80 placeholder-cream/25 outline-none focus:border-amber/30 transition-colors resize-none"
            dir={lang === 'he' ? 'rtl' : 'ltr'}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={postReply}
              disabled={!replyText.trim() || posting}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber/90 text-bg hover:bg-amber transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {lang === 'he' ? 'שלח' : 'Post'}
            </button>
            <button
              type="button"
              onClick={() => {
                setReplyBoxOpen(false)
                setReplyText('')
                setMention(null)
              }}
              className="text-xs font-medium text-cream/35 hover:text-cream/60 transition-colors"
            >
              {lang === 'he' ? 'בטל' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
