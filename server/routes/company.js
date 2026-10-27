import express from 'express';
import { 
  createCompany, 
  superAdminCreateCompany, 
  getAllCompanies, 
  updateCompany, 
  superAdminUpdateCompany, 
  deleteCompany, 
  toggleCompanyStatus, 
  getTotpQr, 
  listBackups, 
  downloadBackup, 
  deleteBackup, 
  restoreCompany, 
  replaceCompany,
  updateOfficeLocation,
  getOfficeLocation
} from '../controllers/companyController.js';

const router = express.Router();

router.post('/', createCompany);
router.post('/admin', superAdminCreateCompany);
router.get('/', getAllCompanies);
router.get('/:id/office-location', getOfficeLocation);
router.put('/:id/office-location', updateOfficeLocation);
router.get('/totp-setup', getTotpQr);
router.get('/backups', listBackups);
router.get('/backups/:filename/download', downloadBackup);
router.delete('/backups/:filename', deleteBackup);
router.post('/restore', restoreCompany);
router.put('/:id', updateCompany);
router.put('/admin/:id', superAdminUpdateCompany);
router.post('/admin/:id/replace', replaceCompany);
router.post('/:id/replace', replaceCompany);
router.post('/:id/toggle-status', toggleCompanyStatus);
router.delete('/:id', deleteCompany);

export default router;
