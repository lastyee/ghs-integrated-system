import assert from "node:assert/strict";
import {
  ASSIGNMENT_MAX_FILE_SIZE,
  validateAssignmentFileConstraints,
  validateAssignmentFileSignature,
} from "../schemas/assignment-file.ts";

console.log("=== RUNNING ASSIGNMENT FILE VALIDATION SUITE ===\n");

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Helpers to generate synthetic binary buffers
function makeZip(names) {
  const chunks = [];
  for (const name of names) {
    const nameBuf = Buffer.from(name, "utf8");
    const header = Buffer.alloc(30 + nameBuf.length);
    header.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(0, 18);
    header.writeUInt32LE(0, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
    nameBuf.copy(header, 30);
    chunks.push(header);
  }
  return Buffer.concat(chunks);
}

const OLE_HEADER = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const OLE_WORD_STREAM = Buffer.from("WordDocument", "utf16le");
const OLE_PPT_STREAM = Buffer.from("PowerPoint Document", "utf16le");

function makeOleDoc() {
  return Buffer.concat([OLE_HEADER, Buffer.alloc(64), OLE_WORD_STREAM, Buffer.alloc(64)]);
}

function makeOlePpt() {
  return Buffer.concat([OLE_HEADER, Buffer.alloc(64), OLE_PPT_STREAM, Buffer.alloc(64)]);
}

function makePdf() {
  return Buffer.from("%PDF-1.7\nSample PDF stream content");
}

function makePng() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("IHDR..."),
  ]);
}

function makeJpg() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("JFIF..."),
  ]);
}

// -------------------------------------------------------------
// 1. FILE CONSTRAINTS TESTS
// -------------------------------------------------------------

test("Constraints: rejects empty file", () => {
  const res = validateAssignmentFileConstraints({
    name: "task.pdf",
    size: 0,
    type: "application/pdf",
  });
  assert.equal(res.valid, false);
  assert.match(res.error, /tidak boleh kosong/i);
});

