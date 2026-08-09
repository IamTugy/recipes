import { useRef, useState } from 'react'

// Generic undo/redo stack over caller-supplied snapshots - the caller
// decides what a "snapshot" is and how to capture/restore it, this hook
// just manages the two stacks. commit() pushes the *previous* state right
// before a change is applied (so undo restores it), and clears the redo
// stack (standard editor behavior: a new change after an undo discards the
// redo history). In-memory only, cleared whenever the component unmounts.
export function useHistoryStack<Snapshot>() {
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  // Stacks live in refs (no per-entry re-render needed); these mirror just
  // the lengths in state so canUndo/canRedo are safe to read during render.
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)

  function commit(previous: Snapshot) {
    undoStack.current.push(previous)
    redoStack.current = []
    setUndoCount(undoStack.current.length)
    setRedoCount(0)
  }

  function undo(current: Snapshot, restore: (snapshot: Snapshot) => void) {
    const previous = undoStack.current.pop()
    if (previous === undefined) return
    redoStack.current.push(current)
    restore(previous)
    setUndoCount(undoStack.current.length)
    setRedoCount(redoStack.current.length)
  }

  function redo(current: Snapshot, restore: (snapshot: Snapshot) => void) {
    const next = redoStack.current.pop()
    if (next === undefined) return
    undoStack.current.push(current)
    restore(next)
    setUndoCount(undoStack.current.length)
    setRedoCount(redoStack.current.length)
  }

  return {
    commit,
    undo,
    redo,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
  }
}
