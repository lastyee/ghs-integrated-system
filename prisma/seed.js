/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const roles = [
  "SUPER_ADMIN",
  "ADMIN",
  "ACADEMIC_STAFF",
  "INSTRUCTOR",
  "PLACEMENT_STAFF",
  "MANAGEMENT",
  "STUDENT",
];

const permissionDefinitions = [
  ["student:create", "create", "student"],
  ["student:read", "read", "student"],
  ["student:update", "update", "student"],
  ["student:delete", "delete", "student"],
  ["program:create", "create", "program"],
  ["program:read", "read", "program"],
  ["program:update", "update", "program"],
  ["program:delete", "delete", "program"],
  ["subject:create", "create", "subject"],
  ["subject:read", "read", "subject"],
  ["subject:update", "update", "subject"],
  ["subject:delete", "delete", "subject"],
  ["batch:create", "create", "batch"],
  ["batch:read", "read", "batch"],
  ["batch:update", "update", "batch"],
  ["batch:delete", "delete", "batch", "Delete a batch only when it has no enrollments, classes, schedules, or certificates."],
  ["instructor:delete", "delete", "instructor", "Delete an instructor only when it has no classes, schedules, or linked user."],
  ["enrollment:create", "create", "enrollment"],
  ["enrollment:read", "read", "enrollment"],
  ["enrollment:update", "update", "enrollment"],
  ["class:create", "create", "class"],
  ["class:read", "read", "class"],
  ["class:update", "update", "class"],
  ["schedule:create", "create", "schedule"],
  ["schedule:read", "read", "schedule"],
  ["schedule:update", "update", "schedule"],
  ["attendance:create", "create", "attendance"],
  ["attendance:read", "read", "attendance"],
  ["attendance:update", "update", "attendance"],
  ["assessment:create", "create", "assessment"],
  ["assessment:read", "read", "assessment"],
  ["assessment:update", "update", "assessment"],
  ["assessment:delete", "delete", "assessment", "Delete an OPEN assessment only when it has no scores."],
  ["document:create", "create", "document"],
  ["document:read", "read", "document"],
  ["document:update", "update", "document"],
  ["document:verify", "verify", "document"],
  ["document:delete", "delete", "document", "Delete non-verified documents and their stored objects."],
  ["employer:create", "create", "employer"],
  ["employer:read", "read", "employer"],
  ["employer:update", "update", "employer"],
  ["employer:delete", "delete", "employer", "Delete an employer only when it has no vacancies or placements."],
  ["vacancy:create", "create", "vacancy"],
  ["vacancy:read", "read", "vacancy"],
  ["vacancy:update", "update", "vacancy"],
  ["vacancy:delete", "delete", "vacancy", "Delete a vacancy only when it has no applications or placements."],
  ["vacancy:close", "close", "vacancy"],
  ["application:create", "create", "application"],
  ["application:read", "read", "application"],
  ["application:update", "update", "application"],
  ["interview:create", "create", "interview"],
  ["interview:read", "read", "interview"],
  ["interview:update", "update", "interview"],
  ["interview:result", "result", "interview"],
  ["placement:create", "create", "placement"],
  ["placement:read", "read", "placement"],
  ["placement:update", "update", "placement"],
  ["placement:verify", "verify", "placement"],
  ["certificate:create", "create", "certificate"],
  ["certificate:revoke", "revoke", "certificate"],
  ["certificate:read", "read", "certificate"],
  ["audit:read", "read", "audit"],
];

const allPermissionNames = permissionDefinitions.map(([name]) => name);
const readOnly = (subject) => [`${subject}:read`];

const rolePermissionNames = {
  SUPER_ADMIN: allPermissionNames,
  ADMIN: allPermissionNames,
  ACADEMIC_STAFF: [
    "student:create", "student:read", "student:update",
    "program:create", "program:read", "program:update",
    "subject:create", "subject:read", "subject:update",
    "batch:create", "batch:read", "batch:update", "batch:delete",
    "instructor:delete",
    "enrollment:create", "enrollment:read", "enrollment:update",
    "class:create", "class:read", "class:update",
    "schedule:create", "schedule:read", "schedule:update",
    "attendance:read", "assessment:read", "assessment:delete", "document:read", "document:delete",
  ],
  INSTRUCTOR: [
    "student:read", "class:read", "schedule:read",
    "attendance:create", "attendance:read", "attendance:update",
    "assessment:create", "assessment:read", "assessment:update",
  ],
  PLACEMENT_STAFF: [
    "student:read", "document:read", "document:delete",
    "employer:create", "employer:read", "employer:update",
    "vacancy:create", "vacancy:read", "vacancy:update", "vacancy:close",
    "application:create", "application:read", "application:update",
    "interview:create", "interview:read", "interview:update", "interview:result",
    "placement:create", "placement:read", "placement:update", "placement:verify",
  ],
  MANAGEMENT: [
    ...readOnly("student"), ...readOnly("program"), ...readOnly("subject"),
    ...readOnly("batch"), ...readOnly("enrollment"), ...readOnly("class"),
    ...readOnly("schedule"), ...readOnly("attendance"), ...readOnly("assessment"),
    ...readOnly("document"), ...readOnly("employer"), ...readOnly("vacancy"),
    ...readOnly("application"), ...readOnly("interview"), ...readOnly("placement"),
    "certificate:read", "audit:read",
  ],
  STUDENT: [
    "student:read", "student:update",
    "attendance:read", "assessment:read",
    "document:create", "document:read", "document:update",
    "application:create", "application:read", "application:update",
    "interview:read", "placement:read", "certificate:read",
  ],
};

