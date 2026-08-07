import { useEffect, useRef, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
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
import RecipeForm from './components/RecipeForm'
import EditRecipePage from './components/EditRecipePage'
import FeatureRequestsPage from './components/FeatureRequestsPage'
import MyRecipesPage from './components/MyRecipesPage'
import AdminSubmissionsPage from './components/AdminSubmissionsPage'
import MealPlanPage from './components/MealPlanPage'
import ChefProfilePage from './components/ChefProfilePage'
import TimerPanel from './components/TimerPanel'
import ShoppingListPanel from './components/ShoppingListPanel'
import ScrollToTopButton from './components/ScrollToTopButton'
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp'
import { useTimers } from './hooks/useTimers'
import { useShoppingList } from './hooks/useShoppingList'
import { useSidebar } from './hooks/useSidebar'

export default function App() {
  const { timers, addTimer, toggleTimer, removeTimer, resetTimer } = useTimers()
  const shoppingList = useShoppingList()
  const sidebar = useSidebar()
  const [shoppingListOpen, setShoppingListOpen] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const { isLoaded, isSignedIn } = useAuth()
  const timerPanelRef = useRef<HTMLDivElement>(null)
  const [timerBarHeight, setTimerBarHeight] = useState(0)

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
      <div className={`transition-[padding] duration-200 print:pl-0 ${sidebar.collapsed ? 'sm:pl-16' : 'sm:pl-60'}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collections" element={<CollectionsPage onAddToShoppingList={shoppingList.addItems} />} />
          <Route path="/collections/:id/print" element={<CollectionPrintPage />} />
          <Route path="/recipes/new" element={<NewRecipePage />} />
          <Route path="/recipes/new/blank" element={<RecipeForm />} />
          <Route path="/recipes/import" element={<RecipeImportPage />} />
          <Route path="/recipe/:id/edit" element={<EditRecipePage />} />
          <Route path="/feature-requests" element={<FeatureRequestsPage />} />
          <Route path="/my-recipes" element={<MyRecipesPage />} />
          <Route path="/admin/submissions" element={<AdminSubmissionsPage />} />
          <Route path="/meal-plan" element={<MealPlanPage onAddToShoppingList={shoppingList.addItems} />} />
          <Route path="/chef/:userId" element={<ChefProfilePage />} />
          <Route
            path="/recipe/:id"
            element={
              <RecipeDetail
                onAddTimer={addTimer}
                timers={timers}
                timerBarHeight={timerBarHeight}
                onAddToShoppingList={shoppingList.addItems}
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
