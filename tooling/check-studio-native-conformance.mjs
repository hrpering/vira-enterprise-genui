import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const temp = mkdtempSync(path.join(os.tmpdir(), 'vira-studio-interop-'));
const valid = path.join(root, 'interop/studio-experience/v1/fixtures/valid.json');
const invalidVersion = path.join(root, 'interop/studio-experience/v1/fixtures/invalid-version.json');
const missingRequired = path.join(root, 'interop/studio-experience/v1/fixtures/invalid-missing-required.json');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  process.stdout.write(result.stdout);
}

try {
  const swiftBin = path.join(temp, 'swift-conformance');
  run('swiftc', [
    'interop/studio-experience/v1/swift/StudioExperienceModels.swift',
    'interop/studio-experience/v1/swift/Conformance.swift',
    '-o', swiftBin,
  ]);
  run(swiftBin, [valid, invalidVersion, missingRequired]);

  const kotlinJar = path.join(temp, 'kotlin-conformance.jar');
  run('kotlinc', [
    'interop/studio-experience/v1/kotlin/StudioExperienceModels.kt',
    'interop/studio-experience/v1/kotlin/Conformance.kt',
    '-include-runtime', '-d', kotlinJar,
  ]);
  run('java', ['-jar', kotlinJar, valid, invalidVersion, missingRequired]);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
