import { z } from 'zod';

export const eventConfigSchema = z.object({
  coupleNames: z.string().min(1).max(120),
  eventDate: z.string().nullable(),
  coverKey: z.string().nullable(),
  galleryVisibility: z.enum(['public', 'private']),
  moderation: z.enum(['pre', 'post']),
  maxFileMb: z.number().int().positive(),
  allowVideo: z.boolean(),
  maxVideoSeconds: z.number().int().positive(),
  welcomeMessage: z.string().max(2000).nullable(),
});

export type EventConfig = z.infer<typeof eventConfigSchema>;

export const eventConfigUpdateSchema = eventConfigSchema.partial();
export type EventConfigUpdate = z.infer<typeof eventConfigUpdateSchema>;

export const adminUploadSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable(),
  mimeType: z.string(),
  isVideo: z.boolean(),
  sizeBytes: z.number().int(),
  durationSeconds: z.number().int().nullable(),
  authorName: z.string().nullable(),
  message: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'rejected']),
  source: z.enum(['guest', 'import']),
  createdAt: z.number(),
  approvedAt: z.number().nullable(),
});

export type AdminUpload = z.infer<typeof adminUploadSchema>;

export const adminUploadsResponseSchema = z.object({
  items: z.array(adminUploadSchema),
  nextCursor: z.string().nullable(),
});

export type AdminUploadsResponse = z.infer<typeof adminUploadsResponseSchema>;

export const adminStatsSchema = z.object({
  total: z.number().int(),
  approved: z.number().int(),
  pending: z.number().int(),
  rejected: z.number().int(),
  photos: z.number().int(),
  videos: z.number().int(),
  totalBytes: z.number().int(),
});

export type AdminStats = z.infer<typeof adminStatsSchema>;

export const uploadInitSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().regex(/^(image|video)\/[a-z0-9.+-]+$/i),
  sizeBytes: z.number().int().positive(),
  durationSeconds: z.number().int().positive().optional(),
  authorName: z.string().max(80).optional(),
  message: z.string().max(2000).optional(),
  turnstileToken: z.string().min(1).optional(),
});

export type UploadInit = z.infer<typeof uploadInitSchema>;

export const uploadInitResponseSchema = z.object({
  uploadId: z.string(),
  storageKey: z.string(),
  mode: z.enum(['single', 'multipart']),
  putUrl: z.string().url().optional(),
  putHeaders: z.record(z.string()).optional(),
  multipart: z
    .object({
      providerUploadId: z.string(),
      partSize: z.number().int().positive(),
      partUrls: z.array(z.string().url()),
    })
    .optional(),
});

export type UploadInitResponse = z.infer<typeof uploadInitResponseSchema>;

export const uploadConfirmSchema = z.object({
  multipart: z
    .object({
      providerUploadId: z.string(),
      parts: z.array(
        z.object({
          partNumber: z.number().int().positive(),
          etag: z.string().min(1),
        }),
      ),
    })
    .optional(),
});

export type UploadConfirm = z.infer<typeof uploadConfirmSchema>;

export const galleryItemSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  thumbnailUrl: z.string().url().nullable(),
  mimeType: z.string(),
  isVideo: z.boolean(),
  authorName: z.string().nullable(),
  message: z.string().nullable(),
  createdAt: z.number(),
});

export type GalleryItem = z.infer<typeof galleryItemSchema>;

export const galleryResponseSchema = z.object({
  items: z.array(galleryItemSchema),
  nextCursor: z.string().nullable(),
});

export type GalleryResponse = z.infer<typeof galleryResponseSchema>;
