CREATE TYPE "public"."scope2_market_basis" AS ENUM('contractual_instrument', 'grid_average');--> statement-breakpoint
ALTER TABLE "activity_emission" ADD COLUMN "scope2_market_basis" "scope2_market_basis";--> statement-breakpoint
ALTER TABLE "activity_factor_mapping" ADD COLUMN "scope2_market_basis" "scope2_market_basis";--> statement-breakpoint
-- Backfill, written by hand into the generated file rather than run against the
-- database (AGENTS.md 9). Every market-lane mapping that exists today carries a
-- contractual rate by construction: prompt 85's lane check has refused anything
-- else since the lane existed, so `contractual_instrument` restates what the row
-- already meant rather than asserting something new about it.
--
-- `activity_emission` is deliberately NOT backfilled. Those rows were produced
-- by engine 1.2.0 and D8 says stored figures are not retroactively rewritten;
-- a null basis there reads as "computed before the fallback existed", which is
-- true, and the next recalculation restates them under 1.3.0.
UPDATE "activity_factor_mapping"
   SET "scope2_market_basis" = 'contractual_instrument'
 WHERE "scope2_method" = 'market_based'
   AND "scope2_market_basis" is null;
