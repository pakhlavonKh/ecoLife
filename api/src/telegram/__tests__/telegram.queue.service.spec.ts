import {
  TelegramQueueService,
  isTelegramForbiddenError,
} from '../telegram.queue.service';

describe('TelegramQueueService', () => {
  it('does nothing when not configured', () => {
    const queue = new TelegramQueueService();
    expect(queue.isReady).toBe(false);
    queue.enqueueBroadcast('hello', ['1']);
  });

  it('retries failed sends then succeeds without throwing to caller', async () => {
    const queue = new TelegramQueueService();
    let calls = 0;
    const sendFn = jest.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('network');
      }
    });
    queue.configure({ sendFn });

    queue.enqueueTo('111', '<b>hi</b>');
    await queue.settle(5000);

    expect(sendFn).toHaveBeenCalled();
    expect(calls).toBe(3);
    await queue.onModuleDestroy();
  });

  it('delivers to every chat independently', async () => {
    const queue = new TelegramQueueService();
    const sendFn = jest.fn(async () => undefined);
    queue.configure({ sendFn });

    queue.enqueueMany([
      { chatId: '1', text: 'msg-a' },
      { chatId: '2', text: 'msg-b' },
    ]);
    await queue.settle(1000);

    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(sendFn).toHaveBeenCalledWith('1', 'msg-a');
    expect(sendFn).toHaveBeenCalledWith('2', 'msg-b');
    await queue.onModuleDestroy();
  });

  it('failure for one recipient does not block others', async () => {
    const queue = new TelegramQueueService();
    const sent: string[] = [];
    const sendFn = jest.fn(async (chatId: string) => {
      if (chatId === 'bad') {
        throw new Error('network');
      }
      sent.push(chatId);
    });
    queue.configure({ sendFn });

    queue.enqueueMany([
      { chatId: 'bad', text: 'x' },
      { chatId: 'good', text: 'y' },
    ]);
    await new Promise((r) => setTimeout(r, 200));
    expect(sent).toContain('good');

    await queue.onModuleDestroy();
  });

  it('on 403 calls onForbidden and does not retry', async () => {
    const queue = new TelegramQueueService();
    const onForbidden = jest.fn(async () => undefined);
    const err = Object.assign(new Error('Forbidden: bot was blocked by the user'), {
      error_code: 403,
    });
    const sendFn = jest.fn(async () => {
      throw err;
    });
    queue.configure({ sendFn, onForbidden });

    queue.enqueueTo('999', 'hi');
    await queue.settle(1000);

    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(onForbidden).toHaveBeenCalledWith('999');
    await queue.onModuleDestroy();
  });
});

describe('isTelegramForbiddenError', () => {
  it('detects error_code 403', () => {
    expect(isTelegramForbiddenError({ error_code: 403 })).toBe(true);
    expect(isTelegramForbiddenError({ error_code: 400 })).toBe(false);
  });

  it('detects blocked-by-user message', () => {
    expect(
      isTelegramForbiddenError(
        new Error('Forbidden: bot was blocked by the user'),
      ),
    ).toBe(true);
  });
});
