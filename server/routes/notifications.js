import express from 'express';
import { 
  createNotification, 
  getUserNotifications, 
  deleteNotification, 
  runBirthdayReminders,
  markNotificationRead,
  markAllNotificationsRead,
  updateNotificationAction
} from '../controllers/notificationController.js';

const router = express.Router();

router.post('/', createNotification);
router.post('/birthday-reminders/run', runBirthdayReminders);
router.get('/user/:userId', getUserNotifications);
router.put('/:id/read', markNotificationRead);
router.put('/user/:userId/read-all', markAllNotificationsRead);
router.put('/:id/action', updateNotificationAction);
router.delete('/:id', deleteNotification);

export default router;

