#!/usr/bin/env node

import { register } from "tsx/esm/api";

register();
const { reportCliFailure, runGenUICli } = await import("../src/cli.ts");

runGenUICli(process.argv.slice(2)).catch(reportCliFailure);
