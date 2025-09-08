import 'dotenv/config';
import { Command } from 'commander';
import { initCommand } from './commands/init.command.js';
import { testCommand } from './commands/test.command.js';

const program = new Command();

program
  .name('supaguard')
  .description('Security testing for Supabase RLS policies - catch data leaks before production');

program.addCommand(initCommand);
program.addCommand(testCommand);

program.parse(); 