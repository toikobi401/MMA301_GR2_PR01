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

function collection(name, validator, indexes) {
  if (!db.getCollectionNames().includes(name)) {
    db.createCollection(name, {
      validator: { $jsonSchema: validator },
      validationLevel: 'strict',
      validationAction: 'error',
    });
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
      role: { enum: ['user', 'admin'] },
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
            joinedAt: { bsonType: 'date' },
          },
        },
      },
      handNumber: { bsonType: ['int', 'long'] },
      buttonSeat: { bsonType: 'int', minimum: 0 },
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
