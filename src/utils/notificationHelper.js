import { supabase } from '../../supabaseConfig';

/**
 * Create a notification for admins/super_admins when user clocks in/out
 * @param {Object} params
 * @param {string} params.type - 'clock_in' or 'clock_out'
 * @param {string} params.userId - User ID
 * @param {string} params.userName - User name
 * @param {string} params.userCompany - User company
 * @param {string} params.logDate - Log date (YYYY-MM-DD)
 * @param {string} params.logId - Time log ID
 * @param {string} params.time - Time string (e.g., "9:30 AM")
 * @param {string} params.hours - Hours logged (for clock_out only)
 */
export async function createClockNotification({
  type,
  userId,
  userName,
  userCompany,
  logDate,
  logId,
  time,
  hours,
}) {
  console.log('[notificationHelper] ===== STARTING NOTIFICATION CREATION =====');
  console.log('[notificationHelper] Parameters:', { 
    type, 
    userId, 
    userName, 
    userCompany, 
    logDate, 
    logId, 
    time, 
    hours 
  });
  
  try {
    // Generate notification ID
    const notificationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const title = type === 'clock_in' ? 'Student Clocked In' : 'Student Clocked Out';
    const message = type === 'clock_in'
      ? `${userName} clocked in at ${time} on ${logDate}`
      : `${userName} clocked out at ${time} on ${logDate} (${hours}h logged)`;

    console.log('[notificationHelper] Fetching admin users...');

    // Get all admins and super_admins
    const { data: adminUsers, error: adminError } = await supabase
      .from('users')
      .select('id, role, company')
      .in('role', ['admin', 'super_admin']);

    if (adminError) {
      console.error('[notificationHelper] Error fetching admins:', adminError);
      return;
    }

    console.log('[notificationHelper] Found admin users:', adminUsers?.length || 0);

    // Filter recipients: admins of same company + all super_admins
    const recipients = (adminUsers || []).filter(
      u => u.role === 'super_admin' || (u.role === 'admin' && u.company === userCompany)
    );

    console.log('[notificationHelper] Filtered recipients:', recipients.length);
    console.log('[notificationHelper] Recipients details:', recipients.map(r => ({ id: r.id, role: r.role, company: r.company })));

    if (recipients.length === 0) {
      console.log('[notificationHelper] ❌ NO RECIPIENTS FOUND!');
      console.log('[notificationHelper] User company:', userCompany);
      console.log('[notificationHelper] All admin users:', adminUsers);
      return;
    }

    // Create notification record
    const notificationPayload = {
      id: notificationId,
      sender_id: userId,
      sender_role: 'user',
      target_company: userCompany,
      target_role: 'admin',
      title,
      message,
      is_global: false,
      notification_type: type,
      related_log_id: logId,
      related_log_date: logDate,
    };

    console.log('[notificationHelper] Creating notification record with payload:', notificationPayload);

    const { data: notifData, error: notifError } = await supabase
      .from('notifications')
      .insert(notificationPayload)
      .select();

    if (notifError) {
      console.error('[notificationHelper] Error creating notification:', notifError);
      return;
    }

    console.log('[notificationHelper] Notification created successfully:', notifData);

    // Create notification logs for each recipient
    const recipientIds = recipients.map(u => u.id).filter(Boolean);

    console.log('[notificationHelper] Creating notification logs for recipients:', recipientIds);

    const { error: logsError } = await supabase.rpc('create_notification_logs', {
      _notification_id: notificationId,
      _recipient_ids: recipientIds,
      _default_status: 'sent',
    });

    if (logsError) {
      console.warn('[notificationHelper] Failed to create notification logs:', logsError);
    } else {
      console.log('[notificationHelper] Notification logs created successfully');
    }

    console.log(`[notificationHelper] ✅ Created ${type} notification for ${recipients.length} recipients`);
  } catch (error) {
    console.error('[notificationHelper] ❌ Error creating clock notification:', error);
  }
}
