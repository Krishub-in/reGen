import express from 'express';
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  createProjectTask
} from '../controllers/projectController.js';

const router = express.Router();

router.get('/', getProjects);
router.post('/', createProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);
router.post('/:id/tasks', createProjectTask);

export default router;
