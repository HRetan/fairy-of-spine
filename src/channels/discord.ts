import { createReporter } from "../report.ts";
import type { Action, Channel, CommandHandler, OutgoingMessage } from "./types.ts";

const API_BASE = "https://discord.com/api/v10";
const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
/** REST 요청이 매달릴 수 있는 최대 시간. */
const REQUEST_TIMEOUT_MS = 15_000;

// 게이트웨이 인텐트 비트.
const INTENT_GUILDS = 1 << 0;
const INTENT_GUILD_MESSAGES = 1 << 9;
const INTENT_DIRECT_MESSAGES = 1 << 12;
const INTENT_MESSAGE_CONTENT = 1 << 15;

// 게이트웨이 opcode.
const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_RESUME = 6;
const OP_RECONNECT = 7;
const OP_INVALID_SESSION = 9;
const OP_HELLO = 10;
const OP_HEARTBEAT_ACK = 11;

type GatewayPayload = {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
};

export type DiscordOptions = {
  token: string;
  /**
   * 길드(서버) 채널에서도 메시지 본문을 읽으려면 true.
   * MESSAGE CONTENT 는 특권 인텐트라 개발자 포털에서 먼저 켜야 하고,
   * 켜지 않은 채 요청하면 게이트웨이가 4014 로 끊는다. DM 은 이 인텐트 없이도 본문이 온다.
   */
  messageContentIntent: boolean;
};

/** 봇 토큰으로 게이트웨이에 붙어 메시지도 받고 보내는 채널. */
export class DiscordChannel implements Channel {
  readonly id = "discord" as const;
  readonly label = "디스코드";
  readonly canReceive = true;

  #token: string;
  #intents: number;
  #socket: WebSocket | null = null;
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #sequence: number | null = null;
  #sessionId: string | null = null;
  #resumeUrl: string | null = null;
  #selfId: string | null = null;
  #running = false;
  #backoffMs = 1_000;
  #handler: CommandHandler | null = null;
  // 끊김이 반복될 때 같은 경고를 매번 남기지 않는다.
  #reporter = createReporter("discord");

  constructor(options: DiscordOptions) {
    this.#token = options.token;
    this.#intents =
      INTENT_GUILDS |
      INTENT_GUILD_MESSAGES |
      INTENT_DIRECT_MESSAGES |
      (options.messageContentIntent ? INTENT_MESSAGE_CONTENT : 0);
  }

  async start(handler: CommandHandler): Promise<void> {
    this.#handler = handler;
    this.#running = true;
    this.#connect();
  }

  async stop(): Promise<void> {
    this.#running = false;
    this.#clearTimers();
    this.#socket?.close(1000);
    this.#socket = null;
  }

