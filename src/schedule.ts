import { boundChannels, type Config } from "./config.ts";

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

export const DAY_NAMES_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type ZonedNow = {
  /** 0=일 … 6=토 */
  weekday: number;
  /** 자정 기준 분 */
  minutes: number;
  /** "YYYY-MM-DD" */
  date: string;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** 특정 타임존에서 본 "지금"의 요일 / 시각 / 날짜. */
export function zonedNow(now: Date, timezone: string): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  // hour12:false 는 자정을 "24" 로 주는 구현이 있어 24로 나눈 나머지를 쓴다.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));

  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    minutes: hour * 60 + minute,
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** 활동 시간대가 자정을 넘어가는지 (예: 22:00-02:00). */
function wrapsMidnight(config: Config): boolean {
  return config.endMinutes <= config.startMinutes;
}

/** 지금이 알림을 보내도 되는 요일 + 시간대인지. */
export function isWithinWindow(config: Config, now: Date): boolean {
  const { weekday, minutes } = zonedNow(now, config.timezone);

  if (!wrapsMidnight(config)) {
    return config.days.includes(weekday) && minutes >= config.startMinutes && minutes < config.endMinutes;
  }

  // 자정을 넘는 구간은 두 조각으로 나뉜다.
  // 시작일 기준으로 요일을 판단해야 하므로, 새벽 조각은 "전날"이 활동 요일인지 본다.
  if (minutes >= config.startMinutes) return config.days.includes(weekday);
  if (minutes < config.endMinutes) return config.days.includes((weekday + 6) % 7);
  return false;
}

/** 지금부터 다음 활동 시간대 시작까지 남은 분. 이미 시간대 안이면 0. */
export function minutesUntilWindow(config: Config, now: Date): number {
  if (isWithinWindow(config, now)) return 0;

  const { weekday, minutes } = zonedNow(now, config.timezone);

  // 오늘 포함 8일을 훑으며 가장 가까운 시작 시각을 찾는다.
  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const day = (weekday + dayOffset) % 7;
    if (!config.days.includes(day)) continue;

    const delta = dayOffset * DAY_MINUTES + config.startMinutes - minutes;
    if (delta > 0) return delta;
  }
  return DAY_MINUTES * 7;
}

/** 다음 알림 예정 시각. 보낼 계획이 없으면 null. */
export function nextReminderAt(config: Config, now: Date): Date | null {
  if (!config.enabled || boundChannels(config).length === 0) return null;

  const nowMs = now.getTime();
  const candidates = [nowMs];
  if (config.pausedUntil !== null && config.pausedUntil > nowMs) candidates.push(config.pausedUntil);
  if (config.lastNotifiedAt !== null) candidates.push(config.lastNotifiedAt + config.intervalMinutes * MINUTE);

  const earliest = new Date(Math.max(...candidates));
  const wait = minutesUntilWindow(config, earliest);
  return wait === 0 ? earliest : new Date(earliest.getTime() + wait * MINUTE);
}

/** 지금 알림을 보내야 하는지. */
export function isDue(config: Config, now: Date): boolean {
  const next = nextReminderAt(config, now);
  return next !== null && next.getTime() <= now.getTime();
}

export function formatClock(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "매일";
  if (sorted.join(",") === "1,2,3,4,5") return "평일";
  if (sorted.join(",") === "0,6") return "주말";
  return sorted.map((d) => DAY_NAMES_KO[d]).join("");
}

/** 사람이 읽을 수 있는 "언제" 문자열. 예: "오늘 14:30" */
export function formatWhen(at: Date, timezone: string, now: Date): string {
  const today = zonedNow(now, timezone).date;
  const target = zonedNow(at, timezone);
  const clock = formatClock(target.minutes);

  if (target.date === today) return `오늘 ${clock}`;

  const tomorrow = zonedNow(new Date(now.getTime() + DAY_MINUTES * MINUTE), timezone).date;
  if (target.date === tomorrow) return `내일 ${clock}`;

  return `${target.date} (${DAY_NAMES_KO[target.weekday]}) ${clock}`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / MINUTE));
  if (totalMinutes < 60) return `${totalMinutes}분`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}
