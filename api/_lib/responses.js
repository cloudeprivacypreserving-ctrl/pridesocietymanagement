function ok(res, data, status = 200) {
  return res.status(status).json({ data });
}

function fail(res, status, message, field) {
  const error = field ? { message, field } : { message };
  return res.status(status).json({ error });
}

module.exports = { ok, fail };
