import readline from 'node:readline';
import bcrypt from 'bcrypt';
import { readConfig, writeConfig } from './lib/config.js';

const BCRYPT_ROUNDS = 12;

function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      // Hide input for password
      process.stdout.write(question);
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf-8');

      let input = '';
      const onData = (char: string) => {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          stdin.setRawMode(false);
          stdin.removeListener('data', onData);
          rl.close();
          process.stdout.write('\n');
          resolve(input);
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit(0);
        } else if (char === '\u007F' || char === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
          }
        } else {
          input += char;
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function main() {
  console.log('Annex Setup');
  console.log('===============\n');

  if (!process.env.NOTES_DIR) {
    console.log('Note: NOTES_DIR not set. Config will be stored at ~/.annex/config.json');
    console.log('Set NOTES_DIR to store config alongside your notes as _annex.json\n');
  }

  const config = await readConfig();

  if (config.passwordHash) {
    const overwrite = await prompt('A password is already set. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  const password = await prompt('Enter password: ', true);
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const confirm = await prompt('Confirm password: ', true);
  if (password !== confirm) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  config.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await writeConfig(config);

  console.log('\nPassword set successfully.');
  console.log('Start the server with: npm run dev:server');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
