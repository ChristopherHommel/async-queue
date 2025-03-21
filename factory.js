/**
 * Factory for managing concurrent task processing
 *
 * <pre>
 * examples:
 *
 * >>>>>
 * 1.
 * function handleTaskCompletion({ loading, result, name }) {
 *     console.log(loading, result, name);
 *     setState(() => update state)
 * }
 *
 * useEffect(() => {
 *   const factory = new Factory(3,
 *                 handleTaskCompletion,
 *                 error => console.log(`Error encountered : ${error}`));
 *
 *   factory.addTask(() => mockPromise(), `promise`);
 *
 *   factory.run();
 * })
 * <<<<<
 *
 * >>>>>
 * 2.
 * const taskResults = [];
 *
 * const onTaskCompletion = ({ loading, result, name }) => {
 *     if (!loading) {
 *         taskResults.push({ name, result });
 *     }
 * };
 *
 * const factory = new Factory(3, onTaskCompletion);
 *
 * const taskId1 = factory.addTask(async () => 'Task 1 completed', 'Task 1');
 * const taskId2 = factory.addTask(async () => 'Task 2 completed', 'Task 2');
 *
 * await factory.run();
 *
 * console.log(taskResults);
 * <<<<<
 * </pre>
 *
 * @version 1.0.0
 */
module.exports = class Factory {
    constructor(maxConcurrentTasks, onTaskCompletion, onError) {
        this.queue = [];
        this.promisesRunning = 0;
        this.maxConcurrentTasks = this.checkMaxConcurrentTasks(maxConcurrentTasks);
        this.onTaskCompletion = onTaskCompletion;
        this.onError = onError || (() => {});
        this.retries = 10;
        this.retryDelay = 1000;
        this.activeTasksMap = new Map();
        this._taskIdCounter = 0;
    }

    /**
     * Validates and normalizes maxConcurrentTasks
     *
     * @version 1.0.0
     * @param {number} maxConcurrentTasks
     * @return {number}
     */
    checkMaxConcurrentTasks(maxConcurrentTasks) {
        return Math.max(1, maxConcurrentTasks || 3);
    }

    /**
     * Adds a task to the processing queue
     *
     * @version 1.0.0
     * @param {Function} promiseFn - Promise-returning function to execute
     * @param {string} name - Task identifier
     * @param {Object} options - Optional configuration for this task
     * @returns {string} taskId - Unique identifier for the task
     */
    addTask(promiseFn, name, options = {}) {
        const taskId = `task_${++this._taskIdCounter}`;

        const task = {
            id: taskId,
            promiseFn,
            name,
            priority: options.priority || 0,
            retries: options.retries ?? this.retries,
            retryDelay: options.retryDelay ?? this.retryDelay
        };

        this.onTaskCompletion({ loading: true, result: null, name });

        if (options.priority > 0) {
            const insertIndex = this.queue.findIndex(t => t.priority <= task.priority);
            if (insertIndex === -1) {
                this.queue.push(task);
            } else {
                this.queue.splice(insertIndex, 0, task);
            }
        } else {
            this.queue.push(task);
        }

        return taskId;
    }

    /**
     * Cancels a task if it hasn't started processing
     *
     * @version 1.0.0
     * @param {string} taskId - ID of the task to cancel
     * @returns {boolean} - Whether the task was successfully cancelled
     */
    cancelTask(taskId) {
        const index = this.queue.findIndex(task => task.id === taskId);
        if (index !== -1) {
            const task = this.queue[index];

            this.queue.splice(index, 1);

            this.onTaskCompletion({
                loading: false,
                result: { cancelled: true },
                name: task.name
            });

            return true;
        }

        return false;
    }

    /**
     * Executes a single task with retry logic
     *
     * @version 1.0.0
     */
    async executePromise(task, retriesLeft) {
        const { promiseFn, name, retryDelay } = task;

        try {
            this.activeTasksMap.set(task.id, task);

            const result = await promiseFn();

            this.onTaskCompletion({ loading: false, result, name });

            return result;
        } catch (error) {
            if (retriesLeft > 0) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));

                return this.executePromise(task, retriesLeft - 1);
            } else {
                this.onError(error);
                this.onTaskCompletion({ loading: false, result: error, name });
            }
        } finally {
            this.activeTasksMap.delete(task.id);
            this.promisesRunning--;
            this.processQueue();
        }
    }

    /**
     * Processes queued tasks while respecting concurrency limits
     *
     * @version 1.0.0
     */
    processQueue() {
        while (this.promisesRunning < this.maxConcurrentTasks && this.queue.length > 0) {
            const task = this.queue.shift();
            this.promisesRunning++;
            this.executePromise(task, task.retries)
                .catch(error => {
                    console.error('Task execution error:', error);
                });
        }
    }

    /**
     * Starts processing the task queue
     *
     * @version 1.0.0
     */
    async run() {
        this.processQueue();
    }

    /**
     * Gets the current status of all tasks
     *
     * @version 1.0.0
     * @returns {Object} Status object with counts and details
     */
    getStatus() {
        return {
            queued: this.queue.length,
            running: this.activeTasksMap.size,
            maxConcurrent: this.maxConcurrentTasks,
            activeTasks: Array.from(this.activeTasksMap.values()).map(task => ({
                id: task.id,
                name: task.name
            }))
        };
    }

    /**
     * Updates the configuration of the factory
     *
     * @version 1.0.0
     * @param {Object} config - New configuration options
     */
    configure(config = {}) {
        if (config.maxConcurrentTasks !== undefined) {
            this.maxConcurrentTasks = this.checkMaxConcurrentTasks(config.maxConcurrentTasks);
        }

        if (config.retries !== undefined) {
            this.retries = config.retries;
        }

        if (config.retryDelay !== undefined) {
            this.retryDelay = config.retryDelay;
        }
    }
}