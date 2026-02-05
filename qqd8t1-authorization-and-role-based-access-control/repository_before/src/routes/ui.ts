// src/routes/ui.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.get('/admin', authenticate, (req, res) => {
  // ❌ Relies on frontend to hide this page
  res.render('admin-dashboard');
});

router.get('/settings', authenticate, (req, res) => {
  res.render('settings');
});

export default router;
