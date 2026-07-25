import { TelegramQueueService } from '../telegram.queue.service';

describe('TelegramQueueService', () => {
  it('does nothing when not configured', () => {
    const queue = new TelegramQueueService();
    expect(queue.isReady).toBe(false);
    queue.enqueueBroadcast('hello');
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
    queue.configure({
      sendFn,
      adminChatIds: ['111'],
    });

    queue.enqueueBroadcast('<b>hi</b>');

    // Allow drain + retries (backoff 400 + 800)
    await new Promise((r) => setTimeout(r, 2500));

    expect(sendFn).toHaveBeenCalled();
    expect(calls).toBe(3);
  });

  it('broadcasts to every admin chat id', async () => {
    const queue = new TelegramQueueService();
    const sendFn = jest.fn(async () => undefined);
    queue.configure({
      sendFn,
      adminChatIds: ['1', '2'],
    });

    queue.enqueueBroadcast('msg');
    await new Promise((r) => setTimeout(r, 200));

    expect(sendFn).toHaveBeenCalledTimes(2);
    expect(sendFn).toHaveBeenCalledWith('1', 'msg');
    expect(sendFn).toHaveBeenCalledWith('2', 'msg');
  });
});
