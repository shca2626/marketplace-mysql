import { db } from '../../src/lib/db'
async function main() {
  for (const t of ['MfaEnrollment', 'MfaBackupCode']) {
    const cols = await db.$queryRawUnsafe(`SHOW COLUMNS FROM \`${t}\``) as Array<Record<string, unknown>>
    for (const c of cols) console.log(t, '|', String(c.Field), '|', String(c.Type), '| null=' + String(c.Null), '| def=' + String(c.Default), '| key=' + String(c.Key))
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
