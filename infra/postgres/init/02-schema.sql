-- Schema for the poker application.
-- Runs once when the postgres volume is first created.
-- After changing this file, run `npm run docker:reset` to apply it.

-- ---------------------------------------------------------------- accounts

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 64),
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  -- Play money only. Never real currency.
  chips         BIGINT NOT NULL DEFAULT 10000 CHECK (chips >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_display_name_trgm ON users USING gin (display_name gin_trgm_ops);

-- Refresh tokens are stored hashed so a database leak cannot be replayed.
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- ------------------------------------------------------ simulated payments

-- Every chip movement is an immutable row. Balances are derived from this
-- ledger, never edited in place, so the history always explains the balance.
CREATE TABLE chip_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN (
                'deposit', 'withdrawal', 'buy_in', 'cash_out', 'win', 'loss', 'rake', 'bonus'
              )),
  -- Positive credits the user, negative debits them.
  amount      BIGINT NOT NULL CHECK (amount <> 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  reference   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chip_transactions_user_time ON chip_transactions(user_id, created_at DESC);

-- ---------------------------------------------------------------- friends

-- One row per direction so a request can be pending one way.
CREATE TABLE friendships (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_friendship CHECK (requester_id <> addressee_id),
  CONSTRAINT unique_friendship UNIQUE (requester_id, addressee_id)
);

CREATE INDEX friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX friendships_requester ON friendships(requester_id, status);

-- ------------------------------------------------------------------ tables

CREATE TABLE poker_tables (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  max_seats     SMALLINT NOT NULL DEFAULT 6 CHECK (max_seats BETWEEN 2 AND 9),
  small_blind   INTEGER NOT NULL CHECK (small_blind > 0),
  big_blind     INTEGER NOT NULL CHECK (big_blind > small_blind),
  min_buy_in    BIGINT NOT NULL CHECK (min_buy_in > 0),
  max_buy_in    BIGINT NOT NULL CHECK (max_buy_in >= min_buy_in),
  is_private    BOOLEAN NOT NULL DEFAULT false,
  -- Null for public tables. Short code friends use to join.
  join_code     TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_hand', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX poker_tables_open ON poker_tables(status) WHERE status <> 'closed';

CREATE TABLE table_seats (
  table_id   UUID NOT NULL REFERENCES poker_tables(id) ON DELETE CASCADE,
  seat       SMALLINT NOT NULL CHECK (seat >= 0),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Chips at the table, separate from the account balance.
  stack      BIGINT NOT NULL DEFAULT 0 CHECK (stack >= 0),
  sitting_out BOOLEAN NOT NULL DEFAULT false,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_id, seat),
  -- A user can occupy at most one seat per table.
  CONSTRAINT one_seat_per_user UNIQUE (table_id, user_id)
);

-- ------------------------------------------------------------------- hands

CREATE TABLE hands (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_id     UUID NOT NULL REFERENCES poker_tables(id) ON DELETE CASCADE,
  hand_number  BIGINT NOT NULL,
  button_seat  SMALLINT NOT NULL,
  small_blind  INTEGER NOT NULL,
  big_blind    INTEGER NOT NULL,
  board        TEXT[] NOT NULL DEFAULT '{}',
  -- Full final state for replay: players, pots, results.
  summary      JSONB NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ,
  CONSTRAINT unique_hand_number UNIQUE (table_id, hand_number)
);

CREATE INDEX hands_table_time ON hands(table_id, started_at DESC);

-- Who was in the hand, what they held, what they won or lost.
CREATE TABLE hand_players (
  hand_id     UUID NOT NULL REFERENCES hands(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat        SMALLINT NOT NULL,
  -- Null when the player folded without showing.
  hole_cards  TEXT[],
  starting_stack BIGINT NOT NULL,
  -- Negative when the player lost chips.
  net_chips   BIGINT NOT NULL,
  hand_rank   TEXT,
  PRIMARY KEY (hand_id, user_id)
);

CREATE INDEX hand_players_user ON hand_players(user_id);

-- Every action, in order, so a hand can be replayed action by action.
CREATE TABLE hand_actions (
  id         BIGSERIAL PRIMARY KEY,
  hand_id    UUID NOT NULL REFERENCES hands(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  sequence   INTEGER NOT NULL,
  street     TEXT NOT NULL CHECK (street IN ('preflop', 'flop', 'turn', 'river')),
  action     TEXT NOT NULL CHECK (action IN
               ('fold', 'check', 'call', 'bet', 'raise', 'post_blind')),
  amount     BIGINT NOT NULL DEFAULT 0,
  -- Milliseconds from the start of the hand.
  offset_ms  INTEGER NOT NULL,
  CONSTRAINT unique_action_sequence UNIQUE (hand_id, sequence)
);

CREATE INDEX hand_actions_hand ON hand_actions(hand_id, sequence);
CREATE INDEX hand_actions_user ON hand_actions(user_id, id DESC);

-- -------------------------------------------------------------------- chat

CREATE TABLE chat_messages (
  id         BIGSERIAL PRIMARY KEY,
  table_id   UUID NOT NULL REFERENCES poker_tables(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_table_time ON chat_messages(table_id, id DESC);

-- ------------------------------------------------------------- leaderboard

-- Maintained incrementally as hands finish. Redis holds the live ranking;
-- this table is the durable record behind it.
CREATE TABLE player_stats (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hands_played  INTEGER NOT NULL DEFAULT 0,
  hands_won     INTEGER NOT NULL DEFAULT 0,
  biggest_pot   BIGINT NOT NULL DEFAULT 0,
  net_chips     BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX player_stats_net ON player_stats(net_chips DESC);

-- -------------------------------------------------------------- housekeeping

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER friendships_touch BEFORE UPDATE ON friendships
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
