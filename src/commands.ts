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
  "🧚 나에게 할 수 있는 말",
  "",
  "/start — 이 대화로 찾아갈게",
  "/stop — 조용히 있을게",
  "/status — 지금 설정과 다음에 갈 시각",
  "/done — 폈다고 알려줘. 칭찬하고 타이머를 다시 잴게",
  "/snooze [분] — 잠깐 미뤄줄게 (기본 15분)",
  "/pause [분] — 쉬어갈게 (분을 안 쓰면 부를 때까지)",
  "/resume — 다시 찾아갈게",
  "/interval <분> — 얼마마다 갈지 (예: /interval 25)",
  "/hours <HH:MM-HH:MM> — 언제부터 언제까지 (예: /hours 09:00-18:00)",
  "/days <매일|평일|주말|월화수목금> — 어느 요일에 갈지",
  "/tz <타임존> — 어느 시간대를 기준으로 할지 (예: /tz Asia/Seoul)",
  "/stats — 네가 몇 번 폈는지",
  "/test — 지금 당장 한 번 가볼게",
  "",
  "디스코드에서는 / 대신 ! 도 알아들어 (예: !status).",
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
    await command.reply(`먼저 ${prefix}start 라고 말해줘. 📍\n그래야 어디로 찾아갈지 알거든.`);
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
          ? `🧚 이미 네 옆에 있어.\n\n${describeStatus(config, deps.now())}`
          : `${greetingMessage()}\n\n${describeStatus(config, deps.now())}\n\n/help 라고 하면 내가 할 수 있는 걸 알려줄게.`,
      );
      return;
    }

    case "help":
      await command.reply(HELP);
      return;

    case "stop":
      config.enabled = false;
      save();
      await command.reply("알겠어. 조용히 있을게. 💤\n다시 부르고 싶으면 /start 라고 말해줘.");
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
      const suffix = next ? `\n⏰ 다음엔 ${formatWhen(next, config.timezone, deps.now())} 에 갈게.` : "";
      await command.reply(`${praiseMessage()} (오늘 ${config.stats[today]}번째)${suffix}`);
      return;
    }

    case "snooze": {
      const minutes = args[0] === undefined ? 15 : parsePositiveInt(args[0]);
      if (minutes === null || minutes > MAX_INTERVAL) {
        await command.reply(`🤔 1~${MAX_INTERVAL} 사이의 분을 말해줘. 예: /snooze 10`);
        return;
      }
      config.pausedUntil = deps.now().getTime() + minutes * MINUTE;
      save();
      await command.reply(`알겠어. ${minutes}분 뒤에 다시 올게. 그때까진 조용히 있을게. 😴`);
      return;
    }

    case "pause": {
      if (args[0] === undefined) {
        config.pausedUntil = null;
        config.enabled = false;
        save();
        await command.reply("알겠어. 네가 부를 때까지 쉬고 있을게. 💤\n/resume 이라고 하면 다시 갈게.");
        return;
      }
      const minutes = parsePositiveInt(args[0]);
      if (minutes === null) {
        await command.reply("🤔 몇 분이나 쉴지 숫자로 말해줘. 예: /pause 90");
        return;
      }
      config.pausedUntil = deps.now().getTime() + minutes * MINUTE;
      config.enabled = true;
      save();
      await command.reply(`${formatDuration(minutes * MINUTE)} 동안 조용히 있을게. 🤫`);
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
          ? `다시 갈게. 🧚\n⏰ ${formatWhen(next, config.timezone, deps.now())} 에 찾아갈 거야.`
          : "다시 갈게. 🧚",
      );
      return;
    }

    case "interval": {
      const minutes = args[0] === undefined ? null : parsePositiveInt(args[0]);
      if (minutes === null || minutes < MIN_INTERVAL || minutes > MAX_INTERVAL) {
        await command.reply(`🤔 ${MIN_INTERVAL}~${MAX_INTERVAL} 분 사이로 말해줘. 예: /interval 30`);
        return;
      }
      config.intervalMinutes = minutes;
      save();
      await command.reply(`이제 ${minutes}분마다 갈게. ⏱️\n\n${describeStatus(config, deps.now())}`);
      return;
    }

    case "hours": {
      const range = parseRange(args.join(""));
      if (!range) {
        await command.reply("🤔 HH:MM-HH:MM 이렇게 말해줘. 예: /hours 09:00-18:00");
        return;
      }
      config.startMinutes = range.start;
      config.endMinutes = range.end;
      save();
      await command.reply(`언제 갈지 바꿨어. 🕘\n\n${describeStatus(config, deps.now())}`);
      return;
    }

    case "days": {
      const days = parseDays(args.join(" "));
      if (!days) {
        await command.reply("🤔 이렇게 말해줘. 예: /days 평일, /days 매일, /days 주말, /days 월화수목금토");
        return;
      }
      config.days = days;
      save();
      await command.reply(`어느 요일에 갈지 바꿨어. 📅\n\n${describeStatus(config, deps.now())}`);
      return;
    }

    case "tz": {
      const timezone = args[0];
      if (!timezone || !isValidTimezone(timezone)) {
        await command.reply("🤔 그런 시간대는 나도 모르겠어. 예: /tz Asia/Seoul");
        return;
      }
      config.timezone = timezone;
      save();
      // 조사를 붙이지 않는다. 타임존 이름의 끝소리에 따라 을/를이 갈리는데 미리 알 수 없다.
      await command.reply(`이제 ${timezone} 기준으로 셀게. 🌏\n\n${describeStatus(config, deps.now())}`);
      return;
    }

    case "stats":
      await command.reply(describeStats(config, deps.now()));
      return;

    case "test":
      await deps.sendReminderNow();
      return;

    default:
      await command.reply(`🤔 그건 무슨 말인지 모르겠어: /${name}\n\n${HELP}`);
  }
}

function describeStatus(config: Config, now: Date): string {
  const lines: string[] = [];
  const channels = boundChannels(config);

  lines.push(`🧚 지금: ${statusLabel(config, now)}`);
  lines.push(`⏱️ 얼마마다: ${config.intervalMinutes}분`);
  lines.push(
    `🕘 언제: ${formatDays(config.days)} ${formatClock(config.startMinutes)}~${formatClock(config.endMinutes)} (${config.timezone})`,
  );
  lines.push(`📮 어디로: ${channels.length > 0 ? channels.map(channelLabel).join(", ") : "아직 없어"}`);

  const next = nextReminderAt(config, now);
  lines.push(`⏰ 다음에 갈 시각: ${next ? formatWhen(next, config.timezone, now) : "당분간 안 가"}`);

  return lines.join("\n");
}

function statusLabel(config: Config, now: Date): string {
  if (!config.enabled) return "쉬는 중 (/start 로 불러줘)";
  if (config.pausedUntil !== null && config.pausedUntil > now.getTime()) {
    return `잠깐 미뤄둔 상태 (${formatDuration(config.pausedUntil - now.getTime())} 남음)`;
  }
  // 이 줄은 이미 🧚 로 시작하니 꼬리에 또 붙이지 않는다. (한 줄에 이모지 하나)
  return "네 옆에서 지켜보는 중";
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
    "📊 네가 허리 편 기록",
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
