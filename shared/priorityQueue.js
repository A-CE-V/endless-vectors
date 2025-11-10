const queue = [];
const activeUsers = new Map();
let isProcessing = false;

const priorities = {
  deluxe: 4,
  premium: 3,
  standard: 2,
  free: 1,
};

export function priorityMiddleware(req, res, next) {
  const plan = (req.user?.selectedPlan || "free").toLowerCase();
  const priority = priorities[plan] || 1;

  const request = { req, res, next, priority };
  queue.push(request);

  queue.sort((a, b) => b.priority - a.priority);

  processQueue();
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (queue.length > 0) {
    const { req, res, next, priority } = queue[0];
    const userId = req.user?.id;
    const plan = (req.user?.selectedPlan || "free").toLowerCase();

    const maxConcurrent = plan === "deluxe" ? 3 : 1;
    const activeCount = activeUsers.get(userId) || 0;

    if (activeCount >= maxConcurrent) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }

    queue.shift();
    activeUsers.set(userId, activeCount + 1);

    (async () => {
      try {
        next();
      } catch (err) {
        console.error("Error processing request:", err);
        res.status(500).json({ error: "Internal queue error" });
      } finally {
        activeUsers.set(userId, (activeUsers.get(userId) || 1) - 1);
        if (activeUsers.get(userId) <= 0) {
          activeUsers.delete(userId);
        }
        processQueue();
      }
    })();
  }

  isProcessing = false;
}
