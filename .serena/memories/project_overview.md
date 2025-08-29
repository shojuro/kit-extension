# Kit Memory Extension - Project Overview

## Purpose
A Chrome extension that provides persistent memory for ChatGPT and Claude across sessions. The extension solves the "Groundhog Day" problem where AI assistants forget previous conversations, enabling seamless conversation continuity.

## Core Functionality
- Captures messages from ChatGPT and Claude conversations
- Stores conversations in Supabase with 3-tier memory system (hot/warm/cold)
- Retrieves relevant memories to enhance prompts transparently
- Works invisibly without user intervention

## Tech Stack
- **Platform**: Chrome Extension (Manifest V3)
- **Backend**: Supabase (PostgreSQL with vector extensions)
- **Language**: JavaScript (vanilla, no framework)
- **Storage**: 
  - Chrome Storage API for local config/queue
  - Supabase for persistent memory storage
- **Database**: PostgreSQL with vector extension for future semantic search

## Architecture Pattern
RIEF (Request-Intercept-Enhance-Forward):
1. REQUEST: User types in ChatGPT/Claude
2. INTERCEPT: Content script captures input
3. ENHANCE: Background worker retrieves memories
4. FORWARD: Modified prompt sent to AI

## Memory Tiers
- HOT (0-3 months): Full content, <200ms retrieval
- WARM (3-6 months): Compressed, 500ms-1s retrieval
- COLD (6-12 months): Summaries only, 2-5s retrieval

## Key Features
- Site detection with fallback selectors
- Message deduplication via SHA hashing
- Offline queue for network failures
- Token budget management (max 20% context)
- Smart triggering on keywords
- Transparent operation