import { env } from './env';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface EventStreamOptions {
  /** Headers for each (re)connect, e.g. a fresh access token or the share token. */
  headers: () => Record<string, string>;
  onMessage: (type: string, data: unknown) => void;
  onStatus: (status: StreamStatus, httpStatus?: number) => void;
  /** Called on 401 before giving up; resolve true to retry with new headers. */
  onUnauthorized?: () => Promise<boolean>;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Server-Sent Events over fetch, because EventSource can't send headers (the access token
 * or the share token). Reconnects with backoff and resumes with `Last-Event-ID`, so the
 * server sends only what was missed. Returns a function that closes the stream.
 */
export function openEventStream(path: string, options: EventStreamOptions): () => void {
  const controller = new AbortController();
  let lastEventId: string | null = null;
  let closed = false;
  let attempt = 0;

  const close = () => {
    closed = true;
    controller.abort();
  };

  const finish = (httpStatus?: number) => {
    closed = true;
    options.onStatus('closed', httpStatus);
  };

  const connect = async (): Promise<void> => {
    while (!closed) {
      options.onStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      try {
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
          ...options.headers(),
        };
        if (lastEventId) headers['Last-Event-ID'] = lastEventId;
        const res = await fetch(`${env.apiUrl}${path}`, {
          headers,
          signal: controller.signal,
          credentials: 'include',
        });
        if (res.status === 401 && options.onUnauthorized && (await options.onUnauthorized())) {
          continue;
        }
        if (!res.ok || !res.body) {
          // 4xx won't fix itself (revoked link, no access); 5xx is worth retrying.
          if (res.status < 500) return finish(res.status);
          throw new Error(`HTTP ${res.status}`);
        }
        attempt = 0;
        options.onStatus('live');
        const ended = await read(res.body);
        if (ended === 'revoked') return finish(404);
      } catch {
        if (closed) return;
      }
      attempt += 1;
      const delay = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.min(attempt, 5));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };

  const read = async (body: ReadableStream<Uint8Array>): Promise<'ended' | 'revoked'> => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return 'ended';
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let type = 'message';
        const data: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) type = line.slice(7);
          else if (line.startsWith('id: ')) lastEventId = line.slice(4);
          else if (line.startsWith('data: ')) data.push(line.slice(6));
        }
        if (!data.length) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data.join('\n'));
        } catch {
          continue;
        }
        options.onMessage(type, parsed);
        if (type === 'revoked') return 'revoked';
      }
    }
  };

  void connect();
  return close;
}
