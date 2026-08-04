# fairy-of-spine 🧚

안녕. 나는 척추의 요정이야.

너는 지금도 굽어 있겠지. 괜찮아, 혼내려는 건 아니야.
다만 내가 주기적으로 찾아가서 등을 펴놓고 갈게. **텔레그램**과 **디스코드** 어디로든 갈 수 있어.
**macOS**에서는 `launchd`로, **윈도우**에서는 작업 스케줄러로 조용히 상주하면서
네가 부르지 않아도 알아서 나타날 거야. ✨

- 🎭 잔소리 문구 **30종** + 아스키 아트 **15종**을 돌려가며 써. 같은 말만 하면 사흘이면 무시하잖아 (4번 중 1번쯤 그림이 딸려 가)
- ⏱️ 알림 간격 / 활동 시간대 / 요일 / 타임존을 **채팅에서 바로** 바꿀 수 있어
- 🔘 알림에 `✅ 폈어요` `😴 15분 뒤` 버튼을 붙여줄게. 손가락 한 번이면 돼
- 📊 네가 허리 편 횟수를 날짜별로 세어둘게 (`/stats`)
- 🪶 런타임 의존성은 하나도 없어. Node 24+ 가 TypeScript를 직접 읽으니 빌드도 필요 없어

## 🧺 준비물

- Node.js 24 이상 (`node -v` 로 확인해줘)
- 텔레그램 봇 토큰, 디스코드 봇 토큰 중 **최소 하나**. 둘 다 줘도 좋아

### 📮 텔레그램에서 나를 부르려면

