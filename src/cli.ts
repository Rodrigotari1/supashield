import 'dotenv/config';
import { Command } from 'commander';
import { initCommand } from './commands/init.command.js';
import { testCommand } from './commands/test.command.js';
import { snapshotCommand } from './commands/snapshot.command.js';
import { diffCommand } from './commands/diff.command.js';

const program = new Command();

program
  .name('supasec')
  .description('CLI tool to test Supabase/Postgres RLS policies');

program.addCommand(initCommand);
program.addCommand(testCommand);
program.addCommand(snapshotCommand);
program.addCommand(diffCommand);

program.parse(); 