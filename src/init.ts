import { Command } from 'commander';

export const initCommand = new Command('init')
  .description('Introspect database schema and scaffold policy.yaml')
  .action(async () => {
    // TODO: implement init logic
    console.log('supasec init not implemented yet');
  }); 