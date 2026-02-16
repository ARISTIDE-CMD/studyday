export type StudyPeriodPreset = 'year' | 'semester' | 'trimester' | 'custom';
export type StudyDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type StudySlot = 'morning' | 'afternoon' | 'evening';

export type StudySchedulePreferences = {
  title: string;
  goal: string;
  periodPreset: StudyPeriodPreset;
  startDate: string;
  endDate: string;
  customWeeks: number | null;
  sessionsPerWeek: number;
  sessionMinutes: number;
  includeWeekend: boolean;
  selectedDays: StudyDayKey[];
  preferredSlot: StudySlot;
};

export type StudyScheduleSession = {
  id: string;
  date: string;
  day: StudyDayKey;
  slot: StudySlot;
  durationMinutes: number;
  focus: string;
};

export type StudySchedulePlan = {
  id: string;
  user_id: string;
  title: string;
  goal: string;
  preferences: StudySchedulePreferences;
  summary: {
    totalSessions: number;
    totalHours: number;
    totalWeeks: number;
    startDate: string;
    endDate: string;
  };
  sessions: StudyScheduleSession[];
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};
