export { notificationRegistration, showBahabaNotification, withNotificationTimeout } from '../public/notification-client.js'

export function newFloodReports(reports, seen) {
  return reports.filter((report) => !seen.has(String(report.id))
    && !['rejected', 'resolved', 'cancelled'].includes(String(report.status || '').toLowerCase()))
}