test("Constraints: rejects file exceeding 10 MB", () => {
  const res = validateAssignmentFileConstraints({
    name: "large_presentation.pptx",
    size: ASSIGNMENT_MAX_FILE_SIZE + 1,
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  assert.equal(res.valid, false);
  assert.match(res.error, /melebihi batas maksimum 10 MB/i);
});

test("Constraints: accepts file exactly 10 MB", () => {
  const res = validateAssignmentFileConstraints({
    name: "assignment.docx",
    size: ASSIGNMENT_MAX_FILE_SIZE,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assert.equal(res.valid, true);
  assert.equal(res.extension, "docx");
});

test("Constraints: rejects unsupported extension (.exe)", () => {
  const res = validateAssignmentFileConstraints({
    name: "solution.exe",
    size: 5000,
    type: "application/x-msdownload",
  });
  assert.equal(res.valid, false);
  assert.match(res.error, /Format berkas tidak didukung/i);
});

test("Constraints: rejects unsupported extension (.sh)", () => {
  const res = validateAssignmentFileConstraints({
    name: "exploit.sh",
    size: 5000,
    type: "text/x-shellscript",
  });
  assert.equal(res.valid, false);
  assert.match(res.error, /Format berkas tidak didukung/i);
});

test("Constraints: accepts all 8 valid extensions with proper MIME", () => {
  const validCases = [
    { name: "test.pdf", type: "application/pdf", ext: "pdf" },
    { name: "doc1.doc", type: "application/msword", ext: "doc" },
    { name: "doc2.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
    { name: "slides.ppt", type: "application/vnd.ms-powerpoint", ext: "ppt" },
    { name: "slides.pptx", type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx" },
    { name: "photo.jpg", type: "image/jpeg", ext: "jpg" },
    { name: "photo.jpeg", type: "image/jpeg", ext: "jpeg" },
    { name: "diagram.png", type: "image/png", ext: "png" },
  ];

  for (const c of validCases) {
    const res = validateAssignmentFileConstraints({ name: c.name, size: 1024, type: c.type });
    assert.equal(res.valid, true, `Expected valid for ${c.name}`);
    assert.equal(res.extension, c.ext);
  }
});

test("Constraints: rejects MIME and extension mismatch (e.g. .pdf with image/png)", () => {
  const res = validateAssignmentFileConstraints({
    name: "document.pdf",
    size: 1024,
    type: "image/png",
  });
  assert.equal(res.valid, false);
  assert.match(res.error, /tidak sesuai dengan ekstensi berkas/i);
});

test("Constraints: rejects MIME and extension mismatch (e.g. .docx with image/jpeg)", () => {
  const res = validateAssignmentFileConstraints({
    name: "report.docx",
    size: 1024,
    type: "image/jpeg",
  });
  assert.equal(res.valid, false);
  assert.match(res.error, /tidak sesuai dengan ekstensi berkas/i);
});

// -------------------------------------------------------------
// 2. SIGNATURE & STRUCTURE TESTS
// -------------------------------------------------------------

test("Signature: accepts valid PDF buffer", () => {
  const res = validateAssignmentFileSignature(makePdf(), "pdf");
  assert.equal(res.valid, true);
});

test("Signature: rejects fake PDF (text buffer)", () => {
  const res = validateAssignmentFileSignature(Buffer.from("Hello world"), "pdf");
  assert.equal(res.valid, false);
  assert.match(res.error, /bukan dokumen PDF asli/i);
});

test("Signature: accepts valid PNG buffer", () => {
  const res = validateAssignmentFileSignature(makePng(), "png");
  assert.equal(res.valid, true);
});

test("Signature: rejects fake PNG (corrupt header)", () => {
  const res = validateAssignmentFileSignature(Buffer.from([0x89, 0x50, 0x00, 0x00]), "png");
  assert.equal(res.valid, false);
  assert.match(res.error, /bukan gambar PNG asli/i);
});

test("Signature: accepts valid JPEG buffer", () => {
  const res = validateAssignmentFileSignature(makeJpg(), "jpg");
  assert.equal(res.valid, true);
});

test("Signature: rejects fake JPEG", () => {
  const res = validateAssignmentFileSignature(Buffer.from([0x00, 0x00, 0x00]), "jpg");
  assert.equal(res.valid, false);
  assert.match(res.error, /bukan gambar JPEG asli/i);
});

test("Signature: accepts valid OLE DOC (.doc)", () => {
  const res = validateAssignmentFileSignature(makeOleDoc(), "doc");
  assert.equal(res.valid, true);
});

test("Signature: rejects fake DOC (non-OLE header)", () => {
  const res = validateAssignmentFileSignature(Buffer.from("Random text content"), "doc");
  assert.equal(res.valid, false);
  assert.match(res.error, /bukan dokumen Microsoft Word \(\.doc\) berbasis OLE/i);
});

test("Signature: rejects OLE DOC missing WordDocument stream", () => {
  const corruptOle = Buffer.concat([OLE_HEADER, Buffer.alloc(100)]);
  const res = validateAssignmentFileSignature(corruptOle, "doc");
  assert.equal(res.valid, false);
  assert.match(res.error, /tidak memuat stream WordDocument/i);
});

test("Signature: rejects OLE cross-type mismatch (PPT renamed to .doc)", () => {
  const pptBuf = makeOlePpt();
  const res = validateAssignmentFileSignature(pptBuf, "doc");
  assert.equal(res.valid, false);
  assert.match(res.error, /berisi presentasi PowerPoint \(\.ppt\) namun dinamai sebagai Word/i);
});

test("Signature: accepts valid OLE PPT (.ppt)", () => {
  const res = validateAssignmentFileSignature(makeOlePpt(), "ppt");
  assert.equal(res.valid, true);
});

test("Signature: rejects OLE cross-type mismatch (DOC renamed to .ppt)", () => {
  const docBuf = makeOleDoc();
  const res = validateAssignmentFileSignature(docBuf, "ppt");
  assert.equal(res.valid, false);
  assert.match(res.error, /berisi dokumen Word \(\.doc\) namun dinamai sebagai PowerPoint/i);
});

test("Signature: accepts valid OpenXML DOCX (.docx)", () => {
  const docxBuf = makeZip(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
  const res = validateAssignmentFileSignature(docxBuf, "docx");
  assert.equal(res.valid, true);
});

test("Signature: rejects generic ZIP renamed to .docx (no word/ entry)", () => {
  const genericZip = makeZip(["data.csv", "readme.txt"]);
  const res = validateAssignmentFileSignature(genericZip, "docx");
  assert.equal(res.valid, false);
  assert.match(res.error, /tidak memuat komponen Word \(\.docx\)/i);
});

test("Signature: rejects OpenXML cross-type mismatch (PPTX renamed to .docx)", () => {
  const pptxBuf = makeZip(["[Content_Types].xml", "ppt/presentation.xml"]);
  const res = validateAssignmentFileSignature(pptxBuf, "docx");
  assert.equal(res.valid, false);
  assert.match(res.error, /berisi presentasi PowerPoint \(\.pptx\) namun dinamai sebagai Word/i);
});

test("Signature: accepts valid OpenXML PPTX (.pptx)", () => {
  const pptxBuf = makeZip(["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml"]);
  const res = validateAssignmentFileSignature(pptxBuf, "pptx");
  assert.equal(res.valid, true);
});

test("Signature: rejects generic ZIP renamed to .pptx (no ppt/ entry)", () => {
  const genericZip = makeZip(["notes.txt"]);
  const res = validateAssignmentFileSignature(genericZip, "pptx");
  assert.equal(res.valid, false);
  assert.match(res.error, /tidak memuat komponen PowerPoint \(\.pptx\)/i);
});

test("Signature: rejects OpenXML cross-type mismatch (DOCX renamed to .pptx)", () => {
  const docxBuf = makeZip(["[Content_Types].xml", "word/document.xml"]);
  const res = validateAssignmentFileSignature(docxBuf, "pptx");
  assert.equal(res.valid, false);
  assert.match(res.error, /berisi dokumen Word \(\.docx\) namun dinamai sebagai PowerPoint/i);
});

console.log(`\n==================================================`);
console.log(`ALL FILE VALIDATION TESTS FINISHED: ${passed}/${total} PASSED`);
console.log(`==================================================`);

if (passed !== total) {
  process.exit(1);
}
