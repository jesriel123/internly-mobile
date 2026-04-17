-- ============================================================
-- Internly - Notifications Enhancement Migration
-- Adds support for automatic notifications on clock in/out and approvals
-- Run this in Supabase SQL Editor after supabase-notifications-migration.sql
-- Safe to re-run (idempotent)
-- ============================================================

-- Add new columns to notifications table
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS notification_type TEXT CHECK (notification_type IN ('clock_in', 'clock_out', 'approval', 'rejected', 'manual', NULL)),
ADD COLUMN IF NOT EXISTS related_log_id UUID REFERENCES time_logs(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS related_log_date TEXT;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_related_log ON notifications(related_log_id);

-- Add comment for documentation
COMMENT ON COLUMN notifications.notification_type IS 'Type of notification: clock_in, clock_out, approval, rejected, or manual (admin-sent)';
COMMENT ON COLUMN notifications.related_log_id IS 'Reference to time_logs table for clock in/out and approval notifications';
COMMENT ON COLUMN notifications.related_log_date IS 'Date of the related time log (YYYY-MM-DD format)';
