import type { UploadInit, UploadInitResponse } from '@leetete/shared';

export type UploadProgress = (loaded: number, total: number) => void;

export interface UploadOptions {
  signal?: AbortSignal;
  onProgress?: UploadProgress;
}

export interface UploadOk {
  uploadId: string;
}

async function getDuration(file: File): Promise<number | undefined> {
  if (!file.type.startsWith('video/')) return undefined;
  return await new Promise<number | undefined>((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = url;
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : undefined);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
  });
}

function putWithProgress(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: UploadProgress,
  signal?: AbortSignal,
): Promise<{ etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('etag') ?? xhr.getResponseHeader('ETag') ?? '';
        resolve({ etag: etag.replace(/^"|"$/g, '') });
      } else {
        reject(new Error(`PUT failed: ${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}

export async function uploadFile(
  file: File,
  meta: { authorName?: string; message?: string },
  opts: UploadOptions = {},
): Promise<UploadOk> {
  const duration = await getDuration(file);

  const initBody: UploadInit = {
    filename: file.name || 'upload',
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    durationSeconds: duration,
    authorName: meta.authorName?.trim() || undefined,
    message: meta.message?.trim() || undefined,
  };

  const initRes = await fetch('/api/uploads/init', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(initBody),
    signal: opts.signal,
  });
  if (!initRes.ok) {
    const text = await initRes.text();
    throw new Error(`init failed: ${initRes.status} ${text}`);
  }
  const init = (await initRes.json()) as UploadInitResponse;

  if (init.mode === 'single') {
    if (!init.putUrl) throw new Error('init: missing putUrl');
    await putWithProgress(
      init.putUrl,
      file,
      init.putHeaders ?? { 'content-type': initBody.mimeType },
      opts.onProgress,
      opts.signal,
    );
  } else if (init.mode === 'multipart' && init.multipart) {
    const { partSize, partUrls, providerUploadId } = init.multipart;
    const parts: { partNumber: number; etag: string }[] = [];
    let uploaded = 0;
    for (let i = 0; i < partUrls.length; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);
      const partProgress: UploadProgress = (loaded) => {
        opts.onProgress?.(uploaded + loaded, file.size);
      };
      const url = partUrls[i];
      if (!url) throw new Error(`missing part url for part ${i + 1}`);
      const { etag } = await putWithProgress(url, blob, {}, partProgress, opts.signal);
      uploaded += blob.size;
      opts.onProgress?.(uploaded, file.size);
      if (!etag) throw new Error(`part ${i + 1}: missing ETag (CORS exposes ETag?)`);
      parts.push({ partNumber: i + 1, etag });
    }
    const confirmRes = await fetch(`/api/uploads/${init.uploadId}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ multipart: { providerUploadId, parts } }),
      signal: opts.signal,
    });
    if (!confirmRes.ok) throw new Error(`confirm failed: ${confirmRes.status}`);
    return { uploadId: init.uploadId };
  } else {
    throw new Error('init: invalid mode');
  }

  const confirmRes = await fetch(`/api/uploads/${init.uploadId}/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
    signal: opts.signal,
  });
  if (!confirmRes.ok) throw new Error(`confirm failed: ${confirmRes.status}`);
  return { uploadId: init.uploadId };
}
