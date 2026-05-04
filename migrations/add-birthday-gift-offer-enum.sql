-- ENGAGE Segment #8 "День рождения" — new AIRecommendationType enum value.
--
-- Triggered exactly 7 days before a member's birthday (matched by MM-DD,
-- leap-year safe via to_char). Single email with 3 gift-choice buttons.
-- One per member per calendar year (detector enforces cooldown via
-- WHERE NOT EXISTS BIRTHDAY_GIFT_OFFER log this year).
--
-- Applied to both DBs (mwdftgazlvpfyvqicovh prod, angwdmyswzztmlrdzgxm dev).
ALTER TYPE "AIRecommendationType" ADD VALUE IF NOT EXISTS 'BIRTHDAY_GIFT_OFFER';
