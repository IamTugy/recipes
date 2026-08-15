import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuth, SignIn } from '@clerk/react'
import Nav from './components/Nav'
import Sidebar from './components/Sidebar'
import Home from './components/Home'
import RecipeDetail from './components/RecipeDetail'
import CollectionsPage from './components/CollectionsPage'
import CollectionPrintPage from './components/CollectionPrintPage'
import NewRecipePage from './components/NewRecipePage'
import RecipeImportPage from './components/RecipeImportPage'
import RecipeAiGeneratePage from './components/RecipeAiGeneratePage'
import RecipeForm from './components/RecipeForm'
import EditRecipePage from './components/EditRecipePage'
import FeatureRequestsPage from './components/FeatureRequestsPage'
import MyRecipesPage from './components/MyRecipesPage'
import MealPlanPage from './components/MealPlanPage'
import ChefProfilePage from './components/ChefProfilePage'
import LeaderboardPage from './components/LeaderboardPage'
const CookHistoryPage = lazy(() => import('./components/CookHistoryPage'))
const CookHistoryRecipePage = lazy(() => import('./components/CookHistoryRecipePage'))
import TimerPanel from './components/TimerPanel'
import ShoppingListPanel from './components/ShoppingListPanel'
import ScrollToTopButton from './components/ScrollToTopButton'
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp'
import BackgroundCookStatus from './components/BackgroundCookStatus'
import CookDock from './components/CookDock'
import { useCookSession } from './hooks/useCookSession'
import { useTimers } from './hooks/useTimers'
import { useShoppingList } from './hooks/useShoppingList'
import { useSidebar } from './hooks/useSidebar'
import { useEdgeSwipeToOpenSidebar } from './hooks/useEdgeSwipeToOpenSidebar'
import { useLanguage } from './hooks/useLanguage'
import { useTheme } from './hooks/useTheme'
import { fetchPreferences } from './lib/preferences'
import { t } from './i18n'

