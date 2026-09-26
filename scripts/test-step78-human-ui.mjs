// scripts/test-step78-human-ui.mjs
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const results = [];
function record(name, expected, actual, category = "STEP78_HUMAN_UI") {
  const pass = expected === actual;
  results.push({ name, expected, actual, pass, category });
  const mark = pass ? "✓" : "✗";
  console.log(`${mark} [${category}] ${name}`);
  if (!pass) {
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
  }
}

async function main() {
  console.log("==================================================");
  console.log("STEP 78: HUMAN UI, TYPOGRAPHY & ICONOGRAPHY AUDIT");
  console.log("==================================================");

  // --- PART 1: FAVICON & BROWSER BRANDING ---
  console.log("\n--- PART 1: FAVICON & BROWSER BRANDING ---");
  const faviconIcoExists = fs.existsSync(path.resolve("app/favicon.ico"));
  record("1. app/favicon.ico exists", true, faviconIcoExists);

  const publicFaviconExists = fs.existsSync(path.resolve("public/favicon.ico"));
  record("2. public/favicon.ico exists", true, publicFaviconExists);

  const iconPngExists = fs.existsSync(path.resolve("app/icon.png"));
  record("3. app/icon.png exists", true, iconPngExists);

  const appleIconPngExists = fs.existsSync(path.resolve("app/apple-icon.png"));
  record("4. app/apple-icon.png exists", true, appleIconPngExists);

  const ghsLogoPngExists = fs.existsSync(path.resolve("public/images/ghs-logo.png"));
  record("5. public/images/ghs-logo.png compact source exists", true, ghsLogoPngExists);

  const layoutContent = fs.readFileSync(path.resolve("app/layout.tsx"), "utf-8");
  record("6. app/layout.tsx references icons metadata", true, layoutContent.includes("icons:"));
  record("7. app/layout.tsx configures icon.png", true, layoutContent.includes("/icon.png"));
  record("8. app/layout.tsx configures apple-icon.png", true, layoutContent.includes("/apple-icon.png"));

  // --- PART 2: TYPOGRAPHY SYSTEM ---
  console.log("\n--- PART 2: TYPOGRAPHY SYSTEM ---");
  record("9. app/layout.tsx imports Plus_Jakarta_Sans", true, layoutContent.includes("Plus_Jakarta_Sans"));
  record("10. app/layout.tsx configures --font-sans variable", true, layoutContent.includes("--font-sans"));

  const globalsCss = fs.readFileSync(path.resolve("app/globals.css"), "utf-8");
  record("11. globals.css declares Plus Jakarta Sans font family", true, globalsCss.includes("Plus Jakarta Sans"));
  record("12. globals.css defines GHS Yellow #FFD618", true, globalsCss.includes("#FFD618"));
  record("13. globals.css defines GHS Red #BF120E", true, globalsCss.includes("#BF120E"));
  record("14. globals.css defines GHS Dark #1B1B1B", true, globalsCss.includes("#1B1B1B"));
  record("15. globals.css defines GHS Light Border #EEEEEE", true, globalsCss.includes("#EEEEEE"));
  record("16. globals.css defines GHS Light BG #F3F3F3", true, globalsCss.includes("#F3F3F3"));

  // --- PART 3: SIDEBAR & HEADER REFINEMENT ---
  console.log("\n--- PART 3: SIDEBAR & HEADER REFINEMENT ---");
  const sidebarContent = fs.readFileSync(path.resolve("components/layout/app-sidebar.tsx"), "utf-8");
  record("17. app-sidebar uses compact GHS logo", true, sidebarContent.includes("/images/ghs-logo.png"));
  record("18. app-sidebar active state uses GHS red #BF120E", true, sidebarContent.includes("bg-[#BF120E]"));
  record("19. app-sidebar maintains student Laporan suppression contract", true, sidebarContent.includes('if (isStudent && item.label === "Laporan")'));

  const headerContent = fs.readFileSync(path.resolve("components/layout/app-header.tsx"), "utf-8");
  record("20. app-header has clean institutional typography", true, headerContent.includes("text-[#1B1B1B]"));
  record("21. app-header does not have non-functional notification bell", false, headerContent.includes("Bell className"));

  const shellContent = fs.readFileSync(path.resolve("components/layout/app-shell.tsx"), "utf-8");
  record("22. app-shell maintains getInitials contract", true, shellContent.includes("getInitials(user.name, user.email)"));

  // --- PART 4: LOGIN & ACTIVATION REFINEMENT ---
  console.log("\n--- PART 4: LOGIN & ACTIVATION REFINEMENT ---");
  const loginContent = fs.readFileSync(path.resolve("app/login/page.tsx"), "utf-8");
  record("23. login page uses full GHS logo", true, loginContent.includes("/images/ghs-logo.png"));
  record("24. login page maintains truthful hospitality illustration alt", true, loginContent.includes('alt="Ilustrasi Fasilitas Pelatihan Perhotelan & Kapal Pesiar"'));
  record("25. login page uses moderate radius inputs", true, loginContent.includes("rounded-md border border-[#EEEEEE]"));
  record("26. login page submit button uses GHS red", true, loginContent.includes("bg-[#BF120E]"));

  const activateContent = fs.readFileSync(path.resolve("app/activate/page.tsx"), "utf-8");
  record("27. activate page uses moderate radius inputs", true, activateContent.includes("rounded-md border border-[#EEEEEE]"));
  record("28. activate page submit button uses GHS red", true, activateContent.includes("bg-[#BF120E]"));

  // --- PART 5: DASHBOARDS, PROFILE & REPORTS REFINEMENT ---
  console.log("\n--- PART 5: DASHBOARDS, PROFILE & REPORTS REFINEMENT ---");
  const statCardContent = fs.readFileSync(path.resolve("components/dashboard/stat-card.tsx"), "utf-8");
  record("29. StatCard supports optional icon", true, statCardContent.includes("icon?:"));
  record("30. StatCard uses moderate rounded-lg", true, statCardContent.includes("rounded-lg border border-[#EEEEEE]"));

  const studentProfileContent = fs.readFileSync(path.resolve("components/profile/student-profile-page.tsx"), "utf-8");
  record("31. student-profile-page uses moderate rounded-lg", true, studentProfileContent.includes("rounded-lg border border-[#EEEEEE]"));
  record("32. student-profile-page maintains data-testid='student-profile-academic'", true, studentProfileContent.includes('data-testid="student-profile-academic"'));

  const studentDashContent = fs.readFileSync(path.resolve("components/dashboard/student-dashboard.tsx"), "utf-8");
  record("33. student-dashboard maintains data-testid='student-certificates-loading'", true, studentDashContent.includes('data-testid="student-certificates-loading"'));
  record("34. student-dashboard maintains data-testid='student-certificates-empty'", true, studentDashContent.includes('data-testid="student-certificates-empty"'));

  const reportsContent = fs.readFileSync(path.resolve("components/reports/reports-page.tsx"), "utf-8");
  record("35. reports-page uses GHS red #BF120E for active tab", true, reportsContent.includes("border-[#BF120E] text-[#BF120E]"));
  record("36. reports-page maintains tab-academic testid", true, reportsContent.includes('data-testid="tab-academic"'));

  // --- PART 6: DATABASE BASELINE AUDIT ---
  console.log("\n--- PART 6: DATABASE BASELINE AUDIT ---");
  const usersCount = await prisma.user.count();
  const instructorsCount = await prisma.instructor.count();
  const programsCount = await prisma.program.count();
  const batchesCount = await prisma.batch.count();
  const studentsCount = await prisma.student.count();
  const enrollmentsCount = await prisma.enrollment.count();
  const subjectsCount = await prisma.subject.count();
  const classesCount = await prisma.class.count();
  const schedulesCount = await prisma.schedule.count();
  const employersCount = await prisma.employer.count();
  const vacanciesCount = await prisma.vacancy.count();
  const applicationsCount = await prisma.application.count();
  const interviewsCount = await prisma.interview.count();
  const placementsCount = await prisma.placement.count();
  const documentsCount = await prisma.document.count();
  const certificatesCount = await prisma.certificate.count();

  record("37. Baseline Users = 2", 2, usersCount, "BASELINE");
  record("38. Baseline Instructors = 6", 6, instructorsCount, "BASELINE");
  record("39. Baseline Programs = 1", 1, programsCount, "BASELINE");
  record("40. Baseline Batches = 2", 2, batchesCount, "BASELINE");
  record("41. Baseline Students = 21", 21, studentsCount, "BASELINE");
  record("42. Baseline Enrollments = 21", 21, enrollmentsCount, "BASELINE");
  record("43. Baseline Subjects = 6", 6, subjectsCount, "BASELINE");
  record("44. Baseline Classes = 10", 10, classesCount, "BASELINE");
  record("45. Baseline Schedules = 10", 10, schedulesCount, "BASELINE");
  record("46. Baseline Employers = 0", 0, employersCount, "BASELINE");
  record("47. Baseline Vacancies = 0", 0, vacanciesCount, "BASELINE");
  record("48. Baseline Applications = 0", 0, applicationsCount, "BASELINE");
  record("49. Baseline Interviews = 0", 0, interviewsCount, "BASELINE");
  record("50. Baseline Placements = 0", 0, placementsCount, "BASELINE");
  record("51. Baseline Documents = 0", 0, documentsCount, "BASELINE");
  record("52. Baseline Certificates = 0", 0, certificatesCount, "BASELINE");

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;

  console.log("\n==================================================");
  console.log(`STEP 78 TEST SUMMARY: ${passed}/${total} PASSED`);
  if (failed > 0) {
    console.error(`FAILED ASSERTIONS: ${failed}`);
    process.exit(1);
  } else {
    console.log("ALL ASSERTIONS PASSED!");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
