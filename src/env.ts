import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 저장소 루트 (src/ 의 부모). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 아주 단순한 .env 로더. dotenv 의존성을 피하려고 직접 읽는다.
 * KEY=VALUE 한 줄 형식만 지원하고, 이미 process.env 에 있는 값은 덮어쓰지 않는다.
 */
export function loadDotEnv(path = join(REPO_ROOT, ".env")): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return; // .env 가 없으면 환경변수만 사용
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key in process.env) continue;
    process.env[key] = value;
  }
}

/** 설정 파일과 로그가 사는 곳. 저장소 밖이라 git 에 상태가 섞이지 않는다. */
export function fairyHome(): string {
  return process.env["FAIRY_HOME"] ?? join(homedir(), ".fairy-of-spine");
}

export function requireBotToken(): string {
  const token = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN 이 없습니다. .env.example 을 .env 로 복사한 뒤 BotFather 토큰을 넣어주세요.",
    );
  }
  return token;
}
