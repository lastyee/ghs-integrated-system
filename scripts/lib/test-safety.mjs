const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function fail(message) {
  throw new Error(`Mutation safety check failed: ${message}`);
}

export function assertSafeLocalDatabase({ expectedDatabase }) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    fail("production runtime configuration is not allowed");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL is required");

  let database;
  try {
    database = new URL(databaseUrl);
  } catch {
    fail("DATABASE_URL is invalid");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol)) {
    fail("DATABASE_URL must use PostgreSQL");
  }
  if (!LOCAL_HOSTS.has(database.hostname)) fail("database host must be local");

  const databaseName = decodeURIComponent(database.pathname.replace(/^\/+/, ""));
  if (databaseName !== expectedDatabase) {
    fail(`database must be exactly ${expectedDatabase}; found ${databaseName || "(empty)"}`);
  }

  console.warn(`Sensitive local database target confirmed: "${databaseName}" at ${database.hostname}.`);
}

export function assertSafeLocalApplicationTarget({ baseUrl }) {
  let target;
  try {
    target = new URL(baseUrl);
  } catch {
    fail("test application URL is invalid");
  }
  if (!["http:", "https:"].includes(target.protocol)) {
    fail("test application URL must use HTTP or HTTPS");
  }
  if (!LOCAL_HOSTS.has(target.hostname)) fail("test application host must be local");
}

export function assertSafeMutationTarget({
  mutationFlag,
  expectedDatabase,
  baseUrl,
  confirmationFlag,
}) {
  if (process.env[mutationFlag] !== "YES") {
    fail(`set ${mutationFlag}=YES only after reviewing this script's mutations and cleanup`);
  }
  assertSafeLocalDatabase({ expectedDatabase });
  const database = new URL(process.env.DATABASE_URL);
  const databaseName = decodeURIComponent(database.pathname.replace(/^\/+/, ""));
  if (!confirmationFlag) {
    fail("an exact database confirmation flag must be configured");
  }
  if (process.env[confirmationFlag] !== expectedDatabase) {
    fail(`set ${confirmationFlag}=${expectedDatabase} to confirm the isolated database target`);
  }

  if (baseUrl) {
    if (!process.env.TEST_BASE_URL) {
      fail("TEST_BASE_URL must be explicitly set for HTTP mutation tests");
    }
    if (process.env.TEST_APP_DATABASE_CONFIRM !== expectedDatabase) {
      fail(`set TEST_APP_DATABASE_CONFIRM=${expectedDatabase} after verifying the local application database`);
    }
    assertSafeLocalApplicationTarget({ baseUrl });
  }

  console.warn(`Mutation target confirmed: local database "${databaseName}" at ${database.hostname}.`);
}
