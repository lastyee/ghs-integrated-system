const { attendanceCreateSchema } = await import("../schemas/attendance.ts");

const results = [];

function assertValid(name, input) {
  const result = attendanceCreateSchema.safeParse(input);
  results.push({ name, expected: "valid", actual: result.success ? "valid" : "invalid" });
  if (!result.success) {
    throw new Error(`${name}: expected valid input`);
  }
}

function assertInvalid(name, input, message) {
  const result = attendanceCreateSchema.safeParse(input);
  results.push({ name, expected: "invalid", actual: result.success ? "valid" : "invalid" });
  if (result.success) {
    throw new Error(`${name}: expected invalid input`);
  }

  if (message && !result.error.issues.some((issue) => issue.message === message)) {
    throw new Error(`${name}: expected validation message "${message}"`);
  }
}

const base = { scheduleId: "schedule-id", studentId: "student-id" };

assertValid("PRESENT", { ...base, status: "PRESENT" });
assertValid("PRESENT explicit null", {
  ...base,
  status: "PRESENT",
  absenceType: null,
  lateMinutes: null,
});
assertValid("LATE", { ...base, status: "LATE", lateMinutes: 1 });
assertValid("LATE 15 minutes", { ...base, status: "LATE", lateMinutes: 15 });
assertValid("LATE 30 minutes", { ...base, status: "LATE", lateMinutes: 30 });
assertValid("ABSENT SICK", { ...base, status: "ABSENT", absenceType: "SICK" });
assertValid("ABSENT PERMITTED", { ...base, status: "ABSENT", absenceType: "PERMITTED" });
assertValid("ABSENT UNEXCUSED", { ...base, status: "ABSENT", absenceType: "UNEXCUSED" });

assertInvalid("PRESENT + SICK", { ...base, status: "PRESENT", absenceType: "SICK" }, "absenceType must be null when status is PRESENT");
assertInvalid("PRESENT + lateMinutes", { ...base, status: "PRESENT", lateMinutes: 1 }, "lateMinutes must be null when status is PRESENT");
assertInvalid("LATE without lateMinutes", { ...base, status: "LATE" }, "lateMinutes is required when status is LATE");
assertInvalid("LATE + SICK", { ...base, status: "LATE", absenceType: "SICK", lateMinutes: 1 }, "absenceType must be null when status is LATE");
assertInvalid("LATE + PERMITTED", { ...base, status: "LATE", absenceType: "PERMITTED", lateMinutes: 1 }, "absenceType must be null when status is LATE");
assertInvalid("LATE + UNEXCUSED", { ...base, status: "LATE", absenceType: "UNEXCUSED", lateMinutes: 1 }, "absenceType must be null when status is LATE");
assertInvalid("ABSENT without absenceType", { ...base, status: "ABSENT" }, "absenceType is required when status is ABSENT");
assertInvalid("EXCUSED status", { ...base, status: "EXCUSED" });
assertInvalid("id field", { ...base, status: "PRESENT", id: "id" });
assertInvalid("createdAt field", { ...base, status: "PRESENT", createdAt: "now" });
assertInvalid("updatedAt field", { ...base, status: "PRESENT", updatedAt: "now" });
assertInvalid("missing scheduleId", { studentId: "student-id", status: "PRESENT" });
assertInvalid("missing studentId", { scheduleId: "schedule-id", status: "PRESENT" });
assertInvalid("empty scheduleId", { ...base, scheduleId: "", status: "PRESENT" });
assertInvalid("empty studentId", { ...base, studentId: "", status: "PRESENT" });
assertInvalid("non-integer lateMinutes", { ...base, status: "LATE", lateMinutes: 1.5 });
assertInvalid("invalid absenceType", { ...base, status: "ABSENT", absenceType: "EXCUSED" });

console.log(JSON.stringify({ results }, null, 2));
