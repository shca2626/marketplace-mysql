// ─────────────────────────────────────────────────────────────────────────────
// WA-BIZ SEED — default WhatsApp templates + chatbot rules for the Vendora
// admin console ("Templates" / "Chatbot" tabs).
//
//   bun scripts/seed-wa-biz.ts
//
// Idempotent — every row is checked by its unique name first and skipped when
// it already exists (re-running never duplicates or overwrites admin edits).
// Run with DATABASE_URL exported from .env when the shell env is clobbered:
//   DATABASE_URL=$(grep -oP '^DATABASE_URL=\Kmysql://.+' .env) bun scripts/seed-wa-biz.ts
// ─────────────────────────────────────────────────────────────────────────────

import { db } from '../src/lib/db'

const TEMPLATES = [
  {
    name: 'welcome-buyer',
    category: 'UTILITY',
    language: 'ar',
    status: 'APPROVED',
    body:
      'أهلاً وسهلاً {{name}} في سوق فيندورا 🌞\n' +
      'وجهتك الأولى لأنظمة الطاقة الشمسية ولوحاتها ومحولاتها في اليمن، بأفضل الأسعار وضمان معتمد.\n' +
      'تصفح آلاف المنتجات الآن وسجّل طلبك خلال دقيقة.',
  },
  {
    name: 'order-shipped',
    category: 'NOTIFICATION',
    language: 'ar',
    status: 'APPROVED',
    body:
      'مرحباً {{name}}، تم شحن طلبك رقم {{order}} 🚚\n' +
      'سيتواصل معك مندوب التوصيل قبل الوصول بوقت كافٍ.\n' +
      'شكراً لتسوقك من سوق فيندورا — شريكك في حلول الطاقة.',
  },
  {
    name: 'ramadan-promo',
    category: 'MARKETING',
    language: 'ar',
    status: 'APPROVED',
    body:
      'رمضان كريم {{name}}! 🌙\n' +
      'احتفالاً بالشهر الفضيل، خصم {{discount}} على جميع أنظمة الطاقة الشمسية والبطاريات في سوق فيندورا.\n' +
      'العرض ساري حتى نهاية الشهر — اطلب الآن قبل نفاد الكمية.',
  },
] as const

const RULES = [
  {
    name: 'ساعات العمل',
    matchType: 'CONTAINS',
    pattern: 'ساعات',
    priority: 10,
    reply:
      'ساعات عملنا في سوق فيندورا:\n' +
      'السبت – الخميس: 8 صباحاً – 9 مساءً\n' +
      'الجمعة: 4 عصراً – 9 مساءً\n' +
      'ونحن معك على الواتساب على مدار الأسبوع 🌞',
  },
  {
    name: 'الأسعار',
    matchType: 'CONTAINS',
    pattern: 'سعر',
    priority: 20,
    reply:
      'أسعارنا في سوق فيندورا تنافسية ومحدّثة يومياً 🌞\n' +
      'تصفّح المنتجات وأسعارها مباشرة من الموقع أو التطبيق، أو أرسل لنا اسم المنتج وسنرد عليك بسعره فوراً.',
  },
  {
    name: 'hello',
    matchType: 'CONTAINS',
    pattern: 'hello',
    priority: 30,
    reply:
      'Hello and welcome to Vendora! 👋\n' +
      'أهلاً بك في سوق فيندورا — تصفّح منتجاتنا من الموقع أو أرسل استفسارك هنا وسنرد عليك بأسرع وقت.',
  },
  {
    name: 'شكرا',
    matchType: 'CONTAINS',
    pattern: 'شكرا',
    priority: 40,
    reply: 'العفو، نسعد بخدمتك دائماً 🌞\nسوق فيندورا — شريكك الموثوق في حلول الطاقة الشمسية.',
  },
] as const

async function main() {
  console.log('── WA-BIZ seed (templates + chatbot rules) ──────────────')

  let templatesCreated = 0
  for (const t of TEMPLATES) {
    const existing = await db.whatsAppTemplate.findUnique({ where: { name: t.name }, select: { id: true } })
    if (existing) {
      console.log(`  = template "${t.name}" already exists — skipped`)
      continue
    }
    await db.whatsAppTemplate.create({ data: { ...t } })
    templatesCreated += 1
    console.log(`  + template "${t.name}" (${t.category}/${t.language})`)
  }

  let rulesCreated = 0
  for (const r of RULES) {
    const existing = await db.chatbotRule.findFirst({ where: { name: r.name }, select: { id: true } })
    if (existing) {
      console.log(`  = rule "${r.name}" already exists — skipped`)
      continue
    }
    await db.chatbotRule.create({ data: { ...r, active: true } })
    rulesCreated += 1
    console.log(`  + rule "${r.name}" (${r.matchType} "${r.pattern}", priority ${r.priority})`)
  }

  const [templates, rules] = await Promise.all([
    db.whatsAppTemplate.count(),
    db.chatbotRule.count(),
  ])
  console.log('─────────────────────────────────────────────────────────')
  console.log(`✓ seed done: ${templatesCreated} template(s) + ${rulesCreated} rule(s) created`)
  console.log(`✓ DB now holds ${templates} WhatsAppTemplate row(s), ${rules} ChatbotRule row(s)`)
}

main()
  .catch((err) => {
    console.error('✗ WA-BIZ seed failed:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
