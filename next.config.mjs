/** @type {import('next').NextConfig} */
export default {
  // В Docker (NEXT_OUTPUT=standalone): .next/standalone содержит сервер и только нужные node_modules.
  // Локально — обычная сборка для `npm start`
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
};
