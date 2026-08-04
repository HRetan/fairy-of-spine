import { createReporter } from "../report.ts";
import type { Action, Channel, CommandHandler, OutgoingMessage } from "./types.ts";

const API_BASE = "https://api.telegram.org";
const LONG_POLL_SECONDS = 25;
/**
 * 롱폴링이 아닌 요청이 매달릴 수 있는 최대 시간.
 *
 * 롱폴링(25초)보다 넉넉히 길어야 한다. 짧게 잡았더니 발송이 심심찮게 잘려나갔고
 * (실측 6번 중 2번), 그때마다 알림이 통째로 사라졌다. 간격은 어차피 분 단위라
 * 넉넉히 두어도 잃을 게 없다. 매달린 요청은 발송 빗장이 풀리는 것만 늦출 뿐이다.
 */
const REQUEST_TIMEOUT_MS = 40_000;

type TelegramUpdate = {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
  };
};

export type TelegramOptions = {
  token: string;
  /** 재시작해도 같은 업데이트를 다시 처리하지 않도록 저장해 둔 오프셋. */
  initialOffset: number;
  /** 오프셋이 전진할 때마다 호출된다. 설정 파일에 남기는 용도. */
  onOffset: (offset: number) => void;
};

export class TelegramChannel implements Channel {
  readonly id = "telegram" as const;
  readonly label = "텔레그램";
  readonly canReceive = true;

  #token: string;
  #offset: number;
  #onOffset: (offset: number) => void;
  #running = false;
  /** 롱폴링 전용 취소 컨트롤러. 종료할 때 25초를 기다리지 않기 위한 것. */
  #pollAbort: AbortController | null = null;
  /** getMe 로 한 번만 알아내고 재사용한다. undefined = 아직 안 물어봄. */
  #inviteUrl: string | null | undefined = undefined;

  constructor(options: TelegramOptions) {
    this.#token = options.token;
    this.#offset = options.initialOffset;
    this.#onOffset = options.onOffset;
  }

  async start(handler: CommandHandler): Promise<void> {
    this.#running = true;
    void this.#pollLoop(handler);
  }

  async stop(): Promise<void> {
    this.#running = false;
    this.#pollAbort?.abort();
  }

  async send(conversationId: string, message: OutgoingMessage, actions?: Action[]): Promise<void> {
    // 아스키 아트가 없으면 평문 그대로 보낸다. 이스케이프 사고가 날 여지를 없앤다.
    // 아트가 있을 때만 HTML 모드로 올려서 <pre> 고정폭 블록을 쓴다.
    const body = message.art
      ? {
          text: `${escapeHtml(message.text)}\n<pre>${escapeHtml(message.art)}</pre>`,
          parse_mode: "HTML",
        }
      : { text: message.text };

    await this.#call("sendMessage", {
      chat_id: conversationId,
      ...body,
      ...(actions?.length
        ? {
            reply_markup: {
              inline_keyboard: [
                actions.map((action) => ({ text: action.label, callback_data: action.id })),
              ],
            },
          }
        : {}),
    });
  }

  /**
   * 봇을 여는 t.me 링크. 누르면 텔레그램이 열리고 /start 가 채워진다.
   * 대화를 묶으려면 /start 를 한 번 보내야 하는데, 설정 화면에서는 그걸 대신 해줄 수 없다.
   * 링크 한 번으로 끝나게 해주려고 봇 username 을 물어본다.
   */
  async inviteUrl(): Promise<string | null> {
    if (this.#inviteUrl !== undefined) return this.#inviteUrl;
    try {
      const me = await this.#call<{ username?: string }>("getMe", {});
      this.#inviteUrl = me.username ? `https://t.me/${me.username}?start=fairy` : null;
    } catch {
      this.#inviteUrl = null; // 토큰이 틀렸거나 네트워크가 안 되면 링크는 포기한다
    }
    return this.#inviteUrl;
  }

  async #pollLoop(handler: CommandHandler): Promise<void> {
    let backoffMs = 1_000;
    // 같은 실패가 이어질 때 로그를 매번 남기지 않는다. 409 나 잘못된 토큰이 대표적이다.
    const reporter = createReporter("telegram");

    while (this.#running) {
      try {
        this.#pollAbort = new AbortController();
        const updates = await this.#call<TelegramUpdate[]>(
          "getUpdates",
          {
            offset: this.#offset,
            timeout: LONG_POLL_SECONDS,
            allowed_updates: ["message", "callback_query"],
          },
          this.#pollAbort.signal,
        );
        backoffMs = 1_000;
        reporter.ok();

        for (const update of updates) {
          this.#offset = update.update_id + 1;
          this.#onOffset(this.#offset);
          try {
            await this.#dispatch(update, handler);
          } catch (error) {
            console.error("[telegram] 명령 처리 실패:", error);
          }
        }
      } catch (error) {
        if (!this.#running) return;
        reporter.fail(error);
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 60_000);
      }
    }
  }

  async #dispatch(update: TelegramUpdate, handler: CommandHandler): Promise<void> {
    if (update.callback_query) {
      const query = update.callback_query;
      const chatId = query.message?.chat.id;
      if (chatId === undefined || !query.data) return;

      // 버튼의 로딩 스피너를 먼저 멈춰준다.
      await this.#call("answerCallbackQuery", { callback_query_id: query.id }).catch(() => {});

      await handler({
        channel: this.id,
        conversationId: String(chatId),
        text: `/${query.data.replace(":", " ")}`,
        fromAction: true,
        reply: (text) => this.send(String(chatId), { text }),
      });
      return;
    }

    const message = update.message;
    const text = message?.text?.trim();
    if (!message || !text) return;

    const chatId = String(message.chat.id);
    await handler({
      channel: this.id,
      conversationId: chatId,
      text,
      fromAction: false,
      reply: (reply) => this.send(chatId, { text: reply }),
    });
  }

  async #call<T>(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    // 롱폴링은 자기 신호를 들고 오니 그대로 두고, 나머지 요청에는 타임아웃을 건다.
    // 타임아웃이 없으면 맥이 잠들었다 깨는 사이 요청 하나가 무한정 매달릴 수 있다.
    const response = await fetch(`${API_BASE}/bot${this.#token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!payload.ok) {
      throw new Error(`텔레그램 ${method} 실패: ${payload.description ?? response.status}`);
    }
    return payload.result as T;
  }
}

/** parse_mode 가 HTML 일 때 텍스트로 취급돼야 할 문자를 막는다. 아스키 아트의 < 가 특히 위험하다. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
