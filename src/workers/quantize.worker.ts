import { quantizeImage, type QuantizeOptions } from '@/core/quantize';
import type { BeadColor } from '@/core/model';

interface WorkerRequest {
  type: 'quantize';
  jobId: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
  palette: BeadColor[];
  allowed: Uint8Array;
  options: QuantizeOptions;
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

let cancelledJob = 0;

ctx.onmessage = (event) => {
  const message = event.data;
  if (!message || message.type !== 'quantize') return;
  if (cancelledJob >= message.jobId) return;
  try {
    ctx.postMessage({ type: 'progress', jobId: message.jobId, phase: 'match', progress: 0.1 });
    const result = quantizeImage({
      width: message.width,
      height: message.height,
      data: message.data,
      palette: message.palette,
      allowed: message.allowed,
    }, message.options);
    if (cancelledJob >= message.jobId) return;
    ctx.postMessage({
      type: 'result',
      jobId: message.jobId,
      cells: result.cells,
      counts: result.counts,
      total: result.total,
      colorCount: result.colorCount,
      durationMs: result.durationMs,
    }, [result.cells.buffer, result.counts.buffer]);
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      jobId: message.jobId,
      message: error instanceof Error ? error.message : '图片处理失败',
    });
  }
};

// 取消通过新建 job 隐式实现；保留消息入口，便于后续显式中断。
self.addEventListener('message', (event: MessageEvent<{ type: string; jobId?: number }>) => {
  if (event.data?.type === 'cancel' && typeof event.data.jobId === 'number') {
    cancelledJob = Math.max(cancelledJob, event.data.jobId);
  }
});
