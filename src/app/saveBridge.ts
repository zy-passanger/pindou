let flush: (() => Promise<void>) | null = null;

/** 编辑器注册“立即保存”，PWA 更新前等待保存完成，避免丢失最后 800ms 的改动。 */
export function setFlushSave(fn: (() => Promise<void>) | null): void {
  flush = fn;
}

export async function flushSave(): Promise<void> {
  if (!flush) return;
  try {
    await flush();
  } catch {
    // 保存失败由编辑器自己提示；更新流程继续，避免卡死。
  }
}
