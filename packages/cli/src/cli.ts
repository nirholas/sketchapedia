#!/usr/bin/env node
/**
 * @sketchapedia/cli CLI entry.
 * Populated by prompt 27. Scaffold prints the package banner.
 */
import { cliPackageName } from './index.js';

function main(): void {
  process.stdout.write(`${cliPackageName} scaffold — run by prompt 27\n`);
}

main();
