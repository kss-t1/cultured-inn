// bun run jobs:imports            run every enabled source that is due
// bun run jobs:imports --all      run every enabled source now
// bun run jobs:imports <key|id>…  run the given sources now (even if disabled)
import { sql } from "../src/db.ts";
import { loadSource, runDueSources, runSource } from "../src/importers/run.ts";

const args = process.argv.slice(2);
const log = (m: string) => console.log(m);
let failed = false;

if (args.length === 0) {
  await runDueSources(log);
} else if (args[0] === "--all") {
  for (const { id } of await sql`SELECT id FROM sources WHERE enabled ORDER BY id`) {
    const r = await runSource(id, log);
    failed ||= r.status === "error";
  }
} else {
  for (const a of args) {
    const source = await loadSource(/^\d+$/.test(a) ? Number(a) : a);
    if (!source) {
      console.error(`unknown source: ${a}`);
      failed = true;
      continue;
    }
    const r = await runSource(source.id, log);
    if (r.status === "busy") console.log(`${source.name}: already running elsewhere`);
    failed ||= r.status === "error";
  }
}
await sql.close();
process.exit(failed ? 1 : 0);
