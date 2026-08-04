import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { baseDir } from "./env.ts";

/** UI 에서 다룰 수 있는 키. 여기 없는 키는 건드리지 않는다. */
export const EDITABLE_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CHANNEL_ID",
  "DISCORD_WEBHOOK_URL",
  "DISCORD_MESSAGE_CONTENT_INTENT",
] as const;

export type EditableKey = (typeof EDITABLE_KEYS)[number];

/** 토큰이 들어가는 키. 화면에는 가려서 보낸다. */
export const SECRET_KEYS: readonly string[] = [
  "TELEGRAM_BOT_TOKEN",
  "DISCORD_BOT_TOKEN",
  "DISCORD_WEBHOOK_URL",
];

/** 실행파일로 포장되면 실행파일 옆의 .env 를 본다. */
export function envPath(): string {
  return join(baseDir(), ".env");
}

/** .env 를 읽어 KEY -> VALUE 로. 파일이 없으면 빈 객체. */
export function readEnvFile(path = envPath()): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }

  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const parsed = parseLine(line);
    if (parsed) result[parsed.key] = parsed.value;
  }
  return result;
}

/**
 * .env 의 값을 고쳐 쓴다. 주석과 빈 줄, 손대지 않은 키는 그대로 둔다.
 *
 * 값이 빈 문자열이면 "KEY=" 로 남긴다. 줄을 지우지 않는 이유는,
 * .env.example 에서 복사해온 안내 주석과 짝이 맞아야 다음에 열었을 때 읽기 쉬워서다.
 */
export function updateEnvFile(changes: Record<string, string>, path = envPath()): void {
  const keys = Object.keys(changes);
  if (keys.length === 0) return;

  let lines: string[];
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    lines = [];
  }

  const remaining = new Set(keys);

  // 1) 살아 있는 줄부터 고친다.
  const updated = lines.map((line) => {
    const parsed = parseLine(line);
    if (!parsed || !remaining.has(parsed.key)) return line;
    remaining.delete(parsed.key);
    return `${parsed.key}=${changes[parsed.key]}`;
  });

  // 2) 남은 키가 "# KEY=..." 로 주석 처리돼 있으면 그 자리에서 주석을 벗긴다.
  //    .env.example 이 선택 항목들을 주석으로 달고 오기 때문에 이 경우가 잦다.
  //    이걸 안 하면 안내 주석은 그대로 남고 값만 파일 맨 아래에 따로 붙어 읽기 나빠진다.
  if (remaining.size > 0) {
    for (let i = 0; i < updated.length; i += 1) {
      const commented = parseLine((updated[i] ?? "").replace(/^\s*#\s*/, ""));
      if (!commented || !remaining.has(commented.key)) continue;
      remaining.delete(commented.key);
      updated[i] = `${commented.key}=${changes[commented.key]}`;
    }
  }

  // 3) 그래도 없는 키는 끝에 덧붙인다.
  if (remaining.size > 0) {
    if (updated.length > 0 && updated[updated.length - 1]?.trim() !== "") updated.push("");
    for (const key of remaining) updated.push(`${key}=${changes[key]}`);
    updated.push("");
  }

  writeFileSync(path, updated.join("\n"), "utf8");
}

/** 토큰을 화면에 그대로 흘리지 않도록 가운데를 가린다. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}${"•".repeat(8)}${value.slice(-4)}`;
}

function parseLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;

  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}
