-- Kit Memory Extension - Supabase Schema
-- Run this SQL in your Supabase SQL editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable vector extension for future semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table (anonymous users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settings JSONB DEFAULT '{}'::jsonb
);

-- HOT tier: Memories table (0-3 months)
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  embedding vector(1536), -- For OpenAI embeddings
  tier TEXT DEFAULT 'hot' CHECK (tier IN ('hot', 'warm', 'cold')),
  token_count INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  site TEXT CHECK (site IN ('chatgpt', 'claude')),
  
  -- Foreign key
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- WARM tier: Memories table (3-6 months)
CREATE TABLE IF NOT EXISTS memories_warm (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  embedding vector(1536),
  tier TEXT DEFAULT 'warm',
  token_count INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ,
  site TEXT,
  compressed_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_user_warm FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- COLD tier: Memories table (6-12 months)
CREATE TABLE IF NOT EXISTS memories_cold (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id TEXT NOT NULL,
  summary TEXT NOT NULL, -- Compressed summary instead of full content
  message_count INTEGER,
  tier TEXT DEFAULT 'cold',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT fk_user_cold FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Conversation sessions
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  summary TEXT,
  tags TEXT[],
  message_count INTEGER DEFAULT 0,
  
  CONSTRAINT fk_user_conv FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User settings and preferences
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY,
  memory_enabled BOOLEAN DEFAULT true,
  retention_days INTEGER DEFAULT 365,
  auto_summarize BOOLEAN DEFAULT true,
  model_preferences JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT fk_user_settings FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memories_user_created ON memories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_conversation ON memories(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_search ON memories USING GIN(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_memories_site ON memories(site);
CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);

-- Indexes for warm tier
CREATE INDEX IF NOT EXISTS idx_warm_user ON memories_warm(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warm_conversation ON memories_warm(conversation_id);

-- Indexes for cold tier
CREATE INDEX IF NOT EXISTS idx_cold_user ON memories_cold(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cold_conversation ON memories_cold(conversation_id);

-- Vector similarity search index (for future implementation)
-- CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);

-- Row Level Security (RLS)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories_warm ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories_cold ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (adjust based on your auth strategy)
-- For anonymous access (MVP), we'll use user_id matching

-- Memories policies
CREATE POLICY "Users can view own memories" ON memories
  FOR SELECT USING (auth.uid() = user_id OR true); -- Temporary: allow all for MVP

CREATE POLICY "Users can insert own memories" ON memories
  FOR INSERT WITH CHECK (auth.uid() = user_id OR true); -- Temporary: allow all for MVP

CREATE POLICY "Users can delete own memories" ON memories
  FOR DELETE USING (auth.uid() = user_id OR true); -- Temporary: allow all for MVP

-- Function to migrate memories between tiers
CREATE OR REPLACE FUNCTION migrate_memories_to_warm()
RETURNS void AS $$
BEGIN
  -- Move memories older than 90 days to warm tier
  INSERT INTO memories_warm
  SELECT * FROM memories
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND created_at >= NOW() - INTERVAL '180 days'
    AND tier = 'hot'
  ON CONFLICT (id) DO NOTHING;
  
  -- Delete from hot tier
  DELETE FROM memories
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND tier = 'hot';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION migrate_memories_to_cold()
RETURNS void AS $$
BEGIN
  -- Compress and move memories older than 180 days to cold tier
  INSERT INTO memories_cold (id, user_id, conversation_id, summary, message_count, created_at, metadata)
  SELECT 
    uuid_generate_v4(),
    user_id,
    conversation_id,
    string_agg(content, ' ' ORDER BY created_at) as summary,
    COUNT(*) as message_count,
    MIN(created_at) as created_at,
    jsonb_build_object('original_ids', array_agg(id)) as metadata
  FROM memories_warm
  WHERE created_at < NOW() - INTERVAL '180 days'
  GROUP BY user_id, conversation_id
  ON CONFLICT (id) DO NOTHING;
  
  -- Delete from warm tier
  DELETE FROM memories_warm
  WHERE created_at < NOW() - INTERVAL '180 days';
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old memories (>365 days)
CREATE OR REPLACE FUNCTION cleanup_old_memories()
RETURNS void AS $$
BEGIN
  DELETE FROM memories_cold
  WHERE created_at < NOW() - INTERVAL '365 days';
END;
$$ LANGUAGE plpgsql;

-- Function to get memory statistics
CREATE OR REPLACE FUNCTION get_memory_stats(p_user_id UUID)
RETURNS TABLE (
  total_memories BIGINT,
  hot_count BIGINT,
  warm_count BIGINT,
  cold_count BIGINT,
  total_conversations BIGINT,
  storage_bytes BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM memories WHERE user_id = p_user_id) +
    (SELECT COUNT(*) FROM memories_warm WHERE user_id = p_user_id) +
    (SELECT COUNT(*) FROM memories_cold WHERE user_id = p_user_id) as total_memories,
    (SELECT COUNT(*) FROM memories WHERE user_id = p_user_id) as hot_count,
    (SELECT COUNT(*) FROM memories_warm WHERE user_id = p_user_id) as warm_count,
    (SELECT COUNT(*) FROM memories_cold WHERE user_id = p_user_id) as cold_count,
    (SELECT COUNT(DISTINCT conversation_id) FROM memories WHERE user_id = p_user_id) as total_conversations,
    (SELECT SUM(LENGTH(content)) FROM memories WHERE user_id = p_user_id) as storage_bytes;
END;
$$ LANGUAGE plpgsql;

-- Scheduled jobs (configure in Supabase dashboard or use pg_cron)
-- Run daily at 2 AM:
-- SELECT migrate_memories_to_warm();
-- SELECT migrate_memories_to_cold();
-- SELECT cleanup_old_memories();