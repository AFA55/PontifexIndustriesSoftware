-- Add operator performance rating metrics to profiles table
-- These ratings are calculated from customer feedback surveys

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS cleanliness_rating_avg DECIMAL(3,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS cleanliness_rating_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS communication_rating_avg DECIMAL(3,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS communication_rating_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS overall_rating_avg DECIMAL(3,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS overall_rating_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_ratings_received INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_rating_received_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN profiles.cleanliness_rating_avg IS 'Average cleanliness rating from customer surveys (1-10 scale)';
COMMENT ON COLUMN profiles.cleanliness_rating_count IS 'Number of cleanliness ratings received';
COMMENT ON COLUMN profiles.communication_rating_avg IS 'Average communication rating from customer surveys (1-10 scale)';
COMMENT ON COLUMN profiles.communication_rating_count IS 'Number of communication ratings received';
COMMENT ON COLUMN profiles.overall_rating_avg IS 'Average overall experience rating from customer surveys (1-10 scale)';
COMMENT ON COLUMN profiles.overall_rating_count IS 'Number of overall ratings received';
COMMENT ON COLUMN profiles.total_ratings_received IS 'Total number of survey responses received';
COMMENT ON COLUMN profiles.last_rating_received_at IS 'Timestamp of most recent rating received';

-- Create index for operators with high ratings (for admin dashboard queries)
CREATE INDEX IF NOT EXISTS idx_profiles_high_rated_operators ON profiles(overall_rating_avg DESC, total_ratings_received DESC)
WHERE role IN ('operator', 'super_operator', 'apprentice') AND total_ratings_received > 0;

-- Create index for recently rated operators
CREATE INDEX IF NOT EXISTS idx_profiles_recent_ratings ON profiles(last_rating_received_at DESC)
WHERE role IN ('operator', 'super_operator', 'apprentice');
