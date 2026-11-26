import readline from 'node:readline';
import bcrypt from 'bcrypt';
import { migrateLegacyAuth, readPasswordHash, writePasswordHash } from './lib/config.js';

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

  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--migrate-auth') {
    await migrateLegacyAuth();
    console.log('Private authentication state is ready.');
    return;
  }
  if (args.length) throw new Error('Usage: npm run setup -- [--migrate-auth]');

  if (await readPasswordHash()) {
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

  await writePasswordHash(await bcrypt.hash(password, BCRYPT_ROUNDS));

  console.log('\nPassword set successfully.');
  console.log('Start the server with: npm run dev:server');
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
