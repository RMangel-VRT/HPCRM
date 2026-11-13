-- Complete source-to-source Drizzle Kit output, executed only in disposable PostgreSQL.
-- This is not a live Publish capture or a production migration runner.
ALTER TABLE "estimate_quick_items" DROP CONSTRAINT "estimate_quick_items_unit_v2_check";

ALTER TABLE "estimate_service_categories" DROP CONSTRAINT "estimate_service_categories_unit_v2_check";

ALTER TABLE "estimate_quick_items" ADD CONSTRAINT "estimate_quick_items_unit_v3_check" CHECK ("estimate_quick_items"."default_unit" IN ('SF','LF','1,000 SF','HR','DAY','WEEK','EA','FLAT','GAL','CU. YD','LB','BAG','TON','IN. DBH'));

ALTER TABLE "estimate_service_categories" ADD CONSTRAINT "estimate_service_categories_unit_v3_check" CHECK ("estimate_service_categories"."default_unit" IN ('SF','LF','1,000 SF','HR','DAY','WEEK','EA','FLAT','GAL','CU. YD','LB','BAG','TON','IN. DBH'));
