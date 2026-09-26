// scripts/test-step68b-employers-vacancies.mjs
// Step 68B: Employer & Vacancy API Test Suite

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";

const results = [];

function record(name, expected, actual) {
  const passed =
    expected === actual ||
    (typeof expected === "boolean" && Boolean(actual) === expected);
  results.push({ name, expected, actual, passed });
  if (passed) {
    console.log(`✓ ${name}`);
  } else {
    console.error(`✗ ${name}`);
    console.error(`   Expected: ${expected}`);
    console.error(`   Actual:   ${actual}`);
  }
}

function mergeCookies(existingCookies, response) {
  const getSetCookie = response.headers.getSetCookie?.();
  const rawSetCookie =
    getSetCookie || [response.headers.get("set-cookie")].filter(Boolean);
  const cookieMap = new Map();

  if (existingCookies) {
    existingCookies.split(";").forEach((pair) => {
      const trimmed = pair.trim();
      if (!trimmed) return;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        cookieMap.set(
          trimmed.slice(0, idx).trim(),
          trimmed.slice(idx + 1).trim()
        );
      }
    });
  }

  rawSetCookie.forEach((headerVal) => {
    headerVal.split(",").forEach((single) => {
      const part = single.split(";")[0].trim();
      const idx = part.indexOf("=");
      if (idx !== -1) {
        cookieMap.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
      }
    });
  });

  return Array.from(cookieMap.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  return fetch(url, options);
}

