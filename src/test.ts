import { Command } from 'commander';

export const testCommand = new Command('test')
  .description('Run policy tests against database')
  .action(async () => {
    // TODO: implement test runner
    console.log('supasec test not implemented yet');
  }); 