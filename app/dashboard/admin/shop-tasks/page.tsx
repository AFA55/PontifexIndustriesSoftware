import { redirect } from 'next/navigation';

/**
 * /dashboard/admin/shop-tasks
 *
 * "Shop Tasks" never had a real page (it 404'd) and is redundant with the
 * Maintenance Inbox, which is where equipment/maintenance requests from operators
 * AND supervisors land. We removed it from the sidebar; this redirect keeps any
 * stale link/bookmark from hitting a 404 by sending it to the Maintenance Inbox.
 */
export default function ShopTasksRedirect() {
  redirect('/dashboard/admin/maintenance');
}
