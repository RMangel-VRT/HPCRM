-- DML only. Historical fields and their captured values deliberately remain.
UPDATE ticket_type_fields AS field
SET is_required = 'false', field_label = 'Legacy QuickBooks Estimate #'
FROM ticket_types AS type
WHERE field.ticket_type_id = type.id
  AND type.type_key = 'estimate_request'
  AND field.field_key = 'qb_estimate_number'
  AND (field.is_required IS DISTINCT FROM 'false'
    OR field.field_label IS DISTINCT FROM 'Legacy QuickBooks Estimate #');
