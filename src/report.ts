/**
 * 같은 오류가 이어질 때 매번 찍지 않고 간격을 벌린다.
 *
 * 텔레그램 폴링은 토큰이 틀렸거나 인스턴스가 둘이면 실패를 무한 반복한다.
 * 그대로 두면 스택트레이스가 하루 수천 줄씩 쌓이는데, 정작 담긴 정보는 한 줄짜리다.
 * 그래서 1, 2, 4, 8… 번째에만 찍어 하루 몇 줄로 줄인다.
 */
export type Reporter = {
  /** 오류를 보고한다. 같은 오류가 이어지면 대부분 조용히 넘어간다. */
  fail: (error: unknown) => void;
  /** 정상 동작했을 때 부른다. 반복이 끝났으면 회복을 알린다. */
  ok: () => void;
};

export function createReporter(tag: string): Reporter {
  let lastMessage = "";
  let count = 0;
  let reportAt = 1;

  return {
    fail(error: unknown): void {
      const message = describe(error);

      if (message !== lastMessage) {
        lastMessage = message;
        count = 0;
        reportAt = 1;
      }
      count += 1;
      if (count < reportAt) return;

      if (count === 1) {
        // 처음 한 번만 스택까지 남긴다. 원인을 찾으려면 이게 필요하다.
        console.error(`[${tag}] ${message}`, error);
      } else {
        console.error(`[${tag}] ${message} (${count}번째, 계속 반복 중)`);
      }
      reportAt = count * 2;
    },

    ok(): void {
      if (count > 1) {
        console.log(`[${tag}] 회복됐다. 같은 오류가 ${count}번 반복된 뒤다.`);
      }
      lastMessage = "";
      count = 0;
      reportAt = 1;
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
