import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { ChannelId } from "./channels/types.ts";
import { boundChannels, saveConfig, type Config } from "./config.ts";
import {
  EDITABLE_KEYS,
  maskSecret,
  readEnvFile,
  SECRET_KEYS,
  updateEnvFile,
  type EditableKey,
} from "./envfile.ts";
import { formatClock, formatDays, formatDuration, formatWhen, nextReminderAt, zonedNow } from "./schedule.ts";
import { UI_HTML } from "./ui.ts";

const DEFAULT_PORT = 7979;
const HOST = "127.0.0.1";

export type WebDeps = {
  config: Config;
  /** 지금 켜져 있는 채널. 토큰이 있어 실제로 만들어진 것들. */
  availableChannels: () => ChannelId[];
  sendReminderNow: () => Promise<void>;
  /** 텔레그램 봇을 여는 t.me 링크. 없으면 null. */
  telegramInviteUrl: () => Promise<string | null>;
  /** 프로세스를 곱게 종료한다. */
  quit: () => void;
  now: () => Date;
};

/** 서버를 띄운다. 끌 수 없는 상황이면 null 을 돌려준다. */
export function startWebServer(deps: WebDeps): { url: string; close: () => void } | null {
  if ((process.env["FAIRY_WEB"] ?? "").toLowerCase() === "off") return null;

  const port = Number(process.env["FAIRY_WEB_PORT"] ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[web] FAIRY_WEB_PORT 가 이상해서 설정 화면을 열지 않았다: ${process.env["FAIRY_WEB_PORT"]}`);
    return null;
  }

  const server = createServer((req, res) => {
    handle(req, res, deps).catch((error) => {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  const url = `http://${HOST}:${port}`;

  server.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[web] 설정 화면을 열지 못했다: ${message}`);
    if (message.includes("EADDRINUSE")) {
      console.error(`[web] ${port} 번을 누가 이미 쓰고 있어. 내가 이미 떠 있는 건 아닌지 봐줘.`);
      console.error("[web] 다른 포트를 쓰려면 FAIRY_WEB_PORT 를 정해줘.");
    }
  });

  // 주소는 실제로 자리를 잡은 뒤에 알린다.
  // 미리 찍으면 포트를 못 잡았는데도 열린 것처럼 보인다.
  server.on("listening", () => console.log(`설정 화면: ${url}`));

  // 127.0.0.1 에만 묶는다. 바깥에서는 닿을 수 없다.
  server.listen(port, HOST);
  return { url, close: () => server.close() };
}

async function handle(req: IncomingMessage, res: ServerResponse, deps: WebDeps): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${HOST}`);

  // Host 를 확인해 DNS 리바인딩을 막는다. 브라우저가 다른 이름으로 우리를 부르면 거절한다.
  const host = req.headers.host ?? "";
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
    send(res, 403, { error: "허락되지 않은 host" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(UI_HTML);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    send(res, 200, await buildState(deps));
    return;
  }

  if (req.method === "POST") {
    // 다른 웹페이지가 몰래 form 으로 찌르지 못하게 막는다.
    // 이 헤더는 교차 출처에서 preflight 없이는 붙일 수 없고, 우리는 CORS 를 허락하지 않는다.
    if (req.headers["x-fairy"] !== "1") {
      send(res, 403, { error: "이 요청은 받지 않아" });
      return;
    }

    const body = await readJson(req);
    if (url.pathname === "/api/config") return void (await updateRules(body, deps, res));
    if (url.pathname === "/api/env") return void (await updateEnv(body, deps, res));
    if (url.pathname === "/api/action") return void (await runAction(body, deps, res));
  }

  send(res, 404, { error: "그런 길은 없어" });
}

async function buildState(deps: WebDeps): Promise<unknown> {
  const { config } = deps;
  const now = deps.now();
  const next = nextReminderAt(config, now);
  const today = zonedNow(now, config.timezone).date;

  const env: Record<string, { display: string; masked: boolean }> = {};
  const stored = readEnvFile();
  for (const key of EDITABLE_KEYS) {
    const value = stored[key] ?? "";
    const masked = value !== "" && SECRET_KEYS.includes(key);
    env[key] = { display: masked ? maskSecret(value) : value, masked };
  }

  // 아직 어디에도 안 묶였을 때만 링크를 안내한다. 이미 묶였으면 필요 없다.
  const needsBinding = boundChannels(config).length === 0;
  const inviteUrl = needsBinding ? await deps.telegramInviteUrl() : null;

  return {
    config,
    env,
    inviteUrl,
    status: {
      label: statusLabel(config, now, deps.availableChannels().length > 0, !needsBinding),
      next: next ? formatWhen(next, config.timezone, now) : "당분간 안 가",
      channels: boundChannels(config).map(channelLabel),
      available: deps.availableChannels().map(channelLabel),
      today: config.stats[today] ?? 0,
      window: `${formatDays(config.days)} ${formatClock(config.startMinutes)}~${formatClock(config.endMinutes)}`,
    },
  };
}

function statusLabel(config: Config, now: Date, hasChannel: boolean, isBound: boolean): string {
  // 토큰이 없거나 대화가 안 묶였으면 그것부터 말한다. "지켜보는 중"은 사실이 아니다.
  if (!hasChannel) return "아직 갈 곳이 없어 — 아래에 토큰을 넣어줘";
  if (!isBound) return "어느 대화로 갈지 아직 못 정했어";
  if (!config.enabled) return "쉬는 중";
  if (config.pausedUntil !== null && config.pausedUntil > now.getTime()) {
    return `잠깐 미뤄둔 상태 (${formatDuration(config.pausedUntil - now.getTime())} 남음)`;
  }
  return "네 옆에서 지켜보는 중 🧚";
}

function channelLabel(id: ChannelId): string {
  return id === "telegram" ? "텔레그램" : "디스코드";
}

async function updateRules(body: Record<string, unknown>, deps: WebDeps, res: ServerResponse): Promise<void> {
  const { config } = deps;

  const interval = Number(body["intervalMinutes"]);
  if (!Number.isInteger(interval) || interval < 1 || interval > 1440) {
    send(res, 400, { error: "간격은 1~1440분 사이로 적어줘" });
    return;
  }

  const start = parseClock(String(body["start"] ?? ""));
  const end = parseClock(String(body["end"] ?? ""));
  if (start === null || end === null || start === end) {
    send(res, 400, { error: "시간은 HH:MM 으로 적어줘. 시작과 끝이 같으면 안 돼" });
    return;
  }

  const days = Array.isArray(body["days"])
    ? [...new Set(body["days"].filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  if (days.length === 0) {
    send(res, 400, { error: "요일을 하나 이상 골라줘" });
    return;
  }

  const timezone = String(body["timezone"] ?? "");
  if (!isValidTimezone(timezone)) {
    send(res, 400, { error: "그런 시간대는 나도 모르겠어" });
    return;
  }

  config.intervalMinutes = interval;
  config.startMinutes = start;
  config.endMinutes = end;
  config.days = days;
  config.timezone = timezone;
  saveConfig(config);

  send(res, 200, await buildState(deps));
}

async function updateEnv(body: Record<string, unknown>, deps: WebDeps, res: ServerResponse): Promise<void> {
  const changes: Record<string, string> = {};
  for (const key of EDITABLE_KEYS) {
    if (!(key in body)) continue; // 화면에서 손대지 않은 값은 건드리지 않는다
    changes[key] = String(body[key as EditableKey] ?? "").trim();
  }

  updateEnvFile(changes);
  send(res, 200, await buildState(deps));
}

async function runAction(
  body: Record<string, unknown>,
  deps: WebDeps,
  res: ServerResponse,
): Promise<void> {
  const { config } = deps;
  const action = String(body["action"] ?? "");

  if (action === "test") {
    await deps.sendReminderNow();
  } else if (action === "done") {
    const today = zonedNow(deps.now(), config.timezone).date;
    config.stats[today] = (config.stats[today] ?? 0) + 1;
    config.lastNotifiedAt = deps.now().getTime();
    config.pausedUntil = null;
    saveConfig(config);
  } else if (action === "toggle") {
    config.enabled = !config.enabled;
    config.pausedUntil = null;
    // 켤 때는 타이머를 다시 잰다. /start 와 같은 규칙이다.
    if (config.enabled) config.lastNotifiedAt = deps.now().getTime();
    saveConfig(config);
  } else if (action === "quit") {
    // 응답을 먼저 보내고 끈다. 아니면 화면이 답을 못 받는다.
    send(res, 200, { ok: true });
    setTimeout(() => deps.quit(), 100);
    return;
  } else {
    send(res, 400, { error: "그건 무슨 말인지 모르겠어" });
    return;
  }

  send(res, 200, await buildState(deps));
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      // 설정 몇 줄이 전부다. 그 이상 오면 뭔가 잘못된 것이다.
      if (raw.length > 64_000) reject(new Error("보낸 게 너무 커"));
    });
    req.on("end", () => {
      try {
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        resolve(typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {});
      } catch {
        reject(new Error("읽을 수 없는 형식이야"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  return (h % 24) * 60 + m;
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
