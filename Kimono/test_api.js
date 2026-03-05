const http = require('http');
const fs = require('fs');

Promise.all([
  new Promise(res => http.get('http://localhost:3000/api/likes/creators?site=kemono', (r) => {
    let data = '';
    r.on('data', c => data += c);
    r.on('end', () => res({ type: 'creators', data: JSON.parse(data).slice(0,2) }));
  })),
  new Promise(res => http.get('http://localhost:3000/api/likes/posts?site=kemono', (r) => {
    let data = '';
    r.on('data', c => data += c);
    r.on('end', () => res({ type: 'posts', data: JSON.parse(data).slice(0,2) }));
  }))
]).then(results => {
  fs.writeFileSync('test_likes.json', JSON.stringify(results, null, 2), 'utf8');
});
