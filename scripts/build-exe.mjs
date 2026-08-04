// 단일 실행파일을 만든다. Node 의 SEA(Single Executable Application)를 쓴다.
//
//   node scripts/build-exe.mjs            현재 OS 용
//   node scripts/build-exe.mjs mac        맥용 (arm64)
//   node scripts/build-exe.mjs win        윈도우용 (x64)
//   node scripts/build-exe.mjs mac win    둘 다
//
// 흐름: esbuild 로 한 파일로 묶고 -> SEA blob 을 만들고 -> node 실행파일에 주입한다.
// 윈도우용은 맥에서도 만들 수 있다. 공식 node.exe 를 받아 거기에 주입하면 된다.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(REPO, "build");
const DIST = join(REPO, "dist");

// 로컬에 깔린 node 를 쓰지 않는다. Homebrew 등으로 빌드된 node 에는 SEA 퓨즈가 없어
// 주입이 실패한다. 공식 배포판을 받아 쓰면 어떻게 설치했든 결과가 같다.
const TARGETS = {
  mac: {
    label: "맥 (arm64)",
    out: "fairy-of-spine",
    archive: "darwin-arm64",
    inner: (v) => `node-${v}-darwin-arm64/bin/node`,
  },
  win: {
    label: "윈도우 (x64)",
    out: "fairy-of-spine.exe",
    archive: "win-x64",
    inner: (v) => `node-${v}-win-x64/node.exe`,
  },
};

const requested = process.argv.slice(2).filter((a) => a in TARGETS);
const targets = requested.length > 0 ? requested : [process.platform === "win32" ? "win" : "mac"];

run();

async function run() {
  // dist/ 를 통째로 비우고 시작한다.
  // 여기서 실행파일을 한 번이라도 돌리면 옆에 .env 와 data/ 가 생기는데,
  // 그대로 두면 폴더를 건넬 때 토큰과 연결 정보가 같이 나간다.
  if (existsSync(DIST)) console.log("dist/ 를 비우고 새로 만든다.");
  rmSync(DIST, { recursive: true, force: true });

  mkdirSync(BUILD, { recursive: true });
  mkdirSync(DIST, { recursive: true });

  await bundle();
  makeBlob();

  for (const name of targets) {
    await build(name);
  }

  console.log("\n끝났어. dist/ 를 봐. ✨");
  console.log("실행파일 옆에 .env / data/ / logs/ 가 만들어져. 폴더째 옮기면 설정도 따라가.");
}

/**
 * 여러 모듈을 한 파일로 묶는다. SEA 는 단일 CommonJS 파일만 받는다.
 * CLI 대신 JS API 를 쓴다. bin/esbuild 는 네이티브 바이너리라 node 로 실행할 수 없다.
 */
async function bundle() {
  console.log("1/3  묶는 중…");
  const esbuild = await import("esbuild");
  await esbuild.build({
    entryPoints: [join(REPO, "src", "index.ts")],
    outfile: join(BUILD, "bundle.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    // node: 로 시작하는 내장 모듈은 그대로 둔다.
    packages: "bundle",
  });
}

function makeBlob() {
  console.log("2/3  SEA 뭉치 만드는 중…");
  const configPath = join(BUILD, "sea-config.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        main: join(BUILD, "bundle.cjs"),
        output: join(BUILD, "sea.blob"),
        disableExperimentalSEAWarning: true,
      },
      null,
      2,
    ),
  );
  const result = spawnSync(process.execPath, ["--experimental-sea-config", configPath], {
    stdio: "inherit",
  });
  if (result.status !== 0) fail("SEA 뭉치를 만들지 못했어");
}

async function build(name) {
  const target = TARGETS[name];
  console.log(`3/3  ${target.label} 실행파일 만드는 중…`);

  const base = await fetchNodeBinary(target);
  const outPath = join(DIST, target.out);
  rmSync(outPath, { force: true });
  copyFileSync(base, outPath);
  chmodSync(outPath, 0o755);

  // macOS 는 서명된 바이너리를 수정하면 실행을 거부한다. 떼었다가 다시 붙인다.
  const isMac = name === "mac";
  if (isMac) sh("codesign", ["--remove-signature", outPath], { allowFail: true });

  const postject = spawnSync(
    process.execPath,
    [
      join(REPO, "node_modules", "postject", "dist", "cli.js"),
      outPath,
      "NODE_SEA_BLOB",
      join(BUILD, "sea.blob"),
      "--sentinel-fuse",
      "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
      ...(isMac ? ["--macho-segment-name", "NODE_SEA"] : []),
    ],
    { stdio: "inherit" },
  );
  if (postject.status !== 0) fail("실행파일에 주입하지 못했어");

  if (isMac) sh("codesign", ["--sign", "-", outPath], { allowFail: true });

  const mb = (statSync(outPath).size / 1024 / 1024).toFixed(0);
  console.log(`     ${outPath}  (${mb}MB)`);

  if (isMac) makeAppBundle(outPath);
  else makeHiddenLauncher(target.out);
}

