// NETW-1 E2E cleanup — removes everything the verification round created:
// job postings (+ applications cascade), company follows, referral test
// users/codes, and the NETW-1 notifications. Audit rows stay (immutable trail).
// The p45 fixture admin + financier fixtures are cleaned by config1-cleanup.ts.
import { db } from '../../src/lib/db'

async function main() {
  const jobs = await db.jobPosting.deleteMany({ where: { number: { startsWith: 'JOB-' } } })
  console.log('job postings deleted:', jobs.count)

  const follows = await db.companyFollow.deleteMany({})
  console.log('company follows deleted:', follows.count)

  const testUsers = await db.user.deleteMany({ where: { email: { in: ['ref-test-netw1@vendora.test', 'ref-test-netw2@vendora.test'] } } })
  console.log('referral test users deleted:', testUsers.count)

  const codes = await db.referralCode.deleteMany({})
  console.log('referral codes deleted (regenerate lazily):', codes.count)

  const notifications = await db.notification.deleteMany({
    where: { type: { in: ['NEW_FOLLOWER', 'JOB_STATUS', 'REFERRAL_JOINED'] } },
  })
  console.log('NETW-1 notifications deleted:', notifications.count)

  const [jobCount, followCount, codeCount, referredCount] = await Promise.all([
    db.jobPosting.count(),
    db.companyFollow.count(),
    db.referralCode.count(),
    db.user.count({ where: { referredById: { not: null } } }),
  ])
  console.log('post-cleanup state:', { jobCount, followCount, codeCount, referredCount })
}

main()
  .catch((err) => {
    console.error('cleanup failed:', err)
    process.exit(1)
  })
  .finally(() => void db.$disconnect())
