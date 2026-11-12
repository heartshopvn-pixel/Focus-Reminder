/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { HistoryItem, ReminderItem, SoundType } from './types';
import { playSynthesizedSound, SOUND_OPTIONS } from './utils/sound';
import TodoListCard from './components/TodoListCard';
import ReminderSection, { formatReminderTime } from './components/ReminderSection';
import VoiceInputButton from './components/VoiceInputButton';

const DEFAULT_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxr-zE8YL3yepDSBrt7reZtYcgglWcru8bgF1TgvlweL0Tr4pzRc7Xd0DA0B16uBLkwtw/exec';
const DEFAULT_BOT_TOKEN = '9260153448:AAFxQEPOfaah4zC-W6NqnVNpKjbrb43su7c';
const DEFAULT_CHAT_ID = '7399658008';

const CIRCUMFERENCE = 2 * Math.PI * 95;
const MINI_DOCK_CIRCUMFERENCE = 2 * Math.PI * 34;

function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function getDefaultDateTimeLocal(): string {
  return formatDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000));
}

function createDefaultItem(index = 1, isRoutine = false): ReminderItem {
  const defaultTitle = isRoutine ? `Routine #${index}` : `Nhắc việc #${index}`;
  return {
    id: `${isRoutine ? 'rt' : 'rem'}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: defaultTitle,
    note: '',
    isRoutine,
    mode: 'countdown',
    hours: 0,
    minutes: isRoutine ? 45 : 30,
    targetDateTime: getDefaultDateTimeLocal(),
    totalSeconds: (isRoutine ? 45 : 30) * 60,
    initialSeconds: (isRoutine ? 45 : 30) * 60,
    soundType: isRoutine ? 'marimba' : 'crystal',
    customAudioData: null,
    customAudioName: '',
    endTime: null,
    isRunning: false,
  };
}

function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function formatFocusTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function buildConciseReminderTelegramText(item: ReminderItem): string {
  const icon = item.isRoutine ? '🔁' : '🔔';
  const fallbackTitle = item.isRoutine ? 'Routine' : 'Nhắc việc';
  const title = (item.title || fallbackTitle).trim();
  const note = (item.note || '').trim();
  if (note && note !== title) {
    return `${icon} <b>${escapeHtml(title)}</b>\n${escapeHtml(note)}`;
  }
  return `${icon} <b>${escapeHtml(title)}</b>`;
}

export default function App() {
  // Main Focus Timer State
  const [activeTaskDurationMinutes, setActiveTaskDurationMinutes] = useState<number>(25);
  const [totalSeconds, setTotalSeconds] = useState<number>(25 * 60);
  const [initialSeconds, setInitialSeconds] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Sẵn sàng');

  // Direct inline clock editing state
  const [isEditingClock, setIsEditingClock] = useState<boolean>(false);
  const [clockDraft, setClockDraft] = useState<string>('25');

  const [selectedSoundType, setSelectedSoundType] = useState<SoundType>(
    () => (localStorage.getItem('focus_sound_type') as SoundType) || 'dingdong'
  );
  const [mainCustomAudioName, setMainCustomAudioName] = useState<string>(
    () => localStorage.getItem('main_mp3_name') || ''
  );
  const [mainCustomAudioData, setMainCustomAudioData] = useState<string | null>(
    () => localStorage.getItem('main_mp3_data') || null
  );

  // One-off Reminders (Top of Right Column - Orange)
  const [reminders, setReminders] = useState<ReminderItem[]>(() => {
    try {
      const saved = localStorage.getItem('focus_reminders_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((r: ReminderItem, i: number) => ({
            ...r,
            title: r.title || r.note || `Nhắc việc #${i + 1}`,
            isRoutine: false,
          }));
        }
      }
    } catch {
      // ignore
    }
    return [createDefaultItem(1, false)];
  });

  // Auto-repeating Reminder Routines (Bottom of Right Column - Blue)
  const [routines, setRoutines] = useState<ReminderItem[]>(() => {
    try {
      const saved = localStorage.getItem('focus_routines_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((r: ReminderItem, i: number) => ({
            ...r,
            title: r.title || `Routine #${i + 1}`,
            isRoutine: true,
          }));
        }
      }
    } catch {
      // ignore
    }
    return [createDefaultItem(1, true)];
  });

  useEffect(() => {
    try {
      localStorage.setItem('focus_reminders_v2', JSON.stringify(reminders));
    } catch {
      try {
        localStorage.setItem(
          'focus_reminders_v2',
          JSON.stringify(reminders.map((r) => ({ ...r, customAudioData: null })))
        );
      } catch {
        // ignore
      }
    }
  }, [reminders]);

  useEffect(() => {
    try {
      localStorage.setItem('focus_routines_v1', JSON.stringify(routines));
    } catch {
      try {
        localStorage.setItem(
          'focus_routines_v1',
          JSON.stringify(routines.map((r) => ({ ...r, customAudioData: null })))
        );
      } catch {
        // ignore
      }
    }
  }, [routines]);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('focus_history') || '[]');
    } catch {
      return [];
    }
  });
  const [showQuickAdd, setShowQuickAdd] = useState<boolean>(false);
  const [manualTaskInput, setManualTaskInput] = useState<string>('Work');
  const [manualMinsInput, setManualMinsInput] = useState<number>(25);

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [scriptUrl, setScriptUrl] = useState<string>(
    () => localStorage.getItem('google_script_url') || DEFAULT_SCRIPT_URL
  );
  const [botToken, setBotToken] = useState<string>(
    () => localStorage.getItem('telegram_bot_token') || DEFAULT_BOT_TOKEN
  );
  const [chatId, setChatId] = useState<string>(
    () => localStorage.getItem('telegram_chat_id') || DEFAULT_CHAT_ID
  );
  const [modalSoundSelect, setModalSoundSelect] = useState<SoundType>(selectedSoundType);

  // Alarm Modal & Toast State
  const [alarmOpen, setAlarmOpen] = useState<boolean>(false);
  const [alarmTaskText, setAlarmTaskText] = useState<string>('');
  const [toast, setToast] = useState<{ visible: boolean; title: string; desc: string }>({
    visible: false,
    title: 'Thông báo',
    desc: '',
  });

  const mainEndTimeRef = useRef<number | null>(null);
  const currentAudioObjRef = useRef<HTMLAudioElement | null>(null);
  const alarmIntervalRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const lastTelegramUpdateIdRef = useRef<number>(0);

  const stateRef = useRef({
    isRunning,
    totalSeconds,
    initialSeconds,
    activeTaskDurationMinutes,
    selectedSoundType,
    mainCustomAudioData,
    reminders,
    routines,
    scriptUrl,
    botToken,
    chatId,
    history,
  });

  useEffect(() => {
    stateRef.current = {
      isRunning,
      totalSeconds,
      initialSeconds,
      activeTaskDurationMinutes,
      selectedSoundType,
      mainCustomAudioData,
      reminders,
      routines,
      scriptUrl,
      botToken,
      chatId,
      history,
    };
  }, [
    isRunning,
    totalSeconds,
    initialSeconds,
    activeTaskDurationMinutes,
    selectedSoundType,
    mainCustomAudioData,
    reminders,
    routines,
    scriptUrl,
    botToken,
    chatId,
    history,
  ]);

  useEffect(() => {
    document.title = `(${formatFocusTime(totalSeconds)}) Focus + Reminder`;
  }, [totalSeconds]);

  const showToast = useCallback((title: string, desc: string) => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    setToast({ visible: true, title, desc });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3500);
  }, []);

  const playTimerSound = useCallback((target: 'main' | string, overrideSound?: SoundType) => {
    if (currentAudioObjRef.current) {
      currentAudioObjRef.current.pause();
      currentAudioObjRef.current.currentTime = 0;
    }

    if (target === 'main') {
      const soundToPlay = overrideSound || stateRef.current.selectedSoundType;
      if (soundToPlay === 'custom') {
        const mp3Data =
          stateRef.current.mainCustomAudioData || localStorage.getItem('main_mp3_data');
        if (mp3Data) {
          currentAudioObjRef.current = new Audio(mp3Data);
          currentAudioObjRef.current.play().catch(() => {});
          return;
        }
      }
      playSynthesizedSound(soundToPlay);
    } else {
      const allItems = [...stateRef.current.reminders, ...stateRef.current.routines];
      const rem = allItems.find((r) => r.id === target);
      if (!rem) return;
      const soundToPlay = overrideSound || rem.soundType || 'dingdong';
      if (soundToPlay === 'custom' && rem.customAudioData) {
        currentAudioObjRef.current = new Audio(rem.customAudioData);
        currentAudioObjRef.current.play().catch(() => {});
        return;
      }
      playSynthesizedSound(soundToPlay);
    }
  }, []);

  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      window.clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (currentAudioObjRef.current) {
      currentAudioObjRef.current.pause();
      currentAudioObjRef.current.currentTime = 0;
    }
    setAlarmOpen(false);
  }, []);

  const startContinuousAlarm = useCallback(
    (label: string, target: 'main' | string = 'main') => {
      stopAlarm();
      setAlarmTaskText(label);
      setAlarmOpen(true);
      playTimerSound(target);
      alarmIntervalRef.current = window.setInterval(() => {
        playTimerSound(target);
      }, 2400);
    },
    [playTimerSound, stopAlarm]
  );

  // Cloud & Telegram Helpers
  const scheduleCloudTimer = useCallback(
    (timerId: string, taskName: string, secondsLeft: number, recordSheet: boolean) => {
      const url =
        stateRef.current.scriptUrl.trim() ||
        localStorage.getItem('google_script_url') ||
        DEFAULT_SCRIPT_URL;
      if (!url) return;
      const token = stateRef.current.botToken.trim() || DEFAULT_BOT_TOKEN;
      const cid = stateRef.current.chatId.trim() || DEFAULT_CHAT_ID;

      fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'schedule_timer',
          timerId,
          task: taskName,
          durationMinutes: Math.max(1, Math.round(secondsLeft / 60)),
          delaySeconds: secondsLeft,
          endTime: Date.now() + secondsLeft * 1000,
          recordSheet,
          botToken: token,
          chatId: cid,
        }),
      }).catch(() => {});
    },
    []
  );

  const cancelCloudTimer = useCallback((timerId: string) => {
    const url =
      stateRef.current.scriptUrl.trim() ||
      localStorage.getItem('google_script_url') ||
      DEFAULT_SCRIPT_URL;
    if (!url) return;
    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'cancel_timer', timerId }),
    }).catch(() => {});
  }, []);

  const syncToGoogleSheet = useCallback(
    (url: string, task: string, duration: number) => {
      fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ task, duration }),
      })
        .then(() => showToast('☁️ Đã đồng bộ', `Đã ghi ${duration} phút lên Google Sheet!`))
        .catch(() => showToast('❌ Lỗi ghi Sheet', 'Không thể kết nối tới Webhook URL.'));
    },
    [showToast]
  );

  const sendTelegramHtml = useCallback(
    (htmlMessage: string, isTest = false) => {
      const token = stateRef.current.botToken.trim() || DEFAULT_BOT_TOKEN;
      const cid = stateRef.current.chatId.trim() || DEFAULT_CHAT_ID;
      if (!token || !cid) {
        if (isTest) showToast('⚠️ Thiếu cấu hình', 'Vui lòng nhập Bot Token và Chat ID!');
        return;
      }
      if (isTest) showToast('⏳ Đang gửi...', 'Đang kết nối tới Telegram...');

      fetch(
        `https://api.telegram.org/bot${token}/sendMessage?chat_id=${encodeURIComponent(
          cid
        )}&text=${encodeURIComponent(htmlMessage)}&parse_mode=HTML`
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.ok) {
            if (isTest) showToast('✅ Thành công!', 'Đã gửi tin nhắn tới Telegram.');
          } else {
            showToast('❌ Lỗi Telegram', data.description || 'Lỗi không xác định');
          }
        })
        .catch(() => {
          if (isTest) showToast('❌ Lỗi mạng', 'Không thể kết nối tới API Telegram.');
        });
    },
    [showToast]
  );

  const saveHistoryEntry = useCallback((task: string, duration: number) => {
    const existing: HistoryItem[] = (() => {
      try {
        return JSON.parse(localStorage.getItem('focus_history') || '[]');
      } catch {
        return [];
      }
    })();
    const entry: HistoryItem = {
      task,
      duration,
      time:
        new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
        ' ' +
        new Date().toLocaleDateString('vi-VN'),
    };
    const updated = [entry, ...existing].slice(0, 50);
    localStorage.setItem('focus_history', JSON.stringify(updated));
    setHistory(updated);
  }, []);

  const handleTimerComplete = useCallback(() => {
    const taskName = 'Work';
    const mins = Math.max(1, Math.round(stateRef.current.initialSeconds / 60));
    cancelCloudTimer('MAIN_WORK');

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Hết giờ Focus!', { body: `Hoàn thành: ${taskName} (${mins} phút)` });
    }

    showToast('🎉 Hoàn thành!', `Đã kết thúc phiên: ${taskName} (${mins} phút)`);
    saveHistoryEntry(taskName, mins);
    sendTelegramHtml(`🍅 <b>Hoàn thành Focus</b>\n${escapeHtml(taskName)} — ${mins} phút`);

    const url =
      stateRef.current.scriptUrl.trim() ||
      localStorage.getItem('google_script_url') ||
      DEFAULT_SCRIPT_URL;
    if (url) syncToGoogleSheet(url, taskName, mins);

    startContinuousAlarm(`Đã hoàn thành Focus: "${taskName}" (${mins} phút)`, 'main');
  }, [
    cancelCloudTimer,
    saveHistoryEntry,
    sendTelegramHtml,
    showToast,
    startContinuousAlarm,
    syncToGoogleSheet,
  ]);

  const handleReminderAlert = useCallback(
    (rem: ReminderItem) => {
      const fallbackTitle = rem.isRoutine ? 'Routine' : 'Nhắc việc';
      const titleText = (rem.title || fallbackTitle).trim();
      const noteText = (rem.note || '').trim();
      const displayLabel = noteText ? `${titleText}: ${noteText}` : titleText;

      if (!rem.isRoutine) {
        cancelCloudTimer(rem.id);
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`${rem.isRoutine ? '🔁' : '🔔'} ${titleText}`, {
          body: noteText || 'Đến giờ nhắc hẹn!',
        });
      }

      showToast(
        rem.isRoutine ? `🔵 Routine lặp lại: ${titleText}` : `🟠 Đến giờ: ${titleText}`,
        noteText || 'Đã gửi thông báo qua Telegram'
      );

      // Push concise title + content to Telegram
      sendTelegramHtml(buildConciseReminderTelegramText(rem));

      startContinuousAlarm(displayLabel, rem.id);
    },
    [cancelCloudTimer, sendTelegramHtml, showToast, startContinuousAlarm]
  );

  // Main Focus Controls & Direct Clock Input
  const applyDurationSeconds = useCallback(
    (secs: number) => {
      const clampedSecs = Math.max(10, Math.min(600 * 60, Math.floor(secs) || 60));
      const mins = Math.max(1, Math.round(clampedSecs / 60));
      if (stateRef.current.isRunning) {
        setIsRunning(false);
        mainEndTimeRef.current = null;
        localStorage.removeItem('main_timer_end_time');
        cancelCloudTimer('MAIN_WORK');
      }
      setActiveTaskDurationMinutes(mins);
      setTotalSeconds(clampedSecs);
      setInitialSeconds(clampedSecs);
      setStatusText('Sẵn sàng');
      stateRef.current.activeTaskDurationMinutes = mins;
      stateRef.current.totalSeconds = clampedSecs;
      stateRef.current.initialSeconds = clampedSecs;
      stateRef.current.isRunning = false;
    },
    [cancelCloudTimer]
  );

  const applyDurationMinutes = useCallback(
    (minutes: number) => {
      const mins = Math.max(1, Math.min(360, Math.floor(minutes) || 1));
      applyDurationSeconds(mins * 60);
    },
    [applyDurationSeconds]
  );

  const commitClockDraft = useCallback(
    (raw: string) => {
      setIsEditingClock(false);
      const trimmed = raw.trim();
      if (!trimmed) return;

      if (trimmed.includes(':')) {
        const [mPart, sPart] = trimmed.split(':');
        const m = Math.max(0, parseInt(mPart, 10) || 0);
        const s = Math.max(0, Math.min(59, parseInt(sPart, 10) || 0));
        const total = m * 60 + s;
        if (total > 0) applyDurationSeconds(total);
      } else {
        const mins = parseInt(trimmed, 10);
        if (!isNaN(mins) && mins > 0) {
          applyDurationMinutes(mins);
        }
      }
    },
    [applyDurationMinutes, applyDurationSeconds]
  );

  const toggleTimer = useCallback(() => {
    if (stateRef.current.isRunning) {
      setIsRunning(false);
      mainEndTimeRef.current = null;
      localStorage.removeItem('main_timer_end_time');
      cancelCloudTimer('MAIN_WORK');
      setStatusText('Đã tạm dừng');
    } else {
      setIsEditingClock(false);
      const secs =
        stateRef.current.totalSeconds > 0
          ? stateRef.current.totalSeconds
          : stateRef.current.initialSeconds;
      if (stateRef.current.totalSeconds <= 0) setTotalSeconds(secs);
      const end = Date.now() + secs * 1000;
      mainEndTimeRef.current = end;
      localStorage.setItem('main_timer_end_time', String(end));
      localStorage.setItem('main_timer_init_sec', String(stateRef.current.initialSeconds));
      localStorage.setItem(
        'main_timer_duration_mins',
        String(stateRef.current.activeTaskDurationMinutes)
      );

      scheduleCloudTimer('MAIN_WORK', 'Work', secs, true);
      setIsRunning(true);
      setStatusText('Đang tập trung');
    }
  }, [cancelCloudTimer, scheduleCloudTimer]);

  // Red Finish Immediately Button: records integer minutes to History & Sheet (no seconds)
  const finishTimerImmediately = useCallback(() => {
    const cur = stateRef.current;
    if (!cur.isRunning && cur.totalSeconds === cur.initialSeconds) {
      showToast('⏳ Chưa bắt đầu', 'Hãy bấm Bắt đầu phiên Focus trước khi Kết thúc!');
      return;
    }

    stopAlarm();
    setIsRunning(false);
    setIsEditingClock(false);
    mainEndTimeRef.current = null;
    localStorage.removeItem('main_timer_end_time');
    cancelCloudTimer('MAIN_WORK');

    const elapsedSeconds = Math.max(0, cur.initialSeconds - cur.totalSeconds);
    const recordedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

    setTotalSeconds(cur.initialSeconds);
    setStatusText('Đã kết thúc');

    saveHistoryEntry('Work', recordedMinutes);
    const url =
      cur.scriptUrl.trim() || localStorage.getItem('google_script_url') || DEFAULT_SCRIPT_URL;
    if (url) syncToGoogleSheet(url, 'Work', recordedMinutes);

    sendTelegramHtml(`🛑 <b>Kết thúc Focus</b>\nWork — ${recordedMinutes} phút`);
    playTimerSound('main');
    showToast(
      '✅ Đã kết thúc phiên Focus!',
      `Đã ghi nhận ${recordedMinutes} phút vào nhật ký & Google Sheet.`
    );
  }, [
    cancelCloudTimer,
    playTimerSound,
    saveHistoryEntry,
    sendTelegramHtml,
    showToast,
    stopAlarm,
    syncToGoogleSheet,
  ]);

  const resetTimer = useCallback(() => {
    stopAlarm();
    setIsRunning(false);
    setIsEditingClock(false);
    mainEndTimeRef.current = null;
    localStorage.removeItem('main_timer_end_time');
    cancelCloudTimer('MAIN_WORK');
    setStatusText('Sẵn sàng');
    setTotalSeconds(stateRef.current.initialSeconds);
  }, [cancelCloudTimer, stopAlarm]);

  // Main Timer Interval
  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => {
      if (!mainEndTimeRef.current) return;
      const rem = Math.max(0, Math.ceil((mainEndTimeRef.current - Date.now()) / 1000));
      setTotalSeconds(rem);
      if (rem <= 0) {
        window.clearInterval(interval);
        setIsRunning(false);
        mainEndTimeRef.current = null;
        localStorage.removeItem('main_timer_end_time');
        setStatusText('Hoàn thành');
        handleTimerComplete();
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, handleTimerComplete]);

  // One-off Reminders & Auto-repeating Routines Tick Interval
  const anySubRunning =
    reminders.some((r) => r.isRunning) || routines.some((r) => r.isRunning);

  useEffect(() => {
    if (!anySubRunning) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const alertsToFire: ReminderItem[] = [];

      // 1. Tick one-off Reminders
      setReminders((prev) =>
        prev.map((r) => {
          if (!r.isRunning || !r.endTime) return r;
          const rem = Math.max(0, Math.ceil((r.endTime - now) / 1000));
          if (rem <= 0) {
            alertsToFire.push(r);
            return { ...r, totalSeconds: 0, isRunning: false, endTime: null };
          }
          return { ...r, totalSeconds: rem };
        })
      );

      // 2. Tick auto-repeating Routines
      setRoutines((prev) =>
        prev.map((r) => {
          if (!r.isRunning || !r.endTime) return r;
          const rem = Math.max(0, Math.ceil((r.endTime - now) / 1000));
          if (rem <= 0) {
            alertsToFire.push(r);

            // Compute next repeat cycle automatically
            let nextSecs = Math.max(60, r.hours * 3600 + r.minutes * 60);
            let nextDateTime = r.targetDateTime;

            if (r.mode === 'datetime') {
              let nextTargetMs = new Date(r.targetDateTime).getTime();
              if (isNaN(nextTargetMs)) nextTargetMs = now;
              while (nextTargetMs <= now) {
                nextTargetMs += 24 * 3600 * 1000;
              }
              nextSecs = Math.ceil((nextTargetMs - now) / 1000);
              nextDateTime = formatDateTimeLocal(new Date(nextTargetMs));
            }

            const nextEnd = now + nextSecs * 1000;
            const cloudLabel = `🔁 ${r.title || 'Routine'}${r.note ? `: ${r.note}` : ''}`;
            scheduleCloudTimer(r.id, cloudLabel, nextSecs, false);

            return {
              ...r,
              targetDateTime: nextDateTime,
              totalSeconds: nextSecs,
              initialSeconds: nextSecs,
              endTime: nextEnd,
              isRunning: true,
            };
          }
          return { ...r, totalSeconds: rem };
        })
      );

      alertsToFire.forEach((item) => handleReminderAlert(item));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [anySubRunning, handleReminderAlert, scheduleCloudTimer]);

  // Restore Timers on Mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission().catch(() => {});
    }

    const now = Date.now();
    const savedMainEnd = parseInt(localStorage.getItem('main_timer_end_time') || '0', 10);
    const savedMainInit = parseInt(localStorage.getItem('main_timer_init_sec') || '0', 10);
    const savedMainMins = parseInt(localStorage.getItem('main_timer_duration_mins') || '25', 10);

    if (savedMainEnd > 0) {
      const initSecs = savedMainInit || savedMainMins * 60;
      setActiveTaskDurationMinutes(savedMainMins);
      setInitialSeconds(initSecs);
      if (savedMainEnd > now) {
        setTotalSeconds(Math.ceil((savedMainEnd - now) / 1000));
        mainEndTimeRef.current = savedMainEnd;
        setIsRunning(true);
        setStatusText('Đang tập trung');
      } else {
        localStorage.removeItem('main_timer_end_time');
        setTotalSeconds(initSecs);
        saveHistoryEntry('Work (Hoàn thành ngầm Cloud)', savedMainMins);
      }
    }

    setReminders((prev) =>
      prev.map((r) => {
        if (r.isRunning && r.endTime) {
          if (r.endTime > now) {
            return { ...r, totalSeconds: Math.ceil((r.endTime - now) / 1000) };
          }
          return { ...r, isRunning: false, endTime: null, totalSeconds: 0 };
        }
        return r;
      })
    );

    setRoutines((prev) =>
      prev.map((r) => {
        if (r.isRunning && r.endTime) {
          if (r.endTime > now) {
            return { ...r, totalSeconds: Math.ceil((r.endTime - now) / 1000) };
          }
          const cycleSecs = Math.max(60, r.initialSeconds || r.hours * 3600 + r.minutes * 60);
          const cycleMs = cycleSecs * 1000;
          const remMs = cycleMs - ((now - r.endTime) % cycleMs);
          return {
            ...r,
            totalSeconds: Math.ceil(remMs / 1000),
            initialSeconds: cycleSecs,
            endTime: now + remMs,
            isRunning: true,
          };
        }
        return r;
      })
    );
  }, [saveHistoryEntry]);

  // Telegram Bot Polling
  useEffect(() => {
    const token = botToken.trim() || DEFAULT_BOT_TOKEN;
    if (!token) return;

    fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`).catch(
      () => {}
    );

    const pollInterval = window.setInterval(async () => {
      const currentToken = stateRef.current.botToken.trim() || DEFAULT_BOT_TOKEN;
      if (!currentToken) return;
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${currentToken}/getUpdates?offset=${
            lastTelegramUpdateIdRef.current + 1
          }&timeout=1`
        );
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            lastTelegramUpdateIdRef.current = update.update_id;
            if (update.message?.text) {
              const incomingChatId = String(update.message.chat.id);
              const rawText = update.message.text.trim();
              const normText = removeVietnameseAccents(rawText);
              const cur = stateRef.current;
              const timeStr = formatFocusTime(cur.totalSeconds);
              let reply = '';

              if (normText.includes('thong ke') || normText.includes('bao cao')) {
                const totalSessions = cur.history.length;
                const totalMinutes = cur.history.reduce(
                  (s, i) => s + (Number(i.duration) || 0),
                  0
                );
                reply =
                  `📊 <b>[BÁO CÁO FOCUS + REMINDER]</b>\n` +
                  `✅ Tổng phiên: <b>${totalSessions}</b> (${totalMinutes} phút)\n` +
                  `🔄 Đồng hồ Focus: ${
                    cur.isRunning ? `▶️ Đang chạy (${timeStr})` : `⏸ Đang dừng (${timeStr})`
                  }`;
              } else if (normText === 'bat dau' || normText === '/run') {
                if (!cur.isRunning) toggleTimer();
                reply = `▶️ Đã bắt đầu Focus (${timeStr})`;
              } else if (normText === 'tam dung' || normText === '/stop') {
                if (cur.isRunning) toggleTimer();
                reply = `⏸ Đã tạm dừng Focus (${timeStr})`;
              } else if (normText === 'ket thuc') {
                finishTimerImmediately();
                reply = `🛑 Đã kết thúc phiên Focus và ghi Sheet!`;
              } else if (normText === 'dat lai' || normText === 'reset') {
                resetTimer();
                reply = `🔄 Đã đặt lại Focus!`;
              } else {
                reply = `🤖 <b>Focus + Reminder Bot:</b> Gõ <b>"Thống kê"</b>, <b>"Bắt đầu"</b>, <b>"Tạm dừng"</b>, <b>"Kết thúc"</b> hoặc <b>"Đặt lại"</b>.`;
              }

              fetch(
                `https://api.telegram.org/bot${currentToken}/sendMessage?chat_id=${encodeURIComponent(
                  incomingChatId
                )}&text=${encodeURIComponent(reply)}&parse_mode=HTML`
              ).catch(() => {});
            }
          }
        }
      } catch {
        // ignore
      }
    }, 3000);

    return () => window.clearInterval(pollInterval);
  }, [botToken, finishTimerImmediately, resetTimer, toggleTimer]);

  // Generic Updater Helpers for Reminders & Routines
  const patchItemList = (
    setter: React.Dispatch<React.SetStateAction<ReminderItem[]>>,
    id: string,
    patch: Partial<ReminderItem>
  ) => {
    setter((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };
        if (!updated.isRunning && ('hours' in patch || 'minutes' in patch || 'mode' in patch)) {
          if (updated.mode === 'countdown') {
            const h = Math.max(0, Math.min(99, Number(updated.hours) || 0));
            const m = Math.max(0, Math.min(59, Number(updated.minutes) || 0));
            const secs = Math.max(60, h * 3600 + m * 60);
            updated.hours = h;
            updated.minutes = h === 0 && m === 0 ? 1 : m;
            updated.totalSeconds = secs;
            updated.initialSeconds = secs;
          } else if (updated.mode === 'datetime' && updated.targetDateTime) {
            const diff = Math.max(
              0,
              Math.ceil((new Date(updated.targetDateTime).getTime() - Date.now()) / 1000)
            );
            updated.totalSeconds = diff;
            updated.initialSeconds = Math.max(60, diff);
          }
        }
        return updated;
      })
    );
  };

  const toggleItemInList = (
    list: ReminderItem[],
    setter: React.Dispatch<React.SetStateAction<ReminderItem[]>>,
    id: string
  ) => {
    const target = list.find((r) => r.id === id);
    if (!target) return;

    if (target.isRunning) {
      cancelCloudTimer(id);
      patchItemList(setter, id, { isRunning: false, endTime: null });
      return;
    }

    let secs = target.totalSeconds;
    let initSecs = target.initialSeconds;

    if (target.mode === 'datetime') {
      const targetMs = new Date(target.targetDateTime).getTime();
      if (isNaN(targetMs) || targetMs <= Date.now()) {
        showToast('⚠️ Thời gian không hợp lệ', 'Vui lòng chọn ngày giờ trong tương lai!');
        return;
      }
      secs = Math.ceil((targetMs - Date.now()) / 1000);
      initSecs = secs;
    } else if (secs <= 0) {
      secs = Math.max(60, target.hours * 3600 + target.minutes * 60);
      initSecs = secs;
    }

    const end = Date.now() + secs * 1000;
    const prefix = target.isRoutine ? '🔁' : '🔔';
    const title = (target.title || (target.isRoutine ? 'Routine' : 'Nhắc việc')).trim();
    const cloudLabel = target.note.trim() ? `${prefix} ${title}: ${target.note.trim()}` : `${prefix} ${title}`;

    scheduleCloudTimer(id, cloudLabel, secs, false);
    patchItemList(setter, id, {
      totalSeconds: secs,
      initialSeconds: initSecs,
      endTime: end,
      isRunning: true,
    });
  };

  const resetItemInList = (
    setter: React.Dispatch<React.SetStateAction<ReminderItem[]>>,
    id: string
  ) => {
    stopAlarm();
    cancelCloudTimer(id);
    setter((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const secs =
          r.mode === 'countdown'
            ? Math.max(60, r.hours * 3600 + r.minutes * 60)
            : Math.max(
                0,
                Math.ceil((new Date(r.targetDateTime).getTime() - Date.now()) / 1000)
              );
        return {
          ...r,
          isRunning: false,
          endTime: null,
          totalSeconds: secs,
          initialSeconds: Math.max(60, secs),
        };
      })
    );
  };

  const uploadCustomSound = (target: 'main' | string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3.5 * 1024 * 1024) {
      showToast('⚠️ File quá lớn', 'Vui lòng chọn file MP3 nhỏ hơn 3.5MB!');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;

      if (target === 'main') {
        try {
          localStorage.setItem('main_mp3_data', dataUrl);
          localStorage.setItem('main_mp3_name', file.name);
        } catch {
          // ignore
        }
        setMainCustomAudioData(dataUrl);
        setMainCustomAudioName(file.name);
        setSelectedSoundType('custom');
        setModalSoundSelect('custom');
        localStorage.setItem('focus_sound_type', 'custom');
        showToast('🎵 Đã tải MP3', `Đã gán "${file.name}" cho đồng hồ Focus.`);
      } else if (target.startsWith('rt_')) {
        patchItemList(setRoutines, target, {
          customAudioData: dataUrl,
          customAudioName: file.name,
          soundType: 'custom',
        });
        showToast('🎵 Đã tải MP3', `Đã gán "${file.name}" cho Routine.`);
      } else {
        patchItemList(setReminders, target, {
          customAudioData: dataUrl,
          customAudioName: file.name,
          soundType: 'custom',
        });
        showToast('🎵 Đã tải MP3', `Đã gán "${file.name}" cho Reminder.`);
      }

      if (currentAudioObjRef.current) currentAudioObjRef.current.pause();
      currentAudioObjRef.current = new Audio(dataUrl);
      currentAudioObjRef.current.play().catch(() => {});
    };
    reader.readAsDataURL(file);
  };

  const submitManualSession = () => {
    const task = manualTaskInput.trim() || 'Work';
    const mins = Number(manualMinsInput) || 25;
    saveHistoryEntry(task, mins);
    const url =
      scriptUrl.trim() || localStorage.getItem('google_script_url') || DEFAULT_SCRIPT_URL;
    if (url) syncToGoogleSheet(url, task, mins);
    setManualTaskInput('Work');
    setShowQuickAdd(false);
    showToast('✅ Đã thêm phiên!', `Đã bổ sung "${task}" (${mins} phút).`);
  };

  const saveSettings = () => {
    localStorage.setItem('google_script_url', scriptUrl.trim());
    localStorage.setItem('telegram_bot_token', botToken.trim());
    localStorage.setItem('telegram_chat_id', chatId.trim());
    localStorage.setItem('focus_sound_type', modalSoundSelect);
    setSelectedSoundType(modalSoundSelect);
    setIsSettingsOpen(false);
    showToast('💾 Đã lưu', 'Đã cập nhật cài đặt.');
  };

  const mainProgressRatio = initialSeconds > 0 ? totalSeconds / initialSeconds : 0;
  const mainStrokeDashoffset = CIRCUMFERENCE * (1 - mainProgressRatio);
  const activeDockItems = [
    ...reminders.filter((r) => r.isRunning),
    ...routines.filter((r) => r.isRunning),
  ];

  const canFinishSession = isRunning || totalSeconds < initialSeconds;

  return (
    <div className="overflow-x-clip bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 text-slate-800 dark:text-slate-100 min-h-screen flex flex-col justify-between antialiased">
      {/* Toast Notification */}
      <div
        className={`fixed top-5 right-5 z-50 transform transition-transform duration-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-2xl p-4 flex items-center space-x-3 max-w-sm pointer-events-none ${
          toast.visible ? 'translate-x-0' : 'translate-x-[120%]'
        }`}
      >
        <div className="text-2xl">✨</div>
        <div>
          <h4 className="font-semibold text-sm">{toast.title}</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">{toast.desc}</p>
        </div>
      </div>

      <div className="max-w-[1440px] w-full mx-auto p-4 sm:p-6 my-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60">
          <div className="flex items-center space-x-2.5">
            <span className="text-2xl">🍅</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
                  Focus + Reminder
                </h1>
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  · Cloud &amp; Bot Bật
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Focus Work · To-Do List · Reminder Nhắc Việc &amp; Routine Tự Lặp
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                const url =
                  scriptUrl.trim() ||
                  localStorage.getItem('google_script_url') ||
                  DEFAULT_SCRIPT_URL;
                showToast('⏳ Đang gửi lên Sheet...', 'Đang ghi thử phiên 25 phút...');
                syncToGoogleSheet(url, 'Work', 25);
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>📊</span>
              <span className="hidden sm:inline">Test ghi Sheet</span>
            </button>
            <button
              type="button"
              onClick={() =>
                sendTelegramHtml('🤖 <b>Focus + Reminder</b>\nKiểm tra kết nối Telegram thành công!', true)
              }
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>✈️</span>
              <span className="hidden sm:inline">Test Telegram</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setModalSoundSelect(selectedSoundType);
                setIsSettingsOpen(true);
              }}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition shrink-0"
              title="Cài đặt"
            >
              ⚙️
            </button>
          </div>
        </header>

        {/* Active Dock on Mobile/Tablet when scrolled */}
        {activeDockItems.length > 0 && (
          <div className="lg:hidden fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center space-y-2.5 pointer-events-auto max-h-[90vh] overflow-y-auto py-2 px-1">
            {activeDockItems.map((rem) => {
              const ratio = rem.initialSeconds > 0 ? rem.totalSeconds / rem.initialSeconds : 0;
              const offset = MINI_DOCK_CIRCUMFERENCE * (1 - ratio);
              const isBlue = Boolean(rem.isRoutine);
              return (
                <div
                  key={rem.id}
                  className={`bg-white dark:bg-slate-800 border-2 ${
                    isBlue
                      ? 'border-blue-500 shadow-blue-500/20'
                      : 'border-rose-500 shadow-rose-500/20'
                  } rounded-2xl p-2 shadow-lg flex flex-col items-center w-24 transition transform hover:scale-105`}
                  title={rem.note || rem.title}
                >
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        strokeWidth="6"
                        stroke="currentColor"
                        fill="transparent"
                        className={
                          isBlue
                            ? 'text-blue-100 dark:text-blue-950/60'
                            : 'text-rose-100 dark:text-rose-950/60'
                        }
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        strokeWidth="6"
                        stroke={isBlue ? '#2563eb' : '#ef4444'}
                        fill="transparent"
                        strokeLinecap="round"
                        strokeDasharray={MINI_DOCK_CIRCUMFERENCE}
                        strokeDashoffset={offset}
                        className="transition-all duration-300"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-1">
                      <span
                        className={`text-[11px] font-black font-mono leading-none ${
                          isBlue
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatReminderTime(rem.totalSeconds)}
                      </span>
                      <span
                        className={`text-[9px] font-bold mt-0.5 ${
                          isBlue ? 'text-blue-500' : 'text-rose-500'
                        }`}
                      >
                        {isBlue ? 'Routine' : 'Nhắc'}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold truncate w-full text-center mt-1 px-1 ${
                      isBlue
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {rem.note || rem.title}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Main 3-Column Grid: Left = To-Do List | Center = Focus Work | Right = Reminders */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 xl:gap-6 items-stretch">
          {/* Left Column (3 cols): To-Do List */}
          <div className="lg:col-span-3 flex flex-col relative z-20">
            <TodoListCard onNotify={showToast} />
          </div>

          {/* Center Column (5 cols): Focus Work Timer + History */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* Focus Work Timer Card */}
            <div className="w-full bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl border border-slate-200/60 dark:border-slate-700/60 text-center">
              <div className="mb-4 max-w-md mx-auto">
                <div className="flex justify-between items-center mb-1.5 px-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Mục tiêu hiện tại:
                  </label>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    ☁️ Tự ghi Google Sheet
                  </span>
                </div>
                <input
                  type="text"
                  value="Work"
                  readOnly
                  className="w-full px-4 py-2.5 bg-indigo-50/60 dark:bg-slate-900 border border-indigo-200 dark:border-slate-700 rounded-2xl text-center font-bold text-indigo-700 dark:text-indigo-300 cursor-not-allowed select-none text-base"
                />
              </div>

              {/* Quick Presets & Sound Bar */}
              <div className="mb-5 max-w-md mx-auto bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/70">
                <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                  {[10, 15, 20, 25, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => applyDurationMinutes(mins)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition ${
                        activeTaskDurationMinutes === mins && totalSeconds === mins * 60
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-500'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    🔔 Chuông Focus:
                  </span>
                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <select
                      value={selectedSoundType}
                      onChange={(e) => {
                        const val = e.target.value as SoundType;
                        setSelectedSoundType(val);
                        setModalSoundSelect(val);
                        localStorage.setItem('focus_sound_type', val);
                        playTimerSound('main', val);
                      }}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium max-w-[150px] truncate"
                    >
                      {SOUND_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      {mainCustomAudioData && (
                        <option value="custom">🎵 {mainCustomAudioName || 'File MP3'}</option>
                      )}
                    </select>
                    <label className="cursor-pointer px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-semibold transition shrink-0">
                      📁 MP3
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => uploadCustomSound('main', e)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => playTimerSound('main')}
                      className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl text-xs transition shrink-0"
                    >
                      🔊
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Focus Ring with Direct Inline Time Editing */}
              <div className="relative w-60 h-60 sm:w-64 sm:h-64 mx-auto my-2 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 220 220">
                  <circle
                    cx="110"
                    cy="110"
                    r="95"
                    strokeWidth="10"
                    stroke="currentColor"
                    fill="transparent"
                    className="text-slate-100 dark:text-slate-700/60"
                  />
                  <circle
                    cx="110"
                    cy="110"
                    r="95"
                    strokeWidth="10"
                    stroke="url(#progressGradient)"
                    fill="transparent"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={mainStrokeDashoffset}
                    className="transition-all duration-500"
                  />
                  <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
                  {isEditingClock && !isRunning ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={clockDraft}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setClockDraft(e.target.value)}
                      onBlur={(e) => commitClockDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitClockDraft(clockDraft);
                        if (e.key === 'Escape') setIsEditingClock(false);
                      }}
                      placeholder="25"
                      className="w-44 text-5xl sm:text-6xl font-black tracking-tight text-center text-indigo-600 dark:text-indigo-400 font-mono bg-indigo-50/90 dark:bg-slate-900 border-2 border-indigo-500 rounded-2xl py-1 focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => {
                        if (isRunning) return;
                        const defaultDraft =
                          totalSeconds % 60 === 0
                            ? String(Math.floor(totalSeconds / 60))
                            : formatFocusTime(totalSeconds);
                        setClockDraft(defaultDraft);
                        setIsEditingClock(true);
                      }}
                      title={
                        isRunning
                          ? 'Tạm dừng để sửa giờ'
                          : 'Bấm để nhập trực tiếp số phút (VD: 45 hoặc 25:30)'
                      }
                      className={`text-5xl sm:text-6xl font-black tracking-tight text-slate-900 dark:text-white font-mono px-3 py-1 rounded-2xl transition ${
                        isRunning
                          ? 'cursor-default'
                          : 'hover:bg-indigo-50 dark:hover:bg-slate-700/60 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-text'
                      }`}
                    >
                      {formatFocusTime(totalSeconds)}
                    </button>
                  )}
                  <span className="text-[11px] uppercase font-bold tracking-widest text-slate-400 mt-1">
                    {isEditingClock
                      ? 'Nhập phút + Enter'
                      : !isRunning
                      ? `${statusText} · Bấm giờ để sửa`
                      : statusText}
                  </span>
                </div>
              </div>

              {/* Action Buttons: Start/Pause + Red Finish + Reset */}
              <div className="flex flex-wrap justify-center items-center gap-2.5 mt-6">
                <button
                  type="button"
                  onClick={toggleTimer}
                  className={
                    isRunning
                      ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-3 rounded-2xl shadow-lg transition active:scale-95 flex items-center space-x-2 text-sm'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-3 rounded-2xl shadow-lg shadow-indigo-500/30 transition active:scale-95 flex items-center space-x-2 text-sm'
                  }
                >
                  <span>{isRunning ? '⏸' : '▶'}</span>
                  <span>{isRunning ? 'Tạm dừng' : 'Bắt đầu'}</span>
                </button>

                <button
                  type="button"
                  onClick={finishTimerImmediately}
                  className={`bg-rose-600 hover:bg-rose-700 text-white font-semibold px-5 py-3 rounded-2xl shadow-lg shadow-rose-500/30 transition active:scale-95 flex items-center space-x-2 text-sm ${
                    canFinishSession ? '' : 'opacity-60'
                  }`}
                  title="Kết thúc ngay phiên Focus và ghi số phút vào Google Sheet"
                >
                  <span>⏹</span>
                  <span>Kết thúc</span>
                </button>

                <button
                  type="button"
                  onClick={resetTimer}
                  className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold px-4 py-3 rounded-2xl transition active:scale-95 text-sm"
                >
                  Đặt lại
                </button>
              </div>
            </div>

            {/* History Log */}
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl border border-slate-200/60 dark:border-slate-700/60">
              <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
                <h3 className="font-bold text-sm sm:text-base">
                  📊 Nhật ký Work hoàn thành ({history.length})
                </h3>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowQuickAdd((p) => !p)}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    ➕ Thêm phiên bù
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('focus_history');
                      setHistory([]);
                      showToast('🗑️ Đã xóa', 'Đã xóa lịch sử.');
                    }}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    Xóa lịch sử
                  </button>
                </div>
              </div>

              {showQuickAdd && (
                <div className="mb-4 p-3 bg-indigo-50/70 dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-slate-700 flex items-center gap-2">
                  <input
                    type="text"
                    value={manualTaskInput}
                    onChange={(e) => setManualTaskInput(e.target.value)}
                    placeholder="Tên phiên"
                    className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                  <VoiceInputButton
                    size="sm"
                    onNotify={showToast}
                    onTranscript={(spoken) => setManualTaskInput(spoken)}
                  />
                  <input
                    type="number"
                    value={manualMinsInput}
                    min={1}
                    max={360}
                    onChange={(e) => setManualMinsInput(parseInt(e.target.value, 10) || 25)}
                    className="w-16 px-2 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-center font-bold"
                  />
                  <button
                    type="button"
                    onClick={submitManualSession}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700"
                  >
                    Lưu
                  </button>
                </div>
              )}

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {history.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-4">
                    Chưa có phiên làm việc nào.
                  </p>
                ) : (
                  history.map((item, idx) => (
                    <div
                      key={`${item.time}_${idx}`}
                      className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-700/60 text-xs sm:text-sm"
                    >
                      <div className="flex items-center space-x-2.5 truncate pr-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-semibold truncate">{item.task}</span>
                      </div>
                      <div className="flex items-center space-x-3 shrink-0 font-mono text-xs">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {item.duration} phút
                        </span>
                        <span className="text-slate-400">· {item.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column (4 cols): Top = Orange Reminder Nhắc Việc, Bottom = Blue Reminder Routine */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-6">
            {/* Top Group: One-off Reminders */}
            <div>
              <ReminderSection
                variant="orange"
                heading="Reminder Nhắc Việc"
                subtitle="Chạy 1 lần · Đẩy thông báo về Telegram"
                addLabel="+ Thêm Reminder"
                items={reminders}
                onAdd={() =>
                  setReminders((prev) => [...prev, createDefaultItem(prev.length + 1, false)])
                }
                onRemove={(id) => {
                  cancelCloudTimer(id);
                  setReminders((prev) => {
                    const next = prev.filter((r) => r.id !== id);
                    return next.length > 0 ? next : [createDefaultItem(1, false)];
                  });
                }}
                onUpdate={(id, patch) => patchItemList(setReminders, id, patch)}
                onToggle={(id) => toggleItemInList(reminders, setReminders, id)}
                onReset={(id) => resetItemInList(setReminders, id)}
                onPlaySound={(id, override) => playTimerSound(id, override)}
                onUploadSound={(id, e) => uploadCustomSound(id, e)}
                onNotify={showToast}
              />
            </div>

            {/* Bottom Group: Auto-Repeating Routines */}
            <div className="mt-auto">
              <ReminderSection
                variant="blue"
                heading="Reminder Routine"
                subtitle="Tự động lặp lại khi hoàn thành · Báo Telegram"
                addLabel="+ Thêm Routine"
                items={routines}
                onAdd={() =>
                  setRoutines((prev) => [...prev, createDefaultItem(prev.length + 1, true)])
                }
                onRemove={(id) => {
                  cancelCloudTimer(id);
                  setRoutines((prev) => {
                    const next = prev.filter((r) => r.id !== id);
                    return next.length > 0 ? next : [createDefaultItem(1, true)];
                  });
                }}
                onUpdate={(id, patch) => patchItemList(setRoutines, id, patch)}
                onToggle={(id) => toggleItemInList(routines, setRoutines, id)}
                onReset={(id) => resetItemInList(setRoutines, id)}
                onPlaySound={(id, override) => playTimerSound(id, override)}
                onUploadSound={(id, e) => uploadCustomSound(id, e)}
                onNotify={showToast}
              />
            </div>
          </div>
        </div>

        {/* Full-screen Alarm Modal */}
        {alarmOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl border-2 border-rose-500">
              <div className="w-20 h-20 mx-auto mb-4 bg-rose-100 dark:bg-rose-950/60 text-rose-600 rounded-full flex items-center justify-center text-4xl">
                🔔
              </div>
              <h2 className="text-2xl font-black text-rose-600 dark:text-rose-400 mb-2">
                ĐẾN GIỜ BÁO THỨC!
              </h2>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-6">
                {alarmTaskText}
              </p>
              <button
                type="button"
                onClick={stopAlarm}
                className="w-full py-4 px-6 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white text-lg font-bold rounded-2xl shadow-xl shadow-rose-500/40 transition active:scale-95 flex items-center justify-center gap-2"
              >
                <span>🔕</span>
                <span>TẮT CHUÔNG NGAY</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="text-center py-4 text-xs text-slate-400">
        Focus + Reminder Web App · Kết nối Telegram Bot &amp; Google Sheets
      </footer>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Cài đặt Focus + Reminder</h3>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
              >
                ×
              </button>
            </div>

            <div className="mb-5 pb-5 border-b border-slate-100 dark:border-slate-700">
              <label className="block text-xs font-semibold mb-1.5">🔔 Chuông mặc định:</label>
              <div className="flex items-center gap-2">
                <select
                  value={modalSoundSelect}
                  onChange={(e) => setModalSoundSelect(e.target.value as SoundType)}
                  className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm"
                >
                  {SOUND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.detail}
                    </option>
                  ))}
                  {mainCustomAudioData && (
                    <option value="custom">🎵 {mainCustomAudioName || 'File MP3'}</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => playTimerSound('main', modalSoundSelect)}
                  className="px-3 py-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 rounded-xl text-xs font-bold shrink-0"
                >
                  🔊 Nghe thử
                </button>
              </div>
            </div>

            <div className="mb-5 pb-5 border-b border-slate-100 dark:border-slate-700">
              <label className="block text-xs font-semibold mb-1">
                📊 Google Apps Script Webhook URL:
              </label>
              <input
                type="text"
                value={scriptUrl}
                onChange={(e) => setScriptUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1">
                🤖 Telegram Bot Token &amp; Chat ID:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <input
                  type="text"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="Bot Token"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
                <input
                  type="text"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="Chat ID"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-sm font-medium rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={saveSettings}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700"
              >
                Lưu cài đặt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