/**
 * 맥용 .app 번들을 만든다.
 *
 * 실행파일을 그냥 더블클릭하면 터미널 창이 열린다. .app 으로 감싸면 창 없이 조용히 돈다.
 * 설정과 로그는 번들 안이 아니라 번들 **옆**에 쌓인다(env.ts 의 baseDir 참고).
 * 번들 안에 두면 앱을 갈아끼울 때 같이 날아가기 때문이다.
 */
function makeAppBundle(exePath) {
  const app = join(DIST, "척추의 요정.app");
  const macos = join(app, "Contents", "MacOS");
  rmSync(app, { recursive: true, force: true });
  mkdirSync(macos, { recursive: true });

  copyFileSync(exePath, join(macos, "fairy-of-spine"));
  chmodSync(join(macos, "fairy-of-spine"), 0o755);

  writeFileSync(
    join(app, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>척추의 요정</string>
  <key>CFBundleDisplayName</key><string>척추의 요정</string>
  <key>CFBundleIdentifier</key><string>net.nextlevelstudio.fairy-of-spine</string>
  <key>CFBundleExecutable</key><string>fairy-of-spine</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <!-- Dock 에 뜨지 않는 배경 앱으로 둔다. 끄는 건 설정 화면의 "나 끄기" 버튼으로 한다. -->
  <key>LSUIElement</key><true/>
</dict>
</plist>
`,
  );

  // 번들 내용을 바꿨으니 서명을 다시 붙인다.
  sh("codesign", ["--force", "--deep", "--sign", "-", app], { allowFail: true });
  console.log(`     ${app}  (터미널 없이 실행)`);
}

/** 윈도우에서 콘솔 창 없이 exe 를 띄우는 vbs. exe 와 같은 폴더에 두면 된다. */
function makeHiddenLauncher(exeName) {
  const vbsPath = join(DIST, "조용히 실행.vbs");
  writeFileSync(
    vbsPath,
    // Run 의 세 번째 인자 0 이 "창 숨김"이다.
    // 스크립트가 놓인 폴더를 기준으로 exe 를 찾으므로 폴더째 옮겨도 그대로 동작한다.
    `Set fso = CreateObject("Scripting.FileSystemObject")\r\n` +
      `here = fso.GetParentFolderName(WScript.ScriptFullName)\r\n` +
      `CreateObject("WScript.Shell").Run """" & here & "\\${exeName}""", 0, False\r\n`,
    "utf16le",
  );
  console.log(`     ${vbsPath}  (콘솔 창 없이 실행)`);
}

/**
 * 공식 node 실행파일을 받아온다. 한 번 받으면 build/ 에 남겨 다시 쓴다.
 *
 * 로컬 node 를 쓰지 않는 이유: Homebrew 로 설치한 node 에는 SEA 퓨즈
 * (NODE_SEA_FUSE_...) 가 들어 있지 않아 postject 가 주입할 자리를 못 찾는다.
 */
async function fetchNodeBinary(target) {
  const version = `v${process.versions.node}`;
  // 압축을 풀면 같은 이름의 폴더가 생기므로 이름을 달리한다.
  const cached = join(BUILD, `nodebin-${version}-${target.archive}`);
  if (existsSync(cached)) return cached;

  const isZip = target.archive.startsWith("win");
  const file = `node-${version}-${target.archive}.${isZip ? "zip" : "tar.gz"}`;
  const url = `https://nodejs.org/dist/${version}/${file}`;
  console.log(`     ${target.archive} 용 공식 node 를 받는 중…`);

  const res = await fetch(url);
  if (!res.ok) fail(`node 를 받지 못했어: ${res.status} ${url}`);

  const archivePath = join(BUILD, file);
  writeFileSync(archivePath, Buffer.from(await res.arrayBuffer()));

  // 압축 해제는 OS 기본 도구로 한다. 의존성을 늘리지 않기 위해서다.
  const inner = target.inner(version);
  if (isZip) {
    sh("unzip", ["-o", "-j", archivePath, inner, "-d", BUILD]);
    copyFileSync(join(BUILD, "node.exe"), cached);
  } else {
    sh("tar", ["-xzf", archivePath, "-C", BUILD, inner]);
    copyFileSync(join(BUILD, inner), cached);
  }

  chmodSync(cached, 0o755);
  return cached;
}

function sh(command, args, { allowFail = false } = {}) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0 && !allowFail) fail(`${command} 가 실패했어`);
  return result.status === 0;
}

function fail(message) {
  console.error(`\n🤔 ${message}`);
  process.exit(1);
}
