// Server-Sent Events — broadcast en temps réel vers tous les clients connectés
const clients = new Set();

function addClient(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('\n');
  clients.add(res);

  res.on('close', () => {
    clients.delete(res);
  });
}

function broadcast(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.write(message);
  }
}

module.exports = { addClient, broadcast };
