import { createChannels } from "./channels/index.ts";
import { TelegramChannel } from "./channels/telegram.ts";
import type { Action, Channel, ChannelId } from "./channels/types.ts";
import { handleCommand } from "./commands.ts";
import { boundChannels, CONFIG_PATH, loadConfig, saveConfig } from "./config.ts";
import { loadDotEnv, logDir } from "./env.ts";
import { startFileLogging, trimLogs } from "./logs.ts";
import { reminderMessage } from "./messages.ts";
import { maybeOpenBrowser } from "./open.ts";
import { formatWhen, isDue, nextReminderAt } from "./schedule.ts";
import { startWebServer } from "./web.ts";

/** 알림을 보낼 때가 됐는지 확인하는 주기. 분 단위 정확도면 충분하다. */
const TICK_MS = 20_000;

/**
 * 로그 크기를 확인하는 주기(틱 수). 20초 x 90 = 30분.
 * 시작할 때만 확인하면 부족하다. 폴링이 계속 실패하는 상황에서는
 * 프로세스가 재시작하지 않은 채로 로그만 불어나기 때문이다.
 */
const LOG_CHECK_EVERY = 90;

const REMINDER_ACTIONS: Action[] = [
  { id: "done", label: "✅ 폈어요" },
  { id: "snooze:15", label: "😴 15분 뒤" },
];

loadDotEnv();
trimLogs();
// 콘솔에만 찍히고 사라지지 않도록 파일에도 남긴다. (실행파일을 더블클릭한 경우)
startFileLogging();

const config = loadConfig();

const setups = createChannels({
  telegramOffset: config.telegramUpdateOffset,
  onTelegramOffset: (offset) => {
    config.telegramUpdateOffset = offset;
    saveConfig(config);
  },
});

const channels = new Map<ChannelId, Channel>();
for (const setup of setups) {
  channels.set(setup.channel.id, setup.channel);
  // 환경변수로 대상을 지정했으면 저장된 값보다 우선한다.
  if (setup.defaultConversationId !== null) {
    config.bindings[setup.channel.id] = setup.defaultConversationId;
  }
}
saveConfig(config);

/**
 * 발송이 진행 중인지. 틱은 20초마다 도는데 발송은 그보다 오래 걸릴 수 있다.
 * (맥이 잠들었다 깨거나 네트워크가 멈칫하면 요청 하나가 한참 매달려 있는다)
 * 이 빗장이 없으면 그 사이 틱이 "아직 안 보냈네" 하고 한 번 더 보낸다.
 */
let sending = false;

async function sendReminder(): Promise<void> {
  if (sending) return;

  const message = reminderMessage();
  const targets = boundChannels(config).filter((id) => channels.has(id));

  if (targets.length === 0) {
    // 아직 아무 데도 안 묶였으면 조용히 넘어간다. /start 를 기다린다.
    return;
  }

  sending = true;
  // 보내기 전에 먼저 자리를 차지한다. 발송이 오래 걸려도 다음 틱이 중복으로 보내지 않는다.
  // 발송에 실패하면 이번 차례를 건너뛰는 셈인데, 두 번 보내는 것보다는 낫다.
  config.lastNotifiedAt = Date.now();
  config.pausedUntil = null;
  saveConfig(config);

  try {
    await Promise.all(
      targets.map(async (id) => {
        const channel = channels.get(id)!;
        const conversationId = config.bindings[id]!;
        try {
          await channel.send(conversationId, message, channel.canReceive ? REMINDER_ACTIONS : undefined);
        } catch (error) {
          console.error(`[${id}] 알림 발송 실패:`, error);
        }
      }),
    );
  } finally {
    sending = false;
  }
}

const deps = {
  config,
  save: () => saveConfig(config),
  sendReminderNow: sendReminder,
  now: () => new Date(),
};

// start() 는 폴링/연결을 걸어두고 곧바로 돌아온다. 기다릴 필요가 없고,
// 최상위 await 를 두면 CommonJS 로 번들할 수 없어 단일 실행파일을 만들지 못한다.
for (const setup of setups) {
  void setup.channel.start((command) => handleCommand(command, deps));
}

let ticks = 0;
const web = startWebServer({
  config,
  availableChannels: () => [...channels.keys()],
  // 텔레그램만 대화를 링크로 묶을 수 있다. 디스코드는 채널에 직접 !start 를 보내야 한다.
  telegramInviteUrl: async () => {
    const telegram = channels.get("telegram");
    return telegram instanceof TelegramChannel ? await telegram.inviteUrl() : null;
  },
  sendReminderNow: sendReminder,
  // 창 없이 돌 때는 Ctrl+C 를 누를 데가 없다. 설정 화면에서 끌 수 있어야 한다.
  quit: () => shutdown("설정 화면에서 끄라고 했어."),
  now: () => new Date(),
});

// 토큰이 하나도 없어도 설정 화면이 열려 있으면 살아 있는다.
// 여기서 죽으면 처음 쓰는 사람이 토큰을 넣을 길이 없어진다. 화면을 열려면 내가 떠 있어야 하니까.
if (setups.length === 0 && !web) {
  console.error(
    "쓸 수 있는 채널이 없고 설정 화면도 꺼져 있습니다.\n" +
      ".env 에 TELEGRAM_BOT_TOKEN 또는 DISCORD_BOT_TOKEN(혹은 DISCORD_WEBHOOK_URL)을 넣어주세요.",
  );
  process.exit(1);
}

const tick = setInterval(() => {
  ticks += 1;
  if (ticks % LOG_CHECK_EVERY === 0) trimLogs();

  const now = new Date();
  if (!isDue(config, now)) return;
  void sendReminder();
}, TICK_MS);

const enabledLabels = setups.map((setup) => setup.channel.label).join(", ");
console.log(
  enabledLabels ? `🧚 허리 요정 시작: ${enabledLabels}` : "🧚 허리 요정 시작: 아직 갈 곳이 없어",
);
console.log(`설정 파일: ${CONFIG_PATH}`);
console.log(`로그: ${logDir()}`);

// 아직 갈 곳이 없으면 처음 쓰는 것으로 보고 설정 화면을 띄워준다.
if (web) maybeOpenBrowser(web.url, setups.length === 0);

const next = nextReminderAt(config, new Date());
if (setups.length === 0) {
  console.log(`토큰이 아직 없어요. 설정 화면에서 넣고 나를 다시 깨워주세요: ${web?.url ?? ""}`);
} else if (next) {
  console.log(`다음 알림 예정: ${formatWhen(next, config.timezone, new Date())}`);
} else {
  console.log("아직 연결된 대화가 없습니다. 봇에게 /start 를 보내주세요.");
}

let shuttingDown = false;

function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${reason} 그럼 이만. ✨`);
  clearInterval(tick);
  web?.close();
  void Promise.all(setups.map((setup) => setup.channel.stop())).finally(() => process.exit(0));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => shutdown(`${signal} 받았어.`));
}

process.on("unhandledRejection", (reason) => {
  // 네트워크 오류 하나로 상주 프로세스가 죽지 않게 한다.
  console.error("[fatal] 처리되지 않은 거부:", reason);
});