export default function App() {
  const { lang, setLang } = useLanguage()
  const { timers, addTimer, toggleTimer, removeTimer, resetTimer } = useTimers()
  const cookSession = useCookSession(lang, timers, addTimer, toggleTimer)
  const shoppingList = useShoppingList()
  const sidebar = useSidebar()
  const [shoppingListOpen, setShoppingListOpen] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const timerPanelRef = useRef<HTMLDivElement>(null)
  const [timerBarHeight, setTimerBarHeight] = useState(0)
  const navigate = useNavigate()
  const { setMode } = useTheme()
  const tx = t[lang]

  useEdgeSwipeToOpenSidebar(lang, sidebar.mobileOpen, sidebar.setMobileOpen)

  // A signed-in user's explicit lang/theme choice (if they've ever set one)
  // follows them across devices - overrides whatever this device fell back
  // to (browser language / OS color scheme) the moment we know it. Runs
  // once per sign-in, not on every render.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    let cancelled = false
    fetchPreferences(getToken).then(prefs => {
      if (cancelled) return
      if (prefs.lang) setLang(prefs.lang)
      if (prefs.theme) setMode(prefs.theme)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn])

  // A shared recipe link lands here first (?share=/recipes/<id>) instead of
  // going straight to the hash route, so Home ends up as a real history
  // entry underneath it - landing directly on the recipe via location.replace
  // collapsed everything into one entry with nothing to back into.
  //
  // The Web Share Target API (manifest's share_target, action: "/") sends
  // the OS share sheet's payload here the same way - a real (non-hash)
  // query string, since it's the browser's own URL/searchParams resolution
  // doing the appending, not our router. HashRouter only ever looks at
  // location.hash, so without this bridge the app would just boot to Home
  // with the shared title/text/url silently ignored.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    const params = new URLSearchParams(window.location.search)
    const shareTarget = params.get('share')
    const sharedTitle = params.get('title')
    const sharedText = params.get('text')
    const sharedUrl = params.get('url')
    const target = shareTarget
      ? shareTarget
      : (sharedTitle || sharedText || sharedUrl)
        ? `/recipes/import?${new URLSearchParams({
            ...(sharedUrl ? { url: sharedUrl } : {}),
            ...((sharedText || sharedTitle) ? { text: [sharedTitle, sharedText].filter(Boolean).join(' ') } : {}),
          })}`
        : null
    if (!target) return
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
    navigate(target)
  }, [isLoaded, isSignedIn, navigate])

  // Measured (not guessed) so guided mode's reserved bottom padding always
  // matches the real timer bar - including when it wraps to more rows or
  // grows for the safe-area inset on notched phones.
  useEffect(() => {
    const el = timerPanelRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setTimerBarHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      setTimerBarHeight(0)
    }
  }, [timers.length])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (e.key === '?' && !isTyping) {
        e.preventDefault()
        setShortcutsHelpOpen(v => !v)
      } else if (e.key === 'Escape') {
        setShortcutsHelpOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!cookSession.lightboxUrl) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') cookSession.setLightboxUrl(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [cookSession.lightboxUrl, cookSession.setLightboxUrl])

  if (!isLoaded) {
    return <div className="min-h-dvh bg-bg" />
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-dvh bg-bg flex items-center justify-center px-6">
        <SignIn />
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-bg">
      <Nav
        shoppingListCount={shoppingList.items.length}
        onOpenShoppingList={() => setShoppingListOpen(true)}
        onToggleMobileSidebar={() => sidebar.setMobileOpen(o => !o)}
      />
      <Sidebar sidebar={sidebar} />
      <div className={`app-routes transition-[padding] duration-200 print:pl-0 ${lang === 'he'
        ? (sidebar.collapsed ? 'sm:pr-16' : 'sm:pr-60')
        : (sidebar.collapsed ? 'sm:pl-16' : 'sm:pl-60')}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collections" element={<CollectionsPage onAddToShoppingList={shoppingList.addItems} />} />
          <Route path="/collections/:id/print" element={<CollectionPrintPage />} />
          <Route path="/recipes/new" element={<NewRecipePage />} />
          <Route path="/recipes/new/blank" element={<RecipeForm />} />
          <Route path="/recipes/import" element={<RecipeImportPage />} />
          <Route path="/recipes/generate" element={<RecipeAiGeneratePage />} />
          <Route path="/recipes/:id/edit" element={<EditRecipePage />} />
          <Route path="/feature-requests" element={<FeatureRequestsPage />} />
          <Route path="/my-recipes" element={<MyRecipesPage />} />
          {/* Submissions and Jobs are now tabs on My Recipes, not standalone pages -
              old links/bookmarks still land somewhere useful. */}
          <Route path="/submissions" element={<Navigate to="/my-recipes?tab=submissions" replace />} />
          <Route path="/jobs" element={<Navigate to="/my-recipes?tab=jobs" replace />} />
          <Route path="/meal-plan" element={<MealPlanPage onAddToShoppingList={shoppingList.addItems} />} />
          <Route path="/chef/:userId" element={<ChefProfilePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route
            path="/cook-history"
            element={
              <Suspense fallback={<p className="text-cream/30 text-sm p-6">{tx.loading}</p>}>
                <CookHistoryPage />
              </Suspense>
            }
          />
          <Route
            path="/cook-history/:recipeId"
            element={
              <Suspense fallback={<p className="text-cream/30 text-sm p-6">{tx.loading}</p>}>
                <CookHistoryRecipePage />
              </Suspense>
            }
          />
          <Route
            path="/recipes/:id"
            element={
              <RecipeDetail
                onAddTimer={addTimer}
                onToggleTimer={toggleTimer}
                timers={timers}
                timerBarHeight={timerBarHeight}
                onAddToShoppingList={shoppingList.addItems}
                cookSession={cookSession}
              />
            }
          />
        </Routes>
      </div>
      <AnimatePresence>
        {timers.length > 0 && (
          <TimerPanel
            panelRef={timerPanelRef}
            timers={timers}
            onToggle={toggleTimer}
            onRemove={removeTimer}
            onReset={resetTimer}
          />
        )}
      </AnimatePresence>
      {cookSession.cookSessionActive && cookSession.flatSteps.length > 0 && (
        <div aria-hidden="true" className="h-[20dvh] sm:h-24" style={{ paddingBottom: timerBarHeight }} />
      )}
      {cookSession.cookSessionActive && cookSession.flatSteps.length > 0 && (
        <CookDock
          lang={lang}
          ingredients={cookSession.recipe?.ingredients ?? []}
          checkedIngredients={cookSession.checkedIngredients}
          onToggleIngredient={cookSession.toggleIngredient}
          multiplier={cookSession.multiplier}
          steps={cookSession.flatSteps}
          wizardIndex={cookSession.wizardIndex}
          onPrev={() => cookSession.setWizardIndex(i => Math.max(i - 1, 0))}
          onAdvance={key => { cookSession.markStepChecked(key); cookSession.advanceWizardOrFinish() }}
          onMarkDone={cookSession.handleWizardMarkDone}
          onStop={cookSession.stopCooking}
          onStepEntered={cookSession.handleStepEntered}
          onExpand={() => cookSession.backgroundCookStatusRef.current?.exitFloatingView()}
          checkedSteps={cookSession.checkedSteps}
          nearestTimer={cookSession.nearestTimer}
          onToggleNearestTimer={cookSession.pipToggleNearestTimer}
          getTimerForStep={cookSession.getTimerForStep}
          onStartTimer={cookSession.startTimer}
          onOpenLightbox={cookSession.setLightboxUrl}
          timerBarHeight={timerBarHeight}
          lightboxOpen={!!cookSession.lightboxUrl}
          elapsedBaselineMs={cookSession.cookSessionStartedAt ? new Date(cookSession.cookSessionStartedAt).getTime() : undefined}
          startExpanded={cookSession.startDockExpanded}
          onExpandConsumed={cookSession.onExpandConsumed}
        />
      )}
      <BackgroundCookStatus
        ref={cookSession.backgroundCookStatusRef}
        active={cookSession.cookSessionActive && !!cookSession.currentWizardStep}
        recipeTitle={lang === 'he' ? (cookSession.recipe?.titleHe ?? cookSession.recipe?.title ?? '') : (cookSession.recipe?.title ?? '')}
        stepLabel={cookSession.wizardStepLabel}
        stepText={cookSession.currentWizardStep?.instruction ?? ''}
        nearestTimer={cookSession.nearestTimer}
        lang={lang}
        canGoPrev={cookSession.wizardIndex > 0}
        canGoNext={cookSession.wizardIndex < cookSession.flatSteps.length - 1}
        onToggleNearestTimer={cookSession.pipToggleNearestTimer}
        onPrevStep={cookSession.pipPreviousStep}
        onNextStep={cookSession.pipNextStep}
      />
      {cookSession.lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="print:hidden fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
          onClick={() => cookSession.setLightboxUrl(null)}
        >
          <button type="button"
            onClick={() => cookSession.setLightboxUrl(null)}
            aria-label={tx.close}
            className="absolute top-4 right-4 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            ✕
          </button>
          <img
            src={cookSession.lightboxUrl}
            alt=""
            onClick={e => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
      <ShoppingListPanel
        open={shoppingListOpen}
        onClose={() => setShoppingListOpen(false)}
        items={shoppingList.items}
        onToggle={shoppingList.toggle}
        onRemove={shoppingList.remove}
        onClearChecked={shoppingList.clearChecked}
        onClearAll={shoppingList.clear}
        lastCleared={shoppingList.lastCleared}
        onUndoClear={shoppingList.undoClear}
      />
      <ScrollToTopButton raised={timers.length > 0} />
      <KeyboardShortcutsHelp open={shortcutsHelpOpen} onClose={() => setShortcutsHelpOpen(false)} />
    </div>
  )
}
