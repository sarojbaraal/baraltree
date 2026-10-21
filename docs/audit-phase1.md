# Phase 1 audit — prompt checklist vs. current code (2026-10-20)

Status: ✅ done · 🟡 partial · ❌ missing · ⛔ deliberately not adopted

## Decisions (user)
- Keep pink female accent (`--female`) — no change.
- Keep detail drawer on the left — no change.
- Keep the "night lineage" UI as the base design.

## 1. Architecture
| Item | Status | Note |
|---|---|---|
| App Router, client components for interactive UI | ✅ | `app/(vansh)` + `components/vansh` |
| Auth context + Supabase client | ✅ | `VanshContext`, `@supabase/ssr` |
| Zustand / React Query | ⛔ | Context + memoised graph is enough for ~300 people |
| Tailwind for the new app | ⛔ | See pros/cons in chat; `(site)` pages still use it |
| Icons | ✅ | SVG sprite + emoji |
| Male/female avatars from `site-assets` bucket | ❌ | Inline SVG only; bucket not in new project |

## 2. Database
| Item | Status | Note |
|---|---|---|
| profiles / people / change_requests / user_layout | ✅ | applied in new project |
| `get_people`, `review_request`, `set_my_anchor`, `sync_couple` | ✅ | |
| `admin_set_anchor(p_user,p_target,p_rel)` | ❌ | not in schema, no UI |
| `set_my_anchor` used by UI | ❌ | RPC exists, no "choose my reference" UI |
| `user_layout` used by UI | ❌ | table exists, app doesn't read/write it |

## 3. Kinship engine
| Item | Status | Note |
|---|---|---|
| Labels relative to `position_person_id` | ✅ | `lib/vansh/relations.ts` (pattern based) |
| Anchor = `custom_anchor` | ❌ | only position_person/position_parent |
| BFS shortest path, any → any | ❌ | hard-coded patterns; `relsOf` only for immediate kin |
| Ordinals जेठो/माईलो/साईलो/…/कान्छो | ❌ | only older/younger |
| Mother's sister older/younger (ठूलीआमा/सानिमा) | 🟡 | all मौसी → सानिमा |
| सौतेनी आमा/बुबा | ❌ | |
| Collapse long paths | 🟡 | partial (फुपूको छोरी → …) |
| Smart relation search ("काका", "भतिज") | ❌ | name search only |
| Unit tests | 🟡 | basic labels tested, not dictionary |
| `utils/kinship.ts` | ⚠️ | old, weaker, used only by old `(site)` panel — to be replaced |

## 4. UI/UX
| Item | Status |
|---|---|
| Neon login, feature cards | 🟡 feature list is static, not clickable |
| OAuth user: hide "forgot password", offer "link email/password" | ❌ |
| Registration claim_father / claim_grand + pending screen | ✅ |
| Drawer: resize handle + width in localStorage | ❌ |
| Drawer: mobile bottom sheet + swipe-to-close | 🟡 bottom sheet yes, swipe no |
| `overscroll-behavior: contain` | ✅ |
| Compact sticky header, "⋮ More" | ✅ |
| "तत्काल परिवार" → "परिवार", list view, ♂2 ♀1 counts | ❌ |
| Sticky "मेरो स्थान" + search on family tab | ❌ |
| Glow pulse (`flash`) on locate | ❌ (scrolls only) |
| Overview charts (gender, living, marital, age, shared ancestors) | ✅ |
| Living = glowing green dot; demised dim | 🟡 demised dimmed, no dot |
| "स्वर्गीय"/"स्व." prefix | ❌ |

## 5. Data
| Item | Status |
|---|---|
| ASCII `YYYY-MM-DD`, `00` unknowns | ✅ |
| Devanagari date input, auto-dash, age calc | ✅ (3-field input) |
| Profile photo upload to `profile-photos` | ✅ |
| Camera badge on avatar in edit form | 🟡 |
| Admin upload of global male/female SVG | ❌ |
| Print branch A3 landscape | ✅ |
| Import CSV/JSON/Excel with preview diff | ✅ |

## Proposed Phase 2 order
1. Kinship engine rewrite (BFS + ordinals + dictionary) with tests — core value.
2. Anchor: `set_my_anchor` UI, `admin_set_anchor` RPC, smart relation search.
3. Cheap UI: sticky controls, flash, स्वर्गीय, परिवार list + ♂♀, status dot, OAuth password rules, drawer resize/swipe.
4. Global avatars bucket + admin upload.

## Phase 2 progress (2026-10-21)
- ✅ Kinship engine rewritten (`lib/vansh/kinship.ts`): path/Dijkstra, collapse, सौतेनी rule, ordinals, custom anchor, 26 tests.
- ✅ "नाता सन्दर्भ" dialog (self) + admin per-user button; `admin_set_anchor` in `20261021_admin_set_anchor.sql` (run in SQL editor).
- ✅ Relation words searchable in family tab and chart; जेठो/माइलो/…/कान्छो shown in detail panel.
- ⏳ Next: cheap UI items (sticky controls, flash, स्वर्गीय, परिवार list + ♂♀, status dot, OAuth password rules, drawer resize/swipe), global avatars.
