// Collections, validators, and indexes for the poker application.
//
// Runs once when the mongo volume is first created. After changing this file,
// run `npm run docker:reset` to apply it.
//
// MongoDB creates collections implicitly, but declaring them here lets us
// attach a JSON Schema validator. Without one, a typo in a field name writes a
// new field instead of failing, which is the main way a document database
// loses data silently.

const db = db.getSiblingDB('poker');

/**
 * Recursively forbids unknown properties.
 *
 * JSON Schema permits extra fields unless a schema says otherwise, so without
 * this a typo like `displayNmae` is stored as a new field and nothing
 * complains. Nested objects — a seat inside a table, a player inside a hand —
 * need the same treatment, which is why this recurses rather than setting the
 * flag once at the top.
 */
function closeSchema(schema, isRoot) {
  if (!schema || typeof schema !== 'object') return schema;

  const result = { ...schema };

  if (result.properties) {
    result.additionalProperties = false;
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([key, value]) => [key, closeSchema(value, false)]),
    );

    // Mongo adds _id to every document, so a closed top-level schema that does
    // not declare it rejects every single write. Nested objects have no _id,
    // hence the root-only exception.
    if (isRoot && !result.properties._id) {
      result.properties._id = { bsonType: 'objectId' };
    }
  }

  if (result.items) {
    result.items = closeSchema(result.items, false);
  }

  return result;
}

function collection(name, validator, indexes) {
  const closed = closeSchema(validator, true);

  const options = {
    validator: { $jsonSchema: closed },
    validationLevel: 'strict',
    validationAction: 'error',
  };

  if (db.getCollectionNames().includes(name)) {
    // The collection already exists, so createCollection would fail and the
    // old validator would stay in force — rejecting any field added since.
    // collMod updates it in place, which matters because the alternative is
    // docker:reset, and that destroys every account and hand on the machine.
    db.runCommand({ collMod: name, ...options });
  } else {
    db.createCollection(name, options);
  }

  for (const index of indexes) {
    db[name].createIndex(index.keys, index.options || {});
  }
}

// ---------------------------------------------------------------- accounts

