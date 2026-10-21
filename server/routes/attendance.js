import express from 'express';
import {
  recordAttendance,
  getAllAttendance,
  getUserAttendance,
  updateAttendance,
  getAttendanceReport,
  sendAttendanceReport,
} from '../controllers/attendanceController.js';

const router = express.Router();

// Report endpoints
router.get('/report', getAttendanceReport);
router.post('/send-report', sendAttendanceReport);

// Core attendance endpoints
router.post('/', recordAttendance);
router.get('/', getAllAttendance);
router.get('/user/:userId', getUserAttendance);
router.put('/:id', updateAttendance);
router.put('/', updateAttendance);

export default router;
