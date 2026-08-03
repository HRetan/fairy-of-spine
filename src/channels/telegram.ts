import type { Action, Channel, CommandHandler, OutgoingMessage } from "./types.ts";

const API_BASE = "https://api.telegram.org";
const LONG_POLL_SECONDS = 25;

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

  async #pollLoop(handler: CommandHandler): Promise<void> {
    let backoffMs = 1_000;

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
        console.error(`[telegram] 폴링 실패, ${Math.round(backoffMs / 1000)}초 뒤 재시도:`, error);
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
    const response = await fetch(`${API_BASE}/bot${this.#token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      ...(signal ? { signal } : {}),
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