collection(
  'users',
  {
    bsonType: 'object',
    required: ['email', 'passwordHash', 'displayName', 'role', 'chips', 'createdAt'],
    properties: {
      email: { bsonType: 'string' },
      passwordHash: { bsonType: 'string' },
      displayName: { bsonType: 'string', minLength: 1, maxLength: 64 },
      // moderator runs tournaments; admin can also appoint moderators.
      role: { enum: ['user', 'moderator', 'admin'] },
      // Present only while the account is banned. Chips are untouched, so
      // lifting a ban restores the account exactly as it was.
      ban: {
        bsonType: ['object', 'null'],
        properties: {
          reason: { bsonType: 'string', minLength: 1, maxLength: 280 },
          bannedAt: { bsonType: 'date' },
          bannedBy: { bsonType: 'objectId' },
          expiresAt: { bsonType: ['date', 'null'] },
        },
      },
      // Bots are ordinary accounts with a flag, not a separate role — a new
      // role would ripple into JWT claims and every authorisation check for
      // no benefit. The flag keeps them off the leaderboard instead.
      isBot: { bsonType: 'bool' },
      // Play money only. Never real currency.
      chips: { bsonType: ['int', 'long'], minimum: 0 },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
  [
    // Case-insensitive unique email, the equivalent of Postgres CITEXT.
    {
      keys: { email: 1 },
      options: { unique: true, collation: { locale: 'en', strength: 2 }, name: 'email_unique_ci' },
    },
    { keys: { displayName: 'text' }, options: { name: 'display_name_text' } },
    // Partial, so it indexes the dozen bot accounts rather than every user.
    {
      keys: { isBot: 1 },
      options: { name: 'bots', partialFilterExpression: { isBot: true } },
    },
    // Same reasoning: only banned accounts, which should stay a small set.
    {
      keys: { 'ban.bannedAt': -1 },
      options: { name: 'banned', partialFilterExpression: { ban: { $type: 'object' } } },
    },
    { keys: { role: 1 }, options: { name: 'by_role' } },
  ],
);

collection(
  'refreshTokens',
  {
    bsonType: 'object',
    required: ['userId', 'tokenHash', 'expiresAt', 'createdAt'],
    properties: {
      userId: { bsonType: 'objectId' },
      tokenHash: { bsonType: 'string' },
      expiresAt: { bsonType: 'date' },
      revokedAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' },
    },
  },
  [
    { keys: { tokenHash: 1 }, options: { unique: true, name: 'token_hash_unique' } },
    { keys: { userId: 1, revokedAt: 1 }, options: { name: 'user_live_tokens' } },
    // Mongo deletes expired tokens on its own, so the table cannot grow
    // without bound the way it would with only application-side cleanup.
    { keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_expiry' } },
  ],
);

// ------------------------------------------------------ simulated payments

// Every chip movement is an immutable document. Balances are derived from this
// ledger, never edited without a matching entry, so the history always
// explains the balance.
collection(
  'chipTransactions',
  {
    bsonType: 'object',
    required: ['userId', 'kind', 'amount', 'balanceAfter', 'createdAt'],
    properties: {
      userId: { bsonType: 'objectId' },
      kind: {
        enum: ['deposit', 'withdrawal', 'buy_in', 'cash_out', 'win', 'loss', 'rake', 'bonus'],
      },
      // Positive credits the user, negative debits them.
      amount: { bsonType: ['int', 'long'] },
      balanceAfter: { bsonType: ['int', 'long'], minimum: 0 },
      reference: { bsonType: ['string', 'null'] },
      createdAt: { bsonType: 'date' },
    },
  },
  [{ keys: { userId: 1, createdAt: -1 }, options: { name: 'user_history' } }],
);

// ----------------------------------------------------------------- friends

collection(
  'friendships',
  {
    bsonType: 'object',
    required: ['requesterId', 'addresseeId', 'status', 'createdAt'],
    properties: {
      requesterId: { bsonType: 'objectId' },
      addresseeId: { bsonType: 'objectId' },
      status: { enum: ['pending', 'accepted', 'blocked'] },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
  [
    {
      keys: { requesterId: 1, addresseeId: 1 },
      options: { unique: true, name: 'unique_friendship' },
    },
    { keys: { addresseeId: 1, status: 1 }, options: { name: 'incoming_requests' } },
  ],
);

// ------------------------------------------------------------------ tables

collection(
  'pokerTables',
  {
    bsonType: 'object',
    required: ['name', 'maxSeats', 'smallBlind', 'bigBlind', 'minBuyIn', 'maxBuyIn', 'status', 'createdAt'],
    properties: {
      name: { bsonType: 'string', minLength: 1, maxLength: 64 },
      ownerId: { bsonType: ['objectId', 'null'] },
      maxSeats: { bsonType: 'int', minimum: 2, maximum: 9 },
      smallBlind: { bsonType: 'int', minimum: 1 },
      bigBlind: { bsonType: 'int', minimum: 2 },
      minBuyIn: { bsonType: ['int', 'long'], minimum: 1 },
      maxBuyIn: { bsonType: ['int', 'long'], minimum: 1 },
      isPrivate: { bsonType: 'bool' },
      joinCode: { bsonType: ['string', 'null'] },
      status: { enum: ['open', 'in_hand', 'closed'] },
      // Seats are embedded because they are always read with the table and
      // never queried on their own.
      seats: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['seat', 'stack'],
          properties: {
            seat: { bsonType: 'int', minimum: 0 },
            userId: { bsonType: ['objectId', 'null'] },
            displayName: { bsonType: ['string', 'null'] },
            stack: { bsonType: ['int', 'long'], minimum: 0 },
            sittingOut: { bsonType: 'bool' },
            // Null for a human seat. Difficulty lives here rather than on the
            // bot account so one bot can sit at tables of different levels.
            botProfile: {
              bsonType: ['object', 'null'],
              properties: {
                difficulty: { enum: ['easy', 'medium', 'hard', 'expert'] },
              },
            },
            joinedAt: { bsonType: 'date' },
          },
        },
      },
      handNumber: { bsonType: ['int', 'long'] },
      buttonSeat: { bsonType: 'int', minimum: 0 },
      // Deal the next hand automatically. Off by default, so a table of
      // humans keeps the existing behaviour; turned on when a bot sits down,
      // because otherwise a bot table plays one hand and stops forever.
      autoDeal: { bsonType: 'bool' },
      autoFillBots: { bsonType: 'bool' },
      autoFillDifficulty: { enum: ['easy', 'medium', 'hard', 'expert'] },
      closedAt: { bsonType: ['date', 'null'] },
      closedBy: { bsonType: ['objectId', 'null'] },
      closeReason: { bsonType: ['string', 'null'] },
      createdAt: { bsonType: 'date' },
    },
  },
  [
    {
      keys: { joinCode: 1 },
      options: {
        unique: true,
        // Public tables have no join code; a partial index lets many of them
        // coexist while still enforcing uniqueness on the codes that exist.
        partialFilterExpression: { joinCode: { $type: 'string' } },
        name: 'join_code_unique',
      },
    },
    { keys: { status: 1, createdAt: -1 }, options: { name: 'open_tables' } },
    { keys: { 'seats.userId': 1 }, options: { name: 'seat_by_user' } },
  ],
);

// ------------------------------------------------------------------- hands

// A finished hand is one document: players, board, results, and every action.
// It is written once and read whole, which is exactly what a document store
// is good at, and it removes the three-way join the relational version needed.
collection(
  'hands',
  {
    bsonType: 'object',
    required: ['tableId', 'handNumber', 'buttonSeat', 'startedAt'],
    properties: {
      tableId: { bsonType: 'objectId' },
      handNumber: { bsonType: ['int', 'long'] },
      buttonSeat: { bsonType: 'int' },
      smallBlind: { bsonType: 'int' },
      bigBlind: { bsonType: 'int' },
      board: { bsonType: 'array', items: { bsonType: 'string' } },
      potTotal: { bsonType: ['int', 'long'] },
      players: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['userId', 'seat', 'startingStack', 'netChips'],
          properties: {
            userId: { bsonType: 'objectId' },
            displayName: { bsonType: 'string' },
            seat: { bsonType: 'int' },
            holeCards: { bsonType: ['array', 'null'], items: { bsonType: 'string' } },
            startingStack: { bsonType: ['int', 'long'] },
            netChips: { bsonType: ['int', 'long'] },
            handRank: { bsonType: ['string', 'null'] },
          },
        },
      },
      actions: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['sequence', 'street', 'action', 'amount', 'offsetMs'],
          properties: {
            sequence: { bsonType: 'int' },
            userId: { bsonType: ['objectId', 'null'] },
            street: { enum: ['preflop', 'flop', 'turn', 'river'] },
            action: { enum: ['fold', 'check', 'call', 'bet', 'raise', 'post_blind'] },
            amount: { bsonType: ['int', 'long'] },
            offsetMs: { bsonType: 'int' },
          },
        },
      },
      startedAt: { bsonType: 'date' },
      endedAt: { bsonType: ['date', 'null'] },
    },
  },
  [
    { keys: { tableId: 1, handNumber: -1 }, options: { unique: true, name: 'table_hand_number' } },
    { keys: { tableId: 1, startedAt: -1 }, options: { name: 'table_recent' } },
    // Drives "my hand history" without scanning every hand.
    { keys: { 'players.userId': 1, startedAt: -1 }, options: { name: 'user_hands' } },
  ],
);

