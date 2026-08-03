import { boundChannels, type Config } from "./config.ts";
import type { ChannelId, IncomingCommand } from "./channels/types.ts";
import { greetingMessage, praiseMessage } from "./messages.ts";
import {
  DAY_NAMES_KO,
  formatClock,
  formatDays,
  formatDuration,
  formatWhen,
  nextReminderAt,
  zonedNow,
} from "./schedule.ts";

const MINUTE = 60_000;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 24 * 60;

export type CommandDeps = {
  config: Config;
  /** 설정을 디스크에 반영한다. */
  save: () => void;
  /** 지금 바로 알림을 한 번 보낸다. /test 용. */
  sendReminderNow: () => Promise<void>;
  now: () => Date;
};

const HELP = [
  "🧚 허리 요정 사용법",
  "",
  "/start — 이 대화에 알림을 연결",
  "/stop — 알림 전체 끄기",
  "/status — 현재 설정과 다음 알림 시각",
  "/done — 허리 폈다고 보고 (타이머 리셋)",
  "/snooze [분] — 잠깐 미루기 (기본 15분)",
  "/pause [분] — 일시정지 (분을 안 쓰면 무기한)",
  "/resume — 일시정지 해제",
  "/interval <분> — 알림 간격 (예: /interval 25)",
  "/hours <HH:MM-HH:MM> — 활동 시간대 (예: /hours 09:00-18:00)",
  "/days <매일|평일|주말|월화수목금> — 알림 받을 요일",
  "/tz <타임존> — 기준 시간대 (예: /tz Asia/Seoul)",
  "/stats — 최근 기록",
  "/test — 지금 바로 알림 한 번",
  "",
  "디스코드에서는 / 대신 ! 도 됩니다 (예: !status).",
].join("\n");

