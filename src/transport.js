// Transport: the bridge between client-side intents and the backend that
// resolves them into the next UI state. Everything is async so the real thing
// (WebSocket to a model-renderer service) slots in behind the same contract.
//
// Handlers return { nextState?, values?, patches? } or nothing.

export function localTransport(handler) {
  return {
    async dispatch(intent, context) {
      try {
        return await handler(intent, context);
      } catch (err) {
        console.error('sketchapedia transport error', err);
        return null;
      }
    },
    close() {}
  };
}

export function websocketTransport(url, { timeoutMs = 10000 } = {}) {
  const pending = new Map();
  let nextId = 0;
  let socket;

  function open() {
    socket = new WebSocket(url);
    socket.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(msg.error));
      else entry.resolve(msg.result);
    });
    socket.addEventListener('close', () => {
      for (const [, entry] of pending) entry.reject(new Error('socket closed'));
      pending.clear();
    });
  }
  open();

  function waitOpen() {
    if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
  }

  return {
    async dispatch(intent, context) {
      await waitOpen();
      const id = ++nextId;
      const payload = JSON.stringify({ id, intent, context: { values: context.values } });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('transport timeout'));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        socket.send(payload);
      });
    },
    close() { socket.close(); }
  };
}
