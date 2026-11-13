const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const authService = require('../services/auth.service');
const { User } = require('../models');
const config = require('../config');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.env === 'test' ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later' },
});

const email = z.string().trim().toLowerCase().email().max(120);

const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
  email,
  password: z.string().min(8).max(72), // bcrypt only uses the first 72 bytes
});
const loginSchema = z.strictObject({ email, password: z.string().min(1).max(72) });

router.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  res.status(201).json(await authService.register(req.body));
});

router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  res.json(await authService.login(req.body));
});

router.get('/me', authenticate, async (req, res) => {
  const user = await User.findByPk(req.user.id);
  res.json(authService.toPublic(user));
});

module.exports = router;
