export async function handleRequest(req, res) {
  const start = Date.now();

  const result = await processBusinessLogic(req.body);

  console.log("request handled", {
    path: req.url,
    duration: Date.now() - start,
    user: req.user?.id
  });

  res.json(result);
}
