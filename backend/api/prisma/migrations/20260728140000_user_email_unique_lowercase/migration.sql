-- Normaliza emails existentes e resolve duplicados (prioridade: ADMIN > ATTENDANT > DESIGNER > CLIENT > COLLABORATOR).
UPDATE "users" SET email = LOWER(TRIM(email)) WHERE email <> LOWER(TRIM(email));

WITH ranked AS (
  SELECT
    id,
    email,
    ROW_NUMBER() OVER (
      PARTITION BY email
      ORDER BY
        CASE role
          WHEN 'ADMIN' THEN 0
          WHEN 'ATTENDANT' THEN 1
          WHEN 'DESIGNER' THEN 2
          WHEN 'CLIENT' THEN 3
          WHEN 'COLLABORATOR' THEN 4
          ELSE 5
        END,
        created_at ASC
    ) AS rn
  FROM "users"
)
UPDATE "users" u
SET email = CASE
  WHEN r.rn = 1 THEN r.email
  WHEN r.email LIKE '%@%' THEN
    split_part(r.email, '@', 1) || '+dup' || r.rn::text || '@' || split_part(r.email, '@', 2)
  ELSE r.email || '+dup' || r.rn::text
END
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_chk"
  CHECK (email = lower(email));
