-- Runs once when the postgres volume is first created.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- fuzzy search for library titles
CREATE EXTENSION IF NOT EXISTS "citext";      -- case-insensitive email column
