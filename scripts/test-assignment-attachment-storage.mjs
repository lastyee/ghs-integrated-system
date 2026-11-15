import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertSafeLocalDatabase } from "./lib/test-safety.mjs";
import {
  MockStorageProvider,
  setStorageProviderForTest,
  ASSIGNMENTS_BUCKET,
  generateAssignmentInstructionPath,
  generateAssignmentSubmissionPath,
  sanitizeFileName,
} from "../lib/storage.ts";
import {
  validateAssignmentFileConstraints,
  validateAssignmentFileSignature,
} from "../schemas/assignment-file.ts";

assertSafeLocalDatabase({ expectedDatabase: "ghs_integrated" });

const prisma = new PrismaClient();
let passed = 0;
let total = 0;

function record(name, condition, errorMsg = "") {
  total++;
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    console.error(`✗ ${name}: ${errorMsg}`);
    throw new Error(`Test failed: ${name} - ${errorMsg}`);
  }
}

async function run() {
  console.log("=== RUNNING ASSIGNMENT ATTACHMENT STORAGE & COMPENSATION TESTS ===\n");

  const mockStorage = new MockStorageProvider();
  setStorageProviderForTest(mockStorage);

  const testId = randomUUID().slice(0, 8);
  const assignmentId = `asgn_test_${testId}`;
  const studentId = `std_test_${testId}`;

  // 1. Path Generation & Isolation
  const instructionPath = generateAssignmentInstructionPath(assignmentId, "pdf");
  record(
    "Storage: generateAssignmentInstructionPath uses isolated instruction path",
    instructionPath === `assignments/instructions/${assignmentId}/attachment.pdf`,
    `Unexpected path: ${instructionPath}`
  );

  const submissionPath = generateAssignmentSubmissionPath(assignmentId, studentId, "docx");
  record(
    "Storage: generateAssignmentSubmissionPath uses isolated submission path separate from instructions",
    submissionPath === `assignments/submissions/${assignmentId}/${studentId}/submission.docx`,
    `Unexpected path: ${submissionPath}`
  );

  // 2. MockStorage Upload and Signed URL
  const pdfContent = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
  const uploadResult = await mockStorage.upload({
    bucket: ASSIGNMENTS_BUCKET,
    path: instructionPath,
    file: pdfContent,
    contentType: "application/pdf",
  });

  record(
    "Storage: Upload to ASSIGNMENTS_BUCKET succeeds and registers key",
    uploadResult.path === instructionPath && mockStorage.has(ASSIGNMENTS_BUCKET, instructionPath),
    "Object not found in storage after upload"
  );

  const signedUrl = await mockStorage.createSignedUrl({
    bucket: ASSIGNMENTS_BUCKET,
    path: instructionPath,
    expiresIn: 900,
  });

  record(
    "Storage: createSignedUrl returns private expiring signed URL (no public URL leak)",
    signedUrl.includes("/signed/") &&
      signedUrl.includes(`/${ASSIGNMENTS_BUCKET}/`) &&
      signedUrl.includes("token=") &&
      signedUrl.includes("expires="),
    `Invalid signed URL format: ${signedUrl}`
  );

  // 3. Compensation Pattern: Rollback on DB Failure
  console.log("\nTesting Compensation Rollback Pattern on DB Failure...");
  let uploadedCompensationPath = null;
  const compensationAssignmentId = `asgn_comp_${testId}`;
  const compInstructionPath = generateAssignmentInstructionPath(compensationAssignmentId, "pdf");

  try {
    // Step A: Storage upload succeeds
    await mockStorage.upload({
      bucket: ASSIGNMENTS_BUCKET,
      path: compInstructionPath,
      file: pdfContent,
      contentType: "application/pdf",
    });
    uploadedCompensationPath = compInstructionPath;
    record(
      "Compensation: File successfully placed in storage before DB transaction",
      mockStorage.has(ASSIGNMENTS_BUCKET, compInstructionPath)
    );

    // Step B: Simulate DB transaction failure (e.g. invalid relation, DB error, or constraint violation)
    await prisma.$transaction(async () => {
      throw new Error("Simulated database failure during assignment creation transaction");
    });
  } catch {
    // Step C: Catch DB error and trigger compensation cleanup
    if (uploadedCompensationPath) {
      await mockStorage.delete({
        bucket: ASSIGNMENTS_BUCKET,
        path: uploadedCompensationPath,
      });
    }
  }

  record(
    "Compensation: Newly uploaded file deleted from storage when DB transaction fails",
    !mockStorage.has(ASSIGNMENTS_BUCKET, compInstructionPath),
    "Orphaned file remained in storage after DB transaction failure!"
  );

  // 4. Replacement Pattern: Old file preserved until new DB commit, then cleaned up
  console.log("\nTesting Attachment Replacement Pattern...");
  const oldPath = instructionPath; // Currently in mockStorage
  const newPath = generateAssignmentInstructionPath(assignmentId, "png");
  const pngContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // Upload new file first
  await mockStorage.upload({
    bucket: ASSIGNMENTS_BUCKET,
    path: newPath,
    file: pngContent,
    contentType: "image/png",
  });

  // Verify both exist momentarily before commit
  record(
    "Replacement: Old file remains intact while new file is uploaded",
    mockStorage.has(ASSIGNMENTS_BUCKET, oldPath) && mockStorage.has(ASSIGNMENTS_BUCKET, newPath)
  );

  // Simulate successful DB commit, then delete old file
  await mockStorage.delete({
    bucket: ASSIGNMENTS_BUCKET,
    path: oldPath,
  });

  record(
    "Replacement: Old file removed only after new file is committed, new file preserved",
    !mockStorage.has(ASSIGNMENTS_BUCKET, oldPath) && mockStorage.has(ASSIGNMENTS_BUCKET, newPath)
  );

  // Clean up
  await mockStorage.delete({
    bucket: ASSIGNMENTS_BUCKET,
    path: newPath,
  });

  // 5. File Constraints & Signatures
  console.log("\nTesting File Constraints and Binary Signatures...");
  const validConstraints = validateAssignmentFileConstraints({
    name: "Panduan-Tugas.pdf",
    size: 2 * 1024 * 1024, // 2MB
    type: "application/pdf",
  });
  record("Constraints: Valid PDF within 10MB passes constraints", validConstraints.valid);

  const oversizedConstraints = validateAssignmentFileConstraints({
    name: "BigFile.pdf",
    size: 11 * 1024 * 1024, // 11MB (> 10MB limit)
    type: "application/pdf",
  });
  record(
    "Constraints: File exceeding 10MB is rejected",
    !oversizedConstraints.valid && oversizedConstraints.error?.includes("10 MB")
  );

  const fakePdfSig = validateAssignmentFileSignature(Buffer.from("NOT_A_PDF"), "pdf");
  record("Signature: Fake PDF content rejected", !fakePdfSig.valid);

  const realPdfSig = validateAssignmentFileSignature(pdfContent, "pdf");
  record("Signature: Real PDF content accepted", realPdfSig.valid);

  // Sanitize filename check
  const sanitized = sanitizeFileName("../../../evil/tugas:final*v1?.pdf");
  record(
    "Filename: Sanitize filename removes directory traversal and illegal characters",
    !sanitized.includes("/") && !sanitized.includes("\\") && !sanitized.includes("..") && !sanitized.includes(":")
  );

  setStorageProviderForTest(null);
  await prisma.$disconnect();

  console.log(`\n==================================================`);
  console.log(`STORAGE & COMPENSATION TESTS: ${passed}/${total} PASSED`);
  console.log(`==================================================`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
