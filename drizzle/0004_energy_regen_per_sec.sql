-- Energy regen: effect_amount was per minute, now per second. Scale down to preserve balance.
UPDATE "boosters"
SET "effect_amount" = "effect_amount" / 60
WHERE "type" = 'energy_regen';
