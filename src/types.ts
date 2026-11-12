export type SoundType = 'dingdong' | 'crystal' | 'marimba' | 'bell' | 'breeze' | 'custom';
export type ReminderMode = 'countdown' | 'datetime';

export interface HistoryItem {
  task: string;
  duration: number;
  time: string;
}

export interface TodoItem {
  id: string;
  text: string;
  completing?: boolean;
}

export interface ReminderItem {
  id: string;
  title: string;
  note: string;
  isRoutine?: boolean;
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
