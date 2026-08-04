import { closeSync, mkdirSync, openSync, readSync, statSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";

import { logDir } from "./env.ts";

/** 이 크기를 넘으면 앞부분을 잘라낸다. */
const MAX_BYTES = 1024 * 1024;
/** 자르고 남길 꼬리 크기. 최근 기록은 살려둔다. */
const KEEP_BYTES = 256 * 1024;

/** launchd(macOS) / fairy.cmd(윈도우) 가 리다이렉션으로 채우는 파일들. */
const LOG_FILES = ["fairy.log", "fairy.error.log"];

/**
 * 로그가 너무 커지면 뒷부분만 남기고 잘라낸다.
 *
 * 앱은 stdout/stderr 로만 찍고 파일은 launchd 나 cmd 가 append 로 연다.
 * O_APPEND 는 매 쓰기마다 파일 끝을 다시 찾으므로, 우리가 중간에 파일을 줄여도
 * 이후 기록은 새 끝에 이어진다. 그래서 프로세스를 재시작하지 않고도 안전하다.
 *
 * 회전(rotate)이 아니라 절단(truncate)인 이유는, 파일을 옮기면 이미 열려 있는
 * 핸들이 옮겨간 쪽을 계속 붙잡아 새 파일이 비어 있게 되기 때문이다.
 */
export function trimLogs(): void {
  for (const name of LOG_FILES) {
    try {
      trimOne(join(logDir(), name));
    } catch (error) {
      // 로그 정리에 실패했다고 봇이 죽을 이유는 없다.
      console.error(`[logs] ${name} 정리 실패:`, error instanceof Error ? error.message : error);
    }
  }
}

/**
 * 화면에 찍는 것을 파일에도 남긴다.
 *
 * launchd 나 fairy.cmd 로 띄우면 그쪽이 리다이렉션으로 이미 같은 파일에 쓰고 있다.
 * 그때만 손을 떼야 두 번 쓰지 않는다. 그쪽에서 FAIRY_LOG_REDIRECTED=1 을 넣어준다.
 *
 * TTY 여부로 판단하면 안 된다. .app 번들이나 숨김 실행(vbs)은 콘솔이 없어 TTY 가 아닌데,
 * 아무도 파일로 옮겨주지 않아 기록이 통째로 사라진다.
 */
export function startFileLogging(): void {
  if (process.env["FAIRY_LOG_REDIRECTED"] === "1") return;

  try {
    mkdirSync(logDir(), { recursive: true });
    tee(process.stdout, openSync(join(logDir(), "fairy.log"), "a"));
    tee(process.stderr, openSync(join(logDir(), "fairy.error.log"), "a"));
  } catch (error) {
    console.error("[logs] 파일에 기록하지 못한다:", error instanceof Error ? error.message : error);
  }
}

function tee(stream: NodeJS.WriteStream, fd: number): void {
  const original = stream.write.bind(stream);

  stream.write = ((chunk: unknown, ...rest: unknown[]): boolean => {
    try {
      const text = typeof chunk === "string" ? chunk : String(chunk);
      // 시각이 없으면 나중에 로그를 봐도 언제 있었던 일인지 알 수 없다.
      writeSync(fd, text.trim() ? `${stamp()} ${text}` : text);
    } catch {
      // 파일에 못 써도 화면 출력은 이어져야 한다.
    }
    return (original as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof stream.write;
}

function stamp(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `[${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
}

function trimOne(path: string): void {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return; // 아직 파일이 없다
  }
  if (size <= MAX_BYTES) return;

  const buffer = Buffer.alloc(KEEP_BYTES);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, KEEP_BYTES, size - KEEP_BYTES);
  } finally {
    closeSync(fd);
  }

  // 잘린 지점이 글자 중간일 수 있으니 첫 줄은 통째로 버린다.
  let tail = buffer.toString("utf8");
  const firstNewline = tail.indexOf("\n");
  if (firstNewline >= 0) tail = tail.slice(firstNewline + 1);

  const dropped = Math.round((size - KEEP_BYTES) / 1024);
  writeFileSync(path, `--- 로그가 커져서 앞부분 ${dropped}KB 를 잘랐다 ---\n${tail}`, "utf8");
}
