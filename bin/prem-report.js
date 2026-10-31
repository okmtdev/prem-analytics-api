#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code ?? 0;
  },
  (err) => {
    console.error(`\n[prem-report] ${err?.message ?? err}`);
    if (process.env.PREM_DEBUG) console.error(err);
    process.exitCode = 1;
  },
);