/** 명령 한 건을 처리한다. 명령이 아니면 조용히 무시한다. */
export async function handleCommand(command: IncomingCommand, deps: CommandDeps): Promise<void> {
  const parsed = parseCommand(command.text);
  if (!parsed) return;

  const { config, save } = deps;
  const { name, args } = parsed;

  // 아직 이 채널이 어디에도 묶이지 않았다면 /start 만 받는다.
  const bound = config.bindings[command.channel];
  if (bound === null && name !== "start" && name !== "help") {
    const prefix = command.channel === "discord" ? "!" : "/";
    await command.reply(`먼저 ${prefix}start 를 보내 이 대화를 알림 대상으로 등록해주세요.`);
    return;
  }
  // 다른 대화에서 온 명령은 무시한다. 봇이 여러 채널에 있어도 한 곳만 듣는다.
  if (bound !== null && bound !== command.conversationId && name !== "start") return;

  switch (name) {
    case "start": {
      const wasBound = config.bindings[command.channel] === command.conversationId;
      config.bindings[command.channel] = command.conversationId;
      config.enabled = true;
      config.pausedUntil = null;
      save();
      await command.reply(
        wasBound
          ? `이미 연결돼 있어요.\n\n${describeStatus(config, deps.now())}`
          : `${greetingMessage()}\n\n${describeStatus(config, deps.now())}\n\n/help 로 명령을 볼 수 있어요.`,
      );
      return;
    }

    case "help":
      await command.reply(HELP);
      return;

    case "stop":
      config.enabled = false;
      save();
      await command.reply("알림을 껐습니다. 다시 켜려면 /start 를 보내주세요. 💤");
      return;

    case "status":
      await command.reply(describeStatus(config, deps.now()));
      return;

    case "done": {
      const today = zonedNow(deps.now(), config.timezone).date;
      config.stats[today] = (config.stats[today] ?? 0) + 1;
      config.lastNotifiedAt = deps.now().getTime();
      config.pausedUntil = null;
      save();

      const next = nextReminderAt(config, deps.now());
      const suffix = next ? `\n다음 알림: ${formatWhen(next, config.timezone, deps.now())}` : "";
      await command.reply(`${praiseMessage()} (오늘 ${config.stats[today]}번째)${suffix}`);
      return;
    }

    case "snooze": {
      const minutes = args[0] === undefined ? 15 : parsePositiveInt(args[0]);
      if (minutes === null || minutes > MAX_INTERVAL) {
        await command.reply(`1~${MAX_INTERVAL} 사이의 분을 적어주세요. 예: /snooze 10`);
        return;
      }
      config.pausedUntil = deps.now().getTime() + minutes * MINUTE;
      save();
      await command.reply(`${minutes}분 뒤에 다시 부르러 올게요. 😴`);
      return;
    }

    case "pause": {
      if (args[0] === undefined) {
        config.pausedUntil = null;
        config.enabled = false;
        save();
        await command.reply("무기한 일시정지했습니다. /resume 으로 다시 켜주세요.");
        return;
      }
      const minutes = parsePositiveInt(args[0]);
      if (minutes === null) {
        await command.reply("숫자(분)를 적어주세요. 예: /pause 90");
        return;
      }
      config.pausedUntil = deps.now().getTime() + minutes * MINUTE;
      config.enabled = true;
      save();
      await command.reply(`${formatDuration(minutes * MINUTE)} 동안 조용히 있을게요.`);
      return;
    }

    case "resume": {
      config.enabled = true;
      config.pausedUntil = null;
      config.lastNotifiedAt = deps.now().getTime();
      save();
      const next = nextReminderAt(config, deps.now());
      await command.reply(
        next
          ? `다시 시작합니다. 다음 알림: ${formatWhen(next, config.timezone, deps.now())} 🧚`
          : "다시 시작합니다. 🧚",
      );
      return;
    }

    case "interval": {
      const minutes = args[0] === undefined ? null : parsePositiveInt(args[0]);
      if (minutes === null || minutes < MIN_INTERVAL || minutes > MAX_INTERVAL) {
        await command.reply(`${MIN_INTERVAL}~${MAX_INTERVAL} 분 사이로 적어주세요. 예: /interval 30`);
        return;
      }
      config.intervalMinutes = minutes;
      save();
      await command.reply(`이제 ${minutes}분마다 부르러 올게요.\n\n${describeStatus(config, deps.now())}`);
      return;
    }

    case "hours": {
      const range = parseRange(args.join(""));
      if (!range) {
        await command.reply("HH:MM-HH:MM 형식으로 적어주세요. 예: /hours 09:00-18:00");
        return;
      }
      config.startMinutes = range.start;
      config.endMinutes = range.end;
      save();
      await command.reply(`활동 시간대를 바꿨습니다.\n\n${describeStatus(config, deps.now())}`);
      return;
    }

    case "days": {
      const days = parseDays(args.join(" "));
      if (!days) {
        await command.reply("예: /days 평일, /days 매일, /days 주말, /days 월화수목금토");
        return;
      }
      config.days = days;
      save();
      await command.reply(`알림 요일을 바꿨습니다.\n\n${describeStatus(config, deps.now())}`);
      return;
    }

    case "tz": {
      const timezone = args[0];
      if (!timezone || !isValidTimezone(timezone)) {
        await command.reply("올바른 타임존을 적어주세요. 예: /tz Asia/Seoul");
        return;
      }
      config.timezone = timezone;
      save();
      await command.reply(`기준 시간대를 ${timezone} 로 바꿨습니다.\n\n${describeStatus(config, deps.now())}`);
      return;
    }

    case "stats":
      await command.reply(describeStats(config, deps.now()));
      return;

    case "test":
      await deps.sendReminderNow();
      return;

    default:
      await command.reply(`모르는 명령이에요: /${name}\n\n${HELP}`);
  }
}

function describeStatus(config: Config, now: Date): string {
  const lines: string[] = [];
  const channels = boundChannels(config);

  lines.push(`상태: ${statusLabel(config, now)}`);
  lines.push(`간격: ${config.intervalMinutes}분`);
  lines.push(
    `시간대: ${formatDays(config.days)} ${formatClock(config.startMinutes)}~${formatClock(config.endMinutes)} (${config.timezone})`,
  );
  lines.push(`연결된 채널: ${channels.length > 0 ? channels.map(channelLabel).join(", ") : "없음"}`);

  const next = nextReminderAt(config, now);
  lines.push(`다음 알림: ${next ? formatWhen(next, config.timezone, now) : "예정 없음"}`);

  return lines.join("\n");
}

