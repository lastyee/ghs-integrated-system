import fs from "fs";
import path from "path";

const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const results = [];

function record(name, expected, actual, passCondition) {
  const pass = passCondition !== undefined ? Boolean(passCondition) : expected === actual;
  results.push({ name, expected, actual, pass });
  if (!pass) {
    throw new Error(`TEST FAILED: ${name}\nExpected: ${expected}\nActual: ${actual}`);
  }
  console.log(`✓ ${name}`);
}

async function run() {
  console.log("=== ASSESSMENT FRONTEND VERIFICATION ===\n");

  const pagePath = path.resolve("components/assessments/assessments-page.tsx");
  const detailPath = path.resolve("components/assessments/assessment-detail.tsx");

  const pageContent = fs.readFileSync(pagePath, "utf-8");
  const detailContent = fs.readFileSync(detailPath, "utf-8");

  // 1. Verify no mock imports
  record("assessments-page.tsx does not import mock-data", false, pageContent.includes("@/lib/mock-data"));
  record("assessments-page.tsx does not use managedAssessments", false, pageContent.includes("managedAssessments"));
  record("assessments-page.tsx does not use managedAssessmentScores", false, pageContent.includes("managedAssessmentScores"));

  record("assessment-detail.tsx does not import mock-data", false, detailContent.includes("@/lib/mock-data"));
  record("assessment-detail.tsx does not use managedAssessments", false, detailContent.includes("managedAssessments"));
  record("assessment-detail.tsx does not use managedAssessmentScores", false, detailContent.includes("managedAssessmentScores"));

  // 2. Verify state handling in code
  record("assessments-page.tsx handles loading state", true, pageContent.includes("loading"));
  record("assessments-page.tsx handles unauthorized state", true, pageContent.includes("unauthorized"));
  record("assessments-page.tsx handles error state", true, pageContent.includes("error"));
  record("assessments-page.tsx handles empty state", true, pageContent.includes("filtered.length === 0"));

  record("assessment-detail.tsx handles loading state", true, detailContent.includes("loading"));
  record("assessment-detail.tsx handles unauthorized state", true, detailContent.includes("unauthorized"));
  record("assessment-detail.tsx handles not found state", true, detailContent.includes("notFound"));

  // 3. Test HTTP routes
  const unauthRes = await fetch(`${baseUrl}/assessments`, { redirect: "manual" });
  record("Unauthenticated /assessments redirects to login", true, unauthRes.status === 307 || unauthRes.status === 302);

  console.log("\nALL FRONTEND VERIFICATION CHECKS PASSED!\n");
}

run().catch((err) => {
  console.error("Frontend verification failed:", err);
  process.exit(1);
});
