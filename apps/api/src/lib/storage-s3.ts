import { AwsClient } from 'aws4fetch';
import type {
  CompleteMultipartInput,
  InitMultipartInput,
  InitMultipartResult,
  ObjectMeta,
  PresignPutInput,
  PresignPutResult,
  StorageProvider,
} from './storage.js';

export interface S3StorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  forcePathStyle?: boolean;
}

const DEFAULT_PART_SIZE = 10 * 1024 * 1024;

export class S3Storage implements StorageProvider {
  private aws: AwsClient;

  constructor(private config: S3StorageConfig) {
    this.aws = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: config.region,
    });
  }

  private objectUrl(key: string, query?: string): string {
    const base = this.config.endpoint.replace(/\/$/, '');
    const path = this.config.forcePathStyle
      ? `${base}/${this.config.bucket}/${encodeKey(key)}`
      : `${base}/${encodeKey(key)}`;
    return query ? `${path}?${query}` : path;
  }

  async presignPut(input: PresignPutInput): Promise<PresignPutResult> {
    const expires = input.expiresInSec ?? 600;
    const url = this.objectUrl(input.key, `X-Amz-Expires=${expires}`);
    const signed = await this.aws.sign(
      new Request(url, {
        method: 'PUT',
        headers: { 'content-type': input.contentType },
      }),
      { aws: { signQuery: true } },
    );
    return {
      url: signed.url,
      method: 'PUT',
      headers: { 'content-type': input.contentType },
    };
  }

  async initMultipart(input: InitMultipartInput): Promise<InitMultipartResult> {
    const initUrl = this.objectUrl(input.key, 'uploads=');
    const init = await this.aws.fetch(initUrl, {
      method: 'POST',
      headers: { 'content-type': input.contentType },
    });
    if (!init.ok) {
      throw new Error(`initMultipart failed: ${init.status} ${await init.text()}`);
    }
    const xml = await init.text();
    const uploadId = matchXml(xml, 'UploadId');
    if (!uploadId) throw new Error('multipart upload init: missing UploadId');

    const expires = input.expiresInSec ?? 3600;
    const partUrls: string[] = [];
    for (let i = 1; i <= input.partCount; i++) {
      const url = this.objectUrl(
        input.key,
        `partNumber=${i}&uploadId=${encodeURIComponent(uploadId)}&X-Amz-Expires=${expires}`,
      );
      const signed = await this.aws.sign(new Request(url, { method: 'PUT' }), {
        aws: { signQuery: true },
      });
      partUrls.push(signed.url);
    }

    return { uploadId, partSize: DEFAULT_PART_SIZE, partUrls };
  }

  async completeMultipart(input: CompleteMultipartInput): Promise<void> {
    const sorted = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
    const body =
      `<CompleteMultipartUpload>` +
      sorted
        .map(
          (p) =>
            `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`,
        )
        .join('') +
      `</CompleteMultipartUpload>`;
    const url = this.objectUrl(input.key, `uploadId=${encodeURIComponent(input.uploadId)}`);
    const res = await this.aws.fetch(url, { method: 'POST', body });
    if (!res.ok) {
      throw new Error(`completeMultipart failed: ${res.status} ${await res.text()}`);
    }
  }

  async abortMultipart(input: { key: string; uploadId: string }): Promise<void> {
    const url = this.objectUrl(input.key, `uploadId=${encodeURIComponent(input.uploadId)}`);
    await this.aws.fetch(url, { method: 'DELETE' });
  }

  publicUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${encodeKey(key)}`;
  }

  async presignGet(key: string, expiresInSec = 3600): Promise<string> {
    const url = this.objectUrl(key, `X-Amz-Expires=${expiresInSec}`);
    const signed = await this.aws.sign(new Request(url, { method: 'GET' }), {
      aws: { signQuery: true },
    });
    return signed.url;
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.aws.fetch(this.objectUrl(key), { method: 'HEAD' });
    return res.ok;
  }

  async delete(key: string): Promise<void> {
    const res = await this.aws.fetch(this.objectUrl(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      throw new Error(`delete failed: ${res.status}`);
    }
  }

  async head(key: string): Promise<ObjectMeta | null> {
    const res = await this.aws.fetch(this.objectUrl(key), { method: 'HEAD' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`head failed: ${res.status}`);
    return {
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      contentLength: Number(res.headers.get('content-length') ?? 0),
      etag: res.headers.get('etag') ?? '',
    };
  }
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

function matchXml(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  return m?.[1] ?? null;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
