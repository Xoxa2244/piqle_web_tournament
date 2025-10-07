-- Add DivisionStage enum and stage field to divisions table

-- First, create the enum type
DO $$ BEGIN
    CREATE TYPE "DivisionStage" AS ENUM (
        'RR_IN_PROGRESS',
        'RR_COMPLETE',
        'PLAY_IN_SCHEDULED',
        'PLAY_IN_IN_PROGRESS',
        'PLAY_IN_COMPLETE',
        'PO_R1_SCHEDULED',
        'PO_R1_IN_PROGRESS',
        'PO_R1_COMPLETE',
        'PO_R2_SCHEDULED',
        'PO_R2_IN_PROGRESS',
        'PO_R2_COMPLETE',
        'PO_R3_SCHEDULED',
        'PO_R3_IN_PROGRESS',
        'PO_R3_COMPLETE',
        'FINAL_SCHEDULED',
        'FINAL_IN_PROGRESS',
        'FINAL_COMPLETE',
        'DIVISION_COMPLETE'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add stage column to divisions table
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS stage "DivisionStage" DEFAULT 'RR_IN_PROGRESS';

-- Update existing divisions to have appropriate stage based on their matches
UPDATE divisions 
SET stage = CASE 
    WHEN EXISTS (
        SELECT 1 FROM matches m 
        WHERE m."divisionId" = divisions.id 
        AND m.stage = 'ROUND_ROBIN' 
        AND EXISTS (
            SELECT 1 FROM games g 
            WHERE g."matchId" = m.id 
            AND (g."scoreA" > 0 OR g."scoreB" > 0)
        )
    ) THEN 'RR_IN_PROGRESS'
    WHEN EXISTS (
        SELECT 1 FROM matches m 
        WHERE m."divisionId" = divisions.id 
        AND m.stage = 'PLAY_IN'
    ) THEN 'PLAY_IN_SCHEDULED'
    WHEN EXISTS (
        SELECT 1 FROM matches m 
        WHERE m."divisionId" = divisions.id 
        AND m.stage = 'ELIMINATION'
    ) THEN 'PO_R1_SCHEDULED'
    ELSE 'RR_IN_PROGRESS'
END;
