import { spawn } from "node:child_process";

import { isPackaged } from "./env.ts";

/**
 * 설정 화면을 기본 브라우저로 연다.
 *
 * 실행파일(.app / .exe)로 띄웠으면 늘 연다. 설정 화면이 사실상 그 앱의 창이기 때문이다.
 * .app 은 Dock 아이콘도 콘솔도 없어서, 안 열어주면 더블클릭해도 아무 일이 없어 보인다.
 *
 * 소스로 돌릴 때는 주소가 터미널에 찍히므로 처음 쓸 때(토큰이 아직 없을 때)만 연다.
 * FAIRY_OPEN=on 이면 늘 열고, off 면 절대 열지 않는다.
 * (로그인할 때 자동 실행하도록 걸어둘 때는 off 를 넣어주면 된다)
 */
export function maybeOpenBrowser(url: string, firstRun: boolean): void {
  const setting = (process.env["FAIRY_OPEN"] ?? "").toLowerCase();
  if (setting === "off") return;
  if (setting !== "on" && !firstRun && !isPackaged()) return;

  const [command, args] =
    process.platform === "darwin"
      ? (["open", [url]] as const)
      : process.platform === "win32"
        ? // start 는 cmd 내장 명령이다. 첫 인자는 창 제목으로 먹히므로 빈 문자열을 넣어준다.
          (["cmd", ["/c", "start", "", url]] as const)
        : (["xdg-open", [url]] as const);

  try {
    // 브라우저가 우리 수명에 매이지 않도록 떼어놓는다.
    const child = spawn(command, [...args], { stdio: "ignore", detached: true });
    child.on("error", () => {
      console.log(`설정 화면을 열지 못했어. 직접 열어줘: ${url}`);
    });
    child.unref();
  } catch {
    console.log(`설정 화면을 열지 못했어. 직접 열어줘: ${url}`);
  }
}
