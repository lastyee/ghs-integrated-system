/**
 * Assignment File Validation Utility
 *
 * Provides strict validation for student assignment uploads and instructor task attachments.
 * Supported formats: PDF, DOC, DOCX, PPT, PPTX, JPG, and PNG.
 * Maximum file size limit: 10 MB.
 *
 * Security features:
 * - Server-side file size, extension, and declared MIME enforcement.
 * - Deep binary magic-byte / file-signature verification.
 * - Structural inspection distinguishing OLE-based DOC vs PPT.
 * - Structural ZIP-container inspection distinguishing OpenXML DOCX vs PPTX.
 * - Safe from MIME spoofing and extension-renaming attacks.
 * - Zero binary payload logging.
 */

export const ASSIGNMENT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const ASSIGNMENT_ALLOWED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "jpg",
  "jpeg",
  "png",
] as const;

export type AssignmentAllowedExtension =
  (typeof ASSIGNMENT_ALLOWED_EXTENSIONS)[number];

export const ASSIGNMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export type AssignmentAllowedMimeType =
  (typeof ASSIGNMENT_ALLOWED_MIME_TYPES)[number];

// Standard extension to allowed MIME types mapping
const EXTENSION_TO_MIMES: Record<AssignmentAllowedExtension, string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  doc: [
    "application/msword",
    "application/x-msword",
    "application/vnd.ms-word",
  ],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/x-zip-compressed",
  ],
  ppt: [
    "application/vnd.ms-powerpoint",
    "application/powerpoint",
    "application/x-mspowerpoint",
  ],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/x-zip-compressed",
  ],
};

export interface FileMetadataInput {
  name: string;
  size: number;
  type: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  extension?: AssignmentAllowedExtension;
}

/**
 * Validates file metadata including size, extension, and MIME consistency.
 */
export function validateAssignmentFileConstraints(
  file: FileMetadataInput,
): ValidationResult {
  if (!file || typeof file.size !== "number" || file.size <= 0) {
    return { valid: false, error: "Berkas wajib diunggah dan tidak boleh kosong." };
  }

  if (file.size > ASSIGNMENT_MAX_FILE_SIZE) {
    return {
      valid: false,
      error: "Ukuran berkas melebihi batas maksimum 10 MB.",
    };
  }

  if (!file.name || typeof file.name !== "string") {
    return { valid: false, error: "Nama berkas tidak valid." };
  }

  const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : "";

  if (
    !ASSIGNMENT_ALLOWED_EXTENSIONS.includes(
      ext as AssignmentAllowedExtension,
    )
  ) {
    return {
      valid: false,
      error:
        "Format berkas tidak didukung. Format yang diizinkan adalah PDF, DOC, DOCX, PPT, PPTX, JPG, dan PNG.",
    };
  }

  const typedExt = ext as AssignmentAllowedExtension;
  const mime = (file.type || "").toLowerCase().trim();

  // Validate declared MIME consistency against extension
  const allowedMimes = EXTENSION_TO_MIMES[typedExt] || [];
  if (mime && !allowedMimes.includes(mime)) {
    return {
      valid: false,
      error: `Tipe MIME (${mime}) tidak sesuai dengan ekstensi berkas .${typedExt}.`,
    };
  }

  return { valid: true, extension: typedExt };
}

/**
 * Scans a ZIP archive buffer and extracts local/central directory file entry names.
 */
