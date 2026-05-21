-- Upgrade monetary precision from "分" (0.01 yuan) to 0.0001 yuan.
-- All *_cents columns now represent 1/10000 yuan (100x finer).

BEGIN;

UPDATE users
   SET balance_cents = balance_cents * 100,
       total_used_cents = total_used_cents * 100;

UPDATE request_logs
   SET input_cost_cents = input_cost_cents * 100,
       output_cost_cents = output_cost_cents * 100,
       total_cost_cents = total_cost_cents * 100;

UPDATE top_up_records
   SET amount_cents = amount_cents * 100,
       bonus_cents = bonus_cents * 100;

UPDATE channels
   SET balance_cents = balance_cents * 100
 WHERE balance_cents IS NOT NULL;

COMMIT;
