import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CHANNEL_IDS, type ChannelId } from "./channels/types.ts";
import { fairyHome } from "./env.ts";

export type Config = {
  /**
   * 채널별 알림 대상. 텔레그램은 chat id, 디스코드는 channel id.
   * 환경변수로 미리 지정하거나 /start 를 처음 보낸 곳으로 자동으로 묶인다.
   */
  bindings: Record<ChannelId, string | null>;
  /** 전체 on/off. /pause 와 달리 시간 제한이 없다. */
  enabled: boolean;
  /** 알림 간격(분). */
  intervalMinutes: number;
  /** 활동 시간대 시작/끝, 자정 기준 분. 예: 09:00 -> 540 */
  startMinutes: number;
  endMinutes: number;
  /** 알림을 보낼 요일. 0=일 … 6=토 */
  days: number[];
  /** IANA 타임존. 예: "Asia/Seoul" */
  timezone: string;
  /** 이 시각(epoch ms)까지는 조용히. null 이면 일시정지 아님. */
  pausedUntil: number | null;
  /** 마지막으로 알림을 보낸 시각(epoch ms). 다음 알림 계산의 기준점. */
  lastNotifiedAt: number | null;
  /** 텔레그램 getUpdates 오프셋. 재시작해도 같은 업데이트를 두 번 처리하지 않는다. */
  telegramUpdateOffset: number;
  /** "YYYY-MM-DD" -> 그날 허리를 편 횟수 */
  stats: Record<string, number>;
};

export const DEFAULT_CONFIG: Config = {
  bindings: { telegram: null, discord: null },
  enabled: true,
  intervalMinutes: 30,
  startMinutes: 9 * 60,
  endMinutes: 18 * 60,
  days: [1, 2, 3, 4, 5],
  timezone: "Asia/Seoul",
  pausedUntil: null,
  lastNotifiedAt: null,
  telegramUpdateOffset: 0,
  stats: {},
};

export const CONFIG_PATH = join(fairyHome(), "config.json");

/** 통계를 무한정 쌓지 않도록 최근 N일치만 남긴다. */
const STATS_RETENTION_DAYS = 90;

export function loadConfig(): Config {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf8");
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[config] ${CONFIG_PATH} 를 읽을 수 없어 기본값으로 시작합니다.`);
    return structuredClone(DEFAULT_CONFIG);
  }

  // 필드가 빠졌거나 타입이 이상하면 기본값으로 메운다.
  const partial = (parsed ?? {}) as Partial<Config>;
  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...partial,
    bindings: normalizeBindings(partial.bindings),
    days: normalizeDays(partial.days) ?? DEFAULT_CONFIG.days,
    stats: isRecord(partial.stats) ? (partial.stats as Record<string, number>) : {},
  };
}

export function saveConfig(config: Config): void {
  pruneStats(config);
  mkdirSync(fairyHome(), { recursive: true });
  // 쓰다가 죽어도 기존 설정이 깨지지 않도록 임시 파일에 쓰고 교체한다.
  const tmp = `${CONFIG_PATH}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(tmp, CONFIG_PATH);
}

/** 알림을 보낼 곳이 한 군데라도 묶여 있는지. */
export function boundChannels(config: Config): ChannelId[] {
  return CHANNEL_IDS.filter((id) => config.bindings[id] !== null);
}

function pruneStats(config: Config): void {
  const keys = Object.keys(config.stats).sort();
  if (keys.length <= STATS_RETENTION_DAYS) return;
  for (const key of keys.slice(0, keys.length - STATS_RETENTION_DAYS)) {
    delete config.stats[key];
  }
}

function normalizeBindings(bindings: unknown): Record<ChannelId, string | null> {
  const result: Record<ChannelId, string | null> = { telegram: null, discord: null };
  if (!isRecord(bindings)) return result;

  for (const id of CHANNEL_IDS) {
    const value = bindings[id];
    if (typeof value === "string" && value.length > 0) result[id] = value;
    // 예전 형식(숫자 chat id)도 받아준다.
    else if (typeof value === "number") result[id] = String(value);
  }
  return result;
}

function normalizeDays(days: unknown): number[] | null {
  if (!Array.isArray(days)) return null;
  const cleaned = [
    ...new Set(days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)),
  ];
  return cleaned.length > 0 ? cleaned.sort((a, b) => a - b) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
