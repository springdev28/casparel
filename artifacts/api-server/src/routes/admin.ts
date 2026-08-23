/**
 * @fileOverview API role: implements the Admin HTTP domain, including request validation and response shaping.
 * System connection: mounted by routes/index.ts; coordinates auth middleware, domain helpers, Drizzle tables, and external integrations.
 */
import { Router, type IRouter } from "express";
import {
  and,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  pool,
  usersTable,
  classesTable,
  classMembersTable,
  learningGoalsTable,
  resourcesTable,
  forumMaterialsTable,
  forumPostsTable,
  forumCommentsTable,
  studyActivitiesTable,
  canvasesTable,
  canvasCollaboratorsTable,
  resourceListsTable,
  classAssignmentsTable,
  scheduleBlocksTable,
  studySessionsTable,
  learningEvidenceTable,
  sourceReviewCacheTable,
  adminAuditLogsTable,
} from "@workspace/db";
import {
  BanAdminUserBody,
  BanAdminUserParams,
  BanAdminUserResponse,
  BulkUpdateAdminResourceVerificationBody,
  BulkUpdateAdminResourceVerificationResponse,
  GetAdminOverviewResponse,
  ListAdminResourceReviewQueueQueryParams,
  ListAdminResourceReviewQueueResponse,
  ListAdminUsersQueryParams,
  ListAdminUsersResponse,
  OverrideAdminUserPlanBody,
  OverrideAdminUserPlanParams,
  OverrideAdminUserPlanResponse,
  UnbanAdminUserParams,
  UnbanAdminUserResponse,
  UpdateAdminPublisherVerificationBody,
  UpdateAdminPublisherVerificationParams,
  UpdateAdminPublisherVerificationResponse,
  UpdateAdminResourceVerificationBody,
  UpdateAdminResourceVerificationParams,
  UpdateAdminResourceVerificationResponse,
  UpdateAdminUserBody,
  UpdateAdminUserParams,
  UpdateAdminUserResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

async function count(
  table: Parameters<typeof db.select>[0] extends never ? never : any,
) {
  const [row] = await db
    .select({ value: sql<number>`cast(count(*) as int)` })
    .from(table);
  return row?.value ?? 0;
}

async function readUsageRows(statement: string, values?: unknown[]) {
  try {
    const result = await pool.query<{ key: string; hits: number }>(statement, values);
    return result.rows;
  } catch {
    // The app starts listening before asynchronous database preparation finishes.
    // Admin account data should remain available while the usage store initializes.
    return [];
  }
}

const emptyWorkflowAnalytics = {
  funnel: {
    viewed: 0,
    reviewed: 0,
    saved: 0,
    activityCreated: 0,
    classShared: 0,
    assignmentCreated: 0,
    completedJourneys: 0,
    viewToReviewRate: 0,
    reviewToSaveRate: 0,
    saveToActivityRate: 0,
    activityToClassRate: 0,
    classToAssignmentRate: 0,
  },
  engagement: {
    activeUsers7d: 0,
    activeUsers30d: 0,
    weeklyActiveClasses: 0,
    avgMinutesToFirstActivity: 0,
    inviteAcceptanceRate: 0,
    assignmentCompletionRate: 0,
    remixRate: 0,
    teacherApprovalRate: 0,
    reportsPerThousand: 0,
    estimatedStoredMb: 0,
  },
  activation: {
    registered30d: 0,
    firstSearchUsers30d: 0,
    sourceCheckUsers30d: 0,
    activatedLearners30d: 0,
    activatedEducators30d: 0,
    registeredToSearchRate: 0,
    searchToSourceCheckRate: 0,
    sourceCheckToActionRate: 0,
    d1ReturnRate: 0,
    d7ReturnRate: 0,
    classesWithFiveLearners: 0,
    searchNoResultRate: 0,
    avgPreviewCoverage: 0,
  },
};

const emptyReliabilityAnalytics = {
  sampleWindowDays: 30,
  measuredUsers30d: 0,
  vitalSamples30d: 0,
  clientErrors30d: 0,
  renderCrashes30d: 0,
  errorFreeUsersRate: 0,
  lcpP75Ms: null,
  inpP75Ms: null,
  clsP75: null,
  lcpSloMet: null,
  inpSloMet: null,
  clsSloMet: null,
  errorFreeUsersSloMet: null,
};

function percentage(numerator: number, denominator: number) {
  return denominator
    ? Number(((numerator / denominator) * 100).toFixed(1))
    : 0;
}

async function readWorkflowAnalytics() {
  try {
    const [workflowResult, inviteResult, assignmentResult, communityResult, storageResult] =
      await Promise.all([
        pool.query<{
          viewed: number;
          reviewed: number;
          saved: number;
          activity_created: number;
          class_shared: number;
          assignment_created: number;
          completed_journeys: number;
          active_users_7d: number;
          active_users_30d: number;
          weekly_active_classes: number;
          remix_events: number;
          average_minutes: number;
          registered_30d: number;
          first_search_users_30d: number;
          source_check_users_30d: number;
          activated_learners_30d: number;
          activated_educators_30d: number;
          d1_eligible: number;
          d1_returned: number;
          d7_eligible: number;
          d7_returned: number;
          classes_with_five_learners: number;
          search_events_30d: number;
          no_result_searches_30d: number;
          average_preview_coverage: number;
        }>(`
          WITH journeys AS (
            SELECT user_id, resource_id,
              MIN(created_at) FILTER (WHERE event = 'resource_viewed') AS viewed_at,
              MIN(created_at) FILTER (WHERE event = 'activity_created' OR event = 'activity_remixed') AS activity_at,
              BOOL_OR(event = 'resource_reviewed') AS reviewed,
              BOOL_OR(event = 'resource_saved') AS saved,
              BOOL_OR(event = 'activity_created' OR event = 'activity_remixed') AS activity_created,
              BOOL_OR(event = 'class_shared') AS class_shared,
              BOOL_OR(event = 'assignment_created') AS assignment_created
            FROM workflow_events
            WHERE resource_id IS NOT NULL
            GROUP BY user_id, resource_id
          ), registrations AS (
            SELECT user_id, MIN(created_at) AS registered_at
            FROM workflow_events
            WHERE event = 'account_registered'
            GROUP BY user_id
          ), first_searches AS (
            SELECT user_id, MIN(created_at) AS searched_at
            FROM workflow_events
            WHERE event = 'search_submitted'
            GROUP BY user_id
          ), first_checks AS (
            SELECT user_id, MIN(created_at) AS checked_at
            FROM workflow_events
            WHERE event IN ('source_quick_check_completed', 'source_deep_research_completed')
            GROUP BY user_id
          ), eligible_searches AS (
            SELECT searches.user_id, searches.searched_at
            FROM first_searches searches
            JOIN registrations ON registrations.user_id = searches.user_id
            WHERE registrations.registered_at >= NOW() - INTERVAL '30 days'
              AND searches.searched_at >= registrations.registered_at
              AND searches.searched_at <= registrations.registered_at + INTERVAL '24 hours'
          ), source_check_cohort AS (
            SELECT checks.user_id, checks.checked_at
            FROM first_checks checks
            JOIN eligible_searches searches ON searches.user_id = checks.user_id
            WHERE checks.checked_at >= searches.searched_at
              AND checks.checked_at <= searches.searched_at + INTERVAL '24 hours'
          ), learner_activations AS (
            SELECT checks.user_id, MIN(actions.created_at) AS activated_at
            FROM source_check_cohort checks
            JOIN workflow_events actions ON actions.user_id = checks.user_id
              AND actions.event IN ('resource_saved', 'resource_added_to_goal', 'activity_created', 'activity_completed', 'assignment_completed')
              AND actions.created_at >= checks.checked_at
              AND actions.created_at <= checks.checked_at + INTERVAL '24 hours'
            GROUP BY checks.user_id
          ), retention AS (
            SELECT registrations.user_id, registrations.registered_at,
              EXISTS (
                SELECT 1 FROM workflow_events events
                WHERE events.user_id = registrations.user_id
                  AND events.created_at >= registrations.registered_at + INTERVAL '1 day'
                  AND events.created_at < registrations.registered_at + INTERVAL '2 days'
              ) AS returned_d1,
              EXISTS (
                SELECT 1 FROM workflow_events events
                WHERE events.user_id = registrations.user_id
                  AND events.created_at >= registrations.registered_at + INTERVAL '7 days'
                  AND events.created_at < registrations.registered_at + INTERVAL '8 days'
              ) AS returned_d7
            FROM registrations
          )
          SELECT
            COUNT(*) FILTER (WHERE viewed_at IS NOT NULL)::int AS viewed,
            COUNT(*) FILTER (WHERE reviewed)::int AS reviewed,
            COUNT(*) FILTER (WHERE saved)::int AS saved,
            COUNT(*) FILTER (WHERE activity_created)::int AS activity_created,
            COUNT(*) FILTER (WHERE class_shared)::int AS class_shared,
            COUNT(*) FILTER (WHERE assignment_created)::int AS assignment_created,
            COUNT(*) FILTER (WHERE reviewed AND saved AND activity_created AND class_shared AND assignment_created)::int AS completed_journeys,
            (SELECT COUNT(DISTINCT user_id)::int FROM workflow_events WHERE created_at >= NOW() - INTERVAL '7 days') AS active_users_7d,
            (SELECT COUNT(DISTINCT user_id)::int FROM workflow_events WHERE created_at >= NOW() - INTERVAL '30 days') AS active_users_30d,
            (SELECT COUNT(DISTINCT class_id)::int FROM workflow_events WHERE class_id IS NOT NULL AND created_at >= NOW() - INTERVAL '7 days') AS weekly_active_classes,
            (SELECT COUNT(*)::int FROM workflow_events WHERE event = 'activity_remixed') AS remix_events,
            (SELECT COUNT(*)::int FROM registrations WHERE registered_at >= NOW() - INTERVAL '30 days') AS registered_30d,
            (SELECT COUNT(*)::int FROM eligible_searches) AS first_search_users_30d,
            (SELECT COUNT(*)::int FROM source_check_cohort) AS source_check_users_30d,
            (SELECT COUNT(*)::int FROM learner_activations WHERE activated_at >= NOW() - INTERVAL '30 days') AS activated_learners_30d,
            (SELECT COUNT(DISTINCT user_id)::int FROM workflow_events WHERE event = 'teacher_first_class_activated' AND created_at >= NOW() - INTERVAL '30 days') AS activated_educators_30d,
            (SELECT COUNT(*)::int FROM retention WHERE registered_at <= NOW() - INTERVAL '1 day') AS d1_eligible,
            (SELECT COUNT(*)::int FROM retention WHERE registered_at <= NOW() - INTERVAL '1 day' AND returned_d1) AS d1_returned,
            (SELECT COUNT(*)::int FROM retention WHERE registered_at <= NOW() - INTERVAL '7 days') AS d7_eligible,
            (SELECT COUNT(*)::int FROM retention WHERE registered_at <= NOW() - INTERVAL '7 days' AND returned_d7) AS d7_returned,
            (SELECT COUNT(*)::int FROM (SELECT class_id FROM class_members WHERE role = 'student' GROUP BY class_id HAVING COUNT(DISTINCT user_id) >= 5) classes) AS classes_with_five_learners,
            (SELECT COUNT(*)::int FROM workflow_events WHERE event = 'search_submitted' AND created_at >= NOW() - INTERVAL '30 days') AS search_events_30d,
            (SELECT COUNT(*)::int FROM workflow_events WHERE event = 'search_submitted' AND created_at >= NOW() - INTERVAL '30 days' AND COALESCE((context->>'resultCount')::int, 0) = 0) AS no_result_searches_30d,
            (SELECT COALESCE(AVG((context->>'previewCoverage')::float), 0)::float FROM workflow_events WHERE event = 'search_submitted' AND created_at >= NOW() - INTERVAL '30 days' AND context ? 'previewCoverage') AS average_preview_coverage,
            COALESCE(AVG(EXTRACT(EPOCH FROM (activity_at - viewed_at)) / 60) FILTER (WHERE activity_at >= viewed_at), 0)::float AS average_minutes
          FROM journeys
        `),
        pool.query<{ total: number; accepted: number }>(`
          SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted
          FROM class_invitations
        `),
        pool.query<{ expected: number; completed: number }>(`
          SELECT
            COUNT(*)::int AS expected,
            COUNT(ac.assignment_id)::int AS completed
          FROM class_assignments ca
          JOIN class_members cm ON cm.class_id = ca.class_id AND cm.role = 'student'
          LEFT JOIN assignment_completions ac
            ON ac.assignment_id = ca.id AND ac.user_id = cm.user_id
        `),
        pool.query<{
          activities: number;
          student_materials: number;
          approved_student_materials: number;
          reports: number;
          content_items: number;
        }>(`
          SELECT
            (SELECT COUNT(*)::int FROM study_activities) AS activities,
            (SELECT COUNT(*)::int FROM forum_materials WHERE uploader_role = 'student') AS student_materials,
            (SELECT COUNT(DISTINCT fm.id)::int FROM forum_materials fm JOIN forum_material_approvals fa ON fa.material_id = fm.id WHERE fm.uploader_role = 'student') AS approved_student_materials,
            (SELECT COUNT(*)::int FROM forum_reports) AS reports,
            ((SELECT COUNT(*) FROM forum_materials) + (SELECT COUNT(*) FROM forum_posts) + (SELECT COUNT(*) FROM forum_comments))::int AS content_items
        `),
        pool.query<{ bytes: number }>(`
          SELECT COALESCE(SUM(bytes), 0)::bigint AS bytes FROM (
            SELECT COALESCE(SUM(pg_column_size(cards)), 0) AS bytes FROM study_activities
            UNION ALL SELECT COALESCE(SUM(pg_column_size(document)), 0) FROM canvases
            UNION ALL SELECT COALESCE(SUM(octet_length(COALESCE(file_base64, ''))), 0) FROM forum_materials
            UNION ALL SELECT COALESCE(SUM(octet_length(COALESCE(attachment_file_base64, ''))), 0) FROM forum_posts
          ) stored
        `),
      ]);

    const workflow = workflowResult.rows[0];
    const invitations = inviteResult.rows[0];
    const assignments = assignmentResult.rows[0];
    const community = communityResult.rows[0];
    const storage = storageResult.rows[0];
    if (!workflow || !invitations || !assignments || !community || !storage) {
      return emptyWorkflowAnalytics;
    }

    return {
      funnel: {
        viewed: Number(workflow.viewed),
        reviewed: Number(workflow.reviewed),
        saved: Number(workflow.saved),
        activityCreated: Number(workflow.activity_created),
        classShared: Number(workflow.class_shared),
        assignmentCreated: Number(workflow.assignment_created),
        completedJourneys: Number(workflow.completed_journeys),
        viewToReviewRate: percentage(workflow.reviewed, workflow.viewed),
        reviewToSaveRate: percentage(workflow.saved, workflow.reviewed),
        saveToActivityRate: percentage(workflow.activity_created, workflow.saved),
        activityToClassRate: percentage(workflow.class_shared, workflow.activity_created),
        classToAssignmentRate: percentage(workflow.assignment_created, workflow.class_shared),
      },
      engagement: {
        activeUsers7d: Number(workflow.active_users_7d),
        activeUsers30d: Number(workflow.active_users_30d),
        weeklyActiveClasses: Number(workflow.weekly_active_classes),
        avgMinutesToFirstActivity: Number(Number(workflow.average_minutes).toFixed(1)),
        inviteAcceptanceRate: percentage(invitations.accepted, invitations.total),
        assignmentCompletionRate: percentage(assignments.completed, assignments.expected),
        remixRate: percentage(workflow.remix_events, community.activities),
        teacherApprovalRate: percentage(
          community.approved_student_materials,
          community.student_materials,
        ),
        reportsPerThousand: community.content_items
          ? Number(((community.reports / community.content_items) * 1000).toFixed(1))
          : 0,
        estimatedStoredMb: Number((Number(storage.bytes) / 1024 / 1024).toFixed(2)),
      },
      activation: {
        registered30d: Number(workflow.registered_30d),
        firstSearchUsers30d: Number(workflow.first_search_users_30d),
        sourceCheckUsers30d: Number(workflow.source_check_users_30d),
        activatedLearners30d: Number(workflow.activated_learners_30d),
        activatedEducators30d: Number(workflow.activated_educators_30d),
        registeredToSearchRate: percentage(
          workflow.first_search_users_30d,
          workflow.registered_30d,
        ),
        searchToSourceCheckRate: percentage(
          workflow.source_check_users_30d,
          workflow.first_search_users_30d,
        ),
        sourceCheckToActionRate: percentage(
          workflow.activated_learners_30d,
          workflow.source_check_users_30d,
        ),
        d1ReturnRate: percentage(workflow.d1_returned, workflow.d1_eligible),
        d7ReturnRate: percentage(workflow.d7_returned, workflow.d7_eligible),
        classesWithFiveLearners: Number(workflow.classes_with_five_learners),
        searchNoResultRate: percentage(
          workflow.no_result_searches_30d,
          workflow.search_events_30d,
        ),
        avgPreviewCoverage: Number(
          Number(workflow.average_preview_coverage).toFixed(1),
        ),
      },
    };
  } catch {
    return emptyWorkflowAnalytics;
  }
}

async function readReliabilityAnalytics() {
  try {
    const result = await pool.query<{
      measured_users: number;
      error_users: number;
      vital_samples: number;
      client_errors: number;
      render_crashes: number;
      lcp_p75: number | null;
      inp_p75: number | null;
      cls_p75: number | null;
    }>(`
      WITH recent_telemetry AS (
        SELECT user_id, event, context
        FROM workflow_events
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND event IN ('web_vital_measured', 'client_error_observed')
      )
      SELECT
        COUNT(DISTINCT user_id)::int AS measured_users,
        COUNT(DISTINCT user_id) FILTER (WHERE event = 'client_error_observed')::int AS error_users,
        COUNT(*) FILTER (WHERE event = 'web_vital_measured')::int AS vital_samples,
        COUNT(*) FILTER (WHERE event = 'client_error_observed')::int AS client_errors,
        COUNT(*) FILTER (
          WHERE event = 'client_error_observed'
            AND context->>'source' = 'react_boundary'
        )::int AS render_crashes,
        percentile_cont(0.75) WITHIN GROUP (
          ORDER BY (context->>'value')::double precision
        ) FILTER (
          WHERE event = 'web_vital_measured' AND context->>'metric' = 'LCP'
        ) AS lcp_p75,
        percentile_cont(0.75) WITHIN GROUP (
          ORDER BY (context->>'value')::double precision
        ) FILTER (
          WHERE event = 'web_vital_measured' AND context->>'metric' = 'INP'
        ) AS inp_p75,
        percentile_cont(0.75) WITHIN GROUP (
          ORDER BY (context->>'value')::double precision
        ) FILTER (
          WHERE event = 'web_vital_measured' AND context->>'metric' = 'CLS'
        ) AS cls_p75
      FROM recent_telemetry
    `);
    const row = result.rows[0];
    if (!row) return emptyReliabilityAnalytics;

    const measuredUsers = Number(row.measured_users);
    const errorUsers = Number(row.error_users);
    const errorFreeUsersRate = measuredUsers
      ? Number((((measuredUsers - errorUsers) / measuredUsers) * 100).toFixed(1))
      : 0;
    const lcpP75Ms = row.lcp_p75 === null ? null : Math.round(Number(row.lcp_p75));
    const inpP75Ms = row.inp_p75 === null ? null : Math.round(Number(row.inp_p75));
    const clsP75 = row.cls_p75 === null ? null : Number(Number(row.cls_p75).toFixed(3));

    return {
      sampleWindowDays: 30,
      measuredUsers30d: measuredUsers,
      vitalSamples30d: Number(row.vital_samples),
      clientErrors30d: Number(row.client_errors),
      renderCrashes30d: Number(row.render_crashes),
      errorFreeUsersRate,
      lcpP75Ms,
      inpP75Ms,
      clsP75,
      lcpSloMet: lcpP75Ms === null ? null : lcpP75Ms <= 2_500,
      inpSloMet: inpP75Ms === null ? null : inpP75Ms <= 200,
      clsSloMet: clsP75 === null ? null : clsP75 <= 0.1,
      errorFreeUsersSloMet:
        measuredUsers === 0 ? null : errorFreeUsersRate >= 99,
    };
  } catch {
    return emptyReliabilityAnalytics;
  }
}

async function readAccountCapabilityMetrics() {
  const result = await pool.query<{
    learner_accounts: number;
    educator_accounts: number;
    accounts_both_learn_and_teach: number;
    active_class_owners_30d: number;
    class_learners: number;
  }>(`
      WITH learner_accounts AS (
        SELECT user_id FROM learning_goals WHERE workspace_role = 'student'
        UNION
        SELECT user_id FROM learning_evidence
        UNION
        SELECT owner_id AS user_id FROM study_activities WHERE workspace_role = 'student'
      ), active_class_owners AS (
        SELECT DISTINCT classes.teacher_id AS user_id
        FROM workflow_events
        JOIN classes ON classes.id = workflow_events.class_id
        WHERE workflow_events.created_at >= NOW() - INTERVAL '30 days'
      )
      SELECT
        (SELECT COUNT(*)::int FROM learner_accounts) AS learner_accounts,
        (SELECT COUNT(*)::int FROM users WHERE educator_enabled OR role = 'admin') AS educator_accounts,
        (SELECT COUNT(*)::int FROM learner_accounts JOIN users ON users.id = learner_accounts.user_id WHERE users.educator_enabled OR users.role = 'admin') AS accounts_both_learn_and_teach,
        (SELECT COUNT(*)::int FROM active_class_owners) AS active_class_owners_30d,
        (SELECT COUNT(DISTINCT user_id)::int FROM class_members WHERE role = 'student') AS class_learners
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Account capability metrics query returned no row");
  return {
    learnerAccounts: Number(row.learner_accounts),
    educatorAccounts: Number(row.educator_accounts),
    accountsBothLearnAndTeach: Number(row.accounts_both_learn_and_teach),
    activeClassOwners30d: Number(row.active_class_owners_30d),
    classLearners: Number(row.class_learners),
  };
}

router.get(
  "/admin/overview",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const [
      users,
      admins,
      goals,
      resources,
      cachedResearchReports,
      usageResult,
      allUsageResult,
      userRows,
      workflow,
      capabilityMetrics,
      reliability,
    ] = await Promise.all([
      count(usersTable),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(usersTable)
        .where(eq(usersTable.role, "admin"))
        .then(([row]) => row?.value ?? 0),
      count(learningGoalsTable),
      count(resourcesTable),
      count(sourceReviewCacheTable),
      readUsageRows(
        `SELECT key, CASE WHEN reset_time > NOW() THEN hits ELSE 0 END AS hits
         FROM rate_limit_hits WHERE key = ANY($1::text[])`,
        [["ai-search-daily:all-ai-searches", "deep-global-day:all"]],
      ),
      readUsageRows(
        `SELECT key, CASE WHEN reset_time > NOW() THEN hits ELSE 0 END AS hits
         FROM rate_limit_hits
         WHERE key LIKE 'usage-total:%' OR key LIKE 'usage-month:%' OR key LIKE 'usage-user-total:%'`,
      ),
      db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
        })
        .from(usersTable),
      readWorkflowAnalytics(),
      readAccountCapabilityMetrics(),
      readReliabilityAnalytics(),
    ]);
    const usageByKey = new Map(
      usageResult.map((row) => [row.key, Number(row.hits)]),
    );
    const counters = new Map(
      allUsageResult.map((row) => [row.key, Number(row.hits)]),
    );
    const featureCosts = {
      search: 0.012,
      "quick-review": 0.001,
      "deep-research": 0.05,
      metadata: 0.0005,
    } as const;
    const features = Object.keys(featureCosts) as Array<
      keyof typeof featureCosts
    >;
    const featureUsage = Object.fromEntries(
      features.map((feature) => {
        const total = counters.get(`usage-total:${feature}`) ?? 0;
        const month = counters.get(`usage-month:${feature}`) ?? 0;
        return [
          feature,
          {
            total,
            month,
            estimatedCostUsd: Number(
              (total * featureCosts[feature]).toFixed(2),
            ),
          },
        ];
      }),
    ) as Record<
      keyof typeof featureCosts,
      { total: number; month: number; estimatedCostUsd: number }
    >;
    const userUsage = userRows
      .map((user) => {
        const values = Object.fromEntries(
          features.map((feature) => [
            feature,
            counters.get(`usage-user-total:${user.id}:${feature}`) ?? 0,
          ]),
        ) as Record<keyof typeof featureCosts, number>;
        const total = features.reduce(
          (sum, feature) => sum + values[feature],
          0,
        );
        const estimatedCostUsd = features.reduce(
          (sum, feature) => sum + values[feature] * featureCosts[feature],
          0,
        );
        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          searches: values.search,
          quickReviews: values["quick-review"],
          deepResearch: values["deep-research"],
          metadata: values.metadata,
          total,
          estimatedCostUsd: Number(estimatedCostUsd.toFixed(2)),
        };
      })
      .filter((user) => user.total > 0)
      .sort((a, b) => b.total - a.total);
    const totalAiRequests = features.reduce(
      (sum, feature) => sum + featureUsage[feature].total,
      0,
    );
    const estimatedCostUsd = features.reduce(
      (sum, feature) => sum + featureUsage[feature].estimatedCostUsd,
      0,
    );
    res.json(
      GetAdminOverviewResponse.parse({
        users,
        ...capabilityMetrics,
        admins,
        goals,
        resources,
        cachedResearchReports,
        plan: {
          name: "Administrator",
          status: "active",
          aiSearchLimit: null,
          deepResearchDailyLimit: null,
        },
        usage: {
          aiSearchesToday:
            usageByKey.get("ai-search-daily:all-ai-searches") ?? 0,
          deepResearchToday: usageByKey.get("deep-global-day:all") ?? 0,
          totalAiRequests,
          estimatedCostUsd: Number(estimatedCostUsd.toFixed(2)),
          byFeature: featureUsage,
          byUser: userUsage,
        },
        workflow,
        reliability,
      }),
    );
  },
);

const adminUserSelection = {
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
  role: usersTable.role,
  activeRole: usersTable.activeRole,
  educatorEnabled: usersTable.educatorEnabled,
  teacherVerified: usersTable.teacherVerified,
  avatarUrl: usersTable.avatarUrl,
  bio: usersTable.bio,
  subjects: usersTable.subjects,
  gradeOrDept: usersTable.gradeOrDept,
  timezone: usersTable.timezone,
  profileVisibility: usersTable.profileVisibility,
  libraryVisibility: usersTable.libraryVisibility,
  showBio: usersTable.showBio,
  showSubjects: usersTable.showSubjects,
  showGradeOrDept: usersTable.showGradeOrDept,
  showWebsite: usersTable.showWebsite,
  websiteUrl: usersTable.websiteUrl,
  // RevenueCat once stored `premium` for today's Pro tier. The admin API uses
  // the same normalized three-tier vocabulary as entitlement enforcement.
  plan: sql<"free" | "plus" | "pro">`case
    when ${usersTable.plan} in ('pro', 'premium') then 'pro'
    when ${usersTable.plan} = 'plus' then 'plus'
    else 'free'
  end`,
  planExpiresAt: usersTable.planExpiresAt,
  bannedAt: usersTable.bannedAt,
  bannedReason: usersTable.bannedReason,
  createdAt: usersTable.createdAt,
};

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  // Zod's generic boolean coercion treats every non-empty string as true. Do
  // the HTTP string conversion explicitly so `?educatorEnabled=false` really
  // filters to accounts without that capability.
  if (
    req.query.educatorEnabled !== undefined &&
    req.query.educatorEnabled !== "true" &&
    req.query.educatorEnabled !== "false"
  ) {
    res.status(400).json({ error: "educatorEnabled must be true or false" });
    return;
  }
  const educatorEnabled =
    req.query.educatorEnabled === undefined
      ? undefined
      : req.query.educatorEnabled === "true";
  const parsed = ListAdminUsersQueryParams.safeParse({
    ...req.query,
    educatorEnabled,
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const {
    q = "",
    role,
    status,
    educatorEnabled: educatorFilter,
    limit,
    offset,
  } = parsed.data;
  const conditions = [];
  const searchTerm = q.trim().replace(/\s+/g, " ");
  if (searchTerm) {
    const pattern = `%${searchTerm}%`;
    conditions.push(
      or(
        ilike(usersTable.name, pattern),
        ilike(usersTable.email, pattern),
        ilike(usersTable.bio, pattern),
        ilike(usersTable.gradeOrDept, pattern),
        sql`array_to_string(${usersTable.subjects}, ' ') ilike ${pattern}`,
      )!,
    );
  }
  if (role) conditions.push(eq(usersTable.role, role));
  if (status === "active") conditions.push(isNull(usersTable.bannedAt));
  if (status === "banned") conditions.push(isNotNull(usersTable.bannedAt));
  if (educatorFilter !== undefined) {
    conditions.push(eq(usersTable.educatorEnabled, educatorFilter));
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const [users, [totalRow]] = await Promise.all([
    db
      .select(adminUserSelection)
      .from(usersTable)
      .where(where)
      .orderBy(sql`${usersTable.createdAt} desc`)
      .limit(limit)
      .offset(offset),
    db
      .select({ value: sql<number>`cast(count(*) as int)` })
      .from(usersTable)
      .where(where),
  ]);
  res.json(
    ListAdminUsersResponse.parse({
      items: users,
      total: totalRow?.value ?? 0,
      limit,
      offset,
    }),
  );
});

router.patch("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const adminId = (req as import("../middlewares/requireAuth").AuthenticatedRequest).userId;
  const params = UpdateAdminUserParams.safeParse(req.params);
  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : !parsed.success
          ? parsed.error.message
          : "At least one account field is required",
    });
    return;
  }
  const targetId = params.data.id;
  if (targetId === adminId && parsed.data.role && parsed.data.role !== "admin") {
    res.status(400).json({ error: "You cannot remove your own administrator access" });
    return;
  }
  const [current] = await db
    .select({
      role: usersTable.role,
      activeRole: usersTable.activeRole,
      educatorEnabled: usersTable.educatorEnabled,
    })
    .from(usersTable)
    .where(eq(usersTable.id, targetId));
  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const patch = {
    ...parsed.data,
    ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
    ...(parsed.data.email !== undefined
      ? { email: parsed.data.email.trim().toLowerCase() }
      : {}),
    ...(parsed.data.bio !== undefined
      ? { bio: parsed.data.bio?.trim() || null }
      : {}),
    ...(parsed.data.gradeOrDept !== undefined
      ? { gradeOrDept: parsed.data.gradeOrDept?.trim() || null }
      : {}),
    ...(parsed.data.timezone !== undefined
      ? { timezone: parsed.data.timezone?.trim() || null }
      : {}),
    ...(parsed.data.websiteUrl !== undefined
      ? { websiteUrl: parsed.data.websiteUrl?.trim() || null }
      : {}),
    ...(parsed.data.subjects !== undefined
      ? {
          subjects: parsed.data.subjects?.map((subject) => subject.trim()) ?? null,
        }
      : {}),
  };
  if (!patch.name && parsed.data.name !== undefined) {
    res.status(400).json({ error: "Name cannot be blank" });
    return;
  }
  if (patch.websiteUrl) {
    try {
      new URL(patch.websiteUrl);
    } catch {
      res.status(400).json({ error: "Website must be a valid URL" });
      return;
    }
  }
  const effectiveRole = patch.role ?? current.role;
  const effectiveEducator =
    effectiveRole === "teacher" ||
    effectiveRole === "admin" ||
    (patch.educatorEnabled ?? current.educatorEnabled);
  if (effectiveRole === "teacher") patch.educatorEnabled = true;
  // activeRole controls only the visible learner/educator workspace. It must
  // never encode administrator authority, and educator selection still needs
  // an effective educator capability (admins have that capability implicitly).
  if (
    patch.activeRole === "teacher" &&
    !effectiveEducator
  ) {
    res.status(400).json({ error: "Educator workspace requires educator capability" });
    return;
  }
  if (patch.educatorEnabled === false && effectiveRole !== "admin") {
    patch.activeRole = "student";
  }
  if (current.activeRole === "admin" && patch.activeRole === undefined) {
    patch.activeRole = effectiveEducator ? "teacher" : "student";
  }
  try {
    const [user] = await db.update(usersTable).set(patch)
      .where(eq(usersTable.id, targetId)).returning(adminUserSelection);
    res.json(UpdateAdminUserResponse.parse(user));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "That email address is already in use" });
      return;
    }
    throw error;
  }
});

router.patch("/admin/users/:id/plan", requireAdmin, async (req, res): Promise<void> => {
  const { userId: adminId } = req as import("../middlewares/requireAuth").AuthenticatedRequest;
  const params = OverrideAdminUserPlanParams.safeParse(req.params);
  const body = OverrideAdminUserPlanBody.safeParse(req.body);
  if (!params.success || !body.success || body.data.reason.trim().length < 3) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : !body.success
          ? body.error.message
          : "An audit reason of at least 3 characters is required",
    });
    return;
  }
  const planExpiresAt = body.data.plan === "free" ? null : body.data.expiresAt ?? null;
  let normalizedExpiry: string | null = null;
  if (planExpiresAt) {
    const expiresAtMs = Date.parse(planExpiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      res.status(400).json({ error: "A plan expiry must be a valid future date" });
      return;
    }
    normalizedExpiry = new Date(expiresAtMs).toISOString();
  }

  // The entitlement write and its explanation commit atomically: there is no
  // state in which paid access changed but the audit trail did not.
  const updated = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ plan: usersTable.plan, planExpiresAt: usersTable.planExpiresAt })
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id));
    if (!before) return null;
    const [user] = await tx
      .update(usersTable)
      .set({ plan: body.data.plan, planExpiresAt: normalizedExpiry })
      .where(eq(usersTable.id, params.data.id))
      .returning(adminUserSelection);
    await tx.insert(adminAuditLogsTable).values({
      actorUserId: adminId,
      targetUserId: params.data.id,
      action: "account_plan_override",
      reason: body.data.reason.trim(),
      beforeState: {
        plan: before.plan,
        planExpiresAt: before.planExpiresAt,
      },
      afterState: {
        plan: body.data.plan,
        planExpiresAt: normalizedExpiry,
      },
    });
    return user;
  });
  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(OverrideAdminUserPlanResponse.parse(updated));
});

const affiliationUpdate = z.object({
  role: z.enum(["student", "teacher"]).optional(),
  teacherNote: z.string().trim().max(2000).nullable().optional(),
}).strict();

router.patch("/admin/users/:id/classes/:classId/membership", requireAdmin, async (req, res): Promise<void> => {
  const targetId = Number(req.params.id);
  const classId = Number(req.params.classId);
  const parsed = affiliationUpdate.safeParse(req.body);
  if (!targetId || !classId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid affiliation" : parsed.error.message });
    return;
  }
  const [membership] = await db.update(classMembersTable).set(parsed.data)
    .where(and(eq(classMembersTable.userId, targetId), eq(classMembersTable.classId, classId)))
    .returning();
  if (!membership) {
    res.status(404).json({ error: "Class membership not found" });
    return;
  }
  res.json(membership);
});

const ownedClassUpdate = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  subject: z.string().trim().min(1).max(160).optional(),
  gradeLevel: z.string().trim().min(1).max(80).optional(),
}).strict();

router.patch("/admin/users/:id/classes/:classId", requireAdmin, async (req, res): Promise<void> => {
  const targetId = Number(req.params.id);
  const classId = Number(req.params.classId);
  const parsed = ownedClassUpdate.safeParse(req.body);
  if (!targetId || !classId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid class" : parsed.error.message });
    return;
  }
  const [classroom] = await db.update(classesTable).set(parsed.data)
    .where(and(eq(classesTable.id, classId), eq(classesTable.teacherId, targetId))).returning();
  if (!classroom) {
    res.status(404).json({ error: "Owned class not found" });
    return;
  }
  res.json(classroom);
});

const workEditBody = z.object({
  primary: z.string().trim().min(1).max(500),
  secondary: z.string().trim().max(5000).nullable().optional(),
}).strict();

router.patch("/admin/users/:id/work/:category/:itemId", requireAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const parsed = workEditBody.safeParse(req.body);
  if (!userId || !itemId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid work item" : parsed.error.message });
    return;
  }
  const { primary, secondary = null } = parsed.data;
  let updated: unknown;
  switch (req.params.category) {
    case "goals": [updated] = await db.update(learningGoalsTable).set({ title: primary, description: secondary }).where(and(eq(learningGoalsTable.id, itemId), eq(learningGoalsTable.userId, userId))).returning(); break;
    case "resources": [updated] = await db.update(resourcesTable).set({ title: primary, description: secondary }).where(and(eq(resourcesTable.id, itemId), eq(resourcesTable.submittedById, userId))).returning(); break;
    case "materials": [updated] = await db.update(forumMaterialsTable).set({ title: primary, description: secondary, updatedAt: new Date().toISOString() }).where(and(eq(forumMaterialsTable.id, itemId), eq(forumMaterialsTable.uploaderId, userId))).returning(); break;
    case "posts": [updated] = await db.update(forumPostsTable).set({ title: primary, body: secondary || primary, updatedAt: new Date().toISOString() }).where(and(eq(forumPostsTable.id, itemId), eq(forumPostsTable.authorId, userId))).returning(); break;
    case "comments": [updated] = await db.update(forumCommentsTable).set({ body: primary }).where(and(eq(forumCommentsTable.id, itemId), eq(forumCommentsTable.authorId, userId))).returning(); break;
    case "activities": [updated] = await db.update(studyActivitiesTable).set({ title: primary, subject: secondary || "General", updatedAt: new Date().toISOString() }).where(and(eq(studyActivitiesTable.id, itemId), eq(studyActivitiesTable.ownerId, userId))).returning(); break;
    case "canvases": [updated] = await db.update(canvasesTable).set({ title: primary, description: secondary, updatedAt: new Date().toISOString() }).where(and(eq(canvasesTable.id, itemId), eq(canvasesTable.ownerId, userId))).returning(); break;
    case "lists": [updated] = await db.update(resourceListsTable).set({ name: primary, description: secondary }).where(and(eq(resourceListsTable.id, itemId), eq(resourceListsTable.ownerId, userId))).returning(); break;
    case "assignments": [updated] = await db.update(classAssignmentsTable).set({ title: primary, instructions: secondary || "" }).where(and(eq(classAssignmentsTable.id, itemId), eq(classAssignmentsTable.createdById, userId))).returning(); break;
    case "schedule": [updated] = await db.update(scheduleBlocksTable).set({ title: primary, notes: secondary }).where(and(eq(scheduleBlocksTable.id, itemId), eq(scheduleBlocksTable.userId, userId))).returning(); break;
    case "studySessions": [updated] = await db.update(studySessionsTable).set({ title: primary, topic: secondary || primary }).where(and(eq(studySessionsTable.id, itemId), eq(studySessionsTable.organizerId, userId))).returning(); break;
    case "learningEvidence": [updated] = await db.update(learningEvidenceTable).set({ concept: primary, reflection: secondary }).where(and(eq(learningEvidenceTable.id, itemId), eq(learningEvidenceTable.userId, userId))).returning(); break;
    default: res.status(400).json({ error: "Unsupported work category" }); return;
  }
  if (!updated) { res.status(404).json({ error: "Work item not found for this account" }); return; }
  res.json(updated);
});

router.delete("/admin/users/:id/work/:category/:itemId", requireAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!userId || !itemId) { res.status(400).json({ error: "Invalid work item" }); return; }
  let deleted: unknown;
  switch (req.params.category) {
    case "goals": [deleted] = await db.delete(learningGoalsTable).where(and(eq(learningGoalsTable.id, itemId), eq(learningGoalsTable.userId, userId))).returning(); break;
    case "resources": [deleted] = await db.delete(resourcesTable).where(and(eq(resourcesTable.id, itemId), eq(resourcesTable.submittedById, userId))).returning(); break;
    case "materials": [deleted] = await db.delete(forumMaterialsTable).where(and(eq(forumMaterialsTable.id, itemId), eq(forumMaterialsTable.uploaderId, userId))).returning(); break;
    case "posts": [deleted] = await db.delete(forumPostsTable).where(and(eq(forumPostsTable.id, itemId), eq(forumPostsTable.authorId, userId))).returning(); break;
    case "comments": [deleted] = await db.delete(forumCommentsTable).where(and(eq(forumCommentsTable.id, itemId), eq(forumCommentsTable.authorId, userId))).returning(); break;
    case "activities": [deleted] = await db.delete(studyActivitiesTable).where(and(eq(studyActivitiesTable.id, itemId), eq(studyActivitiesTable.ownerId, userId))).returning(); break;
    case "canvases": [deleted] = await db.delete(canvasesTable).where(and(eq(canvasesTable.id, itemId), eq(canvasesTable.ownerId, userId))).returning(); break;
    case "lists": [deleted] = await db.delete(resourceListsTable).where(and(eq(resourceListsTable.id, itemId), eq(resourceListsTable.ownerId, userId))).returning(); break;
    case "assignments": [deleted] = await db.delete(classAssignmentsTable).where(and(eq(classAssignmentsTable.id, itemId), eq(classAssignmentsTable.createdById, userId))).returning(); break;
    case "schedule": [deleted] = await db.delete(scheduleBlocksTable).where(and(eq(scheduleBlocksTable.id, itemId), eq(scheduleBlocksTable.userId, userId))).returning(); break;
    case "studySessions": [deleted] = await db.delete(studySessionsTable).where(and(eq(studySessionsTable.id, itemId), eq(studySessionsTable.organizerId, userId))).returning(); break;
    case "learningEvidence": [deleted] = await db.delete(learningEvidenceTable).where(and(eq(learningEvidenceTable.id, itemId), eq(learningEvidenceTable.userId, userId))).returning(); break;
    default: res.status(400).json({ error: "Unsupported work category" }); return;
  }
  if (!deleted) { res.status(404).json({ error: "Work item not found for this account" }); return; }
  res.status(204).end();
});

router.get("/admin/users/:id/details", requireAdmin, async (req, res): Promise<void> => {
  const targetId = Number(req.params.id);
  if (!targetId) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [user] = await db
    .select(adminUserSelection)
    .from(usersTable)
    .where(eq(usersTable.id, targetId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [
    ownedClasses,
    classMemberships,
    canvasCollaborations,
    goals,
    resources,
    materials,
    posts,
    comments,
    activities,
    canvases,
    lists,
    assignments,
    schedule,
    studySessions,
    learningEvidence,
  ] = await Promise.all([
    db
      .select({
        id: classesTable.id,
        name: classesTable.name,
        subject: classesTable.subject,
        gradeLevel: classesTable.gradeLevel,
        createdAt: classesTable.createdAt,
      })
      .from(classesTable)
      .where(eq(classesTable.teacherId, targetId))
      .orderBy(sql`${classesTable.createdAt} desc`),
    db
      .select({
        classId: classesTable.id,
        name: classesTable.name,
        subject: classesTable.subject,
        gradeLevel: classesTable.gradeLevel,
        role: classMembersTable.role,
        teacherNote: classMembersTable.teacherNote,
        joinedAt: classMembersTable.joinedAt,
      })
      .from(classMembersTable)
      .innerJoin(classesTable, eq(classMembersTable.classId, classesTable.id))
      .where(eq(classMembersTable.userId, targetId))
      .orderBy(sql`${classMembersTable.joinedAt} desc`),
    db
      .select({
        canvasId: canvasesTable.id,
        title: canvasesTable.title,
        role: canvasCollaboratorsTable.role,
        addedAt: canvasCollaboratorsTable.createdAt,
      })
      .from(canvasCollaboratorsTable)
      .innerJoin(canvasesTable, eq(canvasCollaboratorsTable.canvasId, canvasesTable.id))
      .where(eq(canvasCollaboratorsTable.userId, targetId))
      .orderBy(sql`${canvasCollaboratorsTable.createdAt} desc`),
    db
      .select({
        id: learningGoalsTable.id,
        title: learningGoalsTable.title,
        subject: learningGoalsTable.subject,
        description: learningGoalsTable.description,
        level: learningGoalsTable.level,
        status: learningGoalsTable.status,
        targetDate: learningGoalsTable.targetDate,
        pathSteps: learningGoalsTable.pathSteps,
        updatedAt: learningGoalsTable.updatedAt,
      })
      .from(learningGoalsTable)
      .where(eq(learningGoalsTable.userId, targetId))
      .orderBy(sql`${learningGoalsTable.updatedAt} desc`),
    db
      .select({
        id: resourcesTable.id,
        title: resourcesTable.title,
        url: resourcesTable.url,
        description: resourcesTable.description,
        format: resourcesTable.format,
        subject: resourcesTable.subject,
        gradeLevel: resourcesTable.gradeLevel,
        createdAt: resourcesTable.createdAt,
      })
      .from(resourcesTable)
      .where(eq(resourcesTable.submittedById, targetId))
      .orderBy(sql`${resourcesTable.createdAt} desc`),
    db
      .select({
        id: forumMaterialsTable.id,
        title: forumMaterialsTable.title,
        description: forumMaterialsTable.description,
        unit: forumMaterialsTable.unit,
        topic: forumMaterialsTable.topic,
        materialType: forumMaterialsTable.materialType,
        tags: forumMaterialsTable.tags,
        moderationStatus: forumMaterialsTable.moderationStatus,
        fileName: forumMaterialsTable.fileName,
        linkUrl: forumMaterialsTable.linkUrl,
        createdAt: forumMaterialsTable.createdAt,
      })
      .from(forumMaterialsTable)
      .where(eq(forumMaterialsTable.uploaderId, targetId))
      .orderBy(sql`${forumMaterialsTable.createdAt} desc`),
    db
      .select({
        id: forumPostsTable.id,
        classId: forumPostsTable.classId,
        kind: forumPostsTable.kind,
        title: forumPostsTable.title,
        body: forumPostsTable.body,
        tags: forumPostsTable.tags,
        moderationStatus: forumPostsTable.moderationStatus,
        createdAt: forumPostsTable.createdAt,
        updatedAt: forumPostsTable.updatedAt,
      })
      .from(forumPostsTable)
      .where(eq(forumPostsTable.authorId, targetId))
      .orderBy(sql`${forumPostsTable.updatedAt} desc`),
    db
      .select({
        id: forumCommentsTable.id,
        targetType: forumCommentsTable.targetType,
        targetId: forumCommentsTable.targetId,
        body: forumCommentsTable.body,
        moderationStatus: forumCommentsTable.moderationStatus,
        createdAt: forumCommentsTable.createdAt,
      })
      .from(forumCommentsTable)
      .where(eq(forumCommentsTable.authorId, targetId))
      .orderBy(sql`${forumCommentsTable.createdAt} desc`),
    db
      .select({
        id: studyActivitiesTable.id,
        classId: studyActivitiesTable.classId,
        title: studyActivitiesTable.title,
        subject: studyActivitiesTable.subject,
        cards: studyActivitiesTable.cards,
        updatedAt: studyActivitiesTable.updatedAt,
      })
      .from(studyActivitiesTable)
      .where(eq(studyActivitiesTable.ownerId, targetId))
      .orderBy(sql`${studyActivitiesTable.updatedAt} desc`),
    db
      .select({
        id: canvasesTable.id,
        classId: canvasesTable.classId,
        title: canvasesTable.title,
        description: canvasesTable.description,
        visibility: canvasesTable.visibility,
        document: canvasesTable.document,
        updatedAt: canvasesTable.updatedAt,
      })
      .from(canvasesTable)
      .where(eq(canvasesTable.ownerId, targetId))
      .orderBy(sql`${canvasesTable.updatedAt} desc`),
    db
      .select({
        id: resourceListsTable.id,
        classId: resourceListsTable.classId,
        name: resourceListsTable.name,
        description: resourceListsTable.description,
        createdAt: resourceListsTable.createdAt,
      })
      .from(resourceListsTable)
      .where(eq(resourceListsTable.ownerId, targetId))
      .orderBy(sql`${resourceListsTable.createdAt} desc`),
    db
      .select({
        id: classAssignmentsTable.id,
        classId: classAssignmentsTable.classId,
        title: classAssignmentsTable.title,
        instructions: classAssignmentsTable.instructions,
        dueAt: classAssignmentsTable.dueAt,
        createdAt: classAssignmentsTable.createdAt,
      })
      .from(classAssignmentsTable)
      .where(eq(classAssignmentsTable.createdById, targetId))
      .orderBy(sql`${classAssignmentsTable.createdAt} desc`),
    db
      .select({
        id: scheduleBlocksTable.id,
        classId: scheduleBlocksTable.classId,
        title: scheduleBlocksTable.title,
        date: scheduleBlocksTable.date,
        startTime: scheduleBlocksTable.startTime,
        endTime: scheduleBlocksTable.endTime,
        notes: scheduleBlocksTable.notes,
      })
      .from(scheduleBlocksTable)
      .where(eq(scheduleBlocksTable.userId, targetId))
      .orderBy(sql`${scheduleBlocksTable.date} desc`),
    db
      .select({
        id: studySessionsTable.id,
        title: studySessionsTable.title,
        topic: studySessionsTable.topic,
        startsAt: studySessionsTable.startsAt,
        durationMinutes: studySessionsTable.durationMinutes,
        meetingUrl: studySessionsTable.meetingUrl,
      })
      .from(studySessionsTable)
      .where(eq(studySessionsTable.organizerId, targetId))
      .orderBy(sql`${studySessionsTable.startsAt} desc`),
    db
      .select({
        id: learningEvidenceTable.id,
        concept: learningEvidenceTable.concept,
        confidence: learningEvidenceTable.confidence,
        understanding: learningEvidenceTable.understanding,
        reflection: learningEvidenceTable.reflection,
        misconception: learningEvidenceTable.misconception,
        createdAt: learningEvidenceTable.createdAt,
      })
      .from(learningEvidenceTable)
      .where(eq(learningEvidenceTable.userId, targetId))
      .orderBy(sql`${learningEvidenceTable.createdAt} desc`),
  ]);

  res.json({
    user,
    affiliations: { ownedClasses, classMemberships, canvasCollaborations },
    work: {
      goals,
      resources,
      materials,
      posts,
      comments,
      activities: activities.map(({ cards, ...activity }) => ({
        ...activity,
        cards: cards.map(({ imageData: _imageData, ...card }) => ({
          ...card,
          hasImage: Boolean(_imageData),
        })),
      })),
      canvases: canvases.map(({ document, ...canvas }) => ({
        ...canvas,
        nodes: document.nodes.map((node) => ({
          kind: node.data.kind,
          title: node.data.title,
          text: node.data.text,
          url: node.data.url,
          resourceId: node.data.resourceId,
        })),
        connectionCount: document.edges.length,
      })),
      lists,
      assignments,
      schedule,
      studySessions,
      learningEvidence,
    },
  });
});

router.patch("/admin/users/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const adminId = (req as import("../middlewares/requireAuth").AuthenticatedRequest).userId;
  const params = BanAdminUserParams.safeParse(req.params);
  const body = BanAdminUserBody.safeParse(req.body);
  const reason = body.success ? body.data.reason.trim() : "";
  if (!params.success || !body.success || reason.length < 3) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : !body.success
          ? body.error.message
          : "A ban reason of at least 3 characters is required",
    });
    return;
  }
  const targetId = params.data.id;
  if (targetId === adminId) {
    res.status(400).json({ error: "Administrators cannot ban their own account" });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set({
      bannedAt: new Date().toISOString(),
      bannedReason: reason,
    })
    .where(eq(usersTable.id, targetId))
    .returning(adminUserSelection);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(BanAdminUserResponse.parse(user));
});

router.patch("/admin/users/:id/teacher-verification", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminPublisherVerificationParams.safeParse(req.params);
  const body = UpdateAdminPublisherVerificationBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const targetId = params.data.id;
  const { verified } = body.data;

  const [target] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, targetId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Verification is an ACCOUNT-level trust flag (it lets a submitter's
  // resources publish without review), so students can hold it too. Admins are
  // trusted implicitly and are excluded, they also can never be role
  // "teacher", so the old teacher-only gate made allowlisted admins permanently
  // unverifiable.
  if (target.role === "admin") {
    res.status(400).json({ error: "Admin accounts are trusted implicitly" });
    return;
  }

  const { userId } = req as import("../middlewares/requireAuth").AuthenticatedRequest;
  const [user] = await db
    .update(usersTable)
    .set({
      teacherVerified: verified,
      verifiedAt: verified ? new Date().toISOString() : null,
      verifiedById: verified ? userId : null,
    })
    .where(eq(usersTable.id, targetId))
    .returning(adminUserSelection);
  res.json(UpdateAdminPublisherVerificationResponse.parse(user));
});

router.delete("/admin/users/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const params = UnbanAdminUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const targetId = params.data.id;
  const [user] = await db
    .update(usersTable)
    .set({ bannedAt: null, bannedReason: null })
    .where(eq(usersTable.id, targetId))
    .returning(adminUserSelection);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(UnbanAdminUserResponse.parse(user));
});

// ── Resource verification review queue ──────────────────────────────────────
// These operations are generated from OpenAPI because moderation state is a
// security boundary: the server and admin UI must agree on every transition.

// GET /admin/resources/review-queue, oldest first, so submissions cannot be
// starved by newer ones.
router.get(
  "/admin/resources/review-queue",
  requireAdmin,
  async (req, res): Promise<void> => {
    const query = ListAdminResourceReviewQueueQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    const { status, limit, offset } = query.data;

    const rows = await db
      .select({
        id: resourcesTable.id,
        title: resourcesTable.title,
        url: resourcesTable.url,
        description: resourcesTable.description,
        format: resourcesTable.format,
        subject: resourcesTable.subject,
        gradeLevel: resourcesTable.gradeLevel,
        thumbnailUrl: resourcesTable.thumbnailUrl,
        createdAt: resourcesTable.createdAt,
        verificationStatus: resourcesTable.verificationStatus,
        verificationSource: resourcesTable.verificationSource,
        verificationNote: resourcesTable.verificationNote,
        submittedById: resourcesTable.submittedById,
        submittedByName: usersTable.name,
        submittedByEmail: usersTable.email,
        submittedByRole: usersTable.role,
        submitterVerified: usersTable.teacherVerified,
      })
      .from(resourcesTable)
      .leftJoin(usersTable, eq(usersTable.id, resourcesTable.submittedById))
      .where(eq(resourcesTable.verificationStatus, status))
      .orderBy(resourcesTable.createdAt)
      .limit(limit)
      .offset(offset);

    const [counts] = await db
      .select({ pending: sql<number>`cast(count(*) as int)` })
      .from(resourcesTable)
      .where(eq(resourcesTable.verificationStatus, "unverified"));

    res.json(
      ListAdminResourceReviewQueueResponse.parse({
        items: rows,
        pendingTotal: counts?.pending ?? 0,
      }),
    );
  },
);

// PATCH /admin/resources/:id/verification, approve, reject, or send back.
router.patch(
  "/admin/resources/:id/verification",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminResourceVerificationParams.safeParse(req.params);
    const parsed = UpdateAdminResourceVerificationBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const resourceId = params.data.id;
    const { status, note: rawNote } = parsed.data;
    const note = rawNote?.trim() || undefined;
    // A rejection has to say why, that reason is the only thing the submitter
    // can act on.
    if (status === "rejected" && !note) {
      res.status(400).json({ error: "A note is required when rejecting" });
      return;
    }

    const [resource] = await db
      .update(resourcesTable)
      .set({
        verificationStatus: status,
        verificationSource: status === "unverified" ? null : "reviewer",
        verificationNote: note ?? null,
      })
      .where(eq(resourcesTable.id, resourceId))
      .returning({
        id: resourcesTable.id,
        title: resourcesTable.title,
        verificationStatus: resourcesTable.verificationStatus,
        verificationNote: resourcesTable.verificationNote,
      });
    if (!resource) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
    res.json(UpdateAdminResourceVerificationResponse.parse(resource));
  },
);

// POST /admin/resources/verification/bulk, the difference between a queue and
// a backlog when one person is reviewing.
router.post(
  "/admin/resources/verification/bulk",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = BulkUpdateAdminResourceVerificationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { ids, status, note: rawNote } = parsed.data;
    const note = rawNote?.trim() || undefined;
    if (status === "rejected" && !note) {
      res.status(400).json({ error: "A note is required when rejecting" });
      return;
    }
    const updated = await db
      .update(resourcesTable)
      .set({
        verificationStatus: status,
        verificationSource: status === "unverified" ? null : "reviewer",
        verificationNote: note ?? null,
      })
      .where(inArray(resourcesTable.id, ids))
      .returning({ id: resourcesTable.id });
    res.json(
      BulkUpdateAdminResourceVerificationResponse.parse({
        updated: updated.length,
      }),
    );
  },
);

export default router;
