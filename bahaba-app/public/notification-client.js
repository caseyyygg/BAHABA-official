export async function withNotificationTimeout(promise, stage) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${stage} timed out after 15 seconds`)), 15000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function notificationRegistration() {
  await withNotificationTimeout(navigator.serviceWorker.register('/notification-worker.js'), 'Worker registration')
  return withNotificationTimeout(navigator.serviceWorker.ready, 'Worker activation')
}

export async function showBahabaNotification(title, options = {}, registration) {
  const worker = registration || await notificationRegistration()
  await withNotificationTimeout(worker.showNotification(title, {
    requireInteraction: true,
    silent: false,
    ...options,
  }), 'Notification request')
  return worker
}
