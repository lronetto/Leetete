export interface PresignPutInput {
  key: string;
  contentType: string;
  contentLength?: number;
  expiresInSec?: number;
}

export interface PresignPutResult {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

export interface InitMultipartInput {
  key: string;
  contentType: string;
  partCount: number;
  expiresInSec?: number;
}

export interface InitMultipartResult {
  uploadId: string;
  partSize: number;
  partUrls: string[];
}

export interface CompleteMultipartInput {
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
}

export interface ObjectMeta {
  contentType: string;
  contentLength: number;
  etag: string;
}

export interface StorageProvider {
  presignPut(input: PresignPutInput): Promise<PresignPutResult>;
  initMultipart(input: InitMultipartInput): Promise<InitMultipartResult>;
  completeMultipart(input: CompleteMultipartInput): Promise<void>;
  abortMultipart(input: { key: string; uploadId: string }): Promise<void>;
  publicUrl(key: string): string;
  presignGet(key: string, expiresInSec?: number): Promise<string>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<ObjectMeta | null>;
}
