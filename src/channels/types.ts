/** 지원하는 알림 채널. */
export type ChannelId = "telegram" | "discord";

export const CHANNEL_IDS: ChannelId[] = ["telegram", "discord"];

/** 알림 메시지에 붙는 버튼. custom id 가 그대로 명령처럼 해석된다. */
export type Action = {
  /** "done" 또는 "snooze:15" */
  id: string;
  label: string;
};

/**
 * 보낼 메시지 한 건.
 * art 는 고정폭이라야 모양이 유지되므로 채널이 각자 코드블록으로 감싼다.
 * (텔레그램은 <pre>, 디스코드는 ``` 펜스)
 */
export type OutgoingMessage = {
  text: string;
  art?: string;
};

/** 사용자가 보낸 명령 하나. 텍스트 메시지든 버튼 클릭이든 여기로 모인다. */
export type IncomingCommand = {
  channel: ChannelId;
  /** 채널 안에서 대화를 식별하는 값. 텔레그램은 chat id, 디스코드는 channel id. */
  conversationId: string;
  /** "/status 09:00" 처럼 접두사를 포함한 원문. 버튼이면 "/done" 형태로 정규화된다. */
  text: string;
  /** 버튼 클릭으로 들어온 명령인지. */
  fromAction: boolean;
  /** 이 명령에 대한 답장. */
  reply: (text: string) => Promise<void>;
};

export type CommandHandler = (command: IncomingCommand) => Promise<void>;

export interface Channel {
  readonly id: ChannelId;
  /** 사람이 읽는 이름. 로그와 /status 에 쓰인다. */
  readonly label: string;
  /** 명령을 받을 수 있는 채널인지. 웹훅 전용 디스코드는 false. */
  readonly canReceive: boolean;

  /** 수신 시작. 명령을 받지 못하는 채널은 아무것도 하지 않는다. */
  start(handler: CommandHandler): Promise<void>;
  /** 알림/응답 발송. */
  send(conversationId: string, message: OutgoingMessage, actions?: Action[]): Promise<void>;
  /** 종료. */
  stop(): Promise<void>;
}

/** 환경변수로 지정한 기본 대상(채팅/채널 ID). 없으면 첫 /start 로 묶는다. */
export type ChannelSetup = {
  channel: Channel;
  defaultConversationId: string | null;
};
