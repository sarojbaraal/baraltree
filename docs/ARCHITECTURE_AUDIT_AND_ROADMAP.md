# BaralTree — Architecture Audit & Professional Heritage Roadmap

**Repository reviewed:** `sarojbaraal/baraltree`  
**Review basis:** current `main` tree and source files available on 2026-10-17.  
**Status:** initial static review, not a live penetration test or production database verification.

## Product direction

Evolve BaralTree from a family-tree viewer into a durable, private family heritage archive: reliable genealogy, biographies, family stories and documents, accessible diagrams, useful analytics, and carefully controlled AI assistance. Preserve the current Supabase/Next.js foundation unless a measured technical reason supports changing it. Do not perform a destructive rewrite before validating the existing database and data.

## Existing stack observed

- Next.js App Router, React, TypeScript, Tailwind CSS
- Supabase Auth and Postgres; SQL migration under `supabase/migrations/`
- React Flow + Dagre for tree visualization
- Recharts for analytics; Zustand for client state
- Supabase Edge Functions for Gemini-based profile insights and relationship suggestions
- A substantial legacy HTML/JS implementation under `legacy/`

## High-priority findings from static source review

### P0 — Verify before exposing or deploying

1. **AI Edge Function authorization is not actually validated.** `generate-ai-insights/index.ts` checks only that an `Authorization` header exists, then uses the service-role key for unrestricted reads and writes. A caller's identity and permission to access the requested person are not verified in the function. Validate the JWT with Supabase Auth, enforce role/branch authorization server-side, validate the UUID, and return generic errors without leaking database/provider details. Never trust a client-provided person ID alone.
2. **Relationship-suggestion Edge Function appears callable without authentication/authorization.** `suggest-relationships/index.ts` creates a service-role client and reads up to 1,000 people, then writes suggestions; it does not validate the caller. Require a verified admin/moderator identity and apply rate limits/operational bounds before allowing expensive graph work.
3. **Semantic-search RPC security needs a full review.** `match_people_by_embedding` is `SECURITY DEFINER`, granted to `anon` and `authenticated`, and returns names, dates, summaries, tags, and photos for eligible records. Confirm that anonymous access is an intentional family privacy decision; set a safe `search_path`, validate thresholds/count/vector dimensions, and enforce the same visibility rules as ordinary profile access.
4. **The analytics RPC is SECURITY DEFINER.** `get_family_analytics` is granted to authenticated users and aggregates data using a branch-lock rule. Review the function's `search_path`, intended audience, treatment of living people's data, and whether aggregate outputs can leak private branch details.
5. **RLS assumptions are not yet proven end-to-end.** The migration enables RLS on `people` and `ai_suggestions`, but the full database schema and all existing policies/grants were not available in this review. Audit every table, view, RPC, trigger, storage bucket, and Edge Function. Test as anonymous, ordinary authenticated, moderator, admin, and any premium role. Do not treat UI hiding or middleware as authorization.

### P1 — Correctness and data integrity

6. **Analytics has fabricated fallback values.** `app/analytics/page.tsx` returns hard-coded example longevity, geography, and generation counts when the RPC fails. This can present invented values as real family statistics. Replace these with real calculations or a clear “data unavailable / migration not applied” state; never show sample figures as production results.
7. **Tree generation and edges are father-only.** `components/tree/FamilyTree.tsx` builds generation depth and edges from `father_id` only. Mother links are used to find children in the profile panel but are not represented equivalently in the tree layout. Define a relationship model that can represent both parents, multiple marriages, step/adoptive relationships where needed, and unknown/uncertain links without silently changing lineage.
8. **Relationship inference must remain a review queue.** The suggestion algorithm uses surname, approximate birth year, and locality as heuristics. Those are weak evidence, not proof of kinship. Never automatically write suggested relationships into canonical family records; display evidence, uncertainty, and an explicit human approval action.
9. **BS dates need a defined data contract.** Current analytics extracts the first four digits from strings and subtracts years. That can be misleading when dates are incomplete, malformed, or have different precision. Preserve original date text, validate structured BS dates where possible, explicitly handle uncertainty, and avoid claiming exact ages from year-only data.
10. **Search input and error handling need hardening.** `app/api/search/route.ts` inserts user input into a PostgREST `.or(...)` expression and returns raw exception messages. Escape/validate query syntax, limit length and request rate, use safe query construction, and avoid exposing internal errors.
11. **Data model migration must be reconciled with the actual database.** The checked-in migration assumes `public.people` and `public.profiles` already exist and uses `uuid-ossp`, `vector`, and pgvector HNSW. Inspect the live schema and migration history before applying or editing migrations; never run an unverified migration against production.

### P2 — Product and UX improvements

