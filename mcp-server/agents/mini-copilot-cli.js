#!/usr/bin/env node
// Mini Copilot CLI agent scaffold - interactive helper for local testing
// Features: read commands list, provide help, simulate invocation, teach agents.

const fs = require('fs');
const path = require('path');
const commandsFile = path.join(__dirname, '..', '..', 'docs', 'copilot-cli-commands', 'commands.md');

function listCommands() {
  const txt = fs.readFileSync(commandsFile, 'utf8');
  console.log(txt.split('\n').slice(0, 200).join('\n'));
}

function help() {
  console.log('Mini Copilot CLI Agent\nCommands: list, help, show <n>, teach <n>');
}

const argv = process.argv.slice(2);
if (argv.length === 0) help();
else if (argv[0] === 'list') listCommands();
else if (argv[0] === 'help') help();
else if (argv[0] === 'show' && argv[1]) {
  const txt = fs.readFileSync(commandsFile, 'utf8');
  console.log(txt.match(new RegExp('^'+argv[1]+"\\..+", 'gm')) || 'Not found');
} else {
  help();
}
