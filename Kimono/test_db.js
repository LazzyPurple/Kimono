const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const k = await prisma.creatorsCache.findUnique({ where: { site: 'kemono' } });
    if (k) {
      console.log('Kemono cache size:', k.data.length, 'bytes');
      console.log('Age:', (Date.now() - k.updatedAt) / 1000, 'seconds');
    } else {
      console.log('Kemono cache: NOT FOUND');
    }
    
    const c = await prisma.creatorsCache.findUnique({ where: { site: 'coomer' } });
    if (c) {
      console.log('Coomer cache size:', c.data.length, 'bytes');
      console.log('Age:', (Date.now() - c.updatedAt) / 1000, 'seconds');
    } else {
      console.log('Coomer cache: NOT FOUND');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
