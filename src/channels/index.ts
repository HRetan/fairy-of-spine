import { DiscordChannel, DiscordWebhookChannel } from "./discord.ts";
import { TelegramChannel } from "./telegram.ts";
import type { ChannelSetup } from "./types.ts";

export type ChannelFactoryDeps = {
  /** 저장해 둔 텔레그램 업데이트 오프셋. */
  telegramOffset: number;
  /** 오프셋이 전진할 때마다 호출. 설정 파일에 남기는 용도. */
  onTelegramOffset: (offset: number) => void;
};

/**
 * 환경변수를 보고 쓸 수 있는 채널만 만든다.
 * 토큰이 있는 채널은 켜지고, 없는 채널은 조용히 빠진다.
 *
 *   TELEGRAM_BOT_TOKEN      -> 텔레그램 (명령 O)
 *   DISCORD_BOT_TOKEN       -> 디스코드 봇 (명령 O)
 *   DISCORD_WEBHOOK_URL     -> 디스코드 웹훅 (발송만, 봇 토큰이 없을 때만 사용)
 */
export function createChannels(deps: ChannelFactoryDeps): ChannelSetup[] {
  const setups: ChannelSetup[] = [];

  const telegramToken = env("TELEGRAM_BOT_TOKEN");
  if (telegramToken) {
    setups.push({
      channel: new TelegramChannel({
        token: telegramToken,
        initialOffset: deps.telegramOffset,
        onOffset: deps.onTelegramOffset,
      }),
      defaultConversationId: env("TELEGRAM_CHAT_ID"),
    });
  }

  const discordToken = env("DISCORD_BOT_TOKEN");
  const discordWebhook = env("DISCORD_WEBHOOK_URL");

  if (discordToken) {
    setups.push({
      channel: new DiscordChannel({
        token: discordToken,
        messageContentIntent: envFlag("DISCORD_MESSAGE_CONTENT_INTENT", false),
      }),
      defaultConversationId: env("DISCORD_CHANNEL_ID"),
    });
  } else if (discordWebhook) {
    setups.push({
      channel: new DiscordWebhookChannel(discordWebhook),
      // 웹훅은 URL 자체가 대상이라 대화 ID 가 따로 없다. 자리표시자를 넣어 묶인 상태로 둔다.
      defaultConversationId: "webhook",
    });
  }

  return setups;
}

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function envFlag(name: string, fallback: boolean): boolean {
  const value = env(name)?.toLowerCase();
  if (value === null || value === undefined) return fallback;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}
