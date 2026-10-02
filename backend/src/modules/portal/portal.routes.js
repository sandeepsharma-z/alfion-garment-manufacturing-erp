const express = require('express');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const catchAsync = require('../../common/utils/catch-async');
const ApiError = require('../../common/utils/api-error');
const { authenticate, requireModule } = require('../../common/middleware/auth');
const svc = require('./portal.service');
const File = require('../files/file.model');

/* ---------- internal (ERP users) ---------- */
const internal = express.Router();
internal.use(authenticate);
internal.get('/', catchAsync(async (req, res) => res.json(await svc.list(req, req.query))));
internal.post('/', requireModule('orders'), catchAsync(async (req, res) => {
  const b = req.body || {};
  if (b.kind === 'buyer' && !req.user.flags?.includes('buyer.confidential') && req.user.role !== 'Admin') throw ApiError.forbidden('Buyer-wise master links need the buyer.confidential flag');
  res.status(201).json(await svc.issue(req, b));
}));
internal.post('/:id/revoke', requireModule('orders'), catchAsync(async (req, res) => res.json(await svc.revoke(req, req.params.id))));

/* ---------- public (no ERP login) — rate-limited, field-whitelisted (FR-22.2/4) ---------- */
const publicRouter = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { code: 'RATE_LIMITED', message: 'Too many requests — try again in a few minutes' } });
publicRouter.use(limiter);
publicRouter.get('/track/:token', catchAsync(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await svc.view(req.params.token, req.get('x-pin') || req.query.pin, { ip: req.ip, ua: req.get('user-agent') }));
}));
publicRouter.get('/track/:token/image', catchAsync(async (req, res) => {
  const fileId = await svc.imageFor(req.params.token, req.get('x-pin') || req.query.pin, req.query.order, req.query.i);
  if (!fileId) return res.status(404).end();
  const doc = await File.findById(fileId);
  if (!doc) return res.status(404).end();
  const abs = path.join(__dirname, '../../../uploads', doc.storageKey);
  if (!fs.existsSync(abs)) return res.status(404).end();
  res.set('Content-Type', doc.mime); res.set('Cache-Control', 'private, max-age=300'); res.set('Cross-Origin-Resource-Policy', 'cross-origin');   // <img> from the frontend origin res.set('Cross-Origin-Resource-Policy', 'cross-origin');   // <img> from the frontend origin res.set('Cross-Origin-Resource-Policy', 'cross-origin');   // <img> from the frontend origin
  return fs.createReadStream(abs).pipe(res);
}));

module.exports = { internal, publicRouter };
