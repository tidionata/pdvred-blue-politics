-- Migration to add delivery options to orders table
ALTER TABLE orders 
ADD COLUMN delivery_type text DEFAULT 'local',
ADD COLUMN delivery_address jsonb;
