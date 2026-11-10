/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

type SoundType = 'dingdong' | 'crystal' | 'marimba' | 'bell' | 'breeze' | 'custom';
type ReminderMode = 'countdown' | 'datetime';

interface HistoryItem {
  task: string;
  duration: number;
  time: string;
}

interface ReminderItem {
  id: string;
  note: string;
  mode: ReminderMode;
  hours: number;
  minutes: number;
  targetDateTime: string; // YYYY-MM-DDTHH:mm
  totalSeconds: number;
  initialSeconds: number;
  soundType: SoundType;
  customAudioData: string | null;
  customAudioName: string;
  endTime: number | null;
  isRunning: boolean;
}

const DEFAULT_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbxr-zE8YL3yepDSBrt7reZtYcgglWcru8bgF1TgvlweL0Tr4pzRc7Xd0DA0B16uBLkwtw/exec';
const DEFAULT_BOT_TOKEN = '9260153448:AAFxQEPOfaah4zC-W6NqnVNpKjbrb43su7c';
const DEFAULT_CHAT_ID = '7399658008';

const CIRCUMFERENCE = 2 * Math.PI * 95;
const SUB_CIRCUMFERENCE = 2 * Math.PI * 46;
const RED_MINI_CIRCUMFERENCE = 2 * Math.PI * 34;

function getDefaultDateTimeLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function createDefaultReminder(index = 1): ReminderItem {
  return {
    id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    note: index === 1 ? 'Nhắc việc #1' : `Nhắc việc #${index}`,
    mode: 'countdown',
    hours: 0,
    minutes: 30,
    targetDateTime: getDefaultDateTimeLocal(),
    totalSeconds: 30 * 60,
    initialSeconds: 30 * 60,
    soundType: 'crystal',
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
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function formatFocusTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatReminderTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

export default function App() {
  // Main Focus Timer State (Minutes + Seconds)
  const [activeTaskDurationMinutes, setActiveTaskDurationMinutes] = useState<number>(25);
  const [totalSeconds, setTotalSeconds] = useState<number>(25 * 60);
  const [initialSeconds, setInitialSeconds] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Sẵn sàng');
  const [selectedSoundType, setSelectedSoundType] = useState<SoundType>(
    () => (localStorage.getItem('focus_sound_type') as SoundType) || 'dingdong'
  );
  const [mainCustomAudioName, setMainCustomAudioName] = useState<string>(
    () => localStorage.getItem('main_mp3_name') || ''
  );
  const [mainCustomAudioData, setMainCustomAudioData] = useState<string | null>(
    () => localStorage.getItem('main_mp3_data') || null
  );

  // Dynamic Reminders State (Default 1 Reminder)
  const [reminders, setReminders] = useState<ReminderItem[]>(() => {
    try {
      const saved = localStorage.getItem('focus_reminders_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [createDefaultReminder(1)];
  });

  // Save reminders to localStorage whenever they change (excluding huge custom audio if quota exceeded)
  useEffect(() => {
    try {
      localStorage.setItem('focus_reminders_v2', JSON.stringify(reminders));
    } catch {
      try {
        const slim = reminders.map((r) => ({ ...r, customAudioData: null }));
        localStorage.setItem('focus_reminders_v2', JSON.stringify(slim));
      } catch {
        // ignore
      }
    }
  }, [reminders]);

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
  const [alarmTaskText, setAlarmTaskText] = useState<string>('Bạn đã hoàn thành phiên làm việc.');
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

  // Web Audio Synthesizer
  const playSynthesizedSound = useCallback((type: SoundType) => {
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;

      const playNotes = (notes: number[], wave: OscillatorType, step: number, dur: number, peak = 0.28) => {
        notes.forEach((freq, idx) => {
          const start = now + idx * step;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = wave;
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(peak, start);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(start);
          osc.stop(start + dur);
        });
      };

      if (type === 'crystal') playNotes([659.25, 987.77, 1318.51], 'sine', 0.1, 0.65, 0.25);
      else if (type === 'marimba') playNotes([523.25, 659.25, 783.99], 'triangle', 0.12, 0.35, 0.3);
      else if (type === 'bell') playNotes([1046.5], 'sine', 0, 0.8, 0.35);
      else if (type === 'breeze') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.5);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.6);
      } else {
        playNotes([659.25, 880.0], 'sine', 0.22, 0.45, 0.3);
      }
    } catch (e) {
      console.log('Audio error:', e);
    }
  }, []);

  const playTimerSound = useCallback(
    (target: 'main' | string, overrideSound?: SoundType) => {
      if (currentAudioObjRef.current) {
        currentAudioObjRef.current.pause();
        currentAudioObjRef.current.currentTime = 0;
      }

      if (target === 'main') {
        const soundToPlay = overrideSound || stateRef.current.selectedSoundType;
        if (soundToPlay === 'custom') {
          const mp3Data = stateRef.current.mainCustomAudioData || localStorage.getItem('main_mp3_data');
          if (mp3Data) {
            currentAudioObjRef.current = new Audio(mp3Data);
            currentAudioObjRef.current.play().catch(() => {});
            return;
          }
        }
        playSynthesizedSound(soundToPlay);
      } else {
        const rem = stateRef.current.reminders.find((r) => r.id === target);
        if (!rem) return;
        const soundToPlay = overrideSound || rem.soundType || 'dingdong';
        if (soundToPlay === 'custom' && rem.customAudioData) {
          currentAudioObjRef.current = new Audio(rem.customAudioData);
          currentAudioObjRef.current.play().catch(() => {});
          return;
        }
        playSynthesizedSound(soundToPlay);
      }
    },
    [playSynthesizedSound]
  );

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
      const url = stateRef.current.scriptUrl.trim() || localStorage.getItem('google_script_url') || DEFAULT_SCRIPT_URL;
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
    const url = stateRef.current.scriptUrl.trim() || localStorage.getItem('google_script_url') || DEFAULT_SCRIPT_URL;
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
        .then(() => showToast('☁️ Đã đồng bộ', `Đã gửi ${duration} phút lên Google Sheet!`))
        .catch(() => showToast('❌ Lỗi ghi Sheet', 'Không thể kết nối tới Webhook URL.'));
    },
    [showToast]
  );

  const sendTelegramNotification = useCallback(
    (customMessage: string, isTest = false) => {
      const token = stateRef.current.botToken.trim() || DEFAULT_BOT_TOKEN;
      const cid = stateRef.current.chatId.trim() || DEFAULT_CHAT_ID;
      if (!token || !cid) {
        if (isTest) showToast('⚠️ Thiếu cấu hình', 'Vui lòng nhập Bot Token và Chat ID!');
        return;
      }
      if (isTest) showToast('⏳ Đang gửi...', 'Đang kết nối tới máy chủ Telegram...');

      const text = `🍅 [Focus + Reminder Bot]\n${customMessage}\n⏰ ${new Date().toLocaleString('vi-VN')}`;
      fetch(
        `https://api.telegram.org/bot${token}/sendMessage?chat_id=${encodeURIComponent(cid)}&text=${encodeURIComponent(text)}`
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
    const mins = stateRef.current.activeTaskDurationMinutes;
    cancelCloudTimer('MAIN_WORK');

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Hết giờ Focus!', { body: `Hoàn thành: ${taskName} (${mins} phút)` });
    }

    showToast('🎉 Hoàn thành!', `Đã kết thúc phiên: ${taskName} (${mins} phút)`);
    saveHistoryEntry(taskName, mins);
    sendTelegramNotification(`✅ Hoàn thành Focus:\n🎯 Mục tiêu: ${taskName}\n⏳ Thời gian: ${mins} phút`);

    const url = stateRef.current.scriptUrl.trim() || localStorage.getItem('google_script_url') || DEFAULT_SCRIPT_URL;
    if (url) syncToGoogleSheet(url, taskName, mins);

    startContinuousAlarm(`Đã hoàn thành Focus: "${taskName}" (${mins} phút)`, 'main');
  }, [cancelCloudTimer, saveHistoryEntry, sendTelegramNotification, showToast, startContinuousAlarm, syncToGoogleSheet]);

  const handleReminderComplete = useCallback(
    (rem: ReminderItem) => {
      const noteText = (rem.note || 'Reminder').trim();
      cancelCloudTimer(rem.id);

      const desc =
        rem.mode === 'datetime'
          ? `Hẹn lúc ${new Date(rem.targetDateTime).toLocaleString('vi-VN')}`
          : `${rem.hours > 0 ? `${rem.hours} giờ ` : ''}${rem.minutes} phút`;

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`🔔 Nhắc hẹn: ${noteText}`, { body: desc });
      }

      showToast(`🟠 Đến giờ nhắc hẹn!`, `${noteText} (${desc})`);
      sendTelegramNotification(`🟠 [Reminder] Đến giờ nhắc hẹn:\n📝 Nội dung: ${noteText}\n⏰ Cài đặt: ${desc}`);
      startContinuousAlarm(`Nhắc hẹn: "${noteText}" (${desc})`, rem.id);
    },
    [cancelCloudTimer, sendTelegramNotification, showToast, startContinuousAlarm]
  );

  // Main Focus Controls
  const toggleTimer = useCallback(() => {
    if (stateRef.current.isRunning) {
      setIsRunning(false);
      mainEndTimeRef.current = null;
      localStorage.removeItem('main_timer_end_time');
      cancelCloudTimer('MAIN_WORK');
      setStatusText('Đã tạm dừng');
    } else {
      const secs =
        stateRef.current.totalSeconds > 0 ? stateRef.current.totalSeconds : stateRef.current.initialSeconds;
      if (stateRef.current.totalSeconds <= 0) setTotalSeconds(secs);
      const end = Date.now() + secs * 1000;
      mainEndTimeRef.current = end;
      localStorage.setItem('main_timer_end_time', String(end));
      localStorage.setItem('main_timer_init_sec', String(stateRef.current.initialSeconds));
      localStorage.setItem('main_timer_duration_mins', String(stateRef.current.activeTaskDurationMinutes));

      scheduleCloudTimer('MAIN_WORK', 'Work', secs, true);
      setIsRunning(true);
      setStatusText('Đang tập trung');
    }
  }, [cancelCloudTimer, scheduleCloudTimer]);

  const resetTimer = useCallback(() => {
    stopAlarm();
    setIsRunning(false);
    mainEndTimeRef.current = null;
    localStorage.removeItem('main_timer_end_time');
    cancelCloudTimer('MAIN_WORK');
    setStatusText('Sẵn sàng');
    setTotalSeconds(stateRef.current.initialSeconds);
  }, [cancelCloudTimer, stopAlarm]);

  const applyDuration = useCallback(
    (minutes: number) => {
      const mins = Math.max(1, Math.min(360, Math.floor(minutes) || 1));
      if (stateRef.current.isRunning) {
        setIsRunning(false);
        mainEndTimeRef.current = null;
        localStorage.removeItem('main_timer_end_time');
        cancelCloudTimer('MAIN_WORK');
      }
      setActiveTaskDurationMinutes(mins);
      setTotalSeconds(mins * 60);
      setInitialSeconds(mins * 60);
      setStatusText('Sẵn sàng');
    },
    [cancelCloudTimer]
  );

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

  // Reminders Interval
  const anyReminderRunning = reminders.some((r) => r.isRunning);
  useEffect(() => {
    if (!anyReminderRunning) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const finishedList: ReminderItem[] = [];

      setReminders((prev) =>
        prev.map((r) => {
          if (!r.isRunning || !r.endTime) return r;
          const rem = Math.max(0, Math.ceil((r.endTime - now) / 1000));
          if (rem <= 0) {
            finishedList.push(r);
            return { ...r, totalSeconds: 0, isRunning: false, endTime: null };
          }
          return { ...r, totalSeconds: rem };
        })
      );

      finishedList.forEach((item) => handleReminderComplete(item));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [anyReminderRunning, handleReminderComplete]);

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
  }, [saveHistoryEntry]);

  // Telegram Bot Polling
  useEffect(() => {
    const token = botToken.trim() || DEFAULT_BOT_TOKEN;
    if (!token) return;

    fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`).catch(() => {});

    const pollInterval = window.setInterval(async () => {
      const currentToken = stateRef.current.botToken.trim() || DEFAULT_BOT_TOKEN;
      if (!currentToken) return;
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${currentToken}/getUpdates?offset=${lastTelegramUpdateIdRef.current + 1}&timeout=1`
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
                const totalMinutes = cur.history.reduce((s, i) => s + (Number(i.duration) || 0), 0);
                reply =
                  `📊 <b>[BÁO CÁO FOCUS + REMINDER]</b>\n` +
                  `✅ Tổng phiên: <b>${totalSessions}</b> (${totalMinutes} phút)\n` +
                  `🔄 Đồng hồ Focus: ${cur.isRunning ? `▶️ Đang chạy (${timeStr})` : `⏸ Đang dừng (${timeStr})`}`;
              } else if (normText === 'bat dau' || normText === '/run') {
                if (!cur.isRunning) toggleTimer();
                reply = `▶️ Đã bắt đầu Focus (${timeStr})`;
              } else if (normText === 'tam dung' || normText === '/stop') {
                if (cur.isRunning) toggleTimer();
                reply = `⏸ Đã tạm dừng Focus (${timeStr})`;
              } else if (normText === 'dat lai' || normText === 'reset') {
                resetTimer();
                reply = `🔄 Đã đặt lại Focus!`;
              } else {
                reply = `🤖 <b>Focus + Reminder Bot:</b> Gõ <b>"Thống kê"</b>, <b>"Bắt đầu"</b>, <b>"Tạm dừng"</b> hoặc <b>"Đặt lại"</b>.`;
              }

              fetch(
                `https://api.telegram.org/bot${currentToken}/sendMessage?chat_id=${encodeURIComponent(incomingChatId)}&text=${encodeURIComponent(reply)}&parse_mode=HTML`
              ).catch(() => {});
            }
          }
        }
      } catch {
        // ignore
      }
    }, 3000);

    return () => window.clearInterval(pollInterval);
  }, [botToken, resetTimer, toggleTimer]);

  // Reminder Actions
  const addReminder = () => {
    setReminders((prev) => [...prev, createDefaultReminder(prev.length + 1)]);
  };

  const removeReminder = (id: string) => {
    cancelCloudTimer(id);
    setReminders((prev) => {
      const filtered = prev.filter((r) => r.id !== id);
      return filtered.length > 0 ? filtered : [createDefaultReminder(1)];
    });
  };

  const updateReminder = (id: string, patch: Partial<ReminderItem>) => {
    setReminders((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };

        // Recalculate countdown seconds when hours/minutes or mode changes while not running
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
            const diff = Math.max(0, Math.ceil((new Date(updated.targetDateTime).getTime() - Date.now()) / 1000));
            updated.totalSeconds = diff;
            updated.initialSeconds = Math.max(60, diff);
          }
        }
        return updated;
      })
    );
  };

  const toggleReminder = (id: string) => {
    const target = reminders.find((r) => r.id === id);
    if (!target) return;

    if (target.isRunning) {
      cancelCloudTimer(id);
      updateReminder(id, { isRunning: false, endTime: null });
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
    } else {
      if (secs <= 0) {
        secs = Math.max(60, target.hours * 3600 + target.minutes * 60);
        initSecs = secs;
      }
    }

    const end = Date.now() + secs * 1000;
    scheduleCloudTimer(id, `🟠 [Reminder] ${target.note || 'Nhắc hẹn'}`, secs, false);
    updateReminder(id, {
      totalSeconds: secs,
      initialSeconds: initSecs,
      endTime: end,
      isRunning: true,
    });
  };

  const resetReminder = (id: string) => {
    stopAlarm();
    cancelCloudTimer(id);
    setReminders((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const secs =
          r.mode === 'countdown'
            ? Math.max(60, r.hours * 3600 + r.minutes * 60)
            : Math.max(0, Math.ceil((new Date(r.targetDateTime).getTime() - Date.now()) / 1000));
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
          // ignore quota error
        }
        setMainCustomAudioData(dataUrl);
        setMainCustomAudioName(file.name);
        setSelectedSoundType('custom');
        setModalSoundSelect('custom');
        localStorage.setItem('focus_sound_type', 'custom');
        showToast('🎵 Đã tải MP3', `Đã gán "${file.name}" cho đồng hồ Focus.`);
      } else {
        updateReminder(target, {
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
    const url = scriptUrl.trim() || localStorage.getItem('google_script_url') || DEFAULT_SCRIPT_URL;
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
  const activeReminders = reminders.filter((r) => r.isRunning);

  return (
    <div className="bg-gradient-to-br from-slate-50 via-slate-100 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 text-slate-800 dark:text-slate-100 min-h-screen flex flex-col justify-between antialiased">
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

      <div className="max-w-6xl w-full mx-auto p-4 sm:p-6 my-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-700/60">
          <div className="flex items-center space-x-2.5">
            <span className="text-2xl">🍅</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent">
                  Focus + Reminder
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  Cloud &amp; Bot: Bật
                </span>
              </div>
              <p className="text-xs text-slate-400">Đồng hồ Focus (Phút/Giây) &amp; Hẹn giờ Reminder (Giờ/Phút hoặc Ngày/Giờ)</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                const url = scriptUrl.trim() || localStorage.getItem('google_script_url') || DEFAULT_SCRIPT_URL;
                showToast('⏳ Đang gửi lên Sheet...', 'Đang ghi thử phiên 25 phút vào Google Sheet...');
                syncToGoogleSheet(url, 'Work', 25);
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>📊</span>
              <span className="hidden sm:inline">Test ghi Sheet</span>
            </button>
            <button
              type="button"
              onClick={() => sendTelegramNotification('🤖 Kiểm tra kết nối Telegram Bot thành công!', true)}
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

        {/* Active Red Reminders Dock on Right Screen Edge */}
        {activeReminders.length > 0 && (
          <div className="fixed right-3 sm:right-5 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center space-y-2.5 pointer-events-auto max-h-[90vh] overflow-y-auto py-2 px-1">
            {activeReminders.map((rem, idx) => {
              const ratio = rem.initialSeconds > 0 ? rem.totalSeconds / rem.initialSeconds : 0;
              const offset = RED_MINI_CIRCUMFERENCE * (1 - ratio);
              return (
                <div
                  key={rem.id}
                  className="bg-white dark:bg-slate-800 border-2 border-rose-500 rounded-2xl p-2 shadow-lg shadow-rose-500/20 flex flex-col items-center w-24 transition transform hover:scale-105"
                  title={rem.note}
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
                        className="text-rose-100 dark:text-rose-950/60"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        strokeWidth="6"
                        stroke="#ef4444"
                        fill="transparent"
                        strokeLinecap="round"
                        strokeDasharray={RED_MINI_CIRCUMFERENCE}
                        strokeDashoffset={offset}
                        className="transition-all duration-300"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-1">
                      <span className="text-[11px] font-black font-mono text-rose-600 dark:text-rose-400 leading-none">
                        {formatReminderTime(rem.totalSeconds)}
                      </span>
                      <span className="text-[9px] font-bold text-rose-500 mt-0.5">#{idx + 1}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 truncate w-full text-center mt-1 px-1">
                    {rem.note}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Focus Timer (Minutes & Seconds) + History */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="w-full bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/60 dark:border-slate-700/60 text-center">
              <div className="mb-5 max-w-md mx-auto">
                <div className="flex justify-between items-center mb-1.5 px-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Đồng hồ Focus (Phút : Giây):
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

              <div className="mb-6 max-w-md mx-auto bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700/70">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Nhập số phút Focus:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={360}
                      value={activeTaskDurationMinutes}
                      onChange={(e) => applyDuration(parseInt(e.target.value, 10) || 1)}
                      className="w-20 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-400">phút</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                  {[10, 15, 20, 25, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => applyDuration(mins)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-xl border transition ${
                        activeTaskDurationMinutes === mins
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-500'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">🔔 Chuông Focus:</span>
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
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium max-w-[160px] truncate"
                    >
                      <option value="dingdong">🔔 Ding-Dong</option>
                      <option value="crystal">✨ Crystal Bell</option>
                      <option value="marimba">🎶 Marimba</option>
                      <option value="bell">🛎️ Service Bell</option>
                      <option value="breeze">💨 Breeze Synth</option>
                      {mainCustomAudioData && <option value="custom">🎵 {mainCustomAudioName || 'File MP3'}</option>}
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

              {/* Main Focus Ring */}
              <div className="relative w-64 h-64 mx-auto my-2 flex items-center justify-center">
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
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl sm:text-6xl font-black tracking-tight text-slate-900 dark:text-white font-mono">
                    {formatFocusTime(totalSeconds)}
                  </span>
                  <span className="text-xs uppercase font-bold tracking-widest text-slate-400 mt-1">
                    {statusText}
                  </span>
                </div>
              </div>

              <div className="flex justify-center items-center space-x-4 mt-6">
                <button
                  type="button"
                  onClick={toggleTimer}
                  className={
                    isRunning
                      ? 'bg-amber-600 hover:bg-amber-700 text-white font-semibold px-8 py-3.5 rounded-2xl shadow-lg transition active:scale-95 flex items-center space-x-2'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3.5 rounded-2xl shadow-lg shadow-indigo-500/30 transition active:scale-95 flex items-center space-x-2'
                  }
                >
                  <span>{isRunning ? '⏸' : '▶'}</span>
                  <span>{isRunning ? 'Tạm dừng' : 'Bắt đầu'}</span>
                </button>
                <button
                  type="button"
                  onClick={resetTimer}
                  className="bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold px-6 py-3.5 rounded-2xl transition active:scale-95"
                >
                  Đặt lại
                </button>
              </div>
            </div>

            {/* History Log */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl border border-slate-200/60 dark:border-slate-700/60">
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
                    className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
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
                  <p className="text-slate-400 text-sm text-center py-4">Chưa có phiên làm việc nào.</p>
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
                      <div className="flex items-center space-x-3 shrink-0">
                        <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 font-bold rounded-lg text-xs">
                          {item.duration} phút
                        </span>
                        <span className="text-slate-400 text-xs font-mono">{item.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Reminders (Hours + Minutes OR Exact Date/Time) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl border border-orange-200/70 dark:border-orange-900/40">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-xl">🟠</span>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-orange-600 dark:text-orange-400">
                    Reminder Nhắc Việc ({reminders.length})
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Theo Giờ &amp; Phút hoặc Đúng Ngày Giờ • Không ghi Sheet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={addReminder}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-sm transition active:scale-95 whitespace-nowrap shrink-0"
              >
                + Thêm Reminder
              </button>
            </div>

            <div className="flex flex-col space-y-4">
              {reminders.map((rem, idx) => {
                const ratio = rem.initialSeconds > 0 ? rem.totalSeconds / rem.initialSeconds : 0;
                const strokeOffset = SUB_CIRCUMFERENCE * (1 - ratio);
                const statusLabel = rem.isRunning
                  ? 'Đang hẹn'
                  : rem.totalSeconds === 0
                  ? 'Hoàn thành'
                  : 'Sẵn sàng';

                return (
                  <div
                    key={rem.id}
                    className="bg-orange-50/50 dark:bg-slate-900/70 border border-orange-200/80 dark:border-orange-900/40 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-sm transition"
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
                          className="text-orange-100 dark:text-slate-800"
                        />
                        <circle
                          cx="55"
                          cy="55"
                          r="46"
                          strokeWidth="7"
                          stroke="#f97316"
                          fill="transparent"
                          strokeLinecap="round"
                          strokeDasharray={SUB_CIRCUMFERENCE}
                          strokeDashoffset={strokeOffset}
                          className="transition-all duration-300"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
                        <span className="text-base font-black font-mono text-orange-600 dark:text-orange-400 tracking-tight leading-tight">
                          {formatReminderTime(rem.totalSeconds)}
                        </span>
                        <span className="text-[9px] uppercase font-bold tracking-wider text-orange-400 mt-0.5">
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex-1 min-w-0">
                      {/* Header Row: Title + Mode Switch + Delete */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
                          Reminder #{idx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <div className="flex bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-orange-200 dark:border-slate-700 text-[10px] font-semibold">
                            <button
                              type="button"
                              onClick={() => updateReminder(rem.id, { mode: 'countdown', isRunning: false, endTime: null })}
                              className={`px-2 py-0.5 rounded-md transition ${
                                rem.mode === 'countdown'
                                  ? 'bg-orange-500 text-white'
                                  : 'text-slate-500 hover:text-orange-600'
                              }`}
                            >
                              Giờ/Phút
                            </button>
                            <button
                              type="button"
                              onClick={() => updateReminder(rem.id, { mode: 'datetime', isRunning: false, endTime: null })}
                              className={`px-2 py-0.5 rounded-md transition ${
                                rem.mode === 'datetime'
                                  ? 'bg-orange-500 text-white'
                                  : 'text-slate-500 hover:text-orange-600'
                              }`}
                            >
                              Ngày giờ
                            </button>
                          </div>
                          {reminders.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeReminder(rem.id)}
                              className="p-1 text-slate-400 hover:text-rose-500 transition text-xs font-bold"
                              title="Xóa Reminder này"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Mode-Specific Time Input */}
                      {rem.mode === 'countdown' ? (
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="flex items-center gap-1 flex-1 bg-white dark:bg-slate-800 border border-orange-200 dark:border-slate-700 rounded-xl px-2 py-1">
                            <input
                              type="number"
                              min={0}
                              max={99}
                              disabled={rem.isRunning}
                              value={rem.hours}
                              onChange={(e) => updateReminder(rem.id, { hours: parseInt(e.target.value, 10) || 0 })}
                              className="w-full text-xs font-bold text-center bg-transparent focus:outline-none text-orange-700 dark:text-orange-300"
                            />
                            <span className="text-[10px] text-slate-400 shrink-0">giờ</span>
                          </div>
                          <div className="flex items-center gap-1 flex-1 bg-white dark:bg-slate-800 border border-orange-200 dark:border-slate-700 rounded-xl px-2 py-1">
                            <input
                              type="number"
                              min={0}
                              max={59}
                              disabled={rem.isRunning}
                              value={rem.minutes}
                              onChange={(e) => updateReminder(rem.id, { minutes: parseInt(e.target.value, 10) || 0 })}
                              className="w-full text-xs font-bold text-center bg-transparent focus:outline-none text-orange-700 dark:text-orange-300"
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
                            onChange={(e) => updateReminder(rem.id, { targetDateTime: e.target.value })}
                            className="w-full px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-orange-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-orange-500 text-orange-700 dark:text-orange-300"
                          />
                        </div>
                      )}

                      {/* Note Input */}
                      <input
                        type="text"
                        value={rem.note}
                        onChange={(e) => updateReminder(rem.id, { note: e.target.value })}
                        placeholder="Nhập nội dung nhắc việc..."
                        className="w-full px-3 py-1.5 mb-2 text-xs font-medium bg-white dark:bg-slate-800 border border-orange-200/90 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />

                      {/* Sound Select & MP3 */}
                      <div className="flex items-center justify-between gap-1.5 mb-2.5">
                        <select
                          value={rem.soundType}
                          onChange={(e) => {
                            const val = e.target.value as SoundType;
                            updateReminder(rem.id, { soundType: val });
                            playTimerSound(rem.id, val);
                          }}
                          className="flex-1 min-w-0 px-2 py-1 bg-white dark:bg-slate-800 border border-orange-200 dark:border-slate-700 rounded-lg text-[11px] font-medium truncate"
                        >
                          <option value="dingdong">🔔 Ding-Dong</option>
                          <option value="crystal">✨ Crystal Bell</option>
                          <option value="marimba">🎶 Marimba</option>
                          <option value="bell">🛎️ Service Bell</option>
                          <option value="breeze">💨 Breeze Synth</option>
                          {rem.customAudioData && (
                            <option value="custom">🎵 {rem.customAudioName || 'File MP3'}</option>
                          )}
                        </select>
                        <label className="cursor-pointer px-2 py-1 bg-orange-100/80 dark:bg-slate-800 hover:bg-orange-200 text-orange-700 dark:text-orange-300 rounded-lg text-[10px] font-bold transition shrink-0">
                          📁 MP3
                          <input
                            type="file"
                            accept="audio/*"
                            className="hidden"
                            onChange={(e) => uploadCustomSound(rem.id, e)}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => playTimerSound(rem.id)}
                          className="px-1.5 py-1 bg-white dark:bg-slate-800 border border-orange-200 dark:border-slate-700 rounded-lg text-[11px] hover:bg-orange-50 transition shrink-0"
                        >
                          🔊
                        </button>
                      </div>

                      {/* Start / Reset Buttons (Removed 5m/15m/30m buttons) */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleReminder(rem.id)}
                          className={
                            rem.isRunning
                              ? 'flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-1.5 rounded-xl shadow-sm transition active:scale-95 flex items-center justify-center gap-1'
                              : 'flex-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-1.5 rounded-xl shadow-sm shadow-orange-500/30 transition active:scale-95 flex items-center justify-center gap-1'
                          }
                        >
                          <span>{rem.isRunning ? '⏸' : '▶'}</span>
                          <span>{rem.isRunning ? 'Dừng' : 'Bắt đầu'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => resetReminder(rem.id)}
                          className="bg-orange-100/80 dark:bg-slate-800 hover:bg-orange-200/80 text-orange-700 dark:text-orange-300 text-xs font-semibold px-3 py-1.5 rounded-xl transition active:scale-95"
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
        </div>

        {/* Full-screen Alarm Modal */}
        {alarmOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl border-2 border-rose-500 animate-bounce">
              <div className="w-20 h-20 mx-auto mb-4 bg-rose-100 dark:bg-rose-950/60 text-rose-600 rounded-full flex items-center justify-center text-4xl animate-pulse">
                🔔
              </div>
              <h2 className="text-2xl font-black text-rose-600 dark:text-rose-400 mb-2">ĐẾN GIỜ BÁO THỨC!</h2>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-6">{alarmTaskText}</p>
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
        Focus + Reminder Web App • Kết nối Telegram Bot &amp; Google Sheets
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
                  <option value="dingdong">🔔 Ding-Dong (0.65s)</option>
                  <option value="crystal">✨ Crystal Bell (0.75s)</option>
                  <option value="marimba">🎶 Marimba (0.55s)</option>
                  <option value="bell">🛎️ Service Bell (0.8s)</option>
                  <option value="breeze">💨 Breeze Synth (0.6s)</option>
                  {mainCustomAudioData && <option value="custom">🎵 {mainCustomAudioName || 'File MP3'}</option>}
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
              <label className="block text-xs font-semibold mb-1">📊 Google Apps Script Webhook URL:</label>
              <input
                type="text"
                value={scriptUrl}
                onChange={(e) => setScriptUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1">🤖 Telegram Bot Token &amp; Chat ID:</label>
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
