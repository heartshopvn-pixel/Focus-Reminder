import React from 'react';
import { ReminderItem, SoundType } from '../types';
import { SOUND_OPTIONS } from '../utils/sound';

const SUB_CIRCUMFERENCE = 2 * Math.PI * 46;

export function formatReminderTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

interface ReminderSectionProps {
  variant: 'orange' | 'blue';
  heading: string;
  subtitle: string;
  addLabel: string;
  items: ReminderItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ReminderItem>) => void;
  onToggle: (id: string) => void;
  onReset: (id: string) => void;
  onPlaySound: (id: string, override?: SoundType) => void;
  onUploadSound: (id: string, e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ReminderSection({
  variant,
  heading,
  subtitle,
  addLabel,
  items,
  onAdd,
  onRemove,
  onUpdate,
  onToggle,
  onReset,
  onPlaySound,
  onUploadSound,
}: ReminderSectionProps) {
  const isBlue = variant === 'blue';

  const theme = isBlue
    ? {
        cardBorder: 'border-blue-200/80 dark:border-blue-900/50',
        titleText: 'text-blue-600 dark:text-blue-400',
        addBtn: 'bg-blue-600 hover:bg-blue-700',
        itemBg: 'bg-blue-50/50 dark:bg-slate-900/70 border-blue-200/80 dark:border-blue-900/40',
        ringTrack: 'text-blue-100 dark:text-slate-800',
        ringStroke: '#2563eb',
        timeText: 'text-blue-600 dark:text-blue-400',
        statusText: 'text-blue-500 dark:text-blue-400',
        inputBorder: 'border-blue-200 dark:border-slate-700',
        focusRing: 'focus:ring-blue-500',
        valueText: 'text-blue-700 dark:text-blue-300',
        tabActive: 'bg-blue-600 text-white',
        tabInactive: 'text-slate-500 hover:text-blue-600',
        mp3Btn: 'bg-blue-100/80 dark:bg-slate-800 hover:bg-blue-200 text-blue-700 dark:text-blue-300',
        startBtn: 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/30',
        resetBtn:
          'bg-blue-100/80 dark:bg-slate-800 hover:bg-blue-200/80 text-blue-700 dark:text-blue-300',
        icon: '🔵',
      }
    : {
        cardBorder: 'border-orange-200/70 dark:border-orange-900/40',
        titleText: 'text-orange-600 dark:text-orange-400',
        addBtn: 'bg-orange-500 hover:bg-orange-600',
        itemBg: 'bg-orange-50/50 dark:bg-slate-900/70 border-orange-200/80 dark:border-orange-900/40',
        ringTrack: 'text-orange-100 dark:text-slate-800',
        ringStroke: '#f97316',
        timeText: 'text-orange-600 dark:text-orange-400',
        statusText: 'text-orange-400 dark:text-orange-500',
        inputBorder: 'border-orange-200 dark:border-slate-700',
        focusRing: 'focus:ring-orange-500',
        valueText: 'text-orange-700 dark:text-orange-300',
        tabActive: 'bg-orange-500 text-white',
        tabInactive: 'text-slate-500 hover:text-orange-600',
        mp3Btn:
          'bg-orange-100/80 dark:bg-slate-800 hover:bg-orange-200 text-orange-700 dark:text-orange-300',
        startBtn: 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/30',
        resetBtn:
          'bg-orange-100/80 dark:bg-slate-800 hover:bg-orange-200/80 text-orange-700 dark:text-orange-300',
        icon: '🟠',
      };

  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl border ${theme.cardBorder}`}
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-xl">{theme.icon}</span>
          <div>
            <h2 className={`text-sm sm:text-base font-bold ${theme.titleText}`}>
              {heading} ({items.length})
            </h2>
            <p className="text-[11px] text-slate-400">{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold ${theme.addBtn} text-white shadow-sm transition active:scale-95 whitespace-nowrap shrink-0`}
        >
          {addLabel}
        </button>
      </div>

      <div className="flex flex-col space-y-4">
        {items.map((rem) => {
          const ratio = rem.initialSeconds > 0 ? rem.totalSeconds / rem.initialSeconds : 0;
          const strokeOffset = SUB_CIRCUMFERENCE * (1 - ratio);
          const statusLabel = rem.isRunning
            ? isBlue
              ? 'Đang lặp'
              : 'Đang hẹn'
            : rem.totalSeconds === 0
            ? 'Hoàn thành'
            : 'Sẵn sàng';

          return (
            <div
              key={rem.id}
              className={`${theme.itemBg} border rounded-2xl p-3.5 flex items-center gap-3.5 shadow-sm transition`}
            >
              {/* Circular Progress */}
              <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 110 110">
                  <circle
                    cx="55"
                    cy="55"
                    r="46"
                    strokeWidth="7"
                    stroke="currentColor"
                    fill="transparent"
                    className={theme.ringTrack}
                  />
                  <circle
                    cx="55"
                    cy="55"
                    r="46"
                    strokeWidth="7"
                    stroke={theme.ringStroke}
                    fill="transparent"
                    strokeLinecap="round"
                    strokeDasharray={SUB_CIRCUMFERENCE}
                    strokeDashoffset={strokeOffset}
                    className="transition-all duration-300"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
                  <span
                    className={`text-base font-black font-mono ${theme.timeText} tracking-tight leading-tight`}
                  >
                    {formatReminderTime(rem.totalSeconds)}
                  </span>
                  <span
                    className={`text-[9px] uppercase font-bold tracking-wider ${theme.statusText} mt-0.5`}
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex-1 min-w-0">
                {/* Header Row: Editable Short Title + Mode Switch + Delete */}
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <input
                    type="text"
                    value={rem.title}
                    onChange={(e) => onUpdate(rem.id, { title: e.target.value })}
                    placeholder="Tiêu đề ngắn..."
                    className={`text-xs font-bold ${theme.titleText} bg-transparent border-b border-transparent hover:border-slate-300 focus:border-current focus:outline-none min-w-0 flex-1 truncate py-0.5`}
                    title="Bấm để sửa tiêu đề thông báo Telegram"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <div
                      className={`flex bg-white dark:bg-slate-800 p-0.5 rounded-lg border ${theme.inputBorder} text-[10px] font-semibold`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate(rem.id, { mode: 'countdown', isRunning: false, endTime: null })
                        }
                        className={`px-2 py-0.5 rounded-md transition ${
                          rem.mode === 'countdown' ? theme.tabActive : theme.tabInactive
                        }`}
                      >
                        Giờ/Phút
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate(rem.id, { mode: 'datetime', isRunning: false, endTime: null })
                        }
                        className={`px-2 py-0.5 rounded-md transition ${
                          rem.mode === 'datetime' ? theme.tabActive : theme.tabInactive
                        }`}
                      >
                        Ngày giờ
                      </button>
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemove(rem.id)}
                        className="p-1 text-slate-400 hover:text-rose-500 transition text-xs font-bold"
                        title="Xóa"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Mode-Specific Time Input */}
                {rem.mode === 'countdown' ? (
                  <div className="flex items-center gap-1.5 mb-2">
                    <div
                      className={`flex items-center gap-1 flex-1 bg-white dark:bg-slate-800 border ${theme.inputBorder} rounded-xl px-2 py-1`}
                    >
                      <input
                        type="number"
                        min={0}
                        max={99}
                        disabled={rem.isRunning}
                        value={rem.hours}
                        onChange={(e) =>
                          onUpdate(rem.id, { hours: parseInt(e.target.value, 10) || 0 })
                        }
                        className={`w-full text-xs font-bold text-center bg-transparent focus:outline-none ${theme.valueText}`}
                      />
                      <span className="text-[10px] text-slate-400 shrink-0">giờ</span>
                    </div>
                    <div
                      className={`flex items-center gap-1 flex-1 bg-white dark:bg-slate-800 border ${theme.inputBorder} rounded-xl px-2 py-1`}
                    >
                      <input
                        type="number"
                        min={0}
                        max={59}
                        disabled={rem.isRunning}
                        value={rem.minutes}
                        onChange={(e) =>
                          onUpdate(rem.id, { minutes: parseInt(e.target.value, 10) || 0 })
                        }
                        className={`w-full text-xs font-bold text-center bg-transparent focus:outline-none ${theme.valueText}`}
                      />
                      <span className="text-[10px] text-slate-400 shrink-0">phút</span>
                    </div>
                  </div>
                ) : (
                  <div className="mb-2">
                    <input
                      type="datetime-local"
                      disabled={rem.isRunning}
                      value={rem.targetDateTime}
                      onChange={(e) => onUpdate(rem.id, { targetDateTime: e.target.value })}
                      className={`w-full px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border ${theme.inputBorder} rounded-xl focus:outline-none focus:ring-1 ${theme.focusRing} ${theme.valueText}`}
                    />
                  </div>
                )}

                {/* Note Content Input */}
                <input
                  type="text"
                  value={rem.note}
                  onChange={(e) => onUpdate(rem.id, { note: e.target.value })}
                  placeholder={isBlue ? 'Nhập nội dung routine...' : 'Nhập nội dung nhắc việc...'}
                  className={`w-full px-3 py-1.5 mb-2 text-xs font-medium bg-white dark:bg-slate-800 border ${theme.inputBorder} rounded-xl focus:outline-none focus:ring-2 ${theme.focusRing}`}
                />

                {/* Sound Select & MP3 */}
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <select
                    value={rem.soundType}
                    onChange={(e) => {
                      const val = e.target.value as SoundType;
                      onUpdate(rem.id, { soundType: val });
                      onPlaySound(rem.id, val);
                    }}
                    className={`flex-1 min-w-0 px-2 py-1 bg-white dark:bg-slate-800 border ${theme.inputBorder} rounded-lg text-[11px] font-medium truncate`}
                  >
                    {SOUND_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                    {rem.customAudioData && (
                      <option value="custom">🎵 {rem.customAudioName || 'File MP3'}</option>
                    )}
                  </select>
                  <label
                    className={`cursor-pointer px-2 py-1 ${theme.mp3Btn} rounded-lg text-[10px] font-bold transition shrink-0`}
                  >
                    📁 MP3
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => onUploadSound(rem.id, e)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onPlaySound(rem.id)}
                    className={`px-1.5 py-1 bg-white dark:bg-slate-800 border ${theme.inputBorder} rounded-lg text-[11px] transition shrink-0`}
                  >
                    🔊
                  </button>
                </div>

                {/* Start / Reset Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggle(rem.id)}
                    className={
                      rem.isRunning
                        ? 'flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-1.5 rounded-xl shadow-sm transition active:scale-95 flex items-center justify-center gap-1'
                        : `flex-1 ${theme.startBtn} text-white text-xs font-bold py-1.5 rounded-xl shadow-sm transition active:scale-95 flex items-center justify-center gap-1`
                    }
                  >
                    <span>{rem.isRunning ? '⏸' : '▶'}</span>
                    <span>{rem.isRunning ? 'Dừng' : 'Bắt đầu'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onReset(rem.id)}
                    className={`${theme.resetBtn} text-xs font-semibold px-3 py-1.5 rounded-xl transition active:scale-95`}
                  >
                    Đặt lại
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