export function extractZipEntryNames(buf: Buffer): string[] {
  const entries: string[] = [];
  let offset = 0;
  const maxScan = Math.min(buf.length, 2 * 1024 * 1024); // Scan up to first 2MB

  while (offset + 30 <= buf.length && offset < maxScan) {
    // Local File Header signature: PK\x03\x04
    if (
      buf[offset] === 0x50 &&
      buf[offset + 1] === 0x4b &&
      buf[offset + 2] === 0x03 &&
      buf[offset + 3] === 0x04
    ) {
      const fileNameLength = buf.readUInt16LE(offset + 26);
      const extraFieldLength = buf.readUInt16LE(offset + 28);
      const fileNameStart = offset + 30;
      if (fileNameStart + fileNameLength <= buf.length) {
        entries.push(
          buf.toString("utf8", fileNameStart, fileNameStart + fileNameLength),
        );
      }
      offset = fileNameStart + fileNameLength + extraFieldLength;
      continue;
    }

    // Central Directory Header signature: PK\x01\x02
    if (
      buf[offset] === 0x50 &&
      buf[offset + 1] === 0x4b &&
      buf[offset + 2] === 0x01 &&
      buf[offset + 3] === 0x02
    ) {
      const fileNameLength = buf.readUInt16LE(offset + 28);
      const extraFieldLength = buf.readUInt16LE(offset + 30);
      const commentLength = buf.readUInt16LE(offset + 32);
      const fileNameStart = offset + 46;
      if (fileNameStart + fileNameLength <= buf.length) {
        entries.push(
          buf.toString("utf8", fileNameStart, fileNameStart + fileNameLength),
        );
      }
      offset = fileNameStart + fileNameLength + extraFieldLength + commentLength;
      continue;
    }

    offset++;
  }

  return entries;
}

// OLE Compound File Header (8 bytes): D0 CF 11 E0 A1 B1 1A E1
const OLE_HEADER = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

// Stream signatures inside OLE CFBF (encoded as UTF-16LE in directory sectors)
const OLE_WORD_STREAM = Buffer.from("WordDocument", "utf16le");
const OLE_PPT_STREAM_1 = Buffer.from("PowerPoint Document", "utf16le");
const OLE_PPT_STREAM_2 = Buffer.from("Current User", "utf16le");

/**
 * Validates the binary signature, magic bytes, and internal structures of an assignment file.
 */
