export type SessionManager = ReturnType<typeof createSessionManager>;

interface SlotRequest {
  resolve: () => void;
  reject: (error: Error) => void;
}

const KILLED_ERROR = "Session manager has been killed";

export function createSessionManager(maxConcurrent: number) {
  let active = 0;
  let killed = false;
  const queue: SlotRequest[] = [];

  function release() {
    active--;
    const next = queue.shift();
    if (next) {
      active++;
      next.resolve();
    }
  }

  function acquire(): Promise<void> {
    if (killed) {
      return Promise.reject(new Error(KILLED_ERROR));
    }
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      queue.push({ resolve, reject });
    });
  }

  return {
    async submit<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },

    kill(): void {
      killed = true;
      const error = new Error(KILLED_ERROR);
      while (queue.length > 0) {
        queue.shift()?.reject(error);
      }
    },

    status(): { active: number; queued: number; killed: boolean } {
      return { active, queued: queue.length, killed };
    },
  };
}
