import { Resend } from 'resend';

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is required for email functionality');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'Zurpay <onboarding@resend.dev>';
const EMPLOYEE_APP_URL = process.env.NEXT_PUBLIC_EMPLOYEE_APP_URL || 'http://localhost:3002';

export async function sendInviteEmail(params: {
  to: string;
  orgName: string;
  inviteToken: string;
  inviterName?: string;
}) {
  const { to, orgName, inviteToken, inviterName } = params;
  const inviteUrl = `${EMPLOYEE_APP_URL}/invite/${inviteToken}`;

  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You've been invited to ${orgName} on Zurpay`,
    html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #18181b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #18181b; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="background-color: #27272a; border-radius: 16px; padding: 40px; max-width: 500px;">
                    <tr>
                        <td align="center" style="padding-bottom: 24px;">
                            <span style="font-size: 28px; font-weight: bold; color: #34d399;">Zurpay</span>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 16px;">
                            <h1 style="margin: 0; font-size: 24px; color: #ffffff;">You've been invited!</h1>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <p style="margin: 0; font-size: 16px; color: #a1a1aa; line-height: 1.6;">
                                ${inviterName ? `${inviterName} from ` : ''}<strong style="color: #ffffff;">${orgName}</strong> has invited you to receive payments through Zurpay.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <a href="${inviteUrl}" style="display: inline-block; background-color: #059669; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                                Accept Invitation
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td align="center">
                            <p style="margin: 0; font-size: 14px; color: #71717a;">
                                You'll sign in with Google to verify your identity.<br>
                                Your wallet address stays private.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `,
  });

  if (error) {
    console.error('Failed to send invite email:', error);
    throw new Error(`Failed to send invite email: ${error.message}`);
  }
}

export async function sendClaimEmail(params: {
  to: string;
  orgName: string;
  claimToken: string;
  payrunId: string;
  amount?: string;
  currency?: string;
}) {
  const { to, orgName, claimToken, payrunId, amount, currency } = params;
  const claimUrl = `${EMPLOYEE_APP_URL}/claims/${payrunId}?token=${claimToken}`;

  const amountDisplay =
    amount && currency
      ? `${(Number(amount) / 1_000_000).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} ${currency}`
      : 'your payment';

  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You have a payment to claim from ${orgName}`,
    html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #18181b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #18181b; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="background-color: #27272a; border-radius: 16px; padding: 40px; max-width: 500px;">
                    <tr>
                        <td align="center" style="padding-bottom: 24px;">
                            <span style="font-size: 28px; font-weight: bold; color: #34d399;">Zurpay</span>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 16px;">
                            <h1 style="margin: 0; font-size: 24px; color: #ffffff;">Payment Ready!</h1>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 24px;">
                            <p style="margin: 0; font-size: 16px; color: #a1a1aa; line-height: 1.6;">
                                <strong style="color: #ffffff;">${orgName}</strong> has sent you ${amountDisplay}.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding-bottom: 32px;">
                            <a href="${claimUrl}" style="display: inline-block; background-color: #059669; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
                                Claim Payment
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td align="center">
                            <p style="margin: 0; font-size: 14px; color: #71717a;">
                                Connect any wallet you want to receive the funds.<br>
                                Your employer won't see which wallet you use.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `,
  });

  if (error) {
    console.error('Failed to send claim email:', error);
    throw new Error(`Failed to send claim email: ${error.message}`);
  }
}
