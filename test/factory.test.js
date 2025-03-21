const Factory = require('../factory');

describe('Factory', () => {
    let factory;

    beforeEach(() => {
        factory = new Factory(2, jest.fn(), jest.fn());
    });

    test('should add tasks to the queue', () => {
        const task1 = factory.addTask(async () => 'Task 1', 'Task 1');
        const task2 = factory.addTask(async () => 'Task 2', 'Task 2');
        expect(factory.queue.length).toBe(2);
    });

    test('should execute tasks up to maxConcurrentTasks', async () => {
        const mockFn = jest.fn().mockResolvedValue('Done');
        factory.addTask(mockFn, 'Task 1');
        factory.addTask(mockFn, 'Task 2');
        factory.addTask(mockFn, 'Task 3');

        await factory.run();
        expect(mockFn).toHaveBeenCalledTimes(3);
    });

    test('should retry failed tasks', async () => {
        const failingTask = jest.fn()
            .mockRejectedValueOnce(new Error('Fail 1'))
            .mockRejectedValueOnce(new Error('Fail 2'))
            .mockResolvedValue('Success');

        factory.addTask(failingTask, 'Retry Task', { retries: 2 });
        await factory.run();

        expect(failingTask).toHaveBeenCalledTimes(1);
    });

    test('should cancel a queued task', () => {
        const taskId = factory.addTask(async () => 'Task', 'Cancellable Task');
        const result = factory.cancelTask(taskId);
        expect(result).toBe(true);
        expect(factory.queue.length).toBe(0);
    });

    test('should return correct status', () => {
        factory.addTask(async () => 'Task 1', 'Task 1');
        factory.addTask(async () => 'Task 2', 'Task 2');

        const status = factory.getStatus();
        expect(status.queued).toBe(2);
        expect(status.running).toBe(0);
    });
});