import { z } from "zod";
import { DocumentStatus } from "@prisma/client";

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;

export function validateFileConstraints(file: {
  name: string;
  size: number;
  type: string;
}): {
  valid: boolean;
  error?: string;
  extension?: string;
} {
  if (!file || typeof file.size !== "number" || file.size <= 0) {
    return { valid: false, error: "File is required and must not be empty." };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: "File size exceeds maximum allowed limit of 5 MB.",
    };
  }

  const mime = file.type ? file.type.toLowerCase() : "";
  if (!ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      valid: false,
      error: "Unsupported file type. Allowed types are PDF, JPEG, and PNG.",
    };
  }

  const extMatch = file.name ? file.name.match(/\.([a-zA-Z0-9]+)$/) : null;
  const ext = extMatch ? extMatch[1].toLowerCase() : "";

  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return {
      valid: false,
      error:
        "Unsupported file extension. Allowed extensions are .pdf, .jpg, .jpeg, and .png.",
    };
  }

  // Verify consistency between MIME type and file extension
  if (mime === "application/pdf" && ext !== "pdf") {
    return {
      valid: false,
      error: "File extension does not match MIME type (expected .pdf).",
    };
  }
  if (mime === "image/jpeg" && !["jpg", "jpeg"].includes(ext)) {
    return {
      valid: false,
      error:
        "File extension does not match MIME type (expected .jpg or .jpeg).",
    };
  }
  if (mime === "image/png" && ext !== "png") {
    return {
      valid: false,
      error: "File extension does not match MIME type (expected .png).",
    };
  }

  return { valid: true, extension: ext };
}

export function validateFileSignature(
  buffer: Buffer | Uint8Array,
  extension: string,
  declaredMime: string
): { valid: boolean; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "File content is empty." };
  }

  const ext = extension.replace(/^\./, "").toLowerCase();
  const mime = declaredMime.toLowerCase();

  // 1. PDF: MIME application/pdf, extension .pdf, starts with %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  if (ext === "pdf" || mime === "application/pdf") {
    if (ext !== "pdf" || mime !== "application/pdf") {
      return {
        valid: false,
        error: "MIME type and file extension mismatch for PDF.",
      };
    }
    if (
      buffer.length < 5 ||
      buffer[0] !== 0x25 || // %
      buffer[1] !== 0x50 || // P
      buffer[2] !== 0x44 || // D
      buffer[3] !== 0x46 || // F
      buffer[4] !== 0x2d    // -
    ) {
      return {
        valid: false,
        error: "Invalid file signature. File is not a valid PDF document.",
      };
    }
    return { valid: true };
  }

  // 2. PNG: MIME image/png, extension .png, starts with 89 50 4E 47 0D 0A 1A 0A
  if (ext === "png" || mime === "image/png") {
    if (ext !== "png" || mime !== "image/png") {
      return {
        valid: false,
        error: "MIME type and file extension mismatch for PNG.",
      };
    }
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (
      buffer.length < 8 ||
      !pngSignature.every((byte, idx) => buffer[idx] === byte)
    ) {
      return {
        valid: false,
        error: "Invalid file signature. File is not a valid PNG image.",
      };
    }
    return { valid: true };
  }

  // 3. JPEG: MIME image/jpeg, extensions .jpg / .jpeg, starts with FF D8 FF
  if (["jpg", "jpeg"].includes(ext) || mime === "image/jpeg") {
    if (!["jpg", "jpeg"].includes(ext) || mime !== "image/jpeg") {
      return {
        valid: false,
        error: "MIME type and file extension mismatch for JPEG.",
      };
    }
    if (
      buffer.length < 3 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[2] !== 0xff
    ) {
      return {
        valid: false,
        error: "Invalid file signature. File is not a valid JPEG image.",
      };
    }
    return { valid: true };
  }

  return {
    valid: false,
    error: "Unsupported file format.",
  };
}

export const documentTypeSchema = z
  .string()
  .trim()
  .min(1, "Document type cannot be empty.")
  .max(100, "Document type must be 100 characters or fewer.");

export const verifyDocumentSchema = z
  .object({
    status: z.enum(["VERIFIED", "REJECTED"]),
    rejectionReason: z.string().trim().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "REJECTED") {
      if (!data.rejectionReason || data.rejectionReason.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rejectionReason"],
          message: "Rejection reason is required when rejecting a document.",
        });
      }
    }
  });

export const documentQuerySchema = z.object({
  studentId: z.string().trim().optional(),
  status: z.nativeEnum(DocumentStatus).optional(),
  type: z.string().trim().optional(),
});
