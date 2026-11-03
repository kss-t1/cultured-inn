// Preloaded by `bun test` (bunfig.toml). Points the app at the test database, refusing to run
// against anything whose name doesn't end in _test, because tests wipe tables.
const testUrl =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2") : undefined);
if (!testUrl) throw new Error("Set TEST_DATABASE_URL (or DATABASE_URL) for tests");
const dbName = new URL(testUrl).pathname.slice(1);
if (!dbName.endsWith("_test")) throw new Error(`Refusing to run tests against non-test database "${dbName}"`);

process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET ??= "test-secret";
process.env.PUBLIC_BASE_URL = "https://karczma.test";
process.env.NODE_ENV = "test";

const { migrate } = await import("../db/migrate.ts");
await migrate(() => {});
