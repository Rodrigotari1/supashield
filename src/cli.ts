import 'dotenv/config';
import { Command } from 'commander';
import { initCommand } from './init.js';
import { testCommand } from './test.js';

const program = new Command();

program
  .name('supasec')
  .description('CLI tool to test Supabase/Postgres RLS policies');

program.addCommand(initCommand);
program.addCommand(testCommand);

program.parse(); 