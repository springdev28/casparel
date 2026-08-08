UPDATE "catalog_resources"
SET "metadata" = "metadata" || jsonb_build_object(
  'credibility',
  CASE
    WHEN "provider" IN (
      'Harvard CS50',
      'MIT OpenCourseWare',
      'OpenStax',
      'Open Yale Courses',
      'Purdue OWL',
      'Stanford Encyclopedia of Philosophy',
      'University of Helsinki'
    ) THEN 'academic'
    WHEN "provider" IN (
      'Library of Congress',
      'NASA',
      'Smithsonian Learning Lab'
    ) THEN 'institutional'
    ELSE 'established'
  END,
  'contentScope',
  'whole-work'
);
--> statement-breakpoint
WITH normalized AS (
  SELECT
    "id",
    "source_kind",
    "last_synced_at",
    CASE
      WHEN "canonical_url" ~ '^https://(www\.)?openstax\.org/(details/books|books)/[^/?#]+'
        THEN regexp_replace("canonical_url", '^(https://(?:www\.)?openstax\.org)/(?:details/books|books)/([^/?#]+).*$', '\1/details/books/\2')
      WHEN "canonical_url" ~ '^https://(www\.)?ocw\.mit\.edu/courses/[^/?#]+'
        THEN regexp_replace("canonical_url", '^(https://(?:www\.)?ocw\.mit\.edu/courses/[^/?#]+).*$', '\1')
      WHEN "canonical_url" ~ '^https://[^/]+\.wikibooks\.org/wiki/[^/?#]+'
        THEN regexp_replace("canonical_url", '^(https://[^/]+\.wikibooks\.org/wiki/[^/?#]+).*$', '\1')
      WHEN "canonical_url" ~ '^https://(www\.)?openlibrary\.org/works/[^/?#]+'
        THEN regexp_replace("canonical_url", '^(https://(?:www\.)?openlibrary\.org/works/[^/?#]+).*$', '\1')
      WHEN "canonical_url" ~ '^https://(www\.)?ncbi\.nlm\.nih\.gov/books/NBK[0-9]+'
        THEN regexp_replace("canonical_url", '^(https://(?:www\.)?ncbi\.nlm\.nih\.gov/books/NBK[0-9]+).*$', '\1')
      ELSE "canonical_url"
    END AS "whole_work_url"
  FROM "catalog_resources"
), ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "whole_work_url"
      ORDER BY ("source_kind" = 'curated') DESC, "last_synced_at" DESC, "id" ASC
    ) AS "duplicate_rank"
  FROM normalized
)
DELETE FROM "catalog_resources"
USING ranked
WHERE "catalog_resources"."id" = ranked."id"
  AND ranked."duplicate_rank" > 1;
--> statement-breakpoint
WITH normalized AS (
  SELECT
    "id",
    CASE
      WHEN "canonical_url" ~ '^https://(www\.)?openstax\.org/(details/books|books)/[^/?#]+'
        THEN regexp_replace("canonical_url", '^(https://(?:www\.)?openstax\.org)/(?:details/books|books)/([^/?#]+).*$', '\1/details/books/\2')
      WHEN "canonical_url" ~ '^https://(www\.)?ocw\.mit\.edu/courses/[^/?#]+'
        THEN regexp_replace("canonical_url", '^(https://(?:www\.)?ocw\.mit\.edu/courses/[^/?#]+).*$', '\1')
      WHEN "canonical_url" ~ '^https://[^/]+\.wikibooks\.org/wiki/[^/?#]+'
        THEN regexp_replace("canonical_url", '^(https://[^/]+\.wikibooks\.org/wiki/[^/?#]+).*$', '\1')
      WHEN "canonical_url" ~ '^https://(www\.)?openlibrary\.org/works/[^/?#]+'
        THEN regexp_replace("canonical_url", '^(https://(?:www\.)?openlibrary\.org/works/[^/?#]+).*$', '\1')
      WHEN "canonical_url" ~ '^https://(www\.)?ncbi\.nlm\.nih\.gov/books/NBK[0-9]+'
        THEN regexp_replace("canonical_url", '^(https://(?:www\.)?ncbi\.nlm\.nih\.gov/books/NBK[0-9]+).*$', '\1')
      ELSE "canonical_url"
    END AS "whole_work_url"
  FROM "catalog_resources"
)
UPDATE "catalog_resources"
SET "canonical_url" = normalized."whole_work_url"
FROM normalized
WHERE "catalog_resources"."id" = normalized."id"
  AND "catalog_resources"."canonical_url" <> normalized."whole_work_url";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_resources_credibility_idx"
  ON "catalog_resources" (("metadata"->>'credibility'));
