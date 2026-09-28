import { PrismaClient } from "@prisma/client";
import { assertSafeMutationTarget } from "./lib/test-safety.mjs";

const prisma = new PrismaClient();
const fixtureModels = [
  "assessmentScore",
  "assessment",
  "attendance",
  "schedule",
  "class",
  "certificate",
  "placement",
  "interview",
  "application",
  "vacancy",
  "employer",
  "document",
  "user",
];

async function main() {
  assertSafeMutationTarget({
    mutationFlag: "CLEAN_DB_ALLOW_DESTRUCTIVE",
    expectedDatabase: "ghs_integrated_test",
    confirmationFlag: "CLEAN_DB_CONFIRM_DATABASE",
  });

  const fixtureIdsJson = process.env.CLEAN_DB_FIXTURE_IDS_JSON;
  if (!fixtureIdsJson) {
    throw new Error("CLEAN_DB_FIXTURE_IDS_JSON must contain exact IDs created by the test invocation.");
  }

  let fixtureIds;
  try {
    fixtureIds = JSON.parse(fixtureIdsJson);
  } catch {
    throw new Error("CLEAN_DB_FIXTURE_IDS_JSON must be valid JSON.");
  }
  if (!fixtureIds || typeof fixtureIds !== "object" || Array.isArray(fixtureIds)) {
    throw new Error("CLEAN_DB_FIXTURE_IDS_JSON must be an object keyed by Prisma model.");
  }
  const unknownModels = Object.keys(fixtureIds).filter((model) => !fixtureModels.includes(model));
  if (unknownModels.length) {
    throw new Error(`Fixture cleanup does not allow these models: ${unknownModels.join(", ")}.`);
  }
  for (const [model, ids] of Object.entries(fixtureIds)) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string" || !id.trim())) {
      throw new Error(`${model} fixture IDs must be a non-empty array of exact IDs.`);
    }
  }

  console.warn("Cleaning only exact fixture IDs from the disposable ghs_integrated_test database; AuditLogs are retained.");
  for (const model of fixtureModels) {
    const ids = fixtureIds[model];
    if (!ids) continue;
    const result = await prisma[model].deleteMany({ where: { id: { in: ids } } });
    console.log(`${model}: deleted ${result.count} exact fixture row(s).`);
  }

  const [u, i, pr, b, st, e, su, c, sc, em, v, a, it, pl, d, ce] = await Promise.all([
    prisma.user.count(),
    prisma.instructor.count(),
    prisma.program.count(),
    prisma.batch.count(),
    prisma.student.count(),
    prisma.enrollment.count(),
    prisma.subject.count(),
    prisma.class.count(),
    prisma.schedule.count(),
    prisma.employer.count(),
    prisma.vacancy.count(),
    prisma.application.count(),
    prisma.interview.count(),
    prisma.placement.count(),
    prisma.document.count(),
    prisma.certificate.count(),
  ]);

  console.log("BASELINE VERIFICATION:", JSON.stringify({
    users: u, instructors: i, programs: pr, batches: b, students: st,
    enrollments: e, subjects: su, classes: c, schedules: sc, employers: em,
    vacancies: v, applications: a, interviews: it, placements: pl,
    documents: d, certificates: ce,
  }, null, 2));

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error("Disposable fixture cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
