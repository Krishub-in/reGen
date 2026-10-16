import express from 'express';
import { createUser, getAllUsers, getCurrentUser, getUser, updateUser, deleteUser, toggleUserStatus } from '../controllers/userController.js';

const router = express.Router();

router.post('/', createUser);
router.get('/', getAllUsers);
router.get('/me', getCurrentUser);
router.get('/:id', getUser);
router.put('/:id/status', toggleUserStatus);
router.put('/:id', updateUser); // can handle update via ID in URL
router.put('/', updateUser); // can handle update via body ID
router.delete('/:id', deleteUser);

export default router;
