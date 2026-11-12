import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';

interface SpeechRecognitionResultItem {
  transcript: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionResultItem;
  length: number;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResult>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

let activeStopCallback: (() => void) | null = null;

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  onNotify?: (title: string, desc: string) => void;
  size?: 'sm' | 'md';
}

export default function VoiceInputButton({
  onTranscript,
  onNotify,
  size = 'md',
}: VoiceInputButtonProps) {
  const [status, setStatus] = useState<'idle' | 'listening' | 'loading'>('idle');

  const wantListeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const committedTextRef = useRef('');
  const sessionFinalRef = useRef('');
  const sessionInterimRef = useRef('');
  const flushedRef = useRef(false);
  const flushTimerRef = useRef<number | null>(null);

  const onTranscriptRef = useRef(onTranscript);
  const onNotifyRef = useRef(onNotify);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onNotifyRef.current = onNotify;
  }, [onTranscript, onNotify]);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const finalizeAndEmit = useCallback(() => {
    if (flushedRef.current) return;
    flushedRef.current = true;
    clearFlushTimer();

    const fullText = [
      committedTextRef.current,
      sessionFinalRef.current,
      sessionInterimRef.current,
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    committedTextRef.current = '';
    sessionFinalRef.current = '';
    sessionInterimRef.current = '';
    recognitionRef.current = null;
    setStatus('idle');

    if (fullText) {
      onTranscriptRef.current(fullText);
    } else {
      onNotifyRef.current?.(
        '🎤 Chưa thu được giọng nói',
        'Không nhận diện được âm thanh, bạn hãy thử nói lại nhé.'
      );
    }
  }, [clearFlushTimer]);

  const startSession = useCallback(
    (SpeechRec: SpeechRecognitionConstructor) => {
      const rec = new SpeechRec();
      rec.lang = 'vi-VN';
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event: SpeechRecognitionEventLike) => {
        const finals: string[] = [];
        const interims: string[] = [];
        for (let i = 0; i < event.results.length; i += 1) {
          const res = event.results[i];
          const text = res[0]?.transcript?.trim();
          if (!text) continue;
          if (res.isFinal) {
            finals.push(text);
          } else {
            interims.push(text);
          }
        }
        sessionFinalRef.current = finals.join(' ');
        sessionInterimRef.current = interims.join(' ');
      };

      rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          wantListeningRef.current = false;
          flushedRef.current = true;
          clearFlushTimer();
          setStatus('idle');
          onNotifyRef.current?.(
            '🎤 Chưa cấp quyền Micro',
            'Vui lòng cho phép trình duyệt sử dụng Microphone.'
          );
        } else if (event.error === 'audio-capture') {
          wantListeningRef.current = false;
          flushedRef.current = true;
          clearFlushTimer();
          setStatus('idle');
          onNotifyRef.current?.(
            '🎤 Không tìm thấy Micro',
            'Vui lòng kiểm tra thiết bị thu âm của bạn.'
          );
        }
      };

      rec.onend = () => {
        const chunk = [sessionFinalRef.current, sessionInterimRef.current]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (chunk) {
          committedTextRef.current = [committedTextRef.current, chunk]
            .filter(Boolean)
            .join(' ')
            .trim();
        }
        sessionFinalRef.current = '';
        sessionInterimRef.current = '';

        if (wantListeningRef.current) {
          try {
            startSession(SpeechRec);
          } catch {
            wantListeningRef.current = false;
            finalizeAndEmit();
          }
        } else {
          finalizeAndEmit();
        }
      };

      recognitionRef.current = rec;
      rec.start();
    },
    [clearFlushTimer, finalizeAndEmit]
  );

  const stopAndLoadText = useCallback(() => {
    wantListeningRef.current = false;
    if (activeStopCallback === stopAndLoadText) {
      activeStopCallback = null;
    }
    setStatus('loading');
    try {
      recognitionRef.current?.stop();
    } catch {
      finalizeAndEmit();
      return;
    }
    clearFlushTimer();
    flushTimerRef.current = window.setTimeout(() => {
      finalizeAndEmit();
    }, 650);
  }, [clearFlushTimer, finalizeAndEmit]);

  const handleClick = () => {
    if (status === 'loading') return;

    if (status === 'listening') {
      stopAndLoadText();
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      onNotify?.(
        '⚠️ Trình duyệt chưa hỗ trợ',
        'Vui lòng dùng Chrome, Edge hoặc Safari để nhập bằng giọng nói.'
      );
      return;
    }

    if (activeStopCallback && activeStopCallback !== stopAndLoadText) {
      activeStopCallback();
    }

    committedTextRef.current = '';
    sessionFinalRef.current = '';
    sessionInterimRef.current = '';
    flushedRef.current = false;
    wantListeningRef.current = true;
    activeStopCallback = stopAndLoadText;
    setStatus('listening');

    try {
      startSession(SpeechRec);
    } catch {
      wantListeningRef.current = false;
      activeStopCallback = null;
      setStatus('idle');
      onNotify?.('❌ Không thể bật Micro', 'Vui lòng thử lại hoặc kiểm tra quyền Micro.');
    }
  };

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      flushedRef.current = true;
      if (activeStopCallback === stopAndLoadText) {
        activeStopCallback = null;
      }
      clearFlushTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, [clearFlushTimer, stopAndLoadText]);

  const sizeClasses =
    size === 'sm' ? 'p-1.5 rounded-xl' : 'p-2 rounded-xl';
  const iconClasses = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === 'loading'}
      title={
        status === 'listening'
          ? 'Đang thu giọng nói... Bấm lần nữa để chuyển thành văn bản'
          : status === 'loading'
          ? 'Đang chuyển giọng nói thành văn bản...'
          : 'Bấm để nhập bằng giọng nói'
      }
      className={`${sizeClasses} shrink-0 flex items-center justify-center border transition active:scale-95 ${
        status === 'listening'
          ? 'bg-rose-500 hover:bg-rose-600 text-white border-rose-500 ring-2 ring-rose-300 dark:ring-rose-800 animate-pulse shadow-sm'
          : status === 'loading'
          ? 'bg-indigo-600 text-white border-indigo-600 cursor-wait'
          : 'bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 border-slate-200 dark:border-slate-700'
      }`}
    >
      {status === 'listening' ? (
        <Square className={`${iconClasses} fill-current`} />
      ) : status === 'loading' ? (
        <Loader2 className={`${iconClasses} animate-spin`} />
      ) : (
        <Mic className={iconClasses} />
      )}
    </button>
  );
}