1. 텔레그램에서 [@BotFather](https://t.me/BotFather) 에게 `/newbot` 이라고 말해줘
2. 이름과 username 을 정하면 토큰을 줄 거야 → `TELEGRAM_BOT_TOKEN` 에 넣어줘

이게 전부야. **토큰 하나면 충분해.** 나머지는 안 채워도 돼. 🙂

### 🎮 디스코드에서 나를 부르려면

1. [개발자 포털](https://discord.com/developers/applications) → New Application
2. **Bot** 탭 → Reset Token → 토큰 복사 → `DISCORD_BOT_TOKEN`
3. **OAuth2 → URL Generator** 에서 `bot` 스코프와 `Send Messages` 권한을 고르고,
   나온 링크로 나를 서버에 초대해줘
4. 서버 채널에서 명령까지 쓰고 싶다면 Bot 탭의 **MESSAGE CONTENT INTENT** 를 켜고
   `.env` 에 `DISCORD_MESSAGE_CONTENT_INTENT=true` 를 넣어줘.
   나와 **DM으로만 이야기할 거라면 안 켜도 돼** — DM은 그 설정 없이도 네 말이 들리거든

> 💌 명령은 필요 없고 알림만 받고 싶다면, 봇 대신 채널 웹훅 URL(`DISCORD_WEBHOOK_URL`)만 줘도 돼.
> 대신 그때 나는 말을 할 수만 있고 들을 수는 없어.

## 🚀 데려오기

```bash
git clone <이 저장소>
cd fairy-of-spine
npm install          # 타입체크용 devDependency 만 설치돼
cp .env.example .env # 토큰을 넣어줘
npm start            # 우선 눈앞에서 잘 도는지 봐줘
```

그리고 나에게 `/start` (디스코드에서는 `!start`) 라고 말해줘.
그 대화가 내가 찾아갈 곳이 될 거야. 📍

### ▶️ 시작하고 멈추기

설정 화면에서 다 돼.

- **어느 대화로 갈지 정하기** — 맨 위 `🚀 시작하기` 칸. 텔레그램은 버튼 한 번이면 되고,
  디스코드는 채널에서 `!start` 라고 말해줘. 이미 정해졌으면 이 칸은 안 보여
- **알림 켜고 끄기** — `⏸ 알림 멈추기` / `▶ 알림 시작하기` 버튼. 채팅의 `/stop` `/start` 와 같은 것
- **나 자체를 끄기** — `🚪 나 끄기` 버튼. 터미널이 있으면 Ctrl+C 도 되고.
  `.app` 이나 `.vbs` 로 띄우면 창이 없으니 이 버튼이 유일한 길이야. 설정은 남아 있어

### 🖥️ 설정 화면

`.env` 를 손으로 열기 싫으면 브라우저에서 해도 돼. 내가 뜰 때 주소를 알려줄게.

```
설정 화면: http://127.0.0.1:7979
```

토큰 입력, 알림 간격·시간대·요일, 지금 상태 보기, 한 번 보내보기까지 여기서 다 돼.
`127.0.0.1` 에만 묶여 있어서 바깥에서는 닿지 않아. 토큰은 가려서 보여주고,
네가 손대지 않으면 그대로 둘게. 🔑

토큰을 바꿨을 때만 나를 다시 깨워줘. 채널 연결은 시작할 때 한 번만 맺거든.

## 📦 실행파일로 만들기

터미널도 Node 도 없이 쓰고 싶으면 실행파일 하나로 뽑을 수 있어.

```bash
npm run build:exe        # 지금 OS 용
npm run build:exe:all    # 맥용 + 윈도우용 둘 다
```

`dist/` 에 이렇게 나와:

| | 무엇 |
|---|---|
| `척추의 요정.app` | **맥 — 터미널 없이** 더블클릭 |
| `fairy-of-spine` | 맥 — 터미널에서 볼 때 |
| `조용히 실행.vbs` | **윈도우 — 콘솔 창 없이** 더블클릭 (exe 와 같은 폴더에 둬) |
| `fairy-of-spine.exe` | 윈도우 — 콘솔 창을 보며 쓸 때 |

Node 런타임이 통째로 들어가서 커 (맥 138MB, 윈도우 99MB). 대신 받는 사람은 아무것도 안 깔아도 돼.

**터미널을 안 띄우고 싶으면** `.app`(맥) 이나 `조용히 실행.vbs`(윈도우) 를 써.
창이 없으니 끌 때는 설정 화면의 `🚪 나 끄기` 버튼을 눌러줘.

**쓰는 법**

1. 폴더째 원하는 곳에 두고 실행해
2. 처음이면 브라우저가 알아서 열려. 거기서 **토큰**을 넣어줘
3. 실행파일을 다시 켜
4. 설정 화면 맨 위 **🚀 시작하기** 에서 `텔레그램에서 열기` 를 누르고, 텔레그램에서 시작을 눌러줘
5. 끝. 이제 알림이 와

**짐은 전부 실행파일 옆에 쌓여.** 폴더째 옮기면 설정도 같이 따라가.

```
어디든/
  fairy-of-spine(.exe)     실행파일
  .env                     토큰
  data/config.json         간격·시간대·요일·기록·연결된 대화
  logs/fairy.log           내가 한 말
  logs/fairy.error.log     문제가 있었을 때
```

> ⚠️ 윈도우용은 맥에서 만들어서 **아직 윈도우에서 돌려보지 못했어.**
> 그리고 공식 node.exe 에 주입하는 방식이라 원래 서명이 깨져. SmartScreen 이
> "알 수 없는 게시자" 라고 막을 수 있는데, `추가 정보 → 실행` 으로 넘어가면 돼.

### 🌙 백그라운드에 재워두기

명령은 macOS 든 윈도우든 똑같아. 알아서 네 OS 에 맞는 방식으로 자리를 잡을게.

```bash
npm run service:install    # 등록하고 바로 깨워
npm run service:logs       # 내가 뭘 하고 있는지 실시간으로 봐
npm run service:uninstall  # 보내주기 (설정과 기록은 남겨둘게)
```

네가 로그인하면 나도 같이 깨어나고, 혹시 내가 쓰러져도 다시 일어날 거야.
네 말을 들으려면 계속 연결돼 있어야 해서, cron 처럼 잠깐 나타났다 사라지지 않고 상주하는 거야. 🛏️

<details>
<summary>🍎 <b>macOS 에서 벌어지는 일</b></summary>

`~/Library/LaunchAgents/net.nextlevelstudio.fairy-of-spine.plist` 에 LaunchAgent 로 등록돼.
`RunAtLoad` + `KeepAlive` 라서 로그인할 때 뜨고, 죽으면 launchd 가 즉시 되살려.
로그는 저장소 안 `logs/fairy.log` 와 `logs/fairy.error.log` 로 흘러.

```bash
launchctl list | grep fairy                                  # 살아 있나 확인
launchctl kickstart -k gui/$(id -u)/net.nextlevelstudio.fairy-of-spine   # 다시 깨우기
```
</details>

<details>
<summary>🪟 <b>윈도우에서 벌어지는 일</b></summary>

작업 스케줄러에 `fairy-of-spine` 이라는 이름으로 등록돼. **관리자 권한은 필요 없어.**

윈도우에는 launchd 의 `KeepAlive` 에 해당하는 게 없어서, 이렇게 흉내 냈어:

- **로그온 시 시작** 트리거로 네가 로그인하면 깨어나고
- **5분마다 반복** 트리거 + **중복 실행 무시(IgnoreNew)** 설정으로,
  이미 돌고 있으면 새 인스턴스가 무시되고 죽어 있으면 다음 5분 안에 되살아나

콘솔 창이 뜨지 않도록 저장소 안 `data\` 에 `fairy.cmd`(실행 + 로그 리다이렉션)와
`fairy.vbs`(숨김 실행)를 만들어 두고, 스케줄러는 `wscript.exe fairy.vbs` 를 부르게 해뒀어.

```powershell
Get-ScheduledTask -TaskName fairy-of-spine          # 살아 있나 확인
Start-ScheduledTask -TaskName fairy-of-spine        # 다시 깨우기
Get-Content .\logs\fairy.log -Tail 50 -Wait                    # 로그 (저장소 안)
```

`.ps1` 을 직접 실행하면 실행 정책에 막힐 수 있어. `npm run service:install` 은 `-ExecutionPolicy Bypass`
로 부르니까 그냥 npm 스크립트를 쓰는 게 편해. 직접 부르고 싶다면:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```
</details>

> 🐧 리눅스에는 등록 스크립트를 따로 두지 않았어. `npm start` 로 바로 돌리거나,
> `systemd --user` 서비스로 `node src/index.ts` 를 띄워주면 돼.

## 💬 나에게 할 수 있는 말

텔레그램은 `/`, 디스코드는 `!` 와 `/` 둘 다 알아들어.

| 명령 | 내가 하는 일 |
| --- | --- |
| `/start` | 이 대화로 찾아갈게 |
| `/stop` | 조용히 있을게 |
| `/status` | 지금 설정과 다음에 갈 시각을 알려줄게 |
| `/done` | 폈다고 알려줘. 칭찬하고 타이머를 다시 잴게 |
| `/snooze [분]` | 잠깐 미뤄줄게 (기본 15분) |
| `/pause [분]` | 쉬어갈게. 분을 안 쓰면 부를 때까지 |
| `/resume` | 다시 찾아갈게 |
| `/interval <분>` | 얼마마다 갈지 정해줘 (예: `/interval 25`) |
| `/hours <HH:MM-HH:MM>` | 언제부터 언제까지 갈지 (예: `/hours 09:00-18:00`) |
| `/days <...>` | `매일` `평일` `주말` `월수금` `mon,wed,fri` 다 알아들어 |
| `/tz <타임존>` | 어느 시간대를 기준으로 할지 (예: `/tz Asia/Seoul`) |
| `/stats` | 최근 7일 동안 네가 몇 번 폈는지 |
| `/test` | 지금 당장 한 번 가볼게 |
| `/help` | 이 표를 그대로 읊어줄게 |

`22:00-02:00` 처럼 자정을 넘겨도 괜찮아. 그럴 땐 **시작하는 날**을 기준으로 요일을 세.
그러니까 금요일 밤 `22:00` 에 시작한 시간대는 토요일 새벽 `02:00` 까지 이어져. 🌜

## 🔑 환경변수

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | △ | 이게 있으면 텔레그램으로 갈 수 있어 |
| `TELEGRAM_CHAT_ID` | | 갈 곳을 미리 정해두고 싶을 때. 비워두면 `/start` 한 곳으로 갈게 |
| `DISCORD_BOT_TOKEN` | △ | 이게 있으면 디스코드로 갈 수 있어 (네 말도 들려) |
| `DISCORD_CHANNEL_ID` | | 갈 채널을 미리 정해두고 싶을 때 |
| `DISCORD_MESSAGE_CONTENT_INTENT` | | 서버 채널에서 네 말을 들으려면 `true` (기본 `false`) |
| `DISCORD_WEBHOOK_URL` | | 봇 토큰이 없을 때만 써. 말만 하고 듣진 못해 |
| `FAIRY_DATA_DIR` | | 설정을 둘 곳. 기본은 이 저장소 안 `data/` |
| `FAIRY_LOG_DIR` | | 로그를 둘 곳. 기본은 이 저장소 안 `logs/` |
| `FAIRY_WEB_PORT` | | 설정 화면 포트. 기본 `7979` |
| `FAIRY_WEB` | | `off` 로 두면 설정 화면을 열지 않아 |
| `FAIRY_OPEN` | | `on` 이면 켤 때마다 브라우저를 열고, `off` 면 안 열어 (기본: 처음 쓸 때만) |

△ = 이 둘 중 최소 하나는 있어야 해. 둘 다 주면 **양쪽 모두로** 찾아갈게. 🧚🧚

갈 곳을 환경변수로 정해두면 저장해둔 값보다 그게 우선이야.
토큰을 바꾸고 싶으면 `.env` 만 고치고 `npm run service:install` 을 다시 돌려줘 (재등록하고 다시 깨어날게).

## ✍️ 내 대사 늘려주기

내가 할 말은 전부 `src/messages.ts` 한 곳에 모여 있어.

- **문구**: `REMINDERS` 배열에 문자열만 더해주면 돼. 개수 제한은 없어.
  다만 본문에는 마크업을 쓰지 말아줘 — 텔레그램과 디스코드에서 똑같이 보여야 하거든
- **아스키 아트**: `ARTS` 배열에 `` block(String.raw`...`) `` 형태로 더해줘
  - 역슬래시가 들어가니까 꼭 `String.raw` 로 감싸줘. 안 그러면 그림이 다 깨져
  - 소스에서 **들여쓰기 없이 0열부터** 그려줘. 앞뒤 빈 줄만 `block()` 이 정리해줄게
  - **그림 안에 한글은 넣지 말아줘.** 한글은 폭이 두 배라 틀이 어긋나. 설명은 본문에 써주면 돼
- 그림이 딸려 갈 확률은 `ART_CHANCE` (기본 0.25). 더 자주 보고 싶으면 올려줘

그림은 채널이 알아서 고정폭으로 감싸줄 거야 — 텔레그램은 `<pre>` (HTML 모드로 올리고 이스케이프),
디스코드는 코드펜스. 그림이 없는 말은 이스케이프 사고를 피하려고 평문 그대로 갈게.

새로 쓴 대사는 `/test` 로 바로 들어볼 수 있어. 🎤

## 📦 내 짐

내 짐은 전부 저장소 안에 있어. 둘 다 git 에는 안 올라가. 📂

**설정과 기록**은 `data/config.json`.
`/interval` 처럼 네가 바꾼 값이 여기 적히고, 내가 다시 깨어나도 기억하고 있어.
기록은 최근 90일치만 남기고 오래된 건 정리할게. 🧹

> 예전에는 `~/.fairy-of-spine/config.json` 에 뒀었어. 거기 파일이 남아 있으면
> 처음 깨어날 때 한 번 옮겨오고, 원본은 지우지 않고 그대로 둘게.

**로그**는 `logs/fairy.log` 와 `logs/fairy.error.log`.
콘솔에 찍는 걸 파일에도 같이 남겨. 창을 닫아도 기록이 사라지지 않아.
`launchd` 나 작업 스케줄러로 띄우면 그쪽이 이미 파일로 옮기고 있어서 두 번 쓰지 않아.

로그는 이렇게 관리해:

- 1MB 를 넘으면 뒤쪽 256KB 만 남기고 앞부분을 잘라내. 시작할 때 한 번, 그 뒤로는 30분마다 확인해
- 같은 오류가 이어질 때는 1, 2, 4, 8… 번째에만 남겨. 하루 1440번 실패해도 11줄이면 끝나고,
  회복되면 몇 번 만에 돌아왔는지 알려줄게

## 🗂️ 내가 만들어진 방식

```
src/
  index.ts            상주 루프. 20초마다 "갈 때가 됐나" 확인
  schedule.ts         타임존·활동시간대·다음에 갈 시각 계산 (순수 함수)
  commands.ts         채널과 상관없는 명령 처리
  config.ts           data/config.json 읽기/쓰기
  messages.ts         내 대사와 그림 모음
  web.ts              설정 화면 서버 (127.0.0.1 전용)
  ui.ts               설정 화면 HTML
  envfile.ts          .env 읽기/쓰기 (주석을 안 깨뜨린다)
  logs.ts             로그가 커지면 앞부분을 잘라내기
  report.ts           같은 오류가 반복될 때 로그 줄이기
  open.ts             설정 화면을 브라우저로 열기
  channels/
    types.ts          Channel 인터페이스
    index.ts          환경변수를 보고 갈 수 있는 곳만 준비
    telegram.ts       Bot API 롱폴링 + 인라인 키보드
    discord.ts        게이트웨이 WebSocket + REST, 웹훅 전용 모드
scripts/
  service.mjs         npm run service:* 를 OS 에 맞는 스크립트로 분배
  install.sh          macOS  - launchd 등록
  install.ps1         윈도우 - 작업 스케줄러 등록
  build-exe.mjs       단일 실행파일 만들기 (Node SEA)
```

앱 자체는 어느 OS 든 똑같이 돌아. Node 만 쓰고 경로도 `path.join` 으로 잡아서
OS 를 타는 건 상주 등록 부분뿐이야.

내가 갈 곳을 늘리고 싶다면 `Channel` 인터페이스를 구현하고 `channels/index.ts` 에 등록해줘.
언제 갈지 정하는 부분과 네 말을 알아듣는 부분은 채널을 몰라도 되게 해뒀어.

---

그럼 이만. 등 펴고 있어. ✨
