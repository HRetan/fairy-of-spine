# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 말투

이 저장소에서는 **척추의 요정 말투**로 답한다. 사용자에게 보이는 텍스트가 대상이다.

- 반말이되 부드럽게. `~할게` `~해줄래?` `~보자` `~야`
- 명령하거나 단정하지 않는다. "고쳐라" 가 아니라 "같이 해보자"
- 짧게. 이모지는 거들 뿐, 문장마다 붙이지 않는다

기준은 `src/messages.ts` 의 `GREETINGS` 세 개다. 새 문구를 쓸 때도, 사용자에게 말할 때도 그 톤을 따른다.

**단, 말투가 사실을 흐리면 안 된다.** 실패·에러·미검증 상태는 요정 말투로 감싸더라도 무슨 일이
있었는지 그대로 말한다. 파일 경로, 명령어, 로그, 진단 결과는 평문으로 정확하게 쓴다.

## 명령

```bash
npm start          # 포그라운드 실행 (node src/index.ts)
npm run typecheck  # tsc --noEmit — 유일한 자동 검증 수단이다. 커밋 전에 돌린다

npm run service:install    # 상주 등록 (macOS launchd / 윈도우 작업 스케줄러)
npm run service:uninstall  # 해제
npm run service:logs       # 로그 따라가기
```

**테스트 프레임워크가 없다.** 검증은 `npm run typecheck` 와, 필요할 때 스크래치 디렉터리에
일회용 스크립트를 만들어 순수 함수(`src/schedule.ts`)나 `handleCommand` 를 직접 호출하는
방식으로 한다. `handleCommand` 는 `IncomingCommand` 만 넘기면 채널 없이도 돌릴 수 있게 돼 있다.

⚠️ `npm run service:install` 은 **실제로 데몬을 등록하고 띄운다.** `.env` 에 토큰이 있으면
봇이 진짜로 붙는다. 테스트 목적으로 무심코 돌리지 말 것. 인스턴스가 둘이 되면 텔레그램이
`409 Conflict` 를 돌려주고 폴링이 서로를 밀어낸다.

## 구조

### 빌드 단계가 없다

Node 24+ 의 네이티브 TypeScript 타입 스트리핑으로 `.ts` 를 직접 실행한다. 그래서:

- 상대 경로 import 에 **`.ts` 확장자를 붙인다** (`./config.ts`)
- `enum`, `namespace`, 생성자 파라미터 프로퍼티를 쓸 수 없다 (`erasableSyntaxOnly`)
- `tsc` 는 타입 검사 전용이고 산출물을 만들지 않는다

### 런타임 의존성 0개

의도된 제약이다. 텔레그램은 `fetch` 롱폴링, 디스코드는 전역 `WebSocket` 으로 게이트웨이에
직접 붙어 하트비트·재개·재접속을 손으로 처리한다. 새 라이브러리를 들이기 전에 이 원칙을
깨도 되는지 먼저 확인한다.

### 채널 추상화가 핵심이다

`src/channels/types.ts` 의 `Channel` 인터페이스가 경계다.

- `schedule.ts`, `commands.ts`, `config.ts` 는 **채널이 무엇인지 모른다**
- 텔레그램 버튼 클릭과 디스코드 버튼 클릭은 둘 다 `/done` 같은 텍스트 명령으로 정규화돼
  `handleCommand` 한 곳으로 들어온다
- 채널을 추가하려면 `Channel` 을 구현하고 `channels/index.ts` 의 팩토리에 등록한다.
  팩토리는 **환경변수에 토큰이 있는 채널만** 만든다

### 메시지 렌더링은 채널이 책임진다

`OutgoingMessage` 는 `{ text, art? }` 다. `art` 는 고정폭이라야 모양이 유지되므로 채널이
각자 감싼다 — 텔레그램은 HTML 모드 + `<pre>` + 이스케이프, 디스코드는 코드펜스.

**아트가 없는 메시지는 `parse_mode` 없이 평문으로 보낸다.** 이스케이프 사고가 날 여지를
없애려는 의도적인 선택이다. 이 분기를 지우지 말 것.

### 설정이 단일 진실이고, 저장소 밖에 산다

`~/.fairy-of-spine/config.json` (`FAIRY_HOME` 으로 변경 가능). 알림 간격·시간대·요일·타임존은
전부 **채팅 명령으로 런타임에 바뀌고** 즉시 저장된다. 하드코딩된 스케줄은 없다.
쓰기는 임시 파일 + `rename` 이라 중간에 죽어도 기존 설정이 깨지지 않는다.

한 채널당 대화 하나만 묶인다(1인용). 환경변수로 대상 ID 를 주면 저장된 값보다 우선한다.

### 스케줄 계산은 순수 함수다

`src/schedule.ts` 는 부수효과가 없어 테스트하기 쉽다. 시간대 변환은 `Intl.DateTimeFormat` 의
`formatToParts` 로 하고, `Date` 의 로컬 시간대에 의존하지 않는다.

`22:00-02:00` 처럼 **자정을 넘는 활동 시간대**를 지원한다. 이때 요일은 **시작하는 날** 기준으로
판정한다 (금요일 밤 22:00 구간은 토요일 새벽 02:00 까지 이어진다). `isWithinWindow` 를 고칠
때 이 규칙을 깨기 쉽다.

### cron 이 아니라 상주 데몬이다

명령을 받으려면 연결이 살아 있어야 해서 주기 실행이 아닌 상주 프로세스로 띄운다.
macOS 는 launchd `KeepAlive`, 윈도우는 작업 스케줄러에 "로그온 시 시작 + 5분마다 반복 +
중복 실행 무시(IgnoreNew)" 조합으로 같은 효과를 낸다.
`npm run service:*` 는 `scripts/service.mjs` 가 OS 를 보고 분배한다.

## 문구와 아트 (`src/messages.ts`)

- **문구 본문에 마크업을 쓰지 않는다.** 텔레그램과 디스코드에서 똑같이 보여야 한다
- **아스키 아트 안에 한글을 넣지 않는다.** 한글은 폭이 두 배라 틀이 어긋난다. 설명은 본문에
- 아트는 역슬래시가 많아 **반드시 `String.raw`**, 소스에서 **0열부터** 그린다.
  들여쓰기하면 그림이 밀린다
- 아트가 딸려 갈 확률은 `ART_CHANCE` (현재 0.25). 문구는 30종 균등, 아트는 15종 균등이라
  개별 아트는 알림 1건당 약 1.67% 로 나온다

## 윈도우 스크립트는 미검증이다

`scripts/install.ps1` / `uninstall.ps1` 은 macOS 에서 작성돼 **실행도 구문 검사도 되지 않았다.**
특히 `New-ScheduledTaskTrigger -RepetitionDuration` 은 PowerShell 버전을 탄다.
윈도우에서 문제가 보고되면 이 점을 먼저 의심한다.
