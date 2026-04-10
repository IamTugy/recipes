import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Nav from './components/Nav'
import Home from './components/Home'
import RecipeDetail from './components/RecipeDetail'
import TimerPanel from './components/TimerPanel'
import { useTimers } from './hooks/useTimers'

export default function App() {
  const { timers, addTimer, toggleTimer, removeTimer, resetTimer } = useTimers()

  return (
    <div className="min-h-screen bg-bg">
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/recipe/:id"
          element={
            <RecipeDetail
              onAddTimer={addTimer}
              timers={timers}
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
    </div>
  )
}
