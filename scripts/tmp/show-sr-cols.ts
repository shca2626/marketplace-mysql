import { db } from '../../src/lib/db'
async function main() {
  const cols = await db.$queryRawUnsafe('SHOW COLUMNS FROM `SessionRegistry`') as Array<Record<string, unknown>>
  for (const c of cols) console.log('|', String(c.Field), '|', String(c.Type), '| null=' + String(c.Null), '| def=' + String(c.Default), '| key=' + String(c.Key))
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
