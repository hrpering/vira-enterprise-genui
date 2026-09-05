import { parseViraRuntimeEnvironment } from "../../../ops/deploy/runtime-environment.js";
import { startViraService } from "../../../ops/deploy/start-service.js";

const config = parseViraRuntimeEnvironment(process.env, "vira-api");
startViraService(config);
