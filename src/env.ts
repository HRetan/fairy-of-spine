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

/** 설정과 통계가 사는 곳. 저장소 안 data/ 다. (.gitignore 로 제외돼 있다) */
export function dataDir(): string {
  return process.env["FAIRY_DATA_DIR"] ?? join(REPO_ROOT, "data");
}

/** 로그가 쌓이는 곳. 저장소 안 logs/ 다. (.gitignore 로 제외돼 있다) */
export function logDir(): string {
  return process.env["FAIRY_LOG_DIR"] ?? join(REPO_ROOT, "logs");
}

/**
 * 예전에 설정이 살던 곳. 지금은 저장소 안 data/ 로 옮겼다.
 * loadConfig 가 새 위치에 파일이 없을 때만 여기를 들여다보고 한 번 옮겨온다.
 * 옮김이 끝난 뒤에는 이 함수와 config.ts 의 migrate 를 지워도 된다.
 */
export function legacyHome(): string {
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
