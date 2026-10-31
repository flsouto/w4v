export class Engine {
  constructor(factory = () => new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' }), timeout = 60000) {
    this.factory = factory;
    this.timeout = timeout;
    this.nextId = 0;
    this.pending = new Map();
  }
  start() {
    if (this.worker) return;
    const worker = this.worker = this.factory();
    worker.onmessage = ({ data }) => {
      const job = this.pending.get(data.id);
      if (!job) return;
      clearTimeout(job.timer);
      this.pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data);
    };
    worker.onerror = event => this.cancel(event.message || 'Audio worker failed');
    worker.onmessageerror = () => this.cancel('Could not read the audio worker response');
  }
  run(type, payload = {}, transfer = []) {
    this.start();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.cancel('Processing exceeded 60 seconds. Try shorter samples.'), this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ id, type, payload }, transfer); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  cancel(message = 'Processing cancelled') {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(new Error(message));
    }
    this.pending.clear();
  }
}
