-- Read-only input for the same planPlannerRoutes/coverageResolver used by import.
-- Customer identities are anonymized before leaving production. No notes,
-- addresses, contact details, documents, credentials or user records are selected.
SELECT json_agg(json_build_object(
  'companyId', c.id,
  'observedAt', current_timestamp,
  'maintenanceVisits', (SELECT count(*) FROM visits v WHERE v.company_id=c.id AND v.source_type='maintenance'),
  'templates', coalesce((SELECT json_agg(json_build_object(
    'id',t.id,'name',t.name,'isActive',t.is_active
  )) FROM weekly_schedule_templates t WHERE t.company_id=c.id),'[]'::json),
  'blocks', coalesce((SELECT json_agg(json_build_object(
    'id',b.id,'templateId',b.template_id,'visitConfigId',b.visit_config_id,'crewId',b.crew_id,
    'dayOfWeek',b.day_of_week,'sortOrder',b.sort_order,'startTime',b.start_time
  )) FROM schedule_blocks b JOIN weekly_schedule_templates t ON t.id=b.template_id WHERE t.company_id=c.id),'[]'::json),
  'columns', coalesce((SELECT json_agg(json_build_object(
    'id',m.id,'name',m.name,'crewId',m.crew_id,'isActive',m.is_active
  )) FROM maintenance_crews m WHERE m.company_id=c.id),'[]'::json),
  'configs', coalesce((SELECT json_agg(json_build_object(
    'id',m.id,'customerId',m.customer_id,'estimatedDurationMinutes',m.estimated_duration_minutes,
    'isActive',m.is_active,'notes',NULL,'notesDigest',md5(coalesce(m.notes,''))
  )) FROM maintenance_visit_configs m WHERE m.company_id=c.id),'[]'::json),
  'crews', coalesce((SELECT json_agg(json_build_object(
    'id',s.id,'name',s.name,'isActive',s.is_active,'displayOrder',s.display_order
  )) FROM crews s WHERE s.company_id=c.id),'[]'::json),
  'properties', coalesce((SELECT json_agg(p) FROM (
    SELECT id, 'Property ' || row_number() OVER (ORDER BY id) AS name,
      parent_customer_id AS "parentCustomerId", active, status
    FROM customers WHERE company_id=c.id
  ) p),'[]'::json),
  'agreements', coalesce((SELECT json_agg(json_build_object(
    'id',a.id,'customerId',a.customer_id
  )) FROM agreements a WHERE a.company_id=c.id),'[]'::json),
  'terms', coalesce((SELECT json_agg(json_build_object(
    'id',t.id,'agreementId',t.agreement_id,'status',t.status,'line',t.line,'startDate',t.start_date,'endDate',t.end_date
  )) FROM agreement_terms t WHERE t.company_id=c.id),'[]'::json),
  'scopes', coalesce((SELECT json_agg(json_build_object(
    'termId',s.term_id,'serviceKey',s.service_key,'included',s.included,'quantity',s.quantity,'monthSpread',s.month_spread
  )) FROM term_scope_lines s WHERE s.company_id=c.id),'[]'::json),
  'existing', '[]'::json
)) AS route_audit_inputs FROM companies c;