12. Replace the full-screen canvas-only experience with a clear responsive application shell: dashboard, family tree, people directory, profile/archive, analytics, review queue, and admin/settings. Keep tree exploration a first-class feature.
13. Add accessible tree controls: keyboard navigation, search focus, fit-to-view, ancestor/descendant views, branch isolation, clear legends, loading/empty/error states, and a usable mobile list/profile alternative.
14. Improve profiles into structured heritage records: verified facts, source/citation fields, life events, stories, photos/documents, relationship history, record confidence, and last-updated/change history. Make optional fields optional and clearly label unknown values.
15. Add a directory/table view with filters and pagination so users are not forced to navigate thousands of nodes on a canvas.
16. Add real analytics with source/coverage indicators and privacy-aware aggregation: member counts, recorded generations, branches, known birth/death-date coverage, geographic distribution at safe granularity, and timeline. Do not infer or expose sensitive information about living relatives unnecessarily.
17. AI profile summaries should be drafts grounded only in stored facts. Return a structured response with factual statements linked to source fields; mark missing data as unknown; never invent occupations, titles, honorifics, places, dates, accomplishments, or relationships. Require human review before publishing and retain generated-at/model/version metadata.
18. Use a background/queued process for bulk AI embeddings and suggestions rather than an unbounded request. Add quotas, rate limits, retries, timeout handling, cost visibility, and deletion/re-generation controls.
19. Add automated tests, lint/build CI, migration checks, accessibility checks, dependency review, and a documented recovery drill.

## Security and privacy acceptance criteria

- No service-role key or Gemini API key is exposed to browser code, logs, responses, or committed configuration.
- All privileged functions authenticate the actual JWT, authorize the requested operation on the server, validate input, and use least privilege.
- Every table/view/RPC/storage bucket has documented access rules; test unauthorized reads and writes explicitly.
- Public/anonymous access is an intentional, documented product choice—not a workaround for an RLS error.
- Private or locked branches cannot leak via tree queries, search, analytics, AI prompts, embeddings, logs, exports, or related-person lookups.
- Sensitive records of living people have a defined visibility and consent policy.
- Backups are automated and encrypted where supported; restore steps are documented and periodically tested.
- Migrations are versioned, reviewed, reversible where feasible, and tested against a staging copy before production.
- No destructive data migration or automatic AI relationship update occurs without an explicit reviewed migration and recovery plan.

## Recommended implementation sequence

### Phase 0 — Baseline and protection
1. Capture a database schema-only export, migration history, and a verified backup.
2. Document deployment target, current environment variables (names only), current Supabase RLS policies, storage policies, functions, and role definitions.
3. Add a staging environment and verify restore before schema changes.
4. Add CI for TypeScript/lint/build and basic tests.

### Phase 1 — Security and factual correctness
1. Fix and test authorization for both Edge Functions.
2. Review all SECURITY DEFINER functions, explicit grants, RLS policies, and search paths.
3. Remove fabricated analytics fallbacks and unsafe error disclosures.
4. Harden search validation, rate limiting, and locked-branch filtering.
5. Add regression tests for role/branch access and data validation.

### Phase 2 — Data model and archive
1. Document current relationships and migration from existing data.
2. Add structured life events, sources/citations, stories, media metadata, and audit/change history as appropriate.
3. Decide explicit semantics for spouse history, parentage, adoption/step relationships, unknown parents, and uncertain claims.
4. Create import/export with validation, duplicate review, and dry-run preview.

### Phase 3 — Professional UX
1. Create a responsive app shell and design tokens.
2. Build directory, profile/archive, tree, analytics, and moderation/review pages.
3. Improve graph layout and filtering; test large datasets and mobile behavior.
4. Add accessibility, empty/error/loading states, and clear privacy indicators.

### Phase 4 — AI and analytics
1. Add reviewed AI biography drafts and explainable relationship suggestions.
2. Add queueing, quotas, retries, provider/model metadata, and a no-AI graceful mode.
3. Add meaningful analytics with data coverage and uncertainty shown.
4. Ensure AI output cannot directly overwrite verified records.

### Phase 5 — Release readiness
1. Run security tests across roles and branch visibility.
2. Run build/lint/type tests and end-to-end critical journeys.
3. Validate migration on a staging database copy and restore from backup.
4. Publish operator documentation, privacy policy, incident steps, and maintenance checklist.

## Questions to resolve before a full implementation

- Is the family tree intended to be public, family-login-only, or mixed by branch?
- Who may create/edit records: owner/admin only, moderators, or verified relatives?
- What is the canonical role source: `profiles.role`, `profiles.roles`, or both?
- Is the live database schema identical to the checked-in migration assumptions?
- Where is the app deployed, and are preview deployments connected to a separate Supabase project?
- Which records should be considered private by default, especially for living people and minors?

## Scope note

This is a source-based initial review. It does not prove the current live Supabase configuration is vulnerable or secure, and it is not a penetration test. Confirm findings against the live schema, policies, deployment settings, and tests before changing production.
