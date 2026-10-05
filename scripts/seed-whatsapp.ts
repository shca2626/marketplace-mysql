/**
 * PHASE 8 + WhatsApp suite seed — dynamic currencies + starter templates,
 * chatbot rules. Content recovered from the pre-rebuild session (the live DB
 * still had the old rows; the code had been lost).
 *
 *   bun scripts/seed-whatsapp.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // ── 1. Currencies (service seeds defaults on first read; do it here too
  //       so the admin tab and public API are instantly populated) ─────────
  const currencies: Array<{
    code: string; name: string; symbol: string; rateToUsd: number; displayDecimals: number; sortOrder: number; isActive: boolean
  }> = [
    { code: 'USD', name: 'US Dollar', symbol: '$', rateToUsd: 1, displayDecimals: 2, sortOrder: 0, isActive: true },
    { code: 'YER', name: 'Yemeni Rial', symbol: 'YER', rateToUsd: 530, displayDecimals: 0, sortOrder: 1, isActive: true },
    { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR', rateToUsd: 3.75, displayDecimals: 2, sortOrder: 2, isActive: true },
    { code: 'AED', name: 'UAE Dirham', symbol: 'AED', rateToUsd: 3.6725, displayDecimals: 2, sortOrder: 3, isActive: true },
    { code: 'EGP', name: 'Egyptian Pound', symbol: 'EGP', rateToUsd: 48.5, displayDecimals: 2, sortOrder: 4, isActive: true },
    { code: 'JOD', name: 'Jordanian Dinar', symbol: 'JOD', rateToUsd: 0.709, displayDecimals: 3, sortOrder: 5, isActive: true },
    { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'KWD', rateToUsd: 0.3065, displayDecimals: 3, sortOrder: 6, isActive: true },
    { code: 'QAR', name: 'Qatari Riyal', symbol: 'QAR', rateToUsd: 3.64, displayDecimals: 2, sortOrder: 7, isActive: true },
    { code: 'BHD', name: 'Bahraini Dinar', symbol: 'BHD', rateToUsd: 0.376, displayDecimals: 3, sortOrder: 8, isActive: true },
    { code: 'OMR', name: 'Omani Rial', symbol: 'OMR', rateToUsd: 0.3845, displayDecimals: 3, sortOrder: 9, isActive: true },
    { code: 'EUR', name: 'Euro', symbol: '€', rateToUsd: 0.92, displayDecimals: 2, sortOrder: 10, isActive: true },
    { code: 'GBP', name: 'British Pound', symbol: '£', rateToUsd: 0.79, displayDecimals: 2, sortOrder: 11, isActive: true },
    { code: 'TRY', name: 'Turkish Lira', symbol: 'TRY', rateToUsd: 34.5, displayDecimals: 2, sortOrder: 12, isActive: true },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', rateToUsd: 7.1, displayDecimals: 2, sortOrder: 13, isActive: false },
  ]
  for (const c of currencies) {
    await db.currencyRate.upsert({
      where: { code: c.code },
      update: { name: c.name, symbol: c.symbol, displayDecimals: c.displayDecimals, sortOrder: c.sortOrder },
      create: { ...c, source: 'seed' },
    })
  }
  console.log(`✔ currencies: ${currencies.length} ensured (rates are placeholders — run a live refresh)`)

  // ── 2. WhatsApp templates (recovered from the lost session's DB rows) ───
  const templates = [
    {
      name: 'welcome-buyer',
      category: 'UTILITY',
      language: 'ar',
      body: 'أهلاً وسهلاً {{name}} في سوق فيندورا 🌞\nوجهتك الأولى لأنظمة الطاقة الشمسية ولوحاتها ومحولاتها في اليمن، بأفضل الأسعار وضمان معتمد.\nتصفح آلاف المنتجات الآن وسجّل طلبك خلال دقيقة.',
      status: 'APPROVED',
    },
    {
      name: 'order-shipped',
      category: 'UTILITY',
      language: 'ar',
      body: 'مرحباً {{name}}، تم شحن طلبك رقم {{order}} 🚚\nسيتواصل معك مندوب التوصيل قبل الوصول بوقت كافٍ.\nشكراً لتسوقك من سوق فيندورا — شريكك في حلول الطاقة.',
      status: 'APPROVED',
    },
    {
      name: 'ramadan-promo',
      category: 'MARKETING',
      language: 'ar',
      body: 'رمضان كريم {{name}}! 🌙\nاحتفالاً بالشهر الفضيل، خصم {{discount}} على جميع أنظمة الطاقة الشمسية والبطاريات في سوق فيندورا.\nالعرض ساري حتى نهاية الشهر — اطلب الآن قبل نفاد الكمية.',
      status: 'APPROVED',
    },
    {
      name: 'eid-greeting',
      category: 'MARKETING',
      language: 'ar',
      body: 'مرحبا {{name}} 🎉 خصم {{discount}}% بمناسبة العيد على {{product}}',
      status: 'DRAFT',
    },
  ]
  for (const t of templates) {
    const existing = await db.whatsAppTemplate.findFirst({ where: { name: t.name } })
    if (!existing) await db.whatsAppTemplate.create({ data: t })
  }
  console.log(`✔ templates: ${templates.length} ensured`)

  // ── 3. Chatbot rules (recovered) ──────────────────────────────────────────
  const rules = [
    {
      name: 'ساعات العمل',
      matchType: 'CONTAINS',
      pattern: 'ساعات',
      reply: 'ساعات عملنا في سوق فيندورا:\nالسبت – الخميس: 8 صباحاً – 9 مساءً\nالجمعة: 4 عصراً – 9 مساءً\nونحن معك على الواتساب على مدار الأسبوع 🌞',
      priority: 40,
      active: true,
    },
    {
      name: 'الأسعار',
      matchType: 'CONTAINS',
      pattern: 'سعر',
      reply: 'أسعارنا في سوق فيندورا تنافسية ومحدّثة يومياً 🌞\nتصفّح المنتجات وأسعارها مباشرة من الموقع أو التطبيق، أو أرسل لنا اسم المنتج وسنرد عليك بسعره فوراً.',
      priority: 30,
      active: true,
    },
    {
      name: 'hello',
      matchType: 'CONTAINS',
      pattern: 'hello',
      reply: 'Hello and welcome to Vendora! 👋\nأهلاً بك في سوق فيندورا — تصفّح منتجاتنا من الموقع أو أرسل استفسارك هنا وسنرد عليك بأسرع وقت.',
      priority: 20,
      active: true,
    },
    {
      name: 'شكرا',
      matchType: 'CONTAINS',
      pattern: 'شكرا',
      reply: 'العفو، نسعد بخدمتك دائماً 🌞\nسوق فيندورا — شريكك الموثوق في حلول الطاقة الشمسية.',
      priority: 10,
      active: true,
    },
  ]
  for (const r of rules) {
    const existing = await db.chatbotRule.findFirst({ where: { name: r.name } })
    if (!existing) await db.chatbotRule.create({ data: r })
  }
  console.log(`✔ chatbot rules: ${rules.length} ensured`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
