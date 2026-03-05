import { searchCreators as kSearch } from './lib/api/kemono';
import { searchCreators as cSearch } from './lib/api/coomer';

async function test() {
  const query = '';
  console.log('Testing Kemono searchCreators("")');
  try {
    const kRes = await kSearch(query);
    console.log(`Kemono Length: ${kRes.length}`);
    
    console.log('Testing Coomer searchCreators("")');
    const cRes = await cSearch(query);
    console.log(`Coomer Length: ${cRes.length}`);
  } catch (err) {
    console.error('Error:', err);
  }
}

test().then(() => process.exit(0)).catch(() => process.exit(1));