function requiredSecret(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for development seed execution.`);
  }
  return value;
}

async function main() {
  const superAdminPassword = requiredSecret("DEMO_SUPER_ADMIN_PASSWORD");
  const studentPassword = requiredSecret("DEMO_STUDENT_PASSWORD");

  const permissionRecords = new Map();
  for (const [name, action, subject, description] of permissionDefinitions) {
    const permissionData = {
      action,
      subject,
      ...(description ? { description } : {}),
    };
    const permission = await prisma.permission.upsert({
      where: { name },
      update: permissionData,
      create: { name, ...permissionData },
    });
    permissionRecords.set(name, permission);
  }

  const roleRecords = new Map();
  for (const name of roles) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    roleRecords.set(name, role);
  }

  for (const [roleName, permissionNames] of Object.entries(rolePermissionNames)) {
    const role = roleRecords.get(roleName);
    for (const permissionName of permissionNames) {
      const permission = permissionRecords.get(permissionName);
      if (!permission) {
        throw new Error(`Permission ${permissionName} is not defined.`);
      }
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const superAdminRole = roleRecords.get("SUPER_ADMIN");
  const studentRole = roleRecords.get("STUDENT");
  const superAdminHash = await bcrypt.hash(superAdminPassword, 10);
  const studentHash = await bcrypt.hash(studentPassword, 10);

  await prisma.user.upsert({
    where: { email: "admin.demo@ghs.local" },
    update: { name: "Demo Super Admin", roleId: superAdminRole.id, passwordHash: superAdminHash },
    create: {
      email: "admin.demo@ghs.local",
      name: "Demo Super Admin",
      passwordHash: superAdminHash,
      roleId: superAdminRole.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "student.demo@ghs.local" },
    update: { name: "Demo Student", roleId: studentRole.id, passwordHash: studentHash },
    create: {
      email: "student.demo@ghs.local",
      name: "Demo Student",
      passwordHash: studentHash,
      roleId: studentRole.id,
    },
  });

  const program = await prisma.program.upsert({
    where: { code: "HTP" },
    update: { name: "Hospitality Training Program" },
    create: {
      code: "HTP",
      name: "Hospitality Training Program",
      description: "Global Hospitality Training Program",
    },
  });

  let batchGHI07 = await prisma.batch.findFirst({
    where: { name: "GHI-07" },
  });
  if (!batchGHI07) {
    batchGHI07 = await prisma.batch.create({
      data: {
        name: "GHI-07",
        programId: program.id,
        startDate: new Date("2026-01-01"),
      },
    });
  }

  let batchGHI08 = await prisma.batch.findFirst({
    where: { name: "GHI-08" },
  });
  if (!batchGHI08) {
    batchGHI08 = await prisma.batch.create({
      data: {
        name: "GHI-08",
        programId: program.id,
        startDate: new Date("2026-02-01"),
      },
    });
  }

  const ghi07Students = [
    { nim: "260405064", name: "RAFLI AULIA RAHMAN" },
    { nim: "260405065", name: "SAHRUL GUNAWAN" },
    { nim: "260405066", name: "TIARA ISMI LAILA" },
    { nim: "260405067", name: "KHALIF FAUZI" },
    { nim: "260405068", name: "SUCI WALIYAH" },
    { nim: "260405069", name: "ISMATULLAH MAULANA" },
    { nim: "260405070", name: "ATTHALARICK RAYHAIN KURNIAWAN" },
    { nim: "260405071", name: "RIO RESTU RAHAYU" },
    { nim: "260405072", name: "M. SYEHTU SUBAWAN" },
    { nim: "260405073", name: "ZIQRI HARIRI" },
    { nim: "260405074", name: "DRAJAT PRAMONO" },
    { nim: "260405075", name: "ZIDANE AZZAM MALIK DEGEL" },
  ];

  const ghi08Students = [
    { nim: "260308076", name: "MUHAMMAD NAUFAL" },
    { nim: "260308077", name: "WILDA MAULIDINA" },
    { nim: "260308078", name: "MOCH. RAMLAN RAYANA" },
    { nim: "260308079", name: "ASEP ABDUL JABAR" },
    { nim: "260308080", name: "ADEN AGUSTIAN MAULANA" },
    { nim: "260308081", name: "MUHAMMAD FAJRIL MULYADI" },
    { nim: "260308082", name: "MUHAMMAD PUTRA MULYA PRATAMA" },
    { nim: "260308083", name: "CALISTUS CANDRAWARTYA" },
    { nim: "260308084", name: "MUHAMMAD DIMAS ANDIKA" },
  ];

  for (const s of ghi07Students) {
    const student = await prisma.student.upsert({
      where: { nim: s.nim },
      update: { name: s.name },
      create: {
        nim: s.nim,
        name: s.name,
        nik: null,
        phone: null,
        address: null,
        userId: null,
      },
    });

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        batchId: batchGHI07.id,
      },
    });

    if (!existingEnrollment) {
      await prisma.enrollment.create({
        data: {
          studentId: student.id,
          batchId: batchGHI07.id,
          status: "ACTIVE",
        },
      });
    }
  }

  for (const s of ghi08Students) {
    const student = await prisma.student.upsert({
      where: { nim: s.nim },
      update: { name: s.name },
      create: {
        nim: s.nim,
        name: s.name,
        nik: null,
        phone: null,
        address: null,
        userId: null,
      },
    });

    const existingEnrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        batchId: batchGHI08.id,
      },
    });

    if (!existingEnrollment) {
      await prisma.enrollment.create({
        data: {
          studentId: student.id,
          batchId: batchGHI08.id,
          status: "ACTIVE",
        },
      });
    }
  }

  const instructorNames = [
    "Mr. Rendy Fradita Kriswandi",
    "Mr. Muhammad Nurul Hidayat",
    "Mrs. Sabila Dheandra",
    "Mrs. Hanny Astriani",
    "Mr. Taufan Pratidiena",
    "Chef Eris Resdiyanta",
  ];

  const instructorMap = new Map();
  for (const name of instructorNames) {
    let instructor = await prisma.instructor.findFirst({
      where: { name },
    });

    if (!instructor) {
      instructor = await prisma.instructor.create({
        data: { name },
      });
    }

    instructorMap.set(name, instructor);
  }

  const subjectDefinitions = [
    { code: "FBS", name: "Food and Beverage Service" },
    { code: "EHC", name: "English Hotel conversation" },
    { code: "BE", name: "Basic English" },
    { code: "GEC", name: "General English Conversation" },
    { code: "EFI", name: "English For Interview" },
    { code: "FP", name: "Food Production" },
  ];

  const subjectMap = new Map();
  for (const s of subjectDefinitions) {
    const subject = await prisma.subject.upsert({
      where: { code: s.code },
      update: { name: s.name },
      create: { code: s.code, name: s.name },
    });
    subjectMap.set(s.name, subject);

    await prisma.programSubject.upsert({
      where: {
        programId_subjectId: {
          programId: program.id,
          subjectId: subject.id,
        },
      },
      update: {},
      create: {
        programId: program.id,
        subjectId: subject.id,
      },
    });
  }

  async function getOrCreateClass(className, batchId, instructorId) {
    let classRecord = await prisma.class.findFirst({
      where: {
        name: className,
        batchId: batchId,
      },
    });

    if (!classRecord) {
      classRecord = await prisma.class.create({
        data: {
          name: className,
          batchId: batchId,
          instructorId: instructorId,
          status: "SCHEDULED",
        },
      });
    }

    return classRecord;
  }

  const scheduleDefinitions = [
    // GHI-08 (6 schedules)
    {
      batchName: "GHI-08",
      batchId: batchGHI08.id,
      date: "2026-09-21",
      startTime: "08:30",
      endTime: "10:00",
      subjectName: "Food and Beverage Service",
      instructorName: "Mr. Rendy Fradita Kriswandi",
      room: "Riviera / R. Praktek",
      dressCode: "Vest + Jas GHS",
      topic: null,
    },
    {
      batchName: "GHI-08",
      batchId: batchGHI08.id,
      date: "2026-09-22",
      startTime: "08:30",
      endTime: "10:00",
      subjectName: "English Hotel conversation",
      instructorName: "Mr. Muhammad Nurul Hidayat",
      room: "Riviera / R. Praktek",
      dressCode: "Vest + Jas GHS",
      topic: null,
    },
    {
      batchName: "GHI-08",
      batchId: batchGHI08.id,
      date: "2026-09-23",
      startTime: "08:30",
      endTime: "10:00",
      subjectName: "Basic English",
      instructorName: "Mrs. Sabila Dheandra",
      room: "Riviera / R. Praktek",
      dressCode: "Vest + Jas GHS",
      topic: null,
    },
    {
      batchName: "GHI-08",
      batchId: batchGHI08.id,
      date: "2026-09-23",
      startTime: "10:15",
      endTime: "11:45",
      subjectName: "General English Conversation",
      instructorName: "Mrs. Hanny Astriani",
      room: "Riviera / R. Praktek",
      dressCode: "Vest + Jas GHS",
      topic: null,
    },
    {
      batchName: "GHI-08",
      batchId: batchGHI08.id,
      date: "2026-09-24",
      startTime: "08:30",
      endTime: "10:00",
      subjectName: "English For Interview",
      instructorName: "Mr. Taufan Pratidiena",
      room: "Riviera / R. Praktek",
      dressCode: "Vest + Jas GHS",
      topic: null,
    },
    {
      batchName: "GHI-08",
      batchId: batchGHI08.id,
      date: "2026-09-25",
      startTime: "10:15",
      endTime: "11:45",
      subjectName: "Food Production",
      instructorName: "Chef Eris Resdiyanta",
      room: "Riviera / R. Praktek",
      dressCode: "Polo GHS",
      topic: null,
    },
    // GHI-07 (4 schedules)
    {
      batchName: "GHI-07",
      batchId: batchGHI07.id,
      date: "2026-09-22",
      startTime: "08:30",
      endTime: "10:00",
      subjectName: "Food and Beverage Service",
      instructorName: "Mr. Rendy Fradita Kriswandi",
      room: "Riviera / R. Praktek",
      dressCode: "Vest + Jas GHS",
      topic: null,
    },
    {
      batchName: "GHI-07",
      batchId: batchGHI07.id,
      date: "2026-09-22",
      startTime: "10:15",
      endTime: "11:45",
      subjectName: "General English Conversation",
      instructorName: "Mrs. Hanny Astriani",
      room: "Riviera / R. Praktek",
      dressCode: "Vest + Jas GHS",
      topic: "FINAL TEST",
    },
    {
      batchName: "GHI-07",
      batchId: batchGHI07.id,
      date: "2026-09-24",
      startTime: "10:15",
      endTime: "11:45",
      subjectName: "English For Interview",
      instructorName: "Mr. Taufan Pratidiena",
      room: "Riviera / R. Praktek",
      dressCode: "Vest + Jas GHS",
      topic: null,
    },
    {
      batchName: "GHI-07",
      batchId: batchGHI07.id,
      date: "2026-09-25",
      startTime: "08:30",
      endTime: "10:00",
      subjectName: "Food Production",
      instructorName: "Chef Eris Resdiyanta",
      room: "Riviera / R. Praktek",
      dressCode: "Polo GHS",
      topic: null,
    },
  ];

  for (const item of scheduleDefinitions) {
    const subject = subjectMap.get(item.subjectName);
    if (!subject) throw new Error(`Subject ${item.subjectName} not found`);

    const instructor = instructorMap.get(item.instructorName);
    if (!instructor) throw new Error(`Instructor ${item.instructorName} not found`);

    const className = `${item.batchName} - ${item.subjectName}`;
    const classRecord = await getOrCreateClass(className, item.batchId, instructor.id);

    const scheduleDate = new Date(`${item.date}T00:00:00.000Z`);
    const scheduleStart = new Date(`${item.date}T${item.startTime}:00.000Z`);
    const scheduleEnd = new Date(`${item.date}T${item.endTime}:00.000Z`);

    const existingSchedule = await prisma.schedule.findFirst({
      where: {
        classId: classRecord.id,
        subjectId: subject.id,
        date: scheduleDate,
        startTime: scheduleStart,
        endTime: scheduleEnd,
      },
    });

    if (!existingSchedule) {
      await prisma.schedule.create({
        data: {
          classId: classRecord.id,
          subjectId: subject.id,
          instructorId: instructor.id,
          date: scheduleDate,
          startTime: scheduleStart,
          endTime: scheduleEnd,
          room: item.room,
          dressCode: item.dressCode,
          topic: item.topic,
          status: "SCHEDULED",
        },
      });
    }
  }

  console.log(
    `Seeded ${roles.length} roles, ${permissionDefinitions.length} permissions, 2 demo users, 2 batches (GHI-07, GHI-08), 21 students, 21 enrollments, 6 instructors, 6 subjects, and 10 schedules.`
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
