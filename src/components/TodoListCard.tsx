import React, { useState, useEffect } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { TodoItem } from '../types';

const STORAGE_KEY = 'focus_todos_v1';

export default function TodoListCard() {
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
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completing: true } : t)));
    window.setTimeout(() => {
      setTodos((prev) => prev.filter((t) => t.id !== id));
    }, 520);
  };

  const handleRemove = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl border border-slate-200/60 dark:border-slate-700/60">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100">
          📝 To-Do List ({todos.filter((t) => !t.completing).length})
        </h3>
        <span className="text-xs text-slate-400">Bấm tròn để hoàn thành</span>
      </div>

      <form onSubmit={handleAdd} className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập việc cần làm..."
          className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-bold transition active:scale-95 flex items-center gap-1 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm</span>
        </button>
      </form>

      {todos.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-4">
          Chưa có công việc nào. Hãy thêm mục tiêu hôm nay!
        </p>
      ) : (
        <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {todos.map((todo) => {
            const isDone = Boolean(todo.completing);
            return (
              <li
                key={todo.id}
                className={`group flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all duration-500 ${
                  isDone
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 opacity-0 translate-x-4 scale-95 pointer-events-none'
                    : 'bg-slate-50 dark:bg-slate-900/60 border-slate-100 dark:border-slate-700/60 opacity-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleComplete(todo.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <span
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors duration-200 ${
                      isDone
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-300 dark:border-slate-600 group-hover:border-indigo-500'
                    }`}
                  >
                    {isDone && <Check className="w-3 h-3 stroke-[3]" />}
                  </span>
                  <span className="relative text-xs sm:text-sm font-medium truncate text-slate-700 dark:text-slate-200">
                    <span className={isDone ? 'text-slate-400 line-through' : ''}>{todo.text}</span>
                    <span
                      className={`absolute left-0 top-1/2 h-[2px] bg-emerald-500 transition-all duration-200 ${
                        isDone ? 'w-full' : 'w-0'
                      }`}
                    />
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
