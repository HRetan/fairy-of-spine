// npm run service:* 를 OS 에 맞는 스크립트로 넘겨준다.
// macOS 는 launchd(bash), 윈도우는 작업 스케줄러(PowerShell).
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(SCRIPTS_DIR, "..");
const IS_WINDOWS = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

const action = process.argv[2];
if (!["install", "uninstall", "logs"].includes(action ?? "")) {
  console.error("사용법: node scripts/service.mjs <install|uninstall|logs>");
  process.exit(1);
}

// 로그는 저장소 안 logs/ 에 쌓인다. src/env.ts 의 logDir() 와 같은 규칙이다.
const logFile = join(process.env.FAIRY_LOG_DIR ?? join(REPO_DIR, "logs"), "fairy.log");

const command = resolveCommand();
if (!command) {
  console.error(
    `${process.platform} 에서는 상주 등록 스크립트를 제공하지 않습니다.\n` +
      "직접 실행은 'npm start' 로 가능합니다.\n" +
      "리눅스라면 systemd --user 서비스로 'node src/index.ts' 를 띄우면 됩니다.",
  );
  process.exit(1);
}

const child = spawn(command.file, command.args, { cwd: REPO_DIR, stdio: "inherit", shell: false });
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(`실행 실패: ${command.file}`, error.message);
  process.exit(1);
});

function resolveCommand() {
  if (IS_WINDOWS) {
    if (action === "logs") {
      // tail -f 에 해당하는 것. 파일이 아직 없으면 만들어질 때까지 기다린다.
      return {
        file: "powershell.exe",
        args: [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `Get-Content -Path '${logFile}' -Tail 50 -Wait`,
        ],
      };
    }
    return {
      file: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(SCRIPTS_DIR, `${action}.ps1`)],
    };
  }

  if (IS_MAC) {
    if (action === "logs") return { file: "tail", args: ["-f", logFile] };
    return { file: "bash", args: [join(SCRIPTS_DIR, `${action}.sh`)] };
  }

  return null;
}