function statusLabel(config: Config, now: Date): string {
  if (!config.enabled) return "꺼짐 (/start 로 켜기)";
  if (config.pausedUntil !== null && config.pausedUntil > now.getTime()) {
    return `일시정지 (${formatDuration(config.pausedUntil - now.getTime())} 남음)`;
  }
  return "동작 중 🧚";
}

function channelLabel(id: ChannelId): string {
  return id === "telegram" ? "텔레그램" : "디스코드";
}

function describeStats(config: Config, now: Date): string {
  const today = zonedNow(now, config.timezone).date;
  const todayCount = config.stats[today] ?? 0;

  const recent: string[] = [];
  let weekTotal = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const at = new Date(now.getTime() - offset * 24 * 60 * MINUTE);
    const { date, weekday } = zonedNow(at, config.timezone);
    const count = config.stats[date] ?? 0;
    weekTotal += count;
    recent.push(`${DAY_NAMES_KO[weekday]} ${date.slice(5)}  ${count > 0 ? "▮".repeat(Math.min(count, 20)) : "·"} ${count}`);
  }

  return [
    "📊 허리 편 기록",
    "",
    `오늘: ${todayCount}번`,
    `최근 7일: ${weekTotal}번 (하루 평균 ${(weekTotal / 7).toFixed(1)}번)`,
    "",
    ...recent,
  ].join("\n");
}

/** "/interval 30" 또는 "!interval 30" 을 { name, args } 로. 명령이 아니면 null. */
function parseCommand(text: string): { name: string; args: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/") && !trimmed.startsWith("!")) return null;

  const [head, ...args] = trimmed.slice(1).split(/\s+/);
  if (!head) return null;

  // 텔레그램 그룹에서는 "/status@my_bot" 형태로 온다.
  const name = head.split("@")[0]?.toLowerCase();
  return name ? { name, args } : null;
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value.replace(/[^0-9]/g, ""));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** "09:00-18:00" -> 자정 기준 분. */
function parseRange(value: string): { start: number; end: number } | null {
  const match = /^(\d{1,2}):?(\d{2})?[-~](\d{1,2}):?(\d{2})?$/.exec(value.trim());
  if (!match) return null;

  const start = toMinutes(match[1], match[2]);
  const end = toMinutes(match[3], match[4]);
  if (start === null || end === null || start === end) return null;
  return { start, end };
}

function toMinutes(hour: string | undefined, minute: string | undefined): number | null {
  const h = Number(hour);
  const m = minute === undefined ? 0 : Number(minute);
  if (!Number.isInteger(h) || h < 0 || h > 24) return null;
  if (!Number.isInteger(m) || m < 0 || m > 59) return null;
  return (h % 24) * 60 + m;
}

const DAY_TOKENS: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** "평일", "매일", "주말", "월화수목금", "mon,wed,fri" 를 요일 번호 배열로. */
function parseDays(value: string): number[] | null {
  const normalized = value.replace(/[\s,]/g, "").toLowerCase();
  if (!normalized) return null;

  if (normalized === "매일" || normalized === "everyday" || normalized === "all") return [0, 1, 2, 3, 4, 5, 6];
  if (normalized === "평일" || normalized === "weekday" || normalized === "weekdays") return [1, 2, 3, 4, 5];
  if (normalized === "주말" || normalized === "weekend") return [0, 6];

  const days = new Set<number>();
  // 영문 3글자와 한글 1글자를 섞어 받는다.
  let rest = normalized;
  while (rest.length > 0) {
    const three = rest.slice(0, 3);
    const one = rest.slice(0, 1);
    if (three in DAY_TOKENS) {
      days.add(DAY_TOKENS[three]!);
      rest = rest.slice(3);
    } else if (one in DAY_TOKENS) {
      days.add(DAY_TOKENS[one]!);
      rest = rest.slice(1);
    } else if (/^[0-6]$/.test(one)) {
      days.add(Number(one));
      rest = rest.slice(1);
    } else {
      return null;
    }
  }
  return days.size > 0 ? [...days].sort((a, b) => a - b) : null;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
