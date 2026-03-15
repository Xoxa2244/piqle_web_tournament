-- Add registered_count to play_sessions
-- Stores the actual number of registered players from CSV import.
-- Used by dashboard for occupancy calculations instead of counting bookings.
ALTER TABLE play_sessions ADD COLUMN IF NOT EXISTS registered_count INT;