export function validateAssignmentFileSignature(
  rawBuffer: Buffer | Uint8Array,
  extension: string,
  _declaredMime?: string,
): { valid: boolean; error?: string } {
  void _declaredMime;
  if (!rawBuffer || rawBuffer.length === 0) {
    return { valid: false, error: "Isi berkas kosong." };
  }

  const buf = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
  const ext = extension.replace(/^\./, "").toLowerCase().trim();

  // 1. PDF: starts with %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (ext === "pdf") {
    if (
      buf.length < 5 ||
      buf[0] !== 0x25 || // %
      buf[1] !== 0x50 || // P
      buf[2] !== 0x44 || // D
      buf[3] !== 0x46 || // F
      buf[4] !== 0x2d    // -
    ) {
      return {
        valid: false,
        error: "Signature berkas tidak valid. Berkas bukan dokumen PDF asli.",
      };
    }
    return { valid: true };
  }

  // 2. PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  if (ext === "png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (
      buf.length < 8 ||
      !pngSignature.every((byte, idx) => buf[idx] === byte)
    ) {
      return {
        valid: false,
        error: "Signature berkas tidak valid. Berkas bukan gambar PNG asli.",
      };
    }
    return { valid: true };
  }

  // 3. JPEG: starts with FF D8 FF
  if (["jpg", "jpeg"].includes(ext)) {
    if (
      buf.length < 3 ||
      buf[0] !== 0xff ||
      buf[1] !== 0xd8 ||
      buf[2] !== 0xff
    ) {
      return {
        valid: false,
        error: "Signature berkas tidak valid. Berkas bukan gambar JPEG asli.",
      };
    }
    return { valid: true };
  }

  // 4. DOC (Legacy Word 97-2003, OLE Compound File)
  if (ext === "doc") {
    if (buf.length < 8 || !buf.subarray(0, 8).equals(OLE_HEADER)) {
      return {
        valid: false,
        error:
          "Signature berkas tidak valid. Berkas bukan dokumen Microsoft Word (.doc) berbasis OLE yang sah.",
      };
    }

    const hasWordStream = buf.includes(OLE_WORD_STREAM);
    const hasPptStream =
      buf.includes(OLE_PPT_STREAM_1) || buf.includes(OLE_PPT_STREAM_2);

    if (hasPptStream && !hasWordStream) {
      return {
        valid: false,
        error:
          "Ketidaksesuaian struktur berkas: Berkas berisi presentasi PowerPoint (.ppt) namun dinamai sebagai Word (.doc).",
      };
    }

    if (!hasWordStream) {
      return {
        valid: false,
        error:
          "Struktur berkas OLE tidak memuat stream WordDocument yang valid.",
      };
    }

    return { valid: true };
  }

  // 5. PPT (Legacy PowerPoint 97-2003, OLE Compound File)
  if (ext === "ppt") {
    if (buf.length < 8 || !buf.subarray(0, 8).equals(OLE_HEADER)) {
      return {
        valid: false,
        error:
          "Signature berkas tidak valid. Berkas bukan presentasi Microsoft PowerPoint (.ppt) berbasis OLE yang sah.",
      };
    }

    const hasWordStream = buf.includes(OLE_WORD_STREAM);
    const hasPptStream =
      buf.includes(OLE_PPT_STREAM_1) || buf.includes(OLE_PPT_STREAM_2);

    if (hasWordStream && !hasPptStream) {
      return {
        valid: false,
        error:
          "Ketidaksesuaian struktur berkas: Berkas berisi dokumen Word (.doc) namun dinamai sebagai PowerPoint (.ppt).",
      };
    }

    if (!hasPptStream) {
      return {
        valid: false,
        error:
          "Struktur berkas OLE tidak memuat stream PowerPoint yang valid.",
      };
    }

    return { valid: true };
  }

  // 6. DOCX (Microsoft Word OpenXML Document - ZIP Container)
  if (ext === "docx") {
    // Must start with PK\x03\x04
    if (
      buf.length < 4 ||
      buf[0] !== 0x50 ||
      buf[1] !== 0x4b ||
      buf[2] !== 0x03 ||
      buf[3] !== 0x04
    ) {
      return {
        valid: false,
        error:
          "Signature berkas tidak valid. Berkas bukan dokumen Word (.docx) berbasis OpenXML yang sah.",
      };
    }

    const entries = extractZipEntryNames(buf);
    const hasWordEntry = entries.some(
      (entry) =>
        entry.startsWith("word/") ||
        entry.includes("wordprocessingml") ||
        entry === "word/document.xml",
    );
    const hasPptEntry = entries.some(
      (entry) =>
        entry.startsWith("ppt/") ||
        entry.includes("presentationml") ||
        entry === "ppt/presentation.xml",
    );

    if (hasPptEntry && !hasWordEntry) {
      return {
        valid: false,
        error:
          "Ketidaksesuaian struktur berkas: Berkas berisi presentasi PowerPoint (.pptx) namun dinamai sebagai Word (.docx).",
      };
    }

    if (!hasWordEntry) {
      return {
        valid: false,
        error:
          "Struktur ZIP tidak memuat komponen Word (.docx) yang valid (word/document.xml).",
      };
    }

    return { valid: true };
  }

  // 7. PPTX (Microsoft PowerPoint OpenXML Presentation - ZIP Container)
  if (ext === "pptx") {
    // Must start with PK\x03\x04
    if (
      buf.length < 4 ||
      buf[0] !== 0x50 ||
      buf[1] !== 0x4b ||
      buf[2] !== 0x03 ||
      buf[3] !== 0x04
    ) {
      return {
        valid: false,
        error:
          "Signature berkas tidak valid. Berkas bukan presentasi PowerPoint (.pptx) berbasis OpenXML yang sah.",
      };
    }

    const entries = extractZipEntryNames(buf);
    const hasWordEntry = entries.some(
      (entry) =>
        entry.startsWith("word/") ||
        entry.includes("wordprocessingml") ||
        entry === "word/document.xml",
    );
    const hasPptEntry = entries.some(
      (entry) =>
        entry.startsWith("ppt/") ||
        entry.includes("presentationml") ||
        entry === "ppt/presentation.xml",
    );

    if (hasWordEntry && !hasPptEntry) {
      return {
        valid: false,
        error:
          "Ketidaksesuaian struktur berkas: Berkas berisi dokumen Word (.docx) namun dinamai sebagai PowerPoint (.pptx).",
      };
    }

    if (!hasPptEntry) {
      return {
        valid: false,
        error:
          "Struktur ZIP tidak memuat komponen PowerPoint (.pptx) yang valid (ppt/presentation.xml).",
      };
    }

    return { valid: true };
  }

  return {
    valid: false,
    error: `Format berkas .${ext} tidak dikenali untuk penugasan.`,
  };
}
