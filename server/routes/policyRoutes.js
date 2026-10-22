import express from 'express';
import {
  getEmployeePolicyStatus,
  acceptPolicy,
  declinePolicy,
  getCompanyPolicyReviews,
  allowEmployeeWorkForward
} from '../controllers/policyController.js';

const router = express.Router();

router.get('/employee-status', getEmployeePolicyStatus);
router.post('/:policyId/accept', acceptPolicy);
router.post('/:policyId/decline', declinePolicy);
router.get('/reviews', getCompanyPolicyReviews);
router.post('/acknowledgments/:id/allow', allowEmployeeWorkForward);

export default router;