async function login(email, password) {
  let cookies = "";
  const csrfRes = await request("/api/auth/csrf");
  cookies = mergeCookies(cookies, csrfRes);
  const { csrfToken } = await csrfRes.json();

  const response = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${baseUrl}/`,
      json: "true",
    }),
    redirect: "manual",
  });
  cookies = mergeCookies(cookies, response);
  if (response.status !== 302 && response.status !== 303) {
    throw new Error(`Login failed for ${email}: HTTP ${response.status}`);
  }
  return cookies;
}

async function run() {
  console.log("=== STEP 68B EMPLOYER & VACANCY API TEST SUITE ===\n");

  const createdUserIds = [];
  const createdEmployerIds = [];
  const createdVacancyIds = [];

  try {
    const tempPassword = "password123!";
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    const roles = await prisma.role.findMany();
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    async function createTempUser(roleName, email) {
      const roleId = roleMap.get(roleName);
      if (!roleId) throw new Error(`Role ${roleName} not found`);
      const user = await prisma.user.create({
        data: {
          email,
          name: `Temp ${roleName}`,
          passwordHash: tempPasswordHash,
          roleId,
        },
      });
      createdUserIds.push(user.id);
      return user;
    }

    const superAdminPassword =
      process.env.DEMO_SUPER_ADMIN_PASSWORD || "superadmin123";
    const studentPassword = process.env.DEMO_STUDENT_PASSWORD || "murid123";

    console.log("1. Authenticating demo users...");
    const superAdminCookies = await login(
      "admin.demo@ghs.local",
      superAdminPassword
    );
    const studentCookies = await login(
      "student.demo@ghs.local",
      studentPassword
    );

    console.log("2. Creating temporary RBAC test users...");
    const adminUser = await createTempUser("ADMIN", "test.admin68b@ghs.test");
    const academicUser = await createTempUser(
      "ACADEMIC_STAFF",
      "test.academic68b@ghs.test"
    );
    const managementUser = await createTempUser(
      "MANAGEMENT",
      "test.management68b@ghs.test"
    );
    const placementUser = await createTempUser(
      "PLACEMENT_STAFF",
      "test.placement68b@ghs.test"
    );
    const instructorUser = await createTempUser(
      "INSTRUCTOR",
      "test.instructor68b@ghs.test"
    );

    const adminCookies = await login(adminUser.email, tempPassword);
    const academicCookies = await login(academicUser.email, tempPassword);
    const managementCookies = await login(managementUser.email, tempPassword);
    const placementCookies = await login(placementUser.email, tempPassword);
    const instructorCookies = await login(instructorUser.email, tempPassword);

    console.log("\n--- EXECUTING REQUIRED TEST SCENARIOS ---\n");

    // ==========================================
    // AUTH (Tests 1 - 2)
    // ==========================================
    console.log("Section: AUTH (1 - 2)");

    // 1. unauthenticated Employer GET -> 401
    const res1 = await request("/api/employers");
    record("1. unauthenticated Employer GET -> 401", 401, res1.status);

    // 2. unauthenticated Vacancy GET -> 401
    const res2 = await request("/api/vacancies");
    record("2. unauthenticated Vacancy GET -> 401", 401, res2.status);

    // ==========================================
    // RBAC: EMPLOYER READ (Tests 3 - 9)
    // ==========================================
    console.log("\nSection: RBAC: EMPLOYER READ (3 - 9)");

    // 3. Super Admin Employer read -> 200
    const res3 = await request("/api/employers", {
      headers: { Cookie: superAdminCookies },
    });
    record("3. Super Admin Employer read -> 200", 200, res3.status);

    // 4. Admin Employer read -> 200
    const res4 = await request("/api/employers", {
      headers: { Cookie: adminCookies },
    });
    record("4. Admin Employer read -> 200", 200, res4.status);

    // 5. Placement Staff Employer read -> 200
    const res5 = await request("/api/employers", {
      headers: { Cookie: placementCookies },
    });
    record("5. Placement Staff Employer read -> 200", 200, res5.status);

    // 6. Management Employer read -> 200
    const res6 = await request("/api/employers", {
      headers: { Cookie: managementCookies },
    });
    record("6. Management Employer read -> 200", 200, res6.status);

    // 7. Academic Staff Employer read -> 403
    const res7 = await request("/api/employers", {
      headers: { Cookie: academicCookies },
    });
    record("7. Academic Staff Employer read -> 403", 403, res7.status);

    // 8. Instructor Employer read -> 403
    const res8 = await request("/api/employers", {
      headers: { Cookie: instructorCookies },
    });
    record("8. Instructor Employer read -> 403", 403, res8.status);

    // 9. Student Employer read -> 403
    const res9 = await request("/api/employers", {
      headers: { Cookie: studentCookies },
    });
    record("9. Student Employer read -> 403", 403, res9.status);

    // ==========================================
    // RBAC: VACANCY READ (Tests 10 - 16)
    // ==========================================
    console.log("\nSection: RBAC: VACANCY READ (10 - 16)");

    // 10. Super Admin Vacancy read -> 200
    const res10 = await request("/api/vacancies", {
      headers: { Cookie: superAdminCookies },
    });
    record("10. Super Admin Vacancy read -> 200", 200, res10.status);

    // 11. Admin Vacancy read -> 200
    const res11 = await request("/api/vacancies", {
      headers: { Cookie: adminCookies },
    });
    record("11. Admin Vacancy read -> 200", 200, res11.status);

    // 12. Placement Staff Vacancy read -> 200
    const res12 = await request("/api/vacancies", {
      headers: { Cookie: placementCookies },
    });
    record("12. Placement Staff Vacancy read -> 200", 200, res12.status);

    // 13. Management Vacancy read -> 200
    const res13 = await request("/api/vacancies", {
      headers: { Cookie: managementCookies },
    });
    record("13. Management Vacancy read -> 200", 200, res13.status);

    // 14. Academic Staff Vacancy read -> 403
    const res14 = await request("/api/vacancies", {
      headers: { Cookie: academicCookies },
    });
    record("14. Academic Staff Vacancy read -> 403", 403, res14.status);

    // 15. Instructor Vacancy read -> 403
    const res15 = await request("/api/vacancies", {
      headers: { Cookie: instructorCookies },
    });
    record("15. Instructor Vacancy read -> 403", 403, res15.status);

    // 16. Student Vacancy read -> 403
    const res16 = await request("/api/vacancies", {
      headers: { Cookie: studentCookies },
    });
    record("16. Student Vacancy read -> 403", 403, res16.status);

    // ==========================================
    // EMPLOYER CRUD (Tests 17 - 23)
    // ==========================================
    console.log("\nSection: EMPLOYER CRUD (17 - 23)");

    // 17. create employer -> 201
    const res17 = await request("/api/employers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        name: "Grand Sukabumi Resort & Spa",
        companyInfo: "Luxury resort partner of GHS Sukabumi.",
        address: "Jl. Raya Pelabuhan Ratu No. 45, Sukabumi",
        contactName: "Bambang Hartono",
        contactEmail: "hrd@grandsukabumi.test",
        contactPhone: "+62 812-3456-7890",
      }),
    });
    record("17. create employer -> 201", 201, res17.status);
    const emp17Data = await res17.json();
    createdEmployerIds.push(emp17Data.id);

    // Create a second employer for relation testing
    const resEmp2 = await request("/api/employers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({
        name: "Nusantara Hospitality Cruise",
        companyInfo: "International cruise line operator.",
        address: "Jakarta Maritime Center",
        contactName: "Sarah Wijaya",
        contactEmail: "recruitment@nusantara-cruise.test",
        contactPhone: "+62 811-9876-5432",
      }),
    });
    const emp2Data = await resEmp2.json();
    createdEmployerIds.push(emp2Data.id);

    // 18. duplicate employer name -> 409
    const res18 = await request("/api/employers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        name: "  Grand Sukabumi Resort & Spa  ", // Duplicate despite spaces
        companyInfo: "Duplicate company attempt",
      }),
    });
    record("18. duplicate employer name -> 409", 409, res18.status);

    // 19. get employer detail -> 200
    const res19 = await request(`/api/employers/${emp17Data.id}`, {
      headers: { Cookie: placementCookies },
    });
    record("19. get employer detail -> 200", 200, res19.status);
    const emp19Data = await res19.json();
    record("19b. employer detail name matches", "Grand Sukabumi Resort & Spa", emp19Data.name);

    // 20. search employer -> 200
    const res20 = await request("/api/employers?search=Sukabumi", {
      headers: { Cookie: managementCookies },
    });
    record("20. search employer -> 200", 200, res20.status);
    const emp20Data = await res20.json();
    const searchMatches = Array.isArray(emp20Data) && emp20Data.some((e) => e.name.includes("Sukabumi"));
    record("20b. search returns matching employer", true, searchMatches);

    // 21. update employer -> 200
    const res21 = await request(`/api/employers/${emp17Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify({
        contactPhone: "+62 812-9999-8888",
        companyInfo: "Updated luxury resort partner of GHS.",
      }),
    });
    record("21. update employer -> 200", 200, res21.status);
    const emp21Data = await res21.json();
    record(
      "21b. updated field reflected",
      "+62 812-9999-8888",
      emp21Data.contactPhone
    );

    // 22. missing employer -> 404
    const res22 = await request("/api/employers/nonexistent-employer-id", {
      headers: { Cookie: adminCookies },
    });
    record("22. missing employer -> 404", 404, res22.status);

    // 23. invalid employer payload -> 400
    const res23 = await request("/api/employers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        name: "", // empty name
        contactEmail: "not-an-email", // invalid email
      }),
    });
    record("23. invalid employer payload -> 400", 400, res23.status);

    // ==========================================
    // VACANCY CRUD (Tests 24 - 32)
    // ==========================================
    console.log("\nSection: VACANCY CRUD (24 - 32)");

    // 24. create vacancy -> 201
    const res24 = await request("/api/vacancies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        employerId: emp17Data.id,
        title: "Commis Chef",
        description: "Bertanggung jawab atas persiapan bahan makanan dan hidangan dasar di kitchen.",
        requirements: "Lulusan Culinary/Food Production, sehat jasmani, disiplin tinggi.",
        status: "OPEN",
      }),
    });
    record("24. create vacancy -> 201", 201, res24.status);
    const vac24Data = await res24.json();
    createdVacancyIds.push(vac24Data.id);

    // Create another vacancy for emp2Data
    const resVac2 = await request("/api/vacancies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        employerId: emp2Data.id,
        title: "Housekeeping Attendant",
        description: "Menjaga kebersihan dan kerapian kabin penumpang kapal pesiar.",
        requirements: "Lulusan Housekeeping, bahasa Inggris komunikatif, paspor aktif.",
        status: "OPEN",
      }),
    });
    const vac2Data = await resVac2.json();
    createdVacancyIds.push(vac2Data.id);

    // 25. create vacancy with missing employer -> 404
    const res25 = await request("/api/vacancies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        employerId: "nonexistent-employer-999",
        title: "Front Office Staff",
        description: "Front office role",
        requirements: "Good English",
      }),
    });
    record("25. create vacancy with missing employer -> 404", 404, res25.status);

    // 26. get vacancy detail -> 200
    const res26 = await request(`/api/vacancies/${vac24Data.id}`, {
      headers: { Cookie: managementCookies },
    });
    record("26. get vacancy detail -> 200", 200, res26.status);
    const vac26Data = await res26.json();
    record("26b. vacancy detail title matches", "Commis Chef", vac26Data.title);
    record("26c. vacancy detail includes employer info", true, Boolean(vac26Data.employer?.name));

    // 27. filter employerId -> 200
    const res27 = await request(`/api/vacancies?employerId=${emp17Data.id}`, {
      headers: { Cookie: placementCookies },
    });
    record("27. filter employerId -> 200", 200, res27.status);
    const vac27Data = await res27.json();
    const allMatchEmployer = Array.isArray(vac27Data) && vac27Data.every((v) => v.employerId === emp17Data.id);
    record("27b. all vacancies match filtered employerId", true, allMatchEmployer && vac27Data.length > 0);

    // 28. filter status OPEN -> 200
    const res28 = await request("/api/vacancies?status=OPEN", {
      headers: { Cookie: adminCookies },
    });
    record("28. filter status OPEN -> 200", 200, res28.status);
    const vac28Data = await res28.json();
    const allOpen = Array.isArray(vac28Data) && vac28Data.every((v) => v.status === "OPEN");
    record("28b. all vacancies have status OPEN", true, allOpen);

    // 29. invalid status filter -> 400
    const res29 = await request("/api/vacancies?status=INVALID_STATUS", {
      headers: { Cookie: adminCookies },
    });
    record("29. invalid status filter -> 400", 400, res29.status);

    // 30. update vacancy -> 200
    const res30 = await request(`/api/vacancies/${vac24Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        title: "Senior Commis Chef",
        description: "Deskripsi diperbarui untuk posisi senior commis chef.",
      }),
    });
    record("30. update vacancy -> 200", 200, res30.status);
    const vac30Data = await res30.json();
    record("30b. updated title reflected", "Senior Commis Chef", vac30Data.title);

    // 31. update employer relation -> 200
    const res31 = await request(`/api/vacancies/${vac24Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        employerId: emp2Data.id,
      }),
    });
    record("31. update employer relation -> 200", 200, res31.status);
    const vac31Data = await res31.json();
    record("31b. employerId successfully changed", emp2Data.id, vac31Data.employerId);

    // 32. missing vacancy -> 404
    const res32 = await request("/api/vacancies/nonexistent-vacancy-999", {
      headers: { Cookie: adminCookies },
    });
    record("32. missing vacancy -> 404", 404, res32.status);

    // ==========================================
    // VACANCY CLOSE (Tests 33 - 35)
    // ==========================================
    console.log("\nSection: VACANCY CLOSE (33 - 35)");

    // 33. close vacancy using vacancy:close -> 200
    const res33 = await request(`/api/vacancies/${vac24Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: placementCookies,
      },
      body: JSON.stringify({
        status: "CLOSED",
      }),
    });
    record("33. close vacancy using vacancy:close -> 200", 200, res33.status);

    // 34. unauthorized role cannot close -> 403
    const res34 = await request(`/api/vacancies/${vac2Data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: managementCookies, // Management has no vacancy:close or vacancy:update
      },
      body: JSON.stringify({
        status: "CLOSED",
      }),
    });
    record("34. unauthorized role cannot close -> 403", 403, res34.status);

    // 35. verify status CLOSED
    const res35 = await request(`/api/vacancies/${vac24Data.id}`, {
      headers: { Cookie: adminCookies },
    });
    const vac35Data = await res35.json();
    record("35. verify status CLOSED", "CLOSED", vac35Data.status);

    // ==========================================
    // DELETE (Tests 36 - 37)
    // ==========================================
    console.log("\nSection: DELETE (36 - 37)");

    // 36. Employer DELETE -> 405
    const res36a = await request("/api/employers", {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("36a. Employer collection DELETE -> 405", 405, res36a.status);

    const res36b = await request(`/api/employers/${emp17Data.id}`, {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("36b. Employer detail DELETE -> 405", 405, res36b.status);

    // 37. Vacancy DELETE -> 405
    const res37a = await request("/api/vacancies", {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("37a. Vacancy collection DELETE -> 405", 405, res37a.status);

    const res37b = await request(`/api/vacancies/${vac24Data.id}`, {
      method: "DELETE",
      headers: { Cookie: superAdminCookies },
    });
    record("37b. Vacancy detail DELETE -> 405", 405, res37b.status);

    // ==========================================
    // AUDIT LOG (Tests 38 - 42)
    // ==========================================
    console.log("\nSection: AUDIT LOG (38 - 42)");

    const auditLogsEmp = await prisma.auditLog.findMany({
      where: { entity: "Employer", entityId: emp17Data.id },
    });
    const auditLogsVac = await prisma.auditLog.findMany({
      where: { entity: "Vacancy", entityId: vac24Data.id },
    });

    // 38. employer create audit
    const empCreateAudit = auditLogsEmp.find((a) => a.action === "CREATE");
    record("38. employer create audit exists", true, Boolean(empCreateAudit));

    // 39. employer update audit
    const empUpdateAudit = auditLogsEmp.find((a) => a.action === "UPDATE");
    record("39. employer update audit exists", true, Boolean(empUpdateAudit));

    // 40. vacancy create audit
    const vacCreateAudit = auditLogsVac.find((a) => a.action === "CREATE");
    record("40. vacancy create audit exists", true, Boolean(vacCreateAudit));

    // 41. vacancy update audit
    const vacUpdateAudit = auditLogsVac.find((a) => a.action === "UPDATE");
    record("41. vacancy update audit exists", true, Boolean(vacUpdateAudit));

    // 42. vacancy close audit
    const vacCloseAudit = auditLogsVac.find((a) => a.action === "CLOSE");
    record("42. vacancy close audit exists", true, Boolean(vacCloseAudit));

    // ==========================================
    // SECURITY (Tests 43 - 44)
    // ==========================================
    console.log("\nSection: SECURITY (43 - 44)");

    // 43. explicit select / no credential exposure
    const empStr = JSON.stringify(emp19Data);
    const vacStr = JSON.stringify(vac26Data);
    record(
      "43. no credential exposure in responses",
      true,
      !empStr.includes("password") &&
        !empStr.includes("token") &&
        !vacStr.includes("password") &&
        !vacStr.includes("token")
    );

    // 44. application/placement relation not overexposed
    record(
      "44. applications and placements not overexposed",
      true,
      !("applications" in vac26Data) && !("placements" in vac26Data)
    );

    // ==========================================
    // CLEANUP & POST-TEST VERIFICATION
    // ==========================================
    console.log("\nSection: CLEANUP & VERIFICATION");

    // Clean up test vacancies and audit logs
    if (createdVacancyIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Vacancy", entityId: { in: createdVacancyIds } },
      });
      await prisma.vacancy.deleteMany({
        where: { id: { in: createdVacancyIds } },
      });
    }

    // Clean up test employers and audit logs
    if (createdEmployerIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entity: "Employer", entityId: { in: createdEmployerIds } },
      });
      await prisma.employer.deleteMany({
        where: { id: { in: createdEmployerIds } },
      });
    }

    // Clean up temporary users
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }

    // Verify baseline DB counts
    const residualEmployers = await prisma.employer.count();
    const residualVacancies = await prisma.vacancy.count();
    const residualApplications = await prisma.application.count();
    const residualPlacements = await prisma.placement.count();
    const residualDocuments = await prisma.document.count();

    const studentsCount = await prisma.student.count();
    const enrollmentsCount = await prisma.enrollment.count();
    const subjectsCount = await prisma.subject.count();
    const classesCount = await prisma.class.count();
    const schedulesCount = await prisma.schedule.count();
    const instructorsCount = await prisma.instructor.count();
    const usersCount = await prisma.user.count();

    console.log(`Residual Records:
  Employers: ${residualEmployers}
  Vacancies: ${residualVacancies}
  Applications: ${residualApplications}
  Placements: ${residualPlacements}
  Documents: ${residualDocuments}
`);
    console.log(`Database Master Counts:
  Students: ${studentsCount}
  Enrollments: ${enrollmentsCount}
  Subjects: ${subjectsCount}
  Classes: ${classesCount}
  Schedules: ${schedulesCount}
  Instructors: ${instructorsCount}
  Users: ${usersCount}
`);

    if (
      residualEmployers !== 0 ||
      residualVacancies !== 0 ||
      residualApplications !== 0 ||
      residualPlacements !== 0 ||
      residualDocuments !== 0
    ) {
      throw new Error("Residual test records remain in database!");
    }

    if (
      studentsCount !== 21 ||
      enrollmentsCount !== 21 ||
      subjectsCount !== 6 ||
      classesCount !== 10 ||
      schedulesCount !== 10 ||
      instructorsCount !== 6 ||
      usersCount !== 2
    ) {
      throw new Error("Master database baseline changed!");
    }

    console.log("\n==========================================");
    console.log(`ALL ${results.length} TESTS FINISHED!`);
    const allPassed = results.every((r) => r.passed);
    console.log(`OVERALL STATUS: ${allPassed ? "PASSED" : "FAILED"}`);
    console.log("==========================================");

    if (!allPassed) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    // Teardown safety cleanup
    if (createdVacancyIds.length > 0) {
      await prisma.auditLog
        .deleteMany({
          where: { entity: "Vacancy", entityId: { in: createdVacancyIds } },
        })
        .catch(() => {});
      await prisma.vacancy
        .deleteMany({ where: { id: { in: createdVacancyIds } } })
        .catch(() => {});
    }
    if (createdEmployerIds.length > 0) {
      await prisma.auditLog
        .deleteMany({
          where: { entity: "Employer", entityId: { in: createdEmployerIds } },
        })
        .catch(() => {});
      await prisma.employer
        .deleteMany({ where: { id: { in: createdEmployerIds } } })
        .catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await prisma.user
        .deleteMany({ where: { id: { in: createdUserIds } } })
        .catch(() => {});
    }
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
