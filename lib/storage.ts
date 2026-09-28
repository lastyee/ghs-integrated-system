import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface StorageUploadOptions {
  bucket: string;
  path: string;
  file: Buffer | Uint8Array;
  contentType: string;
}

export interface StorageSignedUrlOptions {
  bucket: string;
  path: string;
  expiresIn?: number; // seconds, defaults to 900 (15 minutes)
}

export interface StorageDeleteOptions {
  bucket: string;
  path: string;
}

export type StorageDeleteResult = {
  outcome: "deleted" | "already_absent";
};

export interface StorageProvider {
  upload(options: StorageUploadOptions): Promise<{ path: string }>;
  createSignedUrl(options: StorageSignedUrlOptions): Promise<string>;
  delete(options: StorageDeleteOptions): Promise<StorageDeleteResult>;
}

export class MockStorageProvider implements StorageProvider {
  private objects = new Map<string, { buffer: Buffer; contentType: string }>();
  private uploadLog: string[] = [];
  private deleteLog: string[] = [];
  private nextDeleteFailure: Error | null = null;

  async upload(options: StorageUploadOptions): Promise<{ path: string }> {
    const key = `${options.bucket}/${options.path}`;
    const buffer = Buffer.isBuffer(options.file)
      ? options.file
      : Buffer.from(options.file);
    this.objects.set(key, { buffer, contentType: options.contentType });
    this.uploadLog.push(key);
    return { path: options.path };
  }

  async createSignedUrl(options: StorageSignedUrlOptions): Promise<string> {
    const key = `${options.bucket}/${options.path}`;
    if (!this.objects.has(key)) {
      // In mock mode, we still generate signed URL if path is valid format,
      // but if checking object presence, we can record or allow
    }
    const expiresIn = options.expiresIn ?? 900;
    const expiresAt = Date.now() + expiresIn * 1000;
    // Explicit private test signed URL (not public storage URL)
    return `https://storage.mock.internal/signed/${options.bucket}/${options.path}?token=mock_sig_${Date.now()}&expires=${expiresAt}`;
  }

  async delete(options: StorageDeleteOptions): Promise<StorageDeleteResult> {
    if (this.nextDeleteFailure) {
      const error = this.nextDeleteFailure;
      this.nextDeleteFailure = null;
      throw error;
    }
    const key = `${options.bucket}/${options.path}`;
    const existed = this.objects.delete(key);
    this.deleteLog.push(key);
    return { outcome: existed ? "deleted" : "already_absent" };
  }

  has(bucket: string, path: string): boolean {
    return this.objects.has(`${bucket}/${path}`);
  }

  get(bucket: string, path: string) {
    return this.objects.get(`${bucket}/${path}`);
  }

  getObjectCount(): number {
    return this.objects.size;
  }

  getKeys(): string[] {
    return Array.from(this.objects.keys());
  }

  getUploadHistory(): string[] {
    return [...this.uploadLog];
  }

  getDeleteHistory(): string[] {
    return [...this.deleteLog];
  }

  failNextDeleteForTest(message = "Mock storage delete failure."): void {
    this.nextDeleteFailure = new Error(message);
  }
}

export class SupabaseStorageProvider implements StorageProvider {
  private client: SupabaseClient;

  constructor(
    supabaseUrl: string,
    supabaseServiceRoleKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(
        "Supabase Storage configuration error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
      );
    }
    this.client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: { fetch: fetcher },
    });
  }

  async upload(options: StorageUploadOptions): Promise<{ path: string }> {
    const { error } = await this.client.storage
      .from(options.bucket)
      .upload(options.path, options.file, {
        contentType: options.contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    return { path: options.path };
  }

  async createSignedUrl(options: StorageSignedUrlOptions): Promise<string> {
    const expiresIn = options.expiresIn ?? 900;
    const { data, error } = await this.client.storage
      .from(options.bucket)
      .createSignedUrl(options.path, expiresIn);

    if (error || !data?.signedUrl) {
      throw new Error(
        `Failed to create signed URL: ${error?.message || "Unknown error"}`
      );
    }

    return data.signedUrl;
  }

  async delete(options: StorageDeleteOptions): Promise<StorageDeleteResult> {
    const { data, error } = await this.client.storage
      .from(options.bucket)
      .remove([options.path]);

    if (error) {
      throw new Error(`Storage delete failed: ${error.message}`);
    }

    return { outcome: data.length > 0 ? "deleted" : "already_absent" };
  }
}

export const DOCUMENTS_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET || "documents";

export const CERTIFICATES_BUCKET =
  process.env.SUPABASE_CERTIFICATES_BUCKET || "certificates";

let activeStorageProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (activeStorageProvider) {
    return activeStorageProvider;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const explicitProvider = process.env.STORAGE_PROVIDER;

  // In production, Supabase is mandatory. Fail fast if credentials are not configured.
  if (isProduction || explicitProvider === "supabase") {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Storage configuration error: Production storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }

    activeStorageProvider = new SupabaseStorageProvider(
      supabaseUrl,
      serviceRoleKey
    );
    return activeStorageProvider;
  }

  // Development and test environment default to MockStorageProvider unless explicitly configured
  activeStorageProvider = new MockStorageProvider();
  return activeStorageProvider;
}

export function setStorageProviderForTest(
  provider: StorageProvider | null
): void {
  activeStorageProvider = provider;
}

export function sanitizeFileName(fileName: string): string {
  // Strip path traversal sequences and directory separators
  const baseName = fileName.replace(/^.*[\\/]/, "");
  // Replace unsafe characters; allow alphanumeric, dot, hyphen, underscore
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Limit length to 200 characters and prevent hidden/empty files
  const clean = sanitized.replace(/^\.+/, "");
  return clean.slice(0, 200) || "document";
}

export function generateStoragePath(
  studentId: string,
  documentId: string,
  extension: string
): string {
  const safeExt = extension.replace(/^\./, "").toLowerCase();
  // Safe, server-controlled path isolated per student
  return `students/${studentId}/${documentId}.${safeExt}`;
}
