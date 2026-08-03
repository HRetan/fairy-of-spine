# fairy-of-spine 🧚

허리 펴라고 주기적으로 잔소리하는 알림 봇. **텔레그램**과 **디스코드**를 동시에 지원하고,
macOS에서 `launchd` 상주 프로세스로 돌아간다.

- 잔소리 문구 **30종** + 아스키 아트 **15종**을 랜덤으로 돌린다 (4번 중 1번쯤 아트가 딸려 온다)
- 알림 간격 / 활동 시간대 / 요일 / 타임존을 **채팅 명령으로 바로 수정**
- 알림에 붙는 버튼으로 `✅ 폈어요` / `😴 15분 뒤`
- 허리 편 횟수를 날짜별로 기록 (`/stats`)
- 런타임 의존성 0개 — Node 24+ 의 네이티브 TypeScript 실행을 쓰므로 빌드 단계가 없다

## 준비물

- Node.js 24 이상 (`node -v`)
- 텔레그램 봇 토큰, 디스코드 봇 토큰 중 **최소 하나**

### 텔레그램 봇 만들기

1. 텔레그램에서 [@BotFather](https://t.me/BotFather) 에게 `/newbot`
2. 이름과 username 을 정하면 토큰이 나온다 → `TELEGRAM_BOT_TOKEN`

### 디스코드 봇 만들기

1. [개발자 포털](https://discord.com/developers/applications) → New Application
2. **Bot** 탭 → Reset Token → 토큰 복사 → `DISCORD_BOT_TOKEN`
3. **OAuth2 → URL Generator** 에서 `bot` 스코프 + `Send Messages` 권한을 골라 나온 링크로 서버에 초대
4. 서버 채널에서 명령을 쓰고 싶다면 Bot 탭의 **MESSAGE CONTENT INTENT** 를 켜고
   `.env` 에 `DISCORD_MESSAGE_CONTENT_INTENT=true` 를 넣는다.
   봇과의 **DM으로만 쓸 거라면 필요 없다** (DM은 인텐트 없이도 본문이 전달된다).

> 명령 없이 알림만 받으면 충분하다면 봇 대신 채널 웹훅 URL(`DISCORD_WEBHOOK_URL`)만 넣어도 된다.

## 설치

```bash
git clone <이 저장소>
cd fairy-of-spine
npm install          # 타입체크용 devDependency 만 설치된다
cp .env.example .env # 토큰 채우기
npm start            # 우선 포그라운드로 동작 확인
```

봇에게 `/start` (디스코드는 `!start`) 를 보내면 그 대화가 알림 대상으로 묶인다.

### 백그라운드 상주로 등록 (macOS)

```bash
npm run service:install    # ~/Library/LaunchAgents 에 등록 + 즉시 기동
npm run service:logs       # 로그 실시간 보기
npm run service:uninstall  # 해제 (설정과 기록은 남는다)
```

로그인할 때 자동으로 뜨고, 프로세스가 죽으면 launchd 가 다시 살린다.
명령을 받으려면 봇이 계속 연결돼 있어야 하므로 cron 방식이 아니라 상주 데몬으로 띄운다.

## 명령어

텔레그램은 `/`, 디스코드는 `!` 또는 `/` 둘 다 된다.

| 명령 | 설명 |
| --- | --- |
| `/start` | 이 대화를 알림 대상으로 연결 |
| `/stop` | 알림 전체 끄기 |
| `/status` | 현재 설정과 다음 알림 시각 |
| `/done` | 허리 폈다고 보고 (타이머 리셋 + 기록) |
| `/snooze [분]` | 잠깐 미루기 (기본 15분) |
| `/pause [분]` | 일시정지. 분을 안 쓰면 무기한 |
| `/resume` | 일시정지 해제 |
| `/interval <분>` | 알림 간격 (예: `/interval 25`) |
| `/hours <HH:MM-HH:MM>` | 활동 시간대 (예: `/hours 09:00-18:00`) |
| `/days <...>` | `매일` `평일` `주말` `월수금` `mon,wed,fri` 모두 인식 |
| `/tz <타임존>` | 기준 시간대 (예: `/tz Asia/Seoul`) |
| `/stats` | 최근 7일 기록 |
| `/test` | 지금 바로 알림 한 번 |

`22:00-02:00` 처럼 자정을 넘는 시간대도 된다. 이 경우 요일은 **시작하는 날** 기준으로 판단한다.

## 환경변수

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | △ | 있으면 텔레그램 채널이 켜진다 |
| `TELEGRAM_CHAT_ID` | | 알림 대상 chat id 고정. 비우면 `/start` 로 자동 등록 |
| `DISCORD_BOT_TOKEN` | △ | 있으면 디스코드 채널이 켜진다 (명령 수신 가능) |
| `DISCORD_CHANNEL_ID` | | 알림 대상 channel id 고정 |
| `DISCORD_MESSAGE_CONTENT_INTENT` | | 서버 채널에서 명령을 읽으려면 `true` (기본 `false`) |
| `DISCORD_WEBHOOK_URL` | | 봇 토큰이 없을 때만 사용. 발송 전용 |
| `FAIRY_HOME` | | 설정·로그 위치. 기본 `~/.fairy-of-spine` |

△ = 둘 중 최소 하나. 둘 다 넣으면 **양쪽 모두로** 알림이 간다.

환경변수로 대상 ID를 지정하면 저장된 값보다 우선한다. 토큰을 바꾸고 싶으면 `.env` 만 고치고
`npm run service:install` 을 다시 돌리면 된다 (재등록 + 재기동).

## 문구 추가하기

전부 `src/messages.ts` 한 곳에 모여 있다.

- **문구**: `REMINDERS` 배열에 문자열을 추가하면 끝. 개수 제한 없다.
  본문에는 마크업을 쓰지 말 것 — 텔레그램과 디스코드에서 똑같이 보여야 한다.
- **아스키 아트**: `ARTS` 배열에 `block(String.raw\`...\`)` 로 추가한다.
  - 역슬래시가 들어가므로 반드시 `String.raw`
  - 소스에서 **들여쓰기 없이 0열부터** 그린다. 앞뒤 빈 줄만 `block()` 이 걷어낸다
  - **아트 안에 한글을 넣지 않는다.** 한글은 폭이 두 배라 틀이 어긋난다. 설명은 본문에 쓴다
- 아트가 붙을 확률은 `ART_CHANCE` (기본 0.25)

아트는 채널이 알아서 고정폭으로 감싼다 — 텔레그램은 `<pre>` (HTML 모드 + 이스케이프),
디스코드는 코드펜스. 아트가 없는 메시지는 이스케이프 사고를 피하려고 평문 그대로 나간다.

`/test` 로 지금 바로 한 건 뽑아볼 수 있다.

## 상태 파일

설정과 기록은 저장소가 아니라 `~/.fairy-of-spine/config.json` 에 쌓인다.
`/interval` 같은 명령으로 바꾼 값이 여기 저장되고, 재시작해도 유지된다.
통계는 최근 90일치만 남기고 자동으로 정리한다.

## 구조

```
src/
  index.ts            상주 루프. 20초마다 "보낼 때가 됐나" 확인
  schedule.ts         타임존·활동시간대·다음 알림 시각 계산 (순수 함수)
  commands.ts         채널 공통 명령 처리
  config.ts           ~/.fairy-of-spine/config.json 읽기/쓰기
  messages.ts         잔소리 문구 모음
  channels/
    types.ts          Channel 인터페이스
    index.ts          환경변수를 보고 쓸 수 있는 채널만 생성
    telegram.ts       Bot API 롱폴링 + 인라인 키보드
    discord.ts        게이트웨이 WebSocket + REST, 웹훅 전용 모드
```

채널을 추가하려면 `Channel` 인터페이스를 구현하고 `channels/index.ts` 에 등록하면 된다.
스케줄링과 명령 처리는 채널을 모른다.
