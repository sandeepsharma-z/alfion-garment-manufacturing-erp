const catchAsync = require('./catch-async');

/** Mounts GET /, GET /:id, POST /, PATCH /:id, POST /:id/toggle for a crud() service. */
module.exports = (router, svc) => {
  router.get('/', catchAsync(async (req, res) => res.json(await svc.list(req))));
  router.get('/:id', catchAsync(async (req, res) => res.json(await svc.get(req, req.params.id))));
  router.post('/', catchAsync(async (req, res) => res.status(201).json(await svc.create(req, req.body))));
  router.patch('/:id', catchAsync(async (req, res) => res.json(await svc.update(req, req.params.id, req.body))));
  router.post('/:id/toggle', catchAsync(async (req, res) => res.json(await svc.toggle(req, req.params.id))));
  return router;
};
