import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';

const MARKET = {
  id: 'mkt-1',
  symbol: 'BTCUSDT',
  status: 'ACTIVE',
  baseAssetId: 'btc-id',
  quoteAssetId: 'usdt-id',
  baseAsset: { symbol: 'BTC' },
  quoteAsset: { symbol: 'USDT' },
  tickSize: '0.10',
  quantityStep: '0.00001',
  minimumQuantity: '0.00001',
  minimumNotional: '5',
};

function buildService(overrides: { market?: any; order?: any } = {}) {
  const txOrderCreate = jest.fn().mockImplementation(({ data }) =>
    Promise.resolve({ id: 'order-1', ...data }),
  );
  const tx = {
    order: {
      create: txOrderCreate,
      findUnique: jest.fn().mockResolvedValue(overrides.order),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...overrides.order, ...data }),
      ),
    },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation((fn: any) => fn(tx)),
  } as any;
  const markets = {
    findBySymbolOrThrow: jest.fn().mockResolvedValue(overrides.market ?? MARKET),
  } as any;
  const balances = {
    lockFunds: jest.fn().mockResolvedValue({}),
    releaseHold: jest.fn().mockResolvedValue({}),
  } as any;

  return { service: new OrdersService(prisma, markets, balances), tx, balances };
}

const validDto = {
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'LIMIT',
  price: '60000',
  quantity: '0.01',
} as any;

describe('OrdersService.createOrder', () => {
  it('rejects orders on non-active markets', async () => {
    const { service } = buildService({ market: { ...MARKET, status: 'HALTED' } });
    await expect(service.createOrder('u1', validDto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects MARKET orders until the matching engine exists', async () => {
    const { service } = buildService();
    await expect(
      service.createOrder('u1', { ...validDto, type: 'MARKET' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a price not aligned to tick size', async () => {
    const { service } = buildService();
    await expect(
      service.createOrder('u1', { ...validDto, price: '60000.15' }),
    ).rejects.toThrow(/tick size/);
  });

  it('rejects a quantity not aligned to quantity step', async () => {
    const { service } = buildService();
    await expect(
      service.createOrder('u1', { ...validDto, quantity: '0.000015' }),
    ).rejects.toThrow(/quantity step/);
  });

  it('rejects orders below the minimum notional', async () => {
    const { service } = buildService();
    // 0.00001 BTC × 60000 = 0.6 USDT < 5 USDT
    await expect(
      service.createOrder('u1', { ...validDto, quantity: '0.00001' }),
    ).rejects.toThrow(/notional/);
  });

  it('locks the notional in quote currency for a BUY', async () => {
    const { service, balances } = buildService();
    await service.createOrder('u1', validDto);
    const lock = balances.lockFunds.mock.calls[0][1];
    expect(lock.assetSymbol).toBe('USDT');
    expect(lock.amount.toString()).toBe('600'); // 0.01 × 60000
  });

  it('locks the base quantity for a SELL', async () => {
    const { service, balances } = buildService();
    await service.createOrder('u1', { ...validDto, side: 'SELL' });
    const lock = balances.lockFunds.mock.calls[0][1];
    expect(lock.assetSymbol).toBe('BTC');
    expect(lock.amount.toString()).toBe('0.01');
  });
});

describe('OrdersService.cancelOrder', () => {
  it('404s when the order belongs to another user', async () => {
    const { service } = buildService({
      order: { id: 'order-1', userId: 'someone-else', status: 'OPEN' },
    });
    await expect(service.cancelOrder('u1', 'order-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s when the order is already cancelled', async () => {
    const { service } = buildService({
      order: { id: 'order-1', userId: 'u1', status: 'CANCELLED' },
    });
    await expect(service.cancelOrder('u1', 'order-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels an open order and releases its hold', async () => {
    const { service, balances } = buildService({
      order: { id: 'order-1', userId: 'u1', status: 'OPEN' },
    });
    const result = await service.cancelOrder('u1', 'order-1');
    expect(result.status).toBe('CANCELLED');
    expect(balances.releaseHold).toHaveBeenCalledWith(expect.anything(), 'order-1');
  });
});
