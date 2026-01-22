interface NotificationPayload {
  event: string;
  orgId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const NOTIFICATION_WEBHOOK_URL = process.env.NOTIFICATION_WEBHOOK_URL;

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const promises: Promise<void>[] = [];

  if (SLACK_WEBHOOK_URL) {
    promises.push(sendSlackNotification(payload));
  }

  if (NOTIFICATION_WEBHOOK_URL) {
    promises.push(sendWebhookNotification(payload));
  }

  await Promise.allSettled(promises);
}

async function sendSlackNotification(payload: NotificationPayload): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;

  const emoji = getEventEmoji(payload.event);
  const message = formatSlackMessage(payload);

  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} ${message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *${payload.event}*\n${message}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Org: \`${payload.orgId.slice(0, 8)}...\` | ${payload.timestamp}`,
              },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    console.error('Slack notification failed:', error);
  }
}

async function sendWebhookNotification(payload: NotificationPayload): Promise<void> {
  if (!NOTIFICATION_WEBHOOK_URL) return;

  try {
    await fetch(NOTIFICATION_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Webhook notification failed:', error);
  }
}

function getEventEmoji(event: string): string {
  const emojis: Record<string, string> = {
    PAYRUN_CREATED: '📋',
    PAYRUN_VALIDATED: '✅',
    PAYRUN_EXECUTING: '⏳',
    PAYRUN_COMPLETED: '🎉',
    PAYRUN_FAILED: '❌',
    PAYLINK_CREATED: '🔗',
    PAYLINK_CLAIMED: '💰',
    WORKER_ADDED: '👤',
  };
  return emojis[event] || '📢';
}

function formatSlackMessage(payload: NotificationPayload): string {
  const { event, data } = payload;

  switch (event) {
    case 'PAYRUN_CREATED':
      return `Payrun created with ${data.totalPayslips} payslips (${data.totalAmount} USDC)`;
    case 'PAYRUN_VALIDATED':
      return `Payrun validated. Merkle root: \`${(data.merkleRootHex as string)?.slice(0, 16)}...\``;
    case 'PAYRUN_COMPLETED':
      return `Payrun completed! ${data.paidCount} paid, ${data.failedCount} failed`;
    case 'PAYRUN_FAILED':
      return `Payrun execution failed: ${data.error}`;
    case 'PAYLINK_CREATED':
      return `Paylink created for ${data.amount} ${data.currency}`;
    case 'PAYLINK_CLAIMED':
      return `Paylink claimed by \`${(data.claimedBy as string)?.slice(0, 8)}...\``;
    case 'WORKER_ADDED':
      return `New worker added: ${data.displayName || (data.wallet as string)?.slice(0, 8)}`;
    default:
      return JSON.stringify(data);
  }
}

export const NotificationEvents = {
  PAYRUN_CREATED: 'PAYRUN_CREATED',
  PAYRUN_VALIDATED: 'PAYRUN_VALIDATED',
  PAYRUN_EXECUTING: 'PAYRUN_EXECUTING',
  PAYRUN_COMPLETED: 'PAYRUN_COMPLETED',
  PAYRUN_FAILED: 'PAYRUN_FAILED',
  PAYLINK_CREATED: 'PAYLINK_CREATED',
  PAYLINK_CLAIMED: 'PAYLINK_CLAIMED',
  WORKER_ADDED: 'WORKER_ADDED',
} as const;

export function notify(event: string, orgId: string, data: Record<string, unknown>): void {
  sendNotification({
    event,
    orgId,
    data,
    timestamp: new Date().toISOString(),
  }).catch((err) => {
    console.error('Notification error:', err);
  });
}
