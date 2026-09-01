#!/usr/bin/env node

import "tsx";

const { reportCliFailure, runGenUICli } = await import("../src/cli.ts");

runGenUICli(process.argv.slice(2)).catch(reportCliFailure);
