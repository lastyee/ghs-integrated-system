import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseIsoToLocalDateAndTime(isoString) {
  if (!isoString) return { date: "", time: "" };
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { date: "", time: "" };
    const pad = (n) => n.toString().padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { date, time };
  } catch {
    return { date: "", time: "" };
  }
}

function combineLocalDateAndTimeToIso(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const dateParts = dateStr.trim().split("-");
  const timeParts = timeStr.trim().split(":");
  if (dateParts.length !== 3 || timeParts.length < 2) return null;

  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const day = parseInt(dateParts[2], 10);
  const hour = parseInt(timeParts[0], 10);
  const minute = parseInt(timeParts[1], 10);

  if (
    isNaN(year) ||
    isNaN(month) ||
    isNaN(day) ||
    isNaN(hour) ||
    isNaN(minute) ||
    month < 0 ||
    month > 11 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const d = new Date(year, month, day, hour, minute, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Emulates the frontend courseGroups useMemo sorting logic
function groupAndSortCourses(schedules) {
  const groupsMap = new Map();

  for (const item of schedules) {
    const key = `${item.classId}_${item.subjectId}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        key,
        subjectName: item.subject?.name || "Mata Kuliah",
        sessions: [],
      });
    }
    const group = groupsMap.get(key);
    group.sessions.push(item);
  }

  const list = Array.from(groupsMap.values());
  for (const group of list) {
    group.sessions.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (timeA !== timeB) return timeB - timeA;
      return b.id.localeCompare(a.id);
    });
  }

  list.sort((a, b) => {
    const timeA = Math.max(...a.sessions.map((s) => new Date(s.createdAt).getTime()));
    const timeB = Math.max(...b.sessions.map((s) => new Date(s.createdAt).getTime()));
    if (timeB !== timeA) return timeB - timeA;
    return b.key.localeCompare(a.key);
  });

  return list;
}

async function run() {
  console.log("=== STARTING TESTS: SCHEDULE ORDER & ASSIGNMENT DEADLINE ===");

  const initialCerts = await prisma.certificate.count();
  const initialAudits = await prisma.auditLog.count();
  const initialSchedules = await prisma.schedule.count();
  const initialAssignments = await prisma.assignment.count();
  console.log("Initial state:", { initialCerts, initialAudits, initialSchedules, initialAssignments });

  // Find a valid class, subject, and instructor
  const testClass = await prisma.class.findFirst({
    where: { deletedAt: null },
    include: { batch: true },
  });
  if (!testClass) throw new Error("No class found in database");

  const subjects = await prisma.subject.findMany({
    where: { deletedAt: null },
    take: 2,
  });
  if (subjects.length < 2) throw new Error("Need at least 2 subjects for test");

  const instructor = await prisma.instructor.findFirst({
    where: { deletedAt: null },
  });
  if (!instructor) throw new Error("No instructor found in database");

  const createdScheduleIds = [];
  const createdAssignmentIds = [];

  try {
    // -------------------------------------------------------------
    // TEST 1: Schedule Ordering (Newest Created Appears First)
    // -------------------------------------------------------------
    console.log("\n--- TEST 1: Schedule Ordering by createdAt DESC ---");

    // Create schedule 1 (older createdAt)
    const schedule1 = await prisma.schedule.create({
      data: {
        classId: testClass.id,
        subjectId: subjects[0].id,
        instructorId: instructor.id,
        date: new Date("2026-12-01T00:00:00.000Z"),
        startTime: "2026-12-01T09:00:00.000Z",
        endTime: "2026-12-01T11:00:00.000Z",
        topic: "Test Topic 1 - Older Created",
        status: "SCHEDULED",
        createdAt: new Date(Date.now() - 5000), // 5 seconds ago
      },
    });
    createdScheduleIds.push(schedule1.id);

    // Create schedule 2 (newer createdAt, but with an older class session date)
    const schedule2 = await prisma.schedule.create({
      data: {
        classId: testClass.id,
        subjectId: subjects[1].id,
        instructorId: instructor.id,
        date: new Date("2026-11-01T00:00:00.000Z"), // earlier date than schedule1
        startTime: "2026-11-01T08:00:00.000Z",
        endTime: "2026-11-01T10:00:00.000Z",
        topic: "Test Topic 2 - Newer Created",
        status: "SCHEDULED",
        createdAt: new Date(), // right now
      },
    });
    createdScheduleIds.push(schedule2.id);

    // Query using the exact query from app/api/schedules/route.ts
    const fetchedSchedules = await prisma.schedule.findMany({
      where: {
        id: { in: [schedule1.id, schedule2.id] },
        deletedAt: null,
      },
      select: {
        id: true,
        topic: true,
        classId: true,
        subjectId: true,
        createdAt: true,
        subject: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    console.log("DB returned schedules order:", fetchedSchedules.map((s) => ({ id: s.id, topic: s.topic, createdAt: s.createdAt })));
    if (fetchedSchedules[0].id !== schedule2.id) {
      throw new Error(`Expected schedule2 (${schedule2.id}) to be at index 0, but got ${fetchedSchedules[0].id}`);
    }
    console.log("✓ Backend query correctly returns newest created schedule at index 0");

    // Test frontend grouping & sorting
    const grouped = groupAndSortCourses(fetchedSchedules);
    console.log("Frontend grouped courses order:", grouped.map((g) => ({ subject: g.subjectName, topSession: g.sessions[0].topic })));
    if (grouped[0].sessions[0].id !== schedule2.id) {
      throw new Error(`Expected grouped courses index 0 to contain schedule2, but got ${grouped[0].sessions[0].id}`);
    }
    console.log("✓ Frontend groupAndSortCourses correctly puts course with newest schedule at index 0");

    // -------------------------------------------------------------
    // TEST 2: Assignment Manual Deadline Creation & No Timezone Drift
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: Assignment Manual Deadline Creation & Retrieval ---");

    const inputDate = "2026-11-20";
    const inputTime = "15:45";
    const combinedIso = combineLocalDateAndTimeToIso(inputDate, inputTime);
    if (!combinedIso) throw new Error("combineLocalDateAndTimeToIso failed on valid input");

    const assignment1 = await prisma.assignment.create({
      data: {
        id: `asgn_test_${Date.now()}`,
        classId: testClass.id,
        subjectId: subjects[0].id,
        instructorId: instructor.id,
        title: "Test Assignment Manual Deadline",
        description: "Testing manual deadline persistence and no timezone distortion",
        dueDate: new Date(combinedIso),
        maxScore: 100,
        status: "PUBLISHED",
      },
    });
    createdAssignmentIds.push(assignment1.id);

    // Fetch assignment as returned by API
    const fetchedAssignment = await prisma.assignment.findUnique({
      where: { id: assignment1.id },
      select: { id: true, dueDate: true },
    });
    if (!fetchedAssignment) throw new Error("Failed to fetch created assignment");

    // Reconstruct date and time using parseIsoToLocalDateAndTime
    const parsedReconstruction = parseIsoToLocalDateAndTime(fetchedAssignment.dueDate.toISOString());
    console.log("Reconstructed values for edit form:", parsedReconstruction);

    if (parsedReconstruction.date !== inputDate || parsedReconstruction.time !== inputTime) {
      throw new Error(
        `Timezone drift detected! Expected ${inputDate} ${inputTime}, but got ${parsedReconstruction.date} ${parsedReconstruction.time}`
      );
    }
    console.log("✓ Date and time reconstructed identically: 0 timezone drift / 0 hour shift");

    // -------------------------------------------------------------
    // TEST 3: Assignment Deadline Update via Edit Form
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Assignment Deadline Update ---");

    const updatedDate = "2026-11-28";
    const updatedTime = "09:15";
    const updatedIso = combineLocalDateAndTimeToIso(updatedDate, updatedTime);

    await prisma.assignment.update({
      where: { id: assignment1.id },
      data: {
        dueDate: new Date(updatedIso),
        title: "Test Assignment Manual Deadline - Updated",
      },
    });

    const refetchedUpdated = await prisma.assignment.findUnique({
      where: { id: assignment1.id },
      select: { id: true, dueDate: true, title: true },
    });

    const parsedUpdated = parseIsoToLocalDateAndTime(refetchedUpdated.dueDate.toISOString());
    console.log("Updated values for edit form:", parsedUpdated);

    if (parsedUpdated.date !== updatedDate || parsedUpdated.time !== updatedTime) {
      throw new Error(
        `Update timezone drift! Expected ${updatedDate} ${updatedTime}, but got ${parsedUpdated.date} ${parsedUpdated.time}`
      );
    }
    console.log("✓ Updated date and time preserved accurately without drift");

    // -------------------------------------------------------------
    // TEST 4: Input Validation Logic
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Deadline Input Validation ---");

    // Missing date
    const nullDateResult = combineLocalDateAndTimeToIso("", "10:00");
    if (nullDateResult !== null) throw new Error("Expected null for empty date");

    // Missing time
    const nullTimeResult = combineLocalDateAndTimeToIso("2026-11-20", "");
    if (nullTimeResult !== null) throw new Error("Expected null for empty time");

    // Invalid month
    const invalidMonthResult = combineLocalDateAndTimeToIso("2026-13-01", "10:00");
    if (invalidMonthResult !== null) throw new Error("Expected null for invalid month 13");

    // Invalid hour
    const invalidHourResult = combineLocalDateAndTimeToIso("2026-11-20", "25:00");
    if (invalidHourResult !== null) throw new Error("Expected null for invalid hour 25");

    // Invalid minute
    const invalidMinuteResult = combineLocalDateAndTimeToIso("2026-11-20", "10:65");
    if (invalidMinuteResult !== null) throw new Error("Expected null for invalid minute 65");

    console.log("✓ Input validation correctly rejects empty, malformed, or out-of-range dates and times");
  } finally {
    // Teardown test records
    console.log("\n--- TEARDOWN TEST RECORDS ---");
    if (createdScheduleIds.length > 0) {
      await prisma.schedule.deleteMany({
        where: { id: { in: createdScheduleIds } },
      });
      console.log(`Deleted ${createdScheduleIds.length} test schedules.`);
    }

    if (createdAssignmentIds.length > 0) {
      await prisma.assignment.deleteMany({
        where: { id: { in: createdAssignmentIds } },
      });
      console.log(`Deleted ${createdAssignmentIds.length} test assignments.`);
    }

    const finalCerts = await prisma.certificate.count();
    const finalAudits = await prisma.auditLog.count();
    const finalSchedules = await prisma.schedule.count();
    const finalAssignments = await prisma.assignment.count();
    console.log("Final state verification:", {
      finalCerts,
      finalAudits,
      finalSchedules,
      finalAssignments,
    });

    if (finalCerts !== initialCerts) {
      console.error(`WARNING: Certificates changed: ${initialCerts} -> ${finalCerts}`);
    }
    if (finalAudits !== initialAudits) {
      console.error(`WARNING: AuditLogs changed: ${initialAudits} -> ${finalAudits}`);
    }
    if (finalSchedules !== initialSchedules) {
      console.error(`WARNING: Schedules changed: ${initialSchedules} -> ${finalSchedules}`);
    }
    if (finalAssignments !== initialAssignments) {
      console.error(`WARNING: Assignments changed: ${initialAssignments} -> ${finalAssignments}`);
    }

    await prisma.$disconnect();
  }

  console.log("\n=== ALL TESTS PASSED SUCCESSFULLY ===");
}

run().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

