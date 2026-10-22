import express from 'express';
import {
  createTask,
  getAllTasks,
  updateTask,
  deleteTask,
  getSchedulesReport,
  sendSchedulesReport,
} from '../controllers/taskController.js';

const router = express.Router();

// Report endpoints (must be before /:id)
router.get('/report', getSchedulesReport);
router.post('/send-report', sendSchedulesReport);

router.post('/', createTask);
router.get('/', getAllTasks);
router.put('/:id', updateTask);
router.put('/', updateTask);
router.delete('/:id', deleteTask);

export default router;
