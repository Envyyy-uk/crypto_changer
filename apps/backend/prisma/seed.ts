import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const assets = [
    { symbol: 'BTC', name: 'Bitcoin', decimals: 8 },
    { symbol: 'ETH', name: 'Ethereum', decimals: 8 },
    { symbol: 'SOL', name: 'Solana', decimals: 6 },
    { symbol: 'USDT', name: 'Tether USD', decimals: 2 },
  ];

  for (const asset of assets) {
    await prisma.asset.upsert({
      where: { symbol: asset.symbol },
      update: {},
      create: asset,
    });
  }

  const bySymbol = Object.fromEntries(
    (await prisma.asset.findMany()).map((a) => [a.symbol, a.id]),
  );

  const markets = [
    {
      symbol: 'BTCUSDT',
      base: 'BTC',
      tickSize: '0.10',
      quantityStep: '0.00001',
      minimumQuantity: '0.00001',
      minimumNotional: '5',
    },
    {
      symbol: 'ETHUSDT',
      base: 'ETH',
      tickSize: '0.01',
      quantityStep: '0.0001',
      minimumQuantity: '0.0001',
      minimumNotional: '5',
    },
    {
      symbol: 'SOLUSDT',
      base: 'SOL',
      tickSize: '0.001',
      quantityStep: '0.01',
      minimumQuantity: '0.01',
      minimumNotional: '5',
    },
  ];

  for (const m of markets) {
    await prisma.market.upsert({
      where: { symbol: m.symbol },
      update: {},
      create: {
        symbol: m.symbol,
        baseAssetId: bySymbol[m.base],
        quoteAssetId: bySymbol['USDT'],
        tickSize: m.tickSize,
        quantityStep: m.quantityStep,
        minimumQuantity: m.minimumQuantity,
        minimumNotional: m.minimumNotional,
        makerFee: '0.001',
        takerFee: '0.001',
        status: 'ACTIVE',
      },
    });
  }

  console.log('Seed complete: 4 assets, 3 markets.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
