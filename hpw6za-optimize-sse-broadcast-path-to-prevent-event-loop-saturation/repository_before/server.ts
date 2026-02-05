import http from "http";

const clients: http.ServerResponse[] = [];

http.createServer((req, res) => {
  if (req.url === "/subscribe") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    clients.push(res);
    return;
  }

  if (req.url === "/broadcast") {
    for (const client of clients) {
      client.write("data: hello\n\n");
    }
    res.end("ok");
    return;
  }

  res.end("noop");
}).listen(3000);
