import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { ObjectId } from 'mongodb';
import { closeDatabase, connectDatabase, isDuplicateKeyError, users } from '../lib/db.js';

/**
 * Creates the bot accounts.
 *
 * Run once during setup: `npm run seed:bots`. Safe to re-run — the unique
 * email index rejects duplicates and this skips them.
 *
 * It is deliberately not run at server boot. A migration that fires on every
 * start is the kind of thing that surprises you later.
 */

const BOT_NAMES = [
  'Ada',
  'Boris',
  'Cleo',
  'Diego',
  'Elena',
  'Felix',
  'Greta',
  'Hugo',
  'Iris',
  'Jonas',
  'Kira',
  'Luca',
];

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main(): Promise<void> {
  await connectDatabase();

  let created = 0;
  let existing = 0;

  for (const name of BOT_NAMES) {
    // A real argon2 hash of a secret that is thrown away immediately. Not an
    // empty string, not a sentinel: the field is required by the validator,
    // and a login attempt must fail exactly the way a wrong password does.
    // Discarding the plaintext means nobody can ever sign in as a bot.
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'), {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    try {
      await users().insertOne({
        _id: new ObjectId(),
        email: `bot-${slug(name)}@bots.local`,
        passwordHash,
        displayName: name,
        role: 'user',
        isBot: true,
        // Bots do not draw from a wallet. They are seated with a fixed stack
        // and never top up, so their account balance stays at zero and never
        // touches the chip ledger.
        chips: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      created += 1;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        existing += 1;
        continue;
      }
      throw error;
    }
  }

  // No playerStats row: bots stay off the leaderboard.

  console.log(`Bot accounts: ${created} created, ${existing} already present.`);
  await closeDatabase();
}

await main();