// -------------------------------------------------------------------- chat

collection(
  'chatMessages',
  {
    bsonType: 'object',
    required: ['tableId', 'body', 'createdAt'],
    properties: {
      tableId: { bsonType: 'objectId' },
      userId: { bsonType: ['objectId', 'null'] },
      displayName: { bsonType: 'string' },
      body: { bsonType: 'string', minLength: 1, maxLength: 500 },
      createdAt: { bsonType: 'date' },
    },
  },
  [
    { keys: { tableId: 1, _id: -1 }, options: { name: 'table_recent_messages' } },
    // Chat is disposable; drop it after 30 days rather than growing forever.
    { keys: { createdAt: 1 }, options: { expireAfterSeconds: 2592000, name: 'ttl_chat' } },
  ],
);

// ------------------------------------------------------------- leaderboard

collection(
  'playerStats',
  {
    bsonType: 'object',
    required: ['userId'],
    properties: {
      userId: { bsonType: 'objectId' },
      handsPlayed: { bsonType: ['int', 'long'], minimum: 0 },
      handsWon: { bsonType: ['int', 'long'], minimum: 0 },
      biggestPot: { bsonType: ['int', 'long'], minimum: 0 },
      netChips: { bsonType: ['int', 'long'] },
      updatedAt: { bsonType: 'date' },
    },
  },
  [
    { keys: { userId: 1 }, options: { unique: true, name: 'user_unique' } },
    { keys: { netChips: -1 }, options: { name: 'leaderboard_net' } },
  ],
);

print('poker database initialised');
