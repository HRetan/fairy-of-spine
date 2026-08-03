import { createChannels } from "./channels/index.ts";
import type { Action, Channel, ChannelId } from "./channels/types.ts";
import { handleCommand } from "./commands.ts";
import { boundChannels, CONFIG_PATH, loadConfig, saveConfig } from "./config.ts";
import { loadDotEnv, logDir } from "./env.ts";
import { trimLogs } from "./logs.ts";
import { reminderMessage } from "./messages.ts";
import { formatWhen, isDue, nextReminderAt } from "./schedule.ts";

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

const config = loadConfig();

const setups = createChannels({
  telegramOffset: config.telegramUpdateOffset,
  onTelegramOffset: (offset) => {
    config.telegramUpdateOffset = offset;
    saveConfig(config);
  },
});

if (setups.length === 0) {
  console.error(
    "쓸 수 있는 채널이 없습니다. .env 에 TELEGRAM_BOT_TOKEN 또는 DISCORD_BOT_TOKEN(혹은 DISCORD_WEBHOOK_URL)을 넣어주세요.",
  );
  process.exit(1);
}

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

for (const setup of setups) {
  await setup.channel.start((command) => handleCommand(command, deps));
}

let ticks = 0;
const tick = setInterval(() => {
  ticks += 1;
  if (ticks % LOG_CHECK_EVERY === 0) trimLogs();

  const now = new Date();
  if (!isDue(config, now)) return;
  void sendReminder();
}, TICK_MS);

const enabledLabels = setups.map((setup) => setup.channel.label).join(", ");
console.log(`🧚 허리 요정 시작: ${enabledLabels}`);
console.log(`설정 파일: ${CONFIG_PATH}`);
console.log(`로그: ${logDir()}`);

const next = nextReminderAt(config, new Date());
console.log(
  next
    ? `다음 알림 예정: ${formatWhen(next, config.timezone, new Date())}`
    : "아직 연결된 대화가 없습니다. 봇에게 /start 를 보내주세요.",
);

let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} 수신, 종료합니다.`);
    clearInterval(tick);
    void Promise.all(setups.map((setup) => setup.channel.stop())).finally(() => process.exit(0));
  });
}

process.on("unhandledRejection", (reason) => {
  // 네트워크 오류 하나로 상주 프로세스가 죽지 않게 한다.
  console.error("[fatal] 처리되지 않은 거부:", reason);
});