  async send(conversationId: string, message: OutgoingMessage, actions?: Action[]): Promise<void> {
    await this.#rest(`/channels/${conversationId}/messages`, {
      content: renderContent(message),
      ...(actions?.length
        ? {
            components: [
              {
                type: 1,
                components: actions.map((action) => ({
                  type: 2,
                  style: 2,
                  label: action.label,
                  custom_id: action.id,
                })),
              },
            ],
          }
        : {}),
    });
  }

  #connect(): void {
    if (!this.#running) return;

    const url = this.#sessionId && this.#resumeUrl ? `${this.#resumeUrl}/?v=10&encoding=json` : GATEWAY_URL;
    const socket = new WebSocket(url);
    this.#socket = socket;

    socket.addEventListener("message", (event) => {
      let payload: GatewayPayload;
      try {
        payload = JSON.parse(String(event.data)) as GatewayPayload;
      } catch {
        return;
      }
      void this.#handlePayload(payload);
    });

    socket.addEventListener("close", (event) => {
      this.#clearTimers();
      if (!this.#running) return;

      // 4014 = 허용되지 않은 인텐트. 재시도해도 계속 끊기니 원인을 알려준다.
      if (event.code === 4014) {
        console.error(
          "[discord] 특권 인텐트가 거부됐습니다. 개발자 포털 > Bot > MESSAGE CONTENT INTENT 를 켜거나 " +
            "DISCORD_MESSAGE_CONTENT_INTENT=false 로 두고 DM 으로 명령을 보내세요.",
        );
      }
      if (event.code === 4004) {
        console.error("[discord] 토큰이 거부됐습니다. DISCORD_BOT_TOKEN 을 확인해주세요.");
        this.#running = false;
        return;
      }
      // 재개 불가능한 코드면 세션을 버리고 새로 신원 확인한다.
      if (event.code >= 4007 && event.code !== 4008) this.#sessionId = null;

      this.#reporter.fail(new Error(`연결이 끊겼다 (code ${event.code}). 재접속한다.`));
      this.#scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      // close 이벤트가 뒤따르므로 여기서는 재접속을 걸지 않는다.
    });
  }

  #scheduleReconnect(): void {
    if (this.#reconnectTimer !== null) return;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#connect();
    }, this.#backoffMs);
    this.#backoffMs = Math.min(this.#backoffMs * 2, 60_000);
  }

  #clearTimers(): void {
    if (this.#heartbeatTimer !== null) clearInterval(this.#heartbeatTimer);
    this.#heartbeatTimer = null;
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
  }

  async #handlePayload(payload: GatewayPayload): Promise<void> {
    if (typeof payload.s === "number") this.#sequence = payload.s;

    switch (payload.op) {
      case OP_HELLO: {
        const interval = (payload.d as { heartbeat_interval: number }).heartbeat_interval;
        this.#heartbeatTimer = setInterval(() => {
          this.#sendPayload({ op: OP_HEARTBEAT, d: this.#sequence });
        }, interval);

        if (this.#sessionId) {
          this.#sendPayload({
            op: OP_RESUME,
            d: { token: this.#token, session_id: this.#sessionId, seq: this.#sequence },
          });
        } else {
          this.#sendPayload({
            op: OP_IDENTIFY,
            d: {
              token: this.#token,
              intents: this.#intents,
              properties: { os: process.platform, browser: "fairy-of-spine", device: "fairy-of-spine" },
            },
          });
        }
        return;
      }

      case OP_HEARTBEAT:
        this.#sendPayload({ op: OP_HEARTBEAT, d: this.#sequence });
        return;

      case OP_HEARTBEAT_ACK:
        this.#backoffMs = 1_000; // 정상 동작 확인됨
        this.#reporter.ok();
        return;

      case OP_RECONNECT:
        this.#socket?.close(4900);
        return;

      case OP_INVALID_SESSION:
        this.#sessionId = null;
        this.#socket?.close(4900);
        return;

      case OP_DISPATCH:
        await this.#handleDispatch(payload);
        return;

      default:
        return;
    }
  }

  async #handleDispatch(payload: GatewayPayload): Promise<void> {
    if (payload.t === "READY") {
      const data = payload.d as {
        session_id: string;
        resume_gateway_url?: string;
        user: { id: string; username: string };
      };
      this.#sessionId = data.session_id;
      this.#resumeUrl = data.resume_gateway_url ?? null;
      this.#selfId = data.user.id;
      console.log(`[discord] ${data.user.username} 으로 접속했습니다.`);
      return;
    }

    if (payload.t === "RESUMED") {
      console.log("[discord] 세션을 재개했습니다.");
      return;
    }

    if (payload.t === "MESSAGE_CREATE") {
      const message = payload.d as {
        channel_id: string;
        content?: string;
        author?: { id: string; bot?: boolean };
      };
      const text = message.content?.trim();
      if (!text || message.author?.bot || message.author?.id === this.#selfId) return;

      await this.#invoke({
        conversationId: message.channel_id,
        text,
        fromAction: false,
      });
      return;
    }

    if (payload.t === "INTERACTION_CREATE") {
      const interaction = payload.d as {
        id: string;
        token: string;
        type: number;
        channel_id?: string;
        data?: { custom_id?: string };
      };
      // 3 = MESSAGE_COMPONENT (버튼 클릭)
      if (interaction.type !== 3 || !interaction.data?.custom_id || !interaction.channel_id) return;

      // 6 = DEFERRED_UPDATE_MESSAGE. 원본 메시지를 건드리지 않고 로딩만 끝낸다.
      await this.#rest(`/interactions/${interaction.id}/${interaction.token}/callback`, { type: 6 }).catch(
        () => {},
      );

      await this.#invoke({
        conversationId: interaction.channel_id,
        text: `/${interaction.data.custom_id.replace(":", " ")}`,
        fromAction: true,
      });
    }
  }

  async #invoke(input: { conversationId: string; text: string; fromAction: boolean }): Promise<void> {
    const handler = this.#handler;
    if (!handler) return;

    try {
      await handler({
        channel: this.id,
        conversationId: input.conversationId,
        text: input.text,
        fromAction: input.fromAction,
        reply: (text) => this.send(input.conversationId, { text }),
      });
    } catch (error) {
      console.error("[discord] 명령 처리 실패:", error);
    }
  }

  #sendPayload(payload: GatewayPayload): void {
    if (this.#socket?.readyState !== WebSocket.OPEN) return;
    this.#socket.send(JSON.stringify(payload));
  }

  async #rest(path: string, body: unknown): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bot ${this.#token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) return;

      if (response.status === 429) {
        const payload = (await response.json().catch(() => ({}))) as { retry_after?: number };
        const waitMs = Math.ceil((payload.retry_after ?? 1) * 1000);
        await sleep(waitMs);
        continue;
      }

      throw new Error(`디스코드 ${path} 실패: ${response.status} ${await response.text()}`);
    }
  }
}

/** 웹훅 URL 만 있을 때 쓰는 발송 전용 채널. 명령은 받지 못한다. */
export class DiscordWebhookChannel implements Channel {
  readonly id = "discord" as const;
  readonly label = "디스코드(웹훅)";
  readonly canReceive = false;

  #url: string;

  constructor(webhookUrl: string) {
    this.#url = webhookUrl;
  }

  async start(): Promise<void> {
    // 수신 불가. 아무것도 하지 않는다.
  }

  async stop(): Promise<void> {
    // 유지할 연결이 없다.
  }

  async send(_conversationId: string, message: OutgoingMessage): Promise<void> {
    const response = await fetch(this.#url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: renderContent(message) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`디스코드 웹훅 실패: ${response.status} ${await response.text()}`);
    }
  }
}

/** 아스키 아트는 코드펜스로 감싸야 고정폭으로 보인다. 디스코드는 별도 parse mode 가 없다. */
function renderContent(message: OutgoingMessage): string {
  return message.art ? `${message.text}\n\`\`\`\n${message.art}\n\`\`\`` : message.text;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
