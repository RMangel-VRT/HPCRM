ALTER TABLE service_calendar ADD COLUMN IF NOT EXISTS customer_label text;
UPDATE service_calendar AS c SET customer_label = labels.customer_label
FROM (VALUES
 ('cleanups','Spring clean-up','Spring clean-up'),
 ('cleanups','Fall leaf clean-up 1','Fall leaf clean-up'),
 ('cleanups','Fall leaf clean-up 2','Final fall clean-up'),
 ('shrub_trimming','Spring shrub trim','Early summer trim'),
 ('shrub_trimming','Fall shrub trim','Fall trim'),
 ('fertilization','Pre-emergent / spring fertilizer','Spring pre-emergent'),
 ('fertilization','Summer fertilizer','Summer'),
 ('fertilization','Fall fertilizer','Fall'),
 ('broadleaf','Broadleaf 1','First application'),
 ('broadleaf','Broadleaf 2','Second application'),
 ('broadleaf','Broadleaf 3','Third application'),
 ('native_areas','Spring full native mow','Spring full mow'),
 ('native_areas','Fall full native mow','Fall full mow')
) AS labels(service_key,name,customer_label)
WHERE c.customer_label IS NULL AND c.kind = 'round'
 AND c.service_key = labels.service_key AND c.name = labels.name;
