import { ObjectId } from 'mongodb';
import { closeDatabase, connectDatabase, EMAIL_COLLATION, users } from '../lib/db.js';
import { revokeAllForUser } from '../lib/tokens.js';

/**
 * Promotes an existing account.
 *
 *   npm run make:moderator -- someone@example.com
 *   npm run make:moderator -- someone@example.com admin
 *
 * Roles live in the JWT, so existing sessions are revoked — otherwise the old
 * token would carry the old role until it expired.
 *
 * This exists because there is no way to appoint the first moderator through
 * the API: doing so requires being an admin already.
 */

const email = process.argv[2];
const role = (process.argv[3] ?? 'moderator') as 'user' | 'moderator' | 'admin';

if (!email) {
  console.error('Usage: npm run make:moderator -- <email> [user|moderator|admin]');
  process.exit(1);
}

if (!['user', 'moderator', 'admin'].includes(role)) {
  console.error(`Unknown role "${role}". Use user, moderator, or admin.`);
  process.exit(1);
}

await connectDatabase();

const result = await users().findOneAndUpdate(
  { email },
  { $set: { role, updatedAt: new Date() } },
  { collation: EMAIL_COLLATION, returnDocument: 'after' },
);

if (!result) {
  console.error(`No account found for ${email}.`);
  await closeDatabase();
  process.exit(1);
}

await revokeAllForUser(new ObjectId(result._id));

console.log(`${result.displayName} <${result.email}> is now ${role}.`);
console.log('Existing sessions were revoked; they must sign in again.');

await closeDatabase();
