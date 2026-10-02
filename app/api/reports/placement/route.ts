import { PrismaClient } from "@prisma/client";
import {
  AuthorizationError,
  authorizationErrorResponse,
  ForbiddenError,
  requireAuthenticatedUser,
} from "@/lib/authorization";

const prisma = new PrismaClient();

const ALLOWED_ROLES = ["SUPER_ADMIN", "ADMIN", "MANAGEMENT", "PLACEMENT_STAFF"];

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();

    if (!ALLOWED_ROLES.includes(user.role)) {
      throw new ForbiddenError("Access to placement reports is restricted");
    }

    const [
      appStats,
      interviewStats,
      placementStats,
      totalVacancies,
      totalEmployers,
    ] = await Promise.all([
      prisma.application.groupBy({
        by: ["status"],
        _count: { status: true },
        where: {
          deletedAt: null,
          student: { deletedAt: null },
          vacancy: {
            is: {
              deletedAt: null,
              employer: { is: { deletedAt: null } },
            },
          },
        },
      }),
      prisma.interview.groupBy({
        by: ["status"],
        _count: { status: true },
        where: {
          deletedAt: null,
          application: {
            deletedAt: null,
            student: { deletedAt: null },
            vacancy: {
              is: {
                deletedAt: null,
                employer: { is: { deletedAt: null } },
              },
            },
          },
        },
      }),
      prisma.placement.groupBy({
        by: ["status"],
        _count: { status: true },
        where: {
          deletedAt: null,
          student: { deletedAt: null },
          employer: { deletedAt: null },
          OR: [
            { vacancyId: null },
            { vacancy: { is: { deletedAt: null, employer: { is: { deletedAt: null } } } } },
          ],
          AND: [
            {
              OR: [
                { applicationId: null },
                {
                  application: {
                    deletedAt: null,
                    student: { deletedAt: null },
                    vacancy: {
                      is: {
                        deletedAt: null,
                        employer: { is: { deletedAt: null } },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      }),
      prisma.vacancy.count({ where: { deletedAt: null, employer: { deletedAt: null } } }),
      prisma.employer.count({ where: { deletedAt: null } }),
    ]);

    const applicationFunnel = {
      APPLIED: 0,
      SCREENING: 0,
      INTERVIEW: 0,
      SELECTED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
    };
    let totalApplications = 0;
    for (const stat of appStats) {
      if (stat.status in applicationFunnel) {
        applicationFunnel[stat.status as keyof typeof applicationFunnel] = stat._count.status;
      }
      totalApplications += stat._count.status;
    }

    const interviewStatusDistribution = {
      PENDING: 0,
      PASSED: 0,
      FAILED: 0,
      RESCHEDULED: 0,
    };
    let totalInterviews = 0;
    for (const stat of interviewStats) {
      if (stat.status in interviewStatusDistribution) {
        interviewStatusDistribution[stat.status as keyof typeof interviewStatusDistribution] = stat._count.status;
      }
      totalInterviews += stat._count.status;
    }

    const placementStatusDistribution = {
      PREPARATION: 0,
      READY: 0,
      DEPARTED: 0,
      PLACED: 0,
      CANCELLED: 0,
    };
    let totalPlacements = 0;
    for (const stat of placementStats) {
      if (stat.status in placementStatusDistribution) {
        placementStatusDistribution[stat.status as keyof typeof placementStatusDistribution] = stat._count.status;
      }
      totalPlacements += stat._count.status;
    }

    return Response.json({
      data: {
        totalApplications,
        totalInterviews,
        totalPlacements,
        totalVacancies,
        totalEmployers,
        applicationFunnel,
        interviewStatusDistribution,
        placementStatusDistribution,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }

    console.error("Failed to generate placement report", error);
    return Response.json({ error: "Unable to generate placement report" }, { status: 500 });
  }
}
