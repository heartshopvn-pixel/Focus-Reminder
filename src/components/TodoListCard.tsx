import React, { useState, useEffect, useRef } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { TodoItem } from '../types';
import VoiceInputButton from './VoiceInputButton';

const STORAGE_KEY = 'focus_todos_v1';

interface TodoListCardProps {
  onNotify?: (title: string, desc: string) => void;
}

export default function TodoListCard({ onNotify }: TodoListCardProps) {
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((t) => t && typeof t.text === 'string' && !t.completing);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const completedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const activeOnly = todos.filter((t) => !t.completing);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeOnly));
    } catch {
      // ignore
    }
  }, [todos]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setTodos((prev) => [
      ...prev,
      { id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text: trimmed },
    ]);
    setInput('');
  };

  const handleComplete = (id: string) => {
    if (completedIdsRef.current.has(id)) return;
    completedIdsRef.current.add(id);

    // Stage 1: Extend glowing strike-through bar across the task & wind up slightly
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completing: true } : t)));

    // Stage 2: Fling task bar away & vanish once strike-through completes
    window.setTimeout(() => {
      setTodos((prev) => prev.filter((t) => t.id !== id));
      window.setTimeout(() => {
        completedIdsRef.current.delete(id);
      }, 600);
    }, 440);
  };

  const handleRemove = (id: string) => {
    completedIdsRef.current.delete(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  const anyCompleting = todos.some((t) => t.completing);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-200/60 dark:border-slate-700/60">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
        <div>
          <h2 className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100">
            📝 To-Do List ({todos.filter((t) => !t.completing).length})
          </h2>
          <p className="text-[11px] text-slate-400">Bấm tròn để gạch ngang &amp; hoàn thành</p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-1.5 mb-4">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập việc cần làm..."
          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <VoiceInputButton
          onNotify={onNotify}
          onTranscript={(spoken) => {
            setInput((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
            inputRef.current?.focus();
          }}
        />
        <button
          type="submit"
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold transition active:scale-95 flex items-center gap-1 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm</span>
        </button>
      </form>

      <div className="relative flex-1 flex flex-col">
        <ul
          className={`relative flex-1 space-y-2.5 pr-1 ${
            !anyCompleting && todos.length > 10 ? 'overflow-y-auto max-h-[680px]' : 'overflow-visible'
          }`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {todos.map((todo) => {
              const isDone = Boolean(todo.completing);
              return (
                <motion.li
                  layout
                  key={todo.id}
                  initial={{ opacity: 0, y: -10, scale: 0.96 }}
                  animate={
                    isDone
                      ? {
                          opacity: 1,
                          x: -8,
                          scale: 1.025,
                          transition: { duration: 0.28, ease: 'easeOut' },
                        }
                      : {
                          opacity: 1,
                          x: 0,
                          y: 0,
                          rotate: 0,
                          scale: 1,
                          transition: { type: 'spring', stiffness: 420, damping: 30 },
                        }
                  }
                  exit={
                    completedIdsRef.current.has(todo.id)
                      ? {
                          x: 360,
                          y: -26,
                          rotate: 11,
                          scale: 0.82,
                          opacity: 0,
                          transition: { duration: 0.44, ease: [0.32, 0, 0.67, 0] },
                        }
                      : {
                          opacity: 0,
                          scale: 0.9,
                          x: -24,
                          transition: { duration: 0.2 },
                        }
                  }
                  className={`group relative flex items-center justify-between gap-2.5 p-3 rounded-2xl border transition-colors duration-300 ${
                    isDone
                      ? 'z-30 bg-emerald-50/95 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-500 shadow-lg shadow-emerald-500/20 pointer-events-none'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-100 dark:border-slate-700/60 hover:border-indigo-200 dark:hover:border-slate-600'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleComplete(todo.id)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                  >
                    <motion.span
                      animate={isDone ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                      transition={{ duration: 0.28 }}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-200 ${
                        isDone
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/50'
                          : 'border-slate-300 dark:border-slate-600 group-hover:border-indigo-500'
                      }`}
                    >
                      {isDone && <Check className="w-3 h-3 stroke-[3]" />}
                    </motion.span>

                    <span className="relative flex-1 min-w-0 py-0.5">
                      <span
                        className={`block text-xs sm:text-sm font-medium truncate transition-colors duration-300 ${
                          isDone
                            ? 'text-emerald-700/70 dark:text-emerald-300/70'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {todo.text}
                      </span>

                      {/* Sweeping Horizontal Strike-Through Slash */}
                      <motion.span
                        initial={false}
                        animate={{
                          width: isDone ? '100%' : '0%',
                          opacity: isDone ? 1 : 0,
                        }}
                        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 shadow-[0_0_10px_rgba(16,185,129,0.75)] flex items-center justify-end"
                      >
                        {isDone && (
                          <span className="w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_8px_#34d399] translate-x-1/2" />
                        )}
                      </motion.span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemove(todo.id)}
                    className="text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition p-1 shrink-0"
                    title="Xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        {todos.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="absolute inset-0 flex items-center justify-center py-10 pointer-events-none"
          >
            <p className="text-slate-400 text-xs sm:text-sm text-center">
              Chưa có công việc nào.
              <br />
              Hãy thêm mục tiêu hôm nay!
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
