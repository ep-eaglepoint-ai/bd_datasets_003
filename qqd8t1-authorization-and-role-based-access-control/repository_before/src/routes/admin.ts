// src/routes/admin.ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/create-user', authenticate, async (req, res) => {
  // ❌ ANY authenticated user can create users
  const { email } = req.body;

  res.json({
    message: `User ${email} created`
  });
});

router.delete('/delete-user/:id', authenticate, async (req, res) => {
  // ❌ No role enforcement
  res.json({
    message: `User ${req.params.id} deleted`
  });
});

export default router;
