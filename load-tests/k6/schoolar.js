import http from "k6/http";
import exec from "k6/execution";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:8080").replace(
  /\/+$/,
  "",
);
const PROFILE = (__ENV.PROFILE || "smoke").toLowerCase();
const IS_PRODUCTION = [
  "https://casparel.com",
  "https://www.casparel.com",
  "lightgrey-oyster-122608.hostingersite.com",
].some(
  (origin) =>
    BASE_URL === origin ||
    BASE_URL.startsWith(`${origin}/`) ||
    (!origin.startsWith("https://") && BASE_URL.includes(origin)),
);
const ALLOW_PRODUCTION_LOAD = __ENV.ALLOW_PRODUCTION_LOAD === "true";
const SMOKE_ITERATIONS = Math.min(
  10,
  Math.max(1, Math.floor(Number(__ENV.SMOKE_ITERATIONS || 1))),
);

if (!["smoke", "public", "authenticated"].includes(PROFILE)) {
  throw new Error(`Unknown PROFILE "${PROFILE}"`);
}

if (IS_PRODUCTION && PROFILE !== "smoke" && !ALLOW_PRODUCTION_LOAD) {
  throw new Error(
    "Production is limited to PROFILE=smoke. Use a staging BASE_URL, or explicitly set ALLOW_PRODUCTION_LOAD=true.",
  );
}

const requestFailures = new Rate("schoolar_request_failures");
const healthDuration = new Trend("schoolar_health_duration", true);
const resourcesPageDuration = new Trend(
  "schoolar_resources_page_duration",
  true,
);
const catalogLatestDuration = new Trend(
  "schoolar_catalog_latest_duration",
  true,
);
const catalogSearchDuration = new Trend(
  "schoolar_catalog_search_duration",
  true,
);
const authenticatedDuration = new Trend(
  "schoolar_authenticated_duration",
  true,
);

const safetyThresholds = {
  schoolar_request_failures: ["rate<0.01"],
  http_req_failed: ["rate<0.01"],
};

const smokeThresholds = {
  schoolar_health_duration: ["p(95)<750"],
  schoolar_resources_page_duration: ["p(95)<1500"],
  schoolar_catalog_latest_duration: ["p(95)<5000"],
  schoolar_catalog_search_duration: ["p(95)<5000"],
};

const loadThresholds = {
  http_req_duration: ["p(95)<1000", "p(99)<2000"],
  schoolar_health_duration: ["p(95)<500"],
  schoolar_resources_page_duration: ["p(95)<1000"],
  schoolar_catalog_latest_duration: ["p(95)<1200"],
  schoolar_catalog_search_duration: ["p(95)<1200"],
};

const profileOptions = {
  smoke: {
    scenarios: {
      smoke: {
        executor: "shared-iterations",
        vus: 1,
        iterations: SMOKE_ITERATIONS,
        maxDuration: "30s",
      },
    },
  },
  public: {
    scenarios: {
      public_catalog: {
        executor: "ramping-vus",
        startVUs: 0,
        stages: [
          { duration: "30s", target: 10 },
          { duration: "1m", target: 25 },
          { duration: "1m", target: 50 },
          { duration: "30s", target: 0 },
        ],
        gracefulRampDown: "15s",
      },
    },
  },
  authenticated: {
    scenarios: {
      authenticated_reads: {
        executor: "ramping-vus",
        startVUs: 0,
        stages: [
          { duration: "30s", target: 5 },
          { duration: "1m", target: 15 },
          { duration: "1m", target: 30 },
          { duration: "30s", target: 0 },
        ],
        gracefulRampDown: "15s",
      },
    },
  },
};

export const options = {
  ...profileOptions[PROFILE],
  thresholds: {
    ...safetyThresholds,
    ...(PROFILE === "smoke" ? smokeThresholds : loadThresholds),
    ...(PROFILE === "authenticated"
      ? { schoolar_authenticated_duration: ["p(95)<1200"] }
      : {}),
  },
  noConnectionReuse: false,
  userAgent: "Casparel-k6-load-test/1.0",
};

function headers(token) {
  return token
    ? {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      }
    : { Accept: "application/json" };
}

function read(path, name, trend, token) {
  const response = http.get(`${BASE_URL}${path}`, {
    headers: headers(token),
    tags: { endpoint: name },
    timeout: "10s",
  });
  const ok = check(response, {
    [`${name} returns 200`]: (result) => result.status === 200,
  });
  requestFailures.add(!ok, { endpoint: name });
  trend.add(response.timings.duration, { endpoint: name });
  return response;
}

function publicJourney() {
  group("public shell and catalog", () => {
    read("/api/healthz", "health", healthDuration);
    read("/resources", "resources_page", resourcesPageDuration);
    read(
      "/api/resources?limit=12&offset=0&sortBy=newest",
      "catalog_latest",
      catalogLatestDuration,
    );

    const searches = ["calculus", "biology", "world history", "python"];
    const query = searches[exec.scenario.iterationInTest % searches.length];
    read(
      `/api/resources?q=${encodeURIComponent(query)}&limit=12&offset=0`,
      "catalog_search",
      catalogSearchDuration,
    );
  });
}

function authenticatedJourney(token) {
  group("authenticated workspace reads", () => {
    read("/api/users/me", "current_user", authenticatedDuration, token);
    read(
      "/api/dashboard/summary",
      "dashboard_summary",
      authenticatedDuration,
      token,
    );
    read(
      "/api/activity/recent",
      "recent_activity",
      authenticatedDuration,
      token,
    );
    read("/api/lists", "lists", authenticatedDuration, token);
    read("/api/classes", "classes", authenticatedDuration, token);
    read(
      "/api/study-activities",
      "study_activities",
      authenticatedDuration,
      token,
    );
    read("/api/forum/access", "forum_access", authenticatedDuration, token);
    read(
      "/api/forum/posts?sort=newest",
      "forum_feed",
      authenticatedDuration,
      token,
    );
    read(
      "/api/workflow/continue",
      "workflow_continue",
      authenticatedDuration,
      token,
    );
  });
}

export function setup() {
  if (PROFILE !== "authenticated") return { token: null };

  if (__ENV.SCHOOLAR_TOKEN) return { token: __ENV.SCHOOLAR_TOKEN };

  if (!__ENV.SCHOOLAR_TEST_EMAIL || !__ENV.SCHOOLAR_TEST_PASSWORD) {
    exec.test.abort(
      "Authenticated testing requires SCHOOLAR_TOKEN or dedicated SCHOOLAR_TEST_EMAIL and SCHOOLAR_TEST_PASSWORD values.",
    );
  }

  const response = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: __ENV.SCHOOLAR_TEST_EMAIL,
      password: __ENV.SCHOOLAR_TEST_PASSWORD,
    }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { endpoint: "login_setup" },
      timeout: "10s",
    },
  );

  if (response.status !== 200) {
    exec.test.abort(`Test-account login failed with HTTP ${response.status}.`);
  }

  return { token: response.json("token") };
}

export default function (data) {
  publicJourney();
  if (PROFILE === "authenticated") authenticatedJourney(data.token);
  sleep(PROFILE === "smoke" ? 0.1 : 0.5 + Math.random());
}
