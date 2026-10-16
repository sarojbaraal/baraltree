-- ============================================================================
-- PHASE 1: DATABASE & SECURITY UPGRADE
-- Vanshavali (Nepali Family Tree) Enterprise Architecture Migration
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. SCHEMA EXTENSION FOR 'people' TABLE
ALTER TABLE public.people 
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_tags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ai_embedding vector(768),
  ADD COLUMN IF NOT EXISTS is_branch_locked boolean DEFAULT false;

-- Create GIN index for rapid tag filtering (e.g. 'शिक्षक', 'काठमाडौं')
CREATE INDEX IF NOT EXISTS idx_people_ai_tags ON public.people USING gin(ai_tags);

-- Create HNSW index for high-dimensional cosine similarity vector search
CREATE INDEX IF NOT EXISTS idx_people_ai_embedding 
  ON public.people 
  USING hnsw (ai_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index foreign keys and search fields for 10,000+ node traversal performance
CREATE INDEX IF NOT EXISTS idx_people_father_id ON public.people(father_id);
CREATE INDEX IF NOT EXISTS idx_people_mother_id ON public.people(mother_id);
CREATE INDEX IF NOT EXISTS idx_people_spouse_id ON public.people(spouse_id);
CREATE INDEX IF NOT EXISTS idx_people_name ON public.people(name);

-- 3. 'ai_suggestions' TABLE
CREATE TABLE IF NOT EXISTS public.ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  target_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  suggestion_type text NOT NULL CHECK (
    suggestion_type IN (
      'potential_father', 
      'potential_mother', 
      'potential_sibling', 
      'potential_spouse'
    )
  ),
  confidence_score numeric(4, 3) NOT NULL CHECK (confidence_score >= 0.000 AND confidence_score <= 1.000),
  reasoning_ne text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_different_persons CHECK (source_person_id <> target_person_id),
  CONSTRAINT uq_person_suggestion UNIQUE (source_person_id, target_person_id, suggestion_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON public.ai_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_source ON public.ai_suggestions(source_person_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_target ON public.ai_suggestions(target_person_id);

-- 4. SECURITY & PERMISSION HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_admin_or_moderator()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND (
        role IN ('admin', 'moderator') 
        OR 'admin' = ANY(roles) 
        OR 'moderator' = ANY(roles)
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_elevated_lineage_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND (
        role IN ('admin', 'moderator', 'premium') 
        OR 'admin' = ANY(roles) 
        OR 'moderator' = ANY(roles)
        OR 'premium' = ANY(roles)
      )
  );
END;
$$;

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public and authenticated users can view eligible people" ON public.people;
CREATE POLICY "Public and authenticated users can view eligible people"
  ON public.people
  FOR SELECT
  USING (
    is_branch_locked = false 
    OR public.has_elevated_lineage_access()
  );

DROP POLICY IF EXISTS "Admins and moderators can insert people" ON public.people;
CREATE POLICY "Admins and moderators can insert people"
  ON public.people
  FOR INSERT
  WITH CHECK (public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins and moderators can update people" ON public.people;
CREATE POLICY "Admins and moderators can update people"
  ON public.people
  FOR UPDATE
  USING (public.is_admin_or_moderator())
  WITH CHECK (public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Admins can delete people" ON public.people;
CREATE POLICY "Admins can delete people"
  ON public.people
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND (role = 'admin' OR 'admin' = ANY(roles))
    )
  );

DROP POLICY IF EXISTS "Admins and moderators can view ai suggestions" ON public.ai_suggestions;
CREATE POLICY "Admins and moderators can view ai suggestions"
  ON public.ai_suggestions
  FOR SELECT
  USING (public.is_admin_or_moderator());

DROP POLICY IF EXISTS "Edge functions and admins can insert ai suggestions" ON public.ai_suggestions;
CREATE POLICY "Edge functions and admins can insert ai suggestions"
  ON public.ai_suggestions
  FOR INSERT
  WITH CHECK (public.is_admin_or_moderator() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins and moderators can update ai suggestions" ON public.ai_suggestions;
CREATE POLICY "Admins and moderators can update ai suggestions"
  ON public.ai_suggestions
  FOR UPDATE
  USING (public.is_admin_or_moderator())
  WITH CHECK (public.is_admin_or_moderator());

-- 6. RPC: SEMANTIC VECTOR SEARCH
CREATE OR REPLACE FUNCTION public.match_people_by_embedding(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.50,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  gender text,
  birth_bs text,
  death_bs text,
  address text,
  ai_summary text,
  ai_tags text[],
  photo_url text,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.gender,
    p.birth_bs,
    p.death_bs,
    CASE 
      WHEN p.is_branch_locked AND NOT public.has_elevated_lineage_access() THEN '[गोप्य / Locked]'
      ELSE p.address 
    END AS address,
    p.ai_summary,
    p.ai_tags,
    p.photo_url,
    ROUND((1 - (p.ai_embedding <=> query_embedding))::numeric, 4)::float AS similarity
  FROM public.people p
  WHERE p.ai_embedding IS NOT NULL
    AND (p.is_branch_locked = false OR public.has_elevated_lineage_access())
    AND (1 - (p.ai_embedding <=> query_embedding)) > match_threshold
  ORDER BY p.ai_embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$;

-- 7. RPC: SECURE FAMILY ANALYTICS
CREATE OR REPLACE FUNCTION public.get_family_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result json;
  user_has_elevated boolean;
BEGIN
  user_has_elevated := public.has_elevated_lineage_access();

  WITH accessible_people AS (
    SELECT * 
    FROM public.people
    WHERE is_branch_locked = false OR user_has_elevated
  ),
  total_stats AS (
    SELECT 
      count(*)::int AS total_members,
      count(*) FILTER (WHERE is_living = true)::int AS living_members,
      count(*) FILTER (WHERE is_living = false)::int AS deceased_members,
      count(*) FILTER (WHERE gender = 'male' OR gender = 'M')::int AS male_count,
      count(*) FILTER (WHERE gender = 'female' OR gender = 'F')::int AS female_count,
      count(*) FILTER (WHERE gender NOT IN ('male', 'female', 'M', 'F') OR gender IS NULL)::int AS other_gender_count
    FROM accessible_people
  ),
  longevity_stats AS (
    SELECT 
      CASE 
        WHEN lifespan < 20 THEN '०-२० वर्ष'
        WHEN lifespan >= 20 AND lifespan < 40 THEN '२०-४० वर्ष'
        WHEN lifespan >= 40 AND lifespan < 60 THEN '४०-६० वर्ष'
        WHEN lifespan >= 60 AND lifespan < 80 THEN '६०-८० वर्ष'
        ELSE '८०+ वर्ष'
      END AS age_bracket,
      count(*)::int AS count
    FROM (
      SELECT 
        (NULLIF(regexp_replace(death_bs, '[^0-9].*$', ''), '')::int - 
         NULLIF(regexp_replace(birth_bs, '[^0-9].*$', ''), '')::int) AS lifespan
      FROM accessible_people
      WHERE birth_bs IS NOT NULL 
        AND death_bs IS NOT NULL
        AND birth_bs ~ '^[0-9]{4}' 
        AND death_bs ~ '^[0-9]{4}'
    ) sub
    WHERE lifespan >= 0 AND lifespan <= 120
    GROUP BY age_bracket
  ),
  geographic_distribution AS (
    SELECT 
      COALESCE(NULLIF(TRIM(split_part(address, ',', 1)), ''), 'अज्ञात') AS location,
      count(*)::int AS count
    FROM accessible_people
    WHERE address IS NOT NULL AND address <> ''
    GROUP BY location
    ORDER BY count DESC
    LIMIT 10
  ),
  generation_depth AS (
    WITH RECURSIVE lineage AS (
      SELECT id, father_id, 1 AS depth
      FROM accessible_people
      WHERE father_id IS NULL
      
      UNION ALL
      
      SELECT child.id, child.father_id, parent.depth + 1
      FROM accessible_people child
      JOIN lineage parent ON child.father_id = parent.id
    )
    SELECT COALESCE(max(depth), 0)::int AS max_generations FROM lineage
  )
  SELECT json_build_object(
    'overview', (SELECT row_to_json(t) FROM total_stats t),
    'longevity', (SELECT COALESCE(json_agg(l), '[]'::json) FROM longevity_stats l),
    'geography', (SELECT COALESCE(json_agg(g), '[]'::json) FROM geographic_distribution g),
    'max_generations', (SELECT max_generations FROM generation_depth)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_moderator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_elevated_lineage_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_people_by_embedding(vector, float, int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_family_analytics() TO authenticated;
