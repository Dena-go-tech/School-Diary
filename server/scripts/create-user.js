#!/usr/bin/env node
// Создание пользователя из консоли (в первую очередь — первого администратора).
//
//   npm run createsuperuser                       — спросит логин, имя и пароль
//   node server/scripts/create-user.js --role student --username ivan --name "Иван" --password secret
//   В Docker: docker compose exec app npm run createsuperuser
//
// Пароль можно передать и через переменную окружения USER_PASSWORD (чтобы не светить в истории команд).
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { pool, migrate } from '../db.js';
import { createUser, MIN_PASSWORD, ROLES } from '../auth.js';

const { values: args } = parseArgs({
  options: {
    role: { type: 'string', default: 'admin' },
    username: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
  },
});

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Не показываем вводимые символы пароля
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else if (s.includes('\n') || s.includes('\r')) rl.output.write('\n');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  if (!ROLES.includes(args.role)) throw new Error(`--role: ${ROLES.join(' или ')}`);
  await migrate({ retries: 3, log: () => {} });

  const username = (args.username ?? (await ask('Логин: '))).trim();
  const name = (args.name ?? (await ask('Имя (как показывать в приложении): '))).trim() || username;
  let password = args.password ?? process.env.USER_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) throw new Error('Нет терминала для ввода пароля: передайте --password или USER_PASSWORD');
    password = await ask(`Пароль (минимум ${MIN_PASSWORD} символов): `, { hidden: true });
    const again = await ask('Пароль ещё раз: ', { hidden: true });
    if (password !== again) throw new Error('Пароли не совпадают');
  }

  const user = await createUser({ username, name, password, role: args.role });
  console.log(`Готово: ${user.role === 'admin' ? 'администратор' : 'ученик'} «${user.name}» (логин ${user.username})`);
}

main()
  .catch((e) => {
    console.error('Ошибка:', e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
