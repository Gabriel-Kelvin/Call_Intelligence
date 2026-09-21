# Call Intelligence

Call Intelligence is an evidence-first research application for analysing expert-call transcripts. Users upload a transcript corpus and an interview guide at runtime. The application then generates cross-call insights, answers each guide question per expert, and supports open-ended questions across the corpus.

Every generated result is grounded in exact transcript excerpts with the original speaker, filename, and timestamp.

## Features

- Upload up to 20 TXT, Markdown, VTT, or SRT transcripts at a time
- Parse speakers, timestamps, markets, and expert metadata
- Preserve exact source passages while chunking long turns
- Generate common themes and meaningful disagreements across calls
- Upload an interview guide and answer each question per expert
- Ask free-form questions across all indexed transcripts
- Display exact supporting quotes and timestamps
- Delete the active corpus and reset generated results
- Validate model-returned citation IDs before displaying evidence

## How it works

1. The corpus endpoint validates and parses uploaded transcripts.
2. Speaker turns become evidence chunks with source metadata.
3. Retrieval uses BM25-style scoring, phrase bonuses, multiple query paths, and transcript-diversity limits.
4. A semantic reranking step removes passages that only share unrelated keywords.
5. The Groq-hosted model receives only selected transcript evidence.
6. Returned evidence IDs are checked against the retrieved set.
7. The UI renders the original stored excerpt, never a model-generated quotation.

## Tech stack

- Next.js 16 and React 19
- TypeScript
- Next.js App Router and route handlers
- Groq API with `qwen/qwen3.8-27b`
- Custom BM25-style in-memory retrieval
- Lucide icons and custom responsive CSS
- Render for the stateful application server
- Vercel for the public frontend and edge delivery

## Local setup

Requirements:

- Node.js 22.13 or newer
- A Groq API key

```bash
git clone https://github.com/Gabriel-Kelvin/Call_Intelligence.git
cd Call_Intelligence
npm ci
```

Copy `.env.example` to `.env.local`, then add your key:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Available commands

```bash
npm run dev      # Start the local development server
npm run build    # Create a production build
npm run start    # Start the production server
npm run lint     # Run ESLint
```

## API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Deployment health check |
| `/api/corpus` | GET | Return the active corpus summary |
| `/api/corpus` | POST | Parse and index uploaded transcripts |
| `/api/corpus` | DELETE | Clear the active corpus |
| `/api/insights` | POST | Generate cross-call themes and disagreements |
| `/api/guide` | POST | Answer an uploaded interview guide |
| `/api/ask` | POST | Answer a question using retrieved evidence |

## Deployment

The included `render.yaml` defines a free Render web service with a health check. Set `GROQ_API_KEY` as a secret environment variable in Render.

The public Vercel deployment proxies API requests to the Render service. This keeps the transcript corpus in one long-running process, because independent serverless functions cannot safely share an in-memory index.

Never commit `.env.local` or API keys. Environment files and platform metadata are excluded by `.gitignore`.

## Current storage model

The demonstration corpus is process-local and intentionally requires no database. A Render restart clears the active corpus. This is suitable for the case-study demo but not for a multi-user production system.

An optional production schema is provided in `supabase/schema.sql`. It includes private transcript tables, full-text search, pgvector indexing, and a hybrid Reciprocal Rank Fusion search function. A production version should add authentication, per-user ownership, and matching row-level security policies.

## Evaluation approach

Retrieval quality should be tested with answerable, comparison, exact-number, disagreement, and unanswerable questions. Useful metrics include retrieval recall, citation precision, quote fidelity, and supported-claim rate. The most important regression test is that an unanswerable question returns an evidence-gap response instead of a plausible guess.
