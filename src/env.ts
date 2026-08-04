import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 단일 실행파일로 포장됐는지.
 * 포장되면 process.execPath 가 node 가 아니라 우리 실행파일을 가리킨다.
 */
export function isPackaged(): boolean {
  const exe = basename(process.execPath).toLowerCase();
  return exe !== "node" && exe !== "node.exe";
}

let cachedBase: string | null = null;

/**
 * 짐(.env, data/, logs/)을 두는 기준 위치.
 *
 * - 소스로 돌릴 때: 저장소 루트
 * - 실행파일로 돌릴 때: **실행파일이 있는 폴더**
 *
 * 포장하면 소스 경로가 의미를 잃으므로 실행파일 옆을 기준으로 삼는다.
 * 그래야 exe 하나만 옮겨도 설정과 로그가 그 옆에 따라다닌다.
 */
export function baseDir(): string {
  if (cachedBase !== null) return cachedBase;
  if (isPackaged()) {
    const exeDir = dirname(process.execPath);
    // macOS .app 번들이면 실행파일이 Contents/MacOS/ 안에 있다.
    // 거기에 설정을 두면 번들 안에 숨고, 앱을 갈아끼울 때 같이 날아간다. 번들 바깥에 둔다.
    cachedBase = exeDir.endsWith("/Contents/MacOS")
      ? dirname(dirname(dirname(exeDir)))
      : exeDir;
    return cachedBase;
  }
  try {
    cachedBase = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  } catch {
    // 번들로 묶이면 import.meta 가 비어 있다. 포장된 경우엔 위에서 이미 돌아갔으니
    // 여기까지 오는 일은 없어야 하지만, 오더라도 죽지는 않게 한다.
    cachedBase = process.cwd();
  }
  return cachedBase;
}

/**
 * 아주 단순한 .env 로더. dotenv 의존성을 피하려고 직접 읽는다.
 * KEY=VALUE 한 줄 형식만 지원하고, 이미 process.env 에 있는 값은 덮어쓰지 않는다.
 */
export function loadDotEnv(path = join(baseDir(), ".env")): void {
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

/** 설정과 통계가 사는 곳. (.gitignore 로 제외돼 있다) */
export function dataDir(): string {
  return process.env["FAIRY_DATA_DIR"] ?? join(baseDir(), "data");
}

/** 로그가 쌓이는 곳. (.gitignore 로 제외돼 있다) */
export function logDir(): string {
  return process.env["FAIRY_LOG_DIR"] ?? join(baseDir(), "logs");
}

/**
 * 예전에 설정이 살던 곳. 지금은 baseDir()/data 로 옮겼다.
 * loadConfig 가 새 위치에 파일이 없을 때만 여기를 들여다보고 한 번 옮겨온다.
 * 옮김이 끝난 뒤에는 이 함수와 config.ts 의 migrate 를 지워도 된다.
 */
export function legacyHome(): string {
  return process.env["FAIRY_HOME"] ?? join(homedir(), ".fairy-of-spine");
}
