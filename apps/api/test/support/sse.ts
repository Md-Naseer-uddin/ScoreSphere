export interface SseMessage {
  type: string;
  id?: string;
  data: unknown;
}

/** A minimal Server-Sent Events reader over fetch, for tests. */
export class SseStream {
  private buffer = '';
  private readonly queue: SseMessage[] = [];
  private waiters: ((m: SseMessage | null) => void)[] = [];
  private ended = false;

  private constructor(
    private readonly controller: AbortController,
    readonly status: number,
  ) {}

  static async open(url: string, headers: Record<string, string> = {}): Promise<SseStream> {
    const controller = new AbortController();
    const res = await fetch(url, { headers, signal: controller.signal });
    const stream = new SseStream(controller, res.status);
    if (res.ok && res.body) void stream.pump(res.body);
    else stream.finish();
    return stream;
  }

  /** Resolves with the next message, or null once the server has closed the stream. */
  next(timeoutMs = 5_000): Promise<SseMessage | null> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.ended) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for an SSE message')),
        timeoutMs,
      );
      this.waiters.push((m) => {
        clearTimeout(timer);
        resolve(m);
      });
    });
  }

  close(): void {
    this.controller.abort();
  }

  private async pump(body: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of body) {
        this.buffer += decoder.decode(chunk, { stream: true });
        let end: number;
        while ((end = this.buffer.indexOf('\n\n')) >= 0) {
          const block = this.buffer.slice(0, end);
          this.buffer = this.buffer.slice(end + 2);
          this.parse(block);
        }
      }
    } catch {
      // Aborted by close().
    }
    this.finish();
  }

  private parse(block: string): void {
    let type = 'message';
    let id: string | undefined;
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) type = line.slice(7);
      else if (line.startsWith('id: ')) id = line.slice(4);
      else if (line.startsWith('data: ')) data.push(line.slice(6));
    }
    if (data.length === 0) return;
    this.deliver({ type, id, data: JSON.parse(data.join('\n')) });
  }

  private deliver(m: SseMessage): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(m);
    else this.queue.push(m);
  }

  private finish(): void {
    this.ended = true;
    for (const w of this.waiters.splice(0)) w(null);
  }
}
