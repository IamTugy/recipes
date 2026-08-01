import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useAuth, SignIn } from '@clerk/react'
import Nav from './components/Nav'
import Home from './components/Home'
import RecipeDetail from './components/RecipeDetail'
import TimerPanel from './components/TimerPanel'
import ShoppingListPanel from './components/ShoppingListPanel'
import ScrollToTopButton from './components/ScrollToTopButton'
import { useTimers } from './hooks/useTimers'
import { useShoppingList } from './hooks/useShoppingList'

export default function App() {
  const { timers, addTimer, toggleTimer, removeTimer, resetTimer } = useTimers()
  const shoppingList = useShoppingList()
  const [shoppingListOpen, setShoppingListOpen] = useState(false)
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return <div className="min-h-screen bg-bg" />
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-6">
        <SignIn />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <Nav
        shoppingListCount={shoppingList.items.length}
        onOpenShoppingList={() => setShoppingListOpen(true)}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/recipe/:id"
          element={
            <RecipeDetail
              onAddTimer={addTimer}
              timers={timers}
              onAddToShoppingList={shoppingList.addItems}
            />
          }
        />
      </Routes>
      <AnimatePresence>
        {timers.length > 0 && (
          <TimerPanel
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
    </div>
  )
}
