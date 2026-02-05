SELECT
  o.id AS order_id,
  o.user_id,
  o.created_at,
  CASE
    WHEN u.id IS NULL THEN 'MISSING_USER'
    WHEN u.deleted_at IS NOT NULL THEN 'SOFT_DELETED_USER'
    WHEN o.user_id IS NULL THEN 'NULL_USER_ID'
    ELSE 'VALID'
  END AS validation_status
FROM orders o
LEFT JOIN users u ON u.id = o.user_id
WHERE
  o.created_at >= '2023-01-01'
  AND (
    o.user_id IS NULL
    OR u.id IS NULL
    OR u.deleted_at IS NOT NULL
  );
