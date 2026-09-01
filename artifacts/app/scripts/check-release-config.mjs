#!/usr/bin/env node
import { validateWebReleaseConfig } from './release-config.mjs';

const problems = validateWebReleaseConfig(process.env);
if (problems.length) {
  console.error(`Web production configuration has ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}
console.log('Web RevenueCat Billing and AdSense production configuration is present.');
