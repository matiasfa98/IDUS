export function notFoundHandler(req, res) {
  res.status(404).json({ error: "NOT_FOUND", path: req.path });
}

export function errorHandler(err, _req, res, _next) {
  const status = err.status ?? 500;

  if (status >= 500) {
    console.error("[error]", err);
  }

  res.status(status).json({
    error: err.code ?? "INTERNAL_ERROR",
    message: err.message ?? "Something went wrong",
  });
}