/**
 * 설정 화면. 문자열로 들고 있는 이유는 나중에 단일 실행파일로 포장할 때
 * 별도 파일이 따라다니지 않게 하기 위해서다.
 */
export const UI_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>척추의 요정</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #fff; --line: #e3e6ea; --text: #1b1f24;
    --muted: #667085; --accent: #6b5cff; --ok: #17845a; --warn: #9a6700; --danger: #b42318;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a; --card: #1c1f24; --line: #2b3038; --text: #e8eaed;
      --muted: #98a2b3; --accent: #9c8fff; --ok: #4ade80; --warn: #fbbf24; --danger: #f87171;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--text);
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 24px; }
  section {
    background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    padding: 20px; margin-bottom: 16px;
  }
  h2 { font-size: 15px; margin: 0 0 16px; display: flex; align-items: center; gap: 8px; }
  label { display: block; margin-bottom: 14px; }
  label > span { display: block; font-size: 13px; color: var(--muted); margin-bottom: 5px; }
  input[type=text], input[type=number], select {
    width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px;
    background: var(--bg); color: var(--text); font: inherit; font-size: 14px;
  }
  input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  .row > label { flex: 1 1 150px; }
  .days { display: flex; gap: 6px; flex-wrap: wrap; }
  .days button {
    width: 40px; height: 38px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--bg); color: var(--muted); font: inherit; cursor: pointer;
  }
  .days button[aria-pressed=true] { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  button.act, a.act {
    padding: 9px 16px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--bg); color: var(--text); font: inherit; cursor: pointer;
    display: inline-block; text-decoration: none;
  }
  button.act:hover, a.act:hover { border-color: var(--accent); }
  .act.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button:disabled { opacity: .5; cursor: default; }
  .status { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; font-size: 14px; }
  .status dt { color: var(--muted); white-space: nowrap; }
  .status dd { margin: 0; }
  .note {
    font-size: 13px; color: var(--warn); background: color-mix(in srgb, var(--warn) 12%, transparent);
    border-radius: 8px; padding: 10px 12px; margin-top: 12px;
  }
  .hint { font-size: 12.5px; color: var(--muted); margin: -8px 0 14px; }
  #toast {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%) translateY(80px);
    background: var(--card); border: 1px solid var(--line); border-radius: 999px;
    padding: 10px 20px; font-size: 14px; box-shadow: 0 6px 24px rgba(0,0,0,.18);
    transition: transform .25s ease, opacity .25s ease; opacity: 0; pointer-events: none;
  }
  #toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
</style>
</head>
<body>
<div class="wrap">
  <h1>🧚 척추의 요정</h1>
  <p class="sub">여기서 나를 설정할 수 있어. 저장하면 바로 반영할게.</p>

  <section id="bind" hidden>
    <h2>🚀 시작하기</h2>
    <p class="sub" style="margin:0 0 14px" id="bindText"></p>
    <div class="btns"><a class="act primary" id="bindLink" target="_blank" rel="noreferrer">텔레그램에서 열기</a></div>
  </section>

  <section>
    <h2>🧚 지금</h2>
    <dl class="status" id="status"><dt>불러오는 중…</dt><dd></dd></dl>
    <div class="btns" style="margin-top:16px">
      <button class="act" data-action="test">지금 한 번 보내보기</button>
      <button class="act" data-action="done">폈어요</button>
      <button class="act primary" data-action="toggle" id="toggle">…</button>
      <button class="act" data-action="quit" id="quit" style="margin-left:auto">🚪 나 끄기</button>
    </div>
  </section>

  <section>
    <h2>⏱️ 언제 갈지</h2>
    <div class="row">
      <label><span>얼마마다 (분)</span><input type="number" id="intervalMinutes" min="1" max="1440"></label>
      <label><span>시작</span><input type="text" id="start" placeholder="09:00"></label>
      <label><span>끝</span><input type="text" id="end" placeholder="18:00"></label>
    </div>
    <p class="hint">끝이 시작보다 이르면 자정을 넘는 걸로 볼게. (예: 22:00~02:00)</p>
    <label><span>요일</span></label>
    <div class="days" id="days"></div>
    <label style="margin-top:14px"><span>기준 시간대</span><input type="text" id="timezone" placeholder="Asia/Seoul"></label>
    <div class="btns"><button class="act primary" id="saveRules">저장</button></div>
  </section>

  <section>
    <h2>📮 어디로 갈지</h2>
    <label><span>텔레그램 봇 토큰</span><input type="text" id="TELEGRAM_BOT_TOKEN" autocomplete="off"></label>
    <label><span>텔레그램 chat id (비워두면 /start 한 곳으로)</span><input type="text" id="TELEGRAM_CHAT_ID" autocomplete="off"></label>
    <label><span>디스코드 봇 토큰</span><input type="text" id="DISCORD_BOT_TOKEN" autocomplete="off"></label>
    <label><span>디스코드 channel id</span><input type="text" id="DISCORD_CHANNEL_ID" autocomplete="off"></label>
    <label><span>디스코드 웹훅 URL (봇 토큰이 없을 때만)</span><input type="text" id="DISCORD_WEBHOOK_URL" autocomplete="off"></label>
    <label><span>서버 채널에서 명령 읽기 (MESSAGE CONTENT INTENT)</span>
      <select id="DISCORD_MESSAGE_CONTENT_INTENT"><option value="">끔</option><option value="true">켬</option></select>
    </label>
    <div class="btns"><button class="act primary" id="saveEnv">저장</button></div>
    <div class="note">토큰을 바꾸면 나를 다시 깨워야 반영돼. 채널 연결은 시작할 때 한 번만 맺거든.</div>
  </section>
