import { useEffect, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { useLanguage } from '../hooks/useLanguage'
import { useToast } from '../hooks/useToast'
import type { useCookTogether } from '../hooks/useCookTogether'
import {
  cookTogetherJoinUrl,
  type CookTogetherParticipant, type CookTogetherRoom, type CookTogetherTask,
} from '../lib/cookTogether'
import { formatDockDuration } from '../utils/format'
import Avatar from './Avatar'
import ConfirmDialog from './ConfirmDialog'
import { t } from '../i18n'

type CookTogether = ReturnType<typeof useCookTogether>
type Tx = (typeof t)['en']

interface CookTogetherPanelProps {
  cookTogether: CookTogether
}

// Re-renders once a second so elapsed-time and countdown displays tick
// between the 3-second server polls.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])
  return now
}

function displayName(p: CookTogetherParticipant | undefined, tx: Tx): string {
  return p?.name?.trim() || tx.ctGenericName
}

function instructionOf(task: CookTogetherTask, lang: 'he' | 'en'): string {
  return lang === 'he' ? task.instruction : (task.instructionEn ?? task.instruction)
}

export default function CookTogetherPanel({ cookTogether }: CookTogetherPanelProps) {
  const { lang } = useLanguage()
  const tx = t[lang]
  const { room, panelOpen, closePanel } = cookTogether
  const [confirm, setConfirm] = useState<'finish' | 'end' | null>(null)

  return (
    <>
      <Dialog.Root open={panelOpen} onOpenChange={next => { if (!next) closePanel() }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="print:hidden fixed inset-0 bg-black/40 z-40 transition-opacity duration-150 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
          <Dialog.Viewport className="print:hidden fixed inset-0 z-50">
            <Dialog.Popup
              className={`fixed top-0 h-full w-full sm:w-[26rem] bg-card shadow-2xl flex flex-col transition-transform duration-150 ${lang === 'he' ? 'left-0 data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full' : 'right-0 data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full'}`}
              dir={lang === 'he' ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center justify-between px-5 h-14 border-b border-tint/[0.06] shrink-0">
                <Dialog.Title className="font-serif text-lg font-medium text-cream truncate">
                  👥 {room ? (lang === 'he' ? (room.recipeTitleHe ?? room.recipeTitle) : room.recipeTitle) : tx.ctTitle}
                </Dialog.Title>
                <button type="button"
                  onClick={closePanel}
                  aria-label={tx.close}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-cream/50 hover:text-cream hover:bg-tint/[0.06] transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {!room && <JoinForm cookTogether={cookTogether} tx={tx} />}
              {room?.status === 'lobby' && <Lobby room={room} cookTogether={cookTogether} tx={tx} lang={lang} />}
              {room?.status === 'cooking' && (
                <Cooking room={room} cookTogether={cookTogether} tx={tx} lang={lang} onConfirm={setConfirm} />
              )}
              {room?.status === 'finished' && <Finished room={room} cookTogether={cookTogether} tx={tx} />}
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={confirm === 'finish'}
        title={tx.ctFinishNow}
        message={tx.ctFinishNowConfirm}
        confirmLabel={tx.ctFinishNow}
        cancelLabel={tx.cancel}
        busy={cookTogether.busy}
        onConfirm={async () => { await cookTogether.finish(); setConfirm(null) }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'end'}
        title={tx.ctEndForAll}
        message={tx.ctEndForAllConfirm}
        confirmLabel={tx.ctEndForAll}
        cancelLabel={tx.cancel}
        danger
        busy={cookTogether.busy}
        onConfirm={async () => { await cookTogether.cancel(); setConfirm(null) }}
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}

function JoinForm({ cookTogether, tx }: { cookTogether: CookTogether; tx: Tx }) {
  const [code, setCode] = useState('')
  const valid = /^[A-Za-z0-9]{6}$/.test(code.trim())
  return (
    <form
      className="flex-1 overflow-y-auto px-5 py-6 space-y-4"
      onSubmit={e => { e.preventDefault(); if (valid) void cookTogether.join(code) }}
    >
      <h3 className="font-serif text-base text-cream">{tx.ctJoinTitle}</h3>
      <p className="text-sm text-cream/50">{tx.ctJoinHint}</p>
      <input
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        maxLength={6}
        placeholder={tx.ctCodePlaceholder}
        aria-label={tx.ctCodePlaceholder}
        autoCapitalize="characters"
        autoComplete="off"
        dir="ltr"
        className="w-full rounded-xl bg-tint/[0.05] border border-tint/10 px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] text-cream placeholder:text-cream/20 placeholder:tracking-normal placeholder:text-base focus:outline-none focus:border-amber/50"
      />
      <button type="submit" disabled={!valid || cookTogether.busy} className="btn-primary w-full disabled:opacity-50">
        {tx.ctJoin}
      </button>
    </form>
  )
}

function PersonRow({ p, room, tx, extra }: { p: CookTogetherParticipant; room: CookTogetherRoom; tx: Tx; extra?: string }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={displayName(p, tx)} imageUrl={p.imageUrl ?? null} />
      <span className="flex-1 min-w-0 truncate text-sm text-cream/85">
        {displayName(p, tx)}
        {p.userId === room.viewerId && <span className="text-cream/40"> ({tx.ctYou})</span>}
      </span>
      {p.userId === room.hostId && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber border border-amber/30 rounded-full px-2 py-0.5">
          {tx.ctHost}
        </span>
      )}
      {extra && <span className="text-xs text-cream/40">{extra}</span>}
    </li>
  )
}

function Lobby({ room, cookTogether, tx, lang }: { room: CookTogetherRoom; cookTogether: CookTogether; tx: Tx; lang: 'he' | 'en' }) {
  const { showToast } = useToast()
  const isHost = room.hostId === room.viewerId
  const title = lang === 'he' ? (room.recipeTitleHe ?? room.recipeTitle) : room.recipeTitle
  const url = cookTogetherJoinUrl(room.code)

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: tx.ctShareText(title), url })
      } catch { /* user cancelled share */ }
      return
    }
    await copy()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      showToast(tx.ctLinkCopied)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-wide text-cream/40">{tx.ctCodeLabel}</p>
          <p dir="ltr" className="font-mono text-4xl tracking-[0.3em] text-amber select-all">{room.code}</p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button type="button" onClick={share} className="btn-ghost text-xs">{tx.ctShare}</button>
            <button type="button" onClick={copy} className="btn-ghost text-xs">{tx.ctCopyCode}</button>
          </div>
        </div>

        <div>
          <h3 className="text-xs uppercase tracking-wide text-cream/40 mb-1">{tx.ctPeople(room.participants.length)}</h3>
          <ul className="divide-y divide-tint/[0.05]">
            {room.participants.map(p => <PersonRow key={p.userId} p={p} room={room} tx={tx} />)}
          </ul>
        </div>

        <p className="text-sm text-cream/50">{tx.ctIntro}</p>
      </div>

      <div className="px-5 py-3 border-t border-tint/[0.06] space-y-2 shrink-0">
        {isHost ? (
          <>
            {room.participants.length === 1 && <p className="text-xs text-cream/40 text-center">{tx.ctWaitingForPeople}</p>}
            <button type="button" onClick={() => void cookTogether.start()} disabled={cookTogether.busy} className="btn-primary w-full disabled:opacity-60">
              {cookTogether.busy ? tx.ctSplitting : tx.ctSplitAndStart}
            </button>
          </>
        ) : (
          <p className="text-sm text-cream/50 text-center py-2">{tx.ctWaitingForHost}</p>
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void cookTogether.leave()} disabled={cookTogether.busy} className="btn-ghost text-xs flex-1">
            {tx.ctLeave}
          </button>
          {isHost && (
            <button type="button" onClick={() => void cookTogether.cancel()} disabled={cookTogether.busy} className="btn-ghost text-xs flex-1 text-red-400/80">
              {tx.ctEndForAll}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function Cooking({ room, cookTogether, tx, lang, onConfirm }: {
  room: CookTogetherRoom
  cookTogether: CookTogether
  tx: Tx
  lang: 'he' | 'en'
  onConfirm: (which: 'finish' | 'end') => void
}) {
  const now = useNow()
  const { progress } = room
  const isHost = room.hostId === room.viewerId

  // Count the server's estimate down between polls, on this device's clock.
  const remaining = Math.max(0, progress.remainingMinutes - (now - cookTogether.receivedAt) / 60000)
  const finishAt = new Date(now + remaining * 60000).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  const remainingRounded = remaining < 0.5 ? 0 : Math.ceil(remaining)

  const lanes = [
    ...[...room.participants].sort((a, b) => Number(b.userId === room.viewerId) - Number(a.userId === room.viewerId)),
  ].map(p => ({ participant: p, tasks: room.tasks.filter(task => task.assigneeId === p.userId) }))
  const unassigned = room.tasks.filter(task => !task.assigneeId)

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4 border-b border-tint/[0.06] space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg font-serif text-cream">{tx.ctRemaining(remainingRounded)}</p>
            <p className="text-xs text-cream/40">{tx.ctFinishAround(finishAt)}</p>
          </div>
          <div className="h-2 rounded-full bg-tint/10 overflow-hidden" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-herb transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-cream/50">
            <span>{tx.ctStepsDone(progress.doneTasks, progress.totalTasks)}</span>
            <span>{progress.percent}%</span>
          </div>
          {(progress.speedFactor >= 1.15 || progress.speedFactor <= 0.87) && (
            <p className="text-xs text-cream/40">{progress.speedFactor >= 1 ? tx.ctPaceSlow : tx.ctPaceFast}</p>
          )}
        </div>

        <div className="px-5 py-3 space-y-5">
          {lanes.map(({ participant, tasks }) => (
            <Lane
              key={participant.userId}
              participant={participant}
              tasks={tasks}
              room={room}
              cookTogether={cookTogether}
              tx={tx}
              lang={lang}
              now={now}
            />
          ))}
          {unassigned.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-cream/40 mb-1">{tx.ctUpForGrabs}</h3>
              <ul className="space-y-2">
                {unassigned.map(task => (
                  <TaskRow key={task.id} task={task} room={room} cookTogether={cookTogether} tx={tx} lang={lang} now={now} />
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-cream/30 text-center">
            {room.planSource === 'ai' ? tx.ctPlanAi : tx.ctPlanBasic}
          </p>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-tint/[0.06] space-y-2 shrink-0">
        {isHost && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void cookTogether.resplit()} disabled={cookTogether.busy} className="btn-ghost text-xs flex-1">
              {tx.ctResplit}
            </button>
            <button type="button" onClick={() => onConfirm('finish')} disabled={cookTogether.busy} className="btn-ghost text-xs flex-1">
              {tx.ctFinishNow}
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void cookTogether.leave()} disabled={cookTogether.busy} className="btn-ghost text-xs flex-1">
            {tx.ctLeave}
          </button>
          {isHost && (
            <button type="button" onClick={() => onConfirm('end')} disabled={cookTogether.busy} className="btn-ghost text-xs flex-1 text-red-400/80">
              {tx.ctEndForAll}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function Lane({ participant, tasks, room, cookTogether, tx, lang, now }: {
  participant: CookTogetherParticipant
  tasks: CookTogetherTask[]
  room: CookTogetherRoom
  cookTogether: CookTogether
  tx: Tx
  lang: 'he' | 'en'
  now: number
}) {
  const stats = room.progress.perParticipant.find(p => p.userId === participant.userId)
  const extra = stats && stats.totalTasks > 0
    ? `${stats.doneTasks}/${stats.totalTasks}${stats.doneTasks < stats.totalTasks ? ` · ${tx.ctMin(stats.remainingMinutes)}` : ''}`
    : undefined
  return (
    <div>
      <ul><PersonRow p={participant} room={room} tx={tx} extra={extra} /></ul>
      {tasks.length === 0 ? (
        <p className="text-xs text-cream/30 ps-9">{tx.ctNoTasks}</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} room={room} cookTogether={cookTogether} tx={tx} lang={lang} now={now} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TaskRow({ task, room, cookTogether, tx, lang, now }: {
  task: CookTogetherTask
  room: CookTogetherRoom
  cookTogether: CookTogether
  tx: Tx
  lang: 'he' | 'en'
  now: number
}) {
  const mine = task.assigneeId === room.viewerId
  const isHost = room.hostId === room.viewerId
  const blockedBy = task.status === 'pending'
    ? room.tasks.filter(other => task.dependsOn.includes(other.id) && other.status !== 'done')
    : []
  const elapsedSeconds = task.status === 'in_progress' && task.startedAt
    ? Math.max(0, (now - new Date(task.startedAt).getTime()) / 1000)
    : 0
  const disabled = cookTogether.busy

  return (
    <li className={`rounded-xl border px-3 py-2.5 space-y-1.5 ${
      task.status === 'in_progress' ? 'border-amber/40 bg-amber/[0.06]' : 'border-tint/[0.08] bg-tint/[0.02]'
    } ${task.status === 'done' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 mt-0.5 text-[11px] font-semibold text-cream/40">{tx.ctStepN(task.stepNum)}</span>
        <p className={`flex-1 min-w-0 text-sm ${task.status === 'done' ? 'line-through text-cream/40' : 'text-cream/85'}`}>
          {instructionOf(task, lang)}
        </p>
        {task.status === 'done' && <span className="text-herb text-sm shrink-0">✓</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cream/40">
        <span>{tx.ctMin(task.activeMinutes + task.waitMinutes)}{task.waitMinutes > 0 && ` (${tx.ctPlusWait(task.waitMinutes)})`}</span>
        {task.status === 'in_progress' && (
          <span className="text-amber">{tx.ctInProgress} · {formatDockDuration(elapsedSeconds)}</span>
        )}
        {blockedBy.length > 0 && <span>{tx.ctWaitingOn(Math.min(...blockedBy.map(b => b.stepNum)))}</span>}
      </div>
      {task.status !== 'done' && (
        <div className="flex items-center gap-2 pt-0.5">
          {mine && task.status === 'pending' && (
            <button type="button" disabled={disabled} onClick={() => void cookTogether.startTask(task.id)} className="btn-ghost text-xs">
              {tx.ctStart}
            </button>
          )}
          {(mine || isHost) && (
            <button type="button" disabled={disabled} onClick={() => void cookTogether.completeTask(task.id)} className="btn-primary text-xs !py-1.5">
              {tx.ctDone}
            </button>
          )}
          {!mine && task.status === 'pending' && (
            <button type="button" disabled={disabled} onClick={() => void cookTogether.startTask(task.id)} className="btn-ghost text-xs">
              {tx.ctTakeOver}
            </button>
          )}
        </div>
      )}
      {task.status === 'done' && (mine || task.completedBy === room.viewerId || isHost) && (
        <button type="button" disabled={disabled} onClick={() => void cookTogether.reopenTask(task.id)} className="text-[11px] text-cream/40 hover:text-cream/70 underline">
          {tx.ctUndo}
        </button>
      )}
    </li>
  )
}

function Finished({ room, cookTogether, tx }: { room: CookTogetherRoom; cookTogether: CookTogether; tx: Tx }) {
  const minutes = room.startedAt && room.finishedAt
    ? Math.max(1, Math.round((new Date(room.finishedAt).getTime() - new Date(room.startedAt).getTime()) / 60000))
    : null
  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-8 space-y-6">
        <div className="text-center space-y-1">
          <p className="font-serif text-2xl text-cream">{tx.ctAllDone}</p>
          {minutes !== null && <p className="text-sm text-cream/50">{tx.ctTookMinutes(minutes)}</p>}
        </div>
        <ul className="divide-y divide-tint/[0.05]">
          {room.participants.map(p => {
            const done = room.tasks.filter(task => task.status === 'done' && (task.completedBy ?? task.assigneeId) === p.userId).length
            return <PersonRow key={p.userId} p={p} room={room} tx={tx} extra={tx.ctStepsDone(done, room.tasks.length)} />
          })}
        </ul>
      </div>
      <div className="px-5 py-3 border-t border-tint/[0.06] shrink-0">
        <button type="button" onClick={() => void cookTogether.leave()} disabled={cookTogether.busy} className="btn-primary w-full">
          {tx.ctClose}
        </button>
      </div>
    </>
  )
}
