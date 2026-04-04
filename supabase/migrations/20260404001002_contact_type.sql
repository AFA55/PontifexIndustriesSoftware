-- Add contact_type to customer_contacts
ALTER TABLE customer_contacts
  ADD COLUMN IF NOT EXISTS contact_type text DEFAULT 'general'
  CHECK (contact_type IN ('on_site', 'billing', 'general'));
