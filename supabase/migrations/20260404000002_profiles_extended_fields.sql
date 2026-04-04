-- Extended profile fields: DOB, hire date, review date, nickname
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_review_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nickname TEXT;
