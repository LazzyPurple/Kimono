const http = require('http');

const data = JSON.stringify({ site: "kemono", service: "fanbox", postId: "7143528" });

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/likes/posts',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let r = '';
  res.on('data', d => r += d);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', r));
});

req.on('error', console.error);
req.write(data);
req.end();