</div>
<div id="toast"></div>

<script>
const DAY_NAMES = ["일","월","화","수","목","금","토"];
let state = null;
let days = [];

const $ = (id) => document.getElementById(id);

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2200);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-fairy": "1" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "요청이 잘 안 됐어");
  return data;
}

function clock(mins) {
  return String(Math.floor(mins / 60) % 24).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

function renderDays() {
  $("days").innerHTML = "";
  DAY_NAMES.forEach((name, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    b.setAttribute("aria-pressed", days.includes(i));
    b.onclick = () => {
      days = days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort();
      renderDays();
    };
    $("days").appendChild(b);
  });
}

/**
 * 상태만 다시 그린다. 입력 칸은 건드리지 않는다.
 * 주기적인 새로고침이 사용자가 타이핑 중인 값을 덮어쓰면 안 되기 때문이다.
 */
function renderStatus() {
  const { config, status } = state;

  $("status").innerHTML = [
    ["지금", status.label],
    ["다음에 갈 시각", status.next],
    ["연결된 곳", status.channels.length ? status.channels.join(", ") : "아직 없어"],
    ["켜져 있는 채널", status.available.length ? status.available.join(", ") : "없어 — 토큰을 넣어줘"],
    ["오늘 편 횟수", status.today + "번"],
  ].map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("");

  $("toggle").textContent = config.enabled ? "⏸ 알림 멈추기" : "▶ 알림 시작하기";

  // 아직 어디에도 안 묶였으면 시작하는 법을 맨 위에 보여준다.
  const bind = $("bind");
  if (status.channels.length > 0 || status.available.length === 0) {
    bind.hidden = true;
  } else {
    bind.hidden = false;
    if (state.inviteUrl) {
      $("bindText").textContent = "어느 대화로 갈지 정해야 해. 아래를 누르면 텔레그램이 열리고, 거기서 시작을 누르면 돼.";
      $("bindLink").href = state.inviteUrl;
      $("bindLink").hidden = false;
    } else {
      $("bindText").textContent = "어느 대화로 갈지 정해야 해. 나에게 /start 라고 말해줘 (디스코드는 !start).";
      $("bindLink").hidden = true;
    }
  }
}

/** 입력 칸을 서버 값으로 채운다. 처음 열 때와 저장 직후에만 부른다. */
function renderForm() {
  const { config, env } = state;

  $("intervalMinutes").value = config.intervalMinutes;
  $("start").value = clock(config.startMinutes);
  $("end").value = clock(config.endMinutes);
  $("timezone").value = config.timezone;
  days = config.days.slice();
  renderDays();

  for (const [key, value] of Object.entries(env)) {
    const el = $(key);
    if (!el) continue;
    el.value = value.display;
    el.dataset.masked = value.masked ? "1" : "";
    if (value.masked) el.onfocus = () => { if (el.dataset.masked) { el.value = ""; el.dataset.masked = ""; } };
  }
}

function render() {
  renderStatus();
  renderForm();
}

/** full=false 면 상태만 갱신한다. 주기적인 새로고침이 이 경로를 쓴다. */
async function load(full) {
  state = await api("/api/state");
  if (full) render(); else renderStatus();
}

$("saveRules").onclick = async () => {
  try {
    state = await api("/api/config", {
      intervalMinutes: Number($("intervalMinutes").value),
      start: $("start").value,
      end: $("end").value,
      days,
      timezone: $("timezone").value.trim(),
    });
    render();
    toast("저장했어 ✨");
  } catch (e) { toast("🤔 " + e.message); }
};

$("saveEnv").onclick = async () => {
  const changes = {};
  for (const key of Object.keys(state.env)) {
    const el = $(key);
    if (!el || el.dataset.masked) continue;   // 손대지 않은 토큰은 그대로 둔다
    changes[key] = el.value.trim();
  }
  try {
    state = await api("/api/env", changes);
    render();
    toast("저장했어. 다시 깨우면 반영돼 ✨");
  } catch (e) { toast("🤔 " + e.message); }
};

document.querySelectorAll("[data-action]").forEach((b) => {
  b.onclick = async () => {
    const action = b.dataset.action;
    if (action === "quit" && !confirm("나를 끌까? 다시 켜려면 실행파일을 다시 실행해야 해.")) return;

    b.disabled = true;
    try {
      const res = await api("/api/action", { action });
      if (action === "quit") {
        document.body.innerHTML =
          "<div class='wrap'><h1>🧚 그럼 이만</h1><p class='sub'>껐어. 다시 켜려면 실행파일을 실행해줘. ✨</p></div>";
        return;
      }
      state = res;
      renderStatus();
      toast({ test: "보냈어 ✨", done: "고마워 🌱", toggle: "바꿨어 ✨" }[action]);
    } catch (e) { toast("🤔 " + e.message); }
    b.disabled = false;
  };
});

load(true).catch((e) => toast("🤔 " + e.message));
// 상태만 갱신한다. 입력 중인 값을 덮어쓰지 않기 위해서다.
setInterval(() => load(false).catch(() => {}), 15000);
</script>
</body>
</html>`;
