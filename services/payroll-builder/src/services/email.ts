import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.EMAIL_FROM || 'Zurpay <noreply@zurpay.io>';
const APP_URL = process.env.EMPLOYEE_APP_URL || 'http://localhost:3002';

export interface SendClaimLinkParams {
  to: string;
  recipientName?: string;
  orgName: string;
  amount: string;
  currency: string;
  claimToken: string;
  paylinkId: string;
  expiresAt: Date;
  memo?: string;
}

export interface SendPayrunNotificationParams {
  to: string;
  recipientName?: string;
  orgName: string;
  payrunId: string;
  totalAmount: string;
  payslipCount: number;
}

export interface SendPaymentRequestNotificationParams {
  to: string;
  recipientName?: string;
  orgName: string;
  amount: string;
  currency: string;
  memo?: string;
  requestId: string;
  requesterWallet: string;
}

export interface SendPaymentRequestStatusParams {
  to: string;
  recipientName?: string;
  orgName: string;
  amount: string;
  currency: string;
  memo?: string;
  status: 'approved' | 'rejected';
  txSignature?: string;
}

export async function sendClaimLinkEmail(params: SendClaimLinkParams): Promise<boolean> {
  if (!resend) {
    console.log('[Email] Resend not configured, skipping email to:', params.to);
    console.log(
      '[Email] Claim URL would be:',
      `${APP_URL}/paylinks/${params.paylinkId}?token=${params.claimToken}`
    );
    return false;
  }

  const claimUrl = `${APP_URL}/paylinks/${params.paylinkId}?token=${params.claimToken}`;
  const formattedAmount = formatAmount(params.amount, params.currency);
  const formattedExpiry = params.expiresAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `You have a payment of ${formattedAmount} from ${params.orgName}`,
      html: generateClaimEmailHtml({
        recipientName: params.recipientName,
        orgName: params.orgName,
        amount: formattedAmount,
        claimUrl,
        expiresAt: formattedExpiry,
        memo: params.memo,
      }),
    });

    if (error) {
      console.error('[Email] Failed to send claim link:', error);
      return false;
    }

    console.log('[Email] Claim link sent to:', params.to);
    return true;
  } catch (err) {
    console.error('[Email] Error sending claim link:', err);
    return false;
  }
}

export async function sendPayrunReadyEmail(params: SendPayrunNotificationParams): Promise<boolean> {
  if (!resend) {
    console.log('[Email] Resend not configured, skipping payrun notification to:', params.to);
    return false;
  }

  const formattedAmount = formatAmount(params.totalAmount, 'USDC');

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `Payrun ready: ${params.payslipCount} payments totaling ${formattedAmount}`,
      html: generatePayrunEmailHtml({
        recipientName: params.recipientName,
        orgName: params.orgName,
        totalAmount: formattedAmount,
        payslipCount: params.payslipCount,
      }),
    });

    if (error) {
      console.error('[Email] Failed to send payrun notification:', error);
      return false;
    }

    console.log('[Email] Payrun notification sent to:', params.to);
    return true;
  } catch (err) {
    console.error('[Email] Error sending payrun notification:', err);
    return false;
  }
}

function formatAmount(amount: string, currency: string): string {
  const num = BigInt(amount);
  const usd = Number(num) / 1_000_000;
  return `${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function generateClaimEmailHtml(params: {
  recipientName?: string;
  orgName: string;
  amount: string;
  claimUrl: string;
  expiresAt: string;
  memo?: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #12121a; border-radius: 16px; border: 1px solid #27272a;">
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-block; width: 48px; height: 48px; background-color: #10b981; border-radius: 12px; line-height: 48px; font-size: 24px; font-weight: bold; color: black;">Z</div>
              </div>
              
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 8px 0;">
                You have a payment!
              </h1>
              
              <p style="color: #9ca3af; font-size: 14px; text-align: center; margin: 0 0 32px 0;">
                ${params.recipientName ? `Hi ${params.recipientName}, ` : ''}${params.orgName} has sent you a payment.
              </p>
              
              <div style="background-color: #1a1a25; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Amount</p>
                <p style="color: #10b981; font-size: 36px; font-weight: 700; margin: 0;">${params.amount}</p>
                ${params.memo ? `<p style="color: #9ca3af; font-size: 14px; margin: 16px 0 0 0;">${params.memo}</p>` : ''}
              </div>
              
              <a href="${params.claimUrl}" style="display: block; background-color: #10b981; color: #000000; text-decoration: none; padding: 16px 24px; border-radius: 8px; font-weight: 600; text-align: center; margin-bottom: 24px;">
                Claim Payment
              </a>
              
              <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
                This link expires on ${params.expiresAt}
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #27272a;">
              <p style="color: #6b7280; font-size: 11px; text-align: center; margin: 0;">
                This payment uses confidential transfers. Your payment amount is encrypted and private.
              </p>
            </td>
          </tr>
        </table>
        
        <p style="color: #4b5563; font-size: 11px; text-align: center; margin-top: 24px;">
          Powered by Zurpay - Confidential Payroll on Solana
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generatePayrunEmailHtml(params: {
  recipientName?: string;
  orgName: string;
  totalAmount: string;
  payslipCount: number;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #12121a; border-radius: 16px; border: 1px solid #27272a;">
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-block; width: 48px; height: 48px; background-color: #10b981; border-radius: 12px; line-height: 48px; font-size: 24px; font-weight: bold; color: black;">Z</div>
              </div>
              
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 8px 0;">
                Payrun Ready for Review
              </h1>
              
              <p style="color: #9ca3af; font-size: 14px; text-align: center; margin: 0 0 32px 0;">
                ${params.recipientName ? `Hi ${params.recipientName}, ` : ''}A new payrun has been created for ${params.orgName}.
              </p>
              
              <div style="background-color: #1a1a25; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
                  <span style="color: #9ca3af;">Total Amount</span>
                  <span style="color: #ffffff; font-weight: 600;">${params.totalAmount}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #9ca3af;">Payslips</span>
                  <span style="color: #ffffff; font-weight: 600;">${params.payslipCount}</span>
                </div>
              </div>
              
              <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
                Log in to the admin dashboard to review and approve.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function sendPaymentRequestToOrgEmail(
  params: SendPaymentRequestNotificationParams
): Promise<boolean> {
  if (!resend) {
    console.log(
      '[Email] Resend not configured, skipping payment request notification to:',
      params.to
    );
    return false;
  }

  const formattedAmount = formatAmount(params.amount, params.currency);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: `New payment request: ${formattedAmount}`,
      html: generatePaymentRequestOrgEmailHtml({
        recipientName: params.recipientName,
        orgName: params.orgName,
        amount: formattedAmount,
        memo: params.memo,
        requesterWallet: params.requesterWallet,
      }),
    });

    if (error) {
      console.error('[Email] Failed to send payment request notification:', error);
      return false;
    }

    console.log('[Email] Payment request notification sent to:', params.to);
    return true;
  } catch (err) {
    console.error('[Email] Error sending payment request notification:', err);
    return false;
  }
}

export async function sendPaymentRequestStatusEmail(
  params: SendPaymentRequestStatusParams
): Promise<boolean> {
  if (!resend) {
    console.log(
      '[Email] Resend not configured, skipping payment status notification to:',
      params.to
    );
    return false;
  }

  const formattedAmount = formatAmount(params.amount, params.currency);
  const subject =
    params.status === 'approved'
      ? `Payment approved: ${formattedAmount} from ${params.orgName}`
      : `Payment request declined by ${params.orgName}`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject,
      html: generatePaymentRequestStatusEmailHtml({
        recipientName: params.recipientName,
        orgName: params.orgName,
        amount: formattedAmount,
        memo: params.memo,
        status: params.status,
        txSignature: params.txSignature,
      }),
    });

    if (error) {
      console.error('[Email] Failed to send payment status notification:', error);
      return false;
    }

    console.log('[Email] Payment status notification sent to:', params.to);
    return true;
  } catch (err) {
    console.error('[Email] Error sending payment status notification:', err);
    return false;
  }
}

function generatePaymentRequestOrgEmailHtml(params: {
  recipientName?: string;
  orgName: string;
  amount: string;
  memo?: string;
  requesterWallet: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #12121a; border-radius: 16px; border: 1px solid #27272a;">
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-block; width: 48px; height: 48px; background-color: #f59e0b; border-radius: 12px; line-height: 48px; font-size: 24px; font-weight: bold; color: black;">Z</div>
              </div>
              
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 8px 0;">
                New Payment Request
              </h1>
              
              <p style="color: #9ca3af; font-size: 14px; text-align: center; margin: 0 0 32px 0;">
                ${params.recipientName ? `Hi ${params.recipientName}, ` : ''}A contractor has submitted a payment request.
              </p>
              
              <div style="background-color: #1a1a25; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Requested Amount</p>
                <p style="color: #f59e0b; font-size: 36px; font-weight: 700; margin: 0;">${params.amount}</p>
                ${params.memo ? `<p style="color: #9ca3af; font-size: 14px; margin: 16px 0 0 0;">${params.memo}</p>` : ''}
              </div>
              
              <div style="background-color: #1a1a25; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0 0 4px 0;">From Wallet</p>
                <p style="color: #ffffff; font-size: 12px; font-family: monospace; margin: 0; word-break: break-all;">${params.requesterWallet}</p>
              </div>
              
              <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
                Log in to the admin dashboard to review and approve this request.
              </p>
            </td>
          </tr>
        </table>
        
        <p style="color: #4b5563; font-size: 11px; text-align: center; margin-top: 24px;">
          Powered by Zurpay - Confidential Payroll on Solana
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generatePaymentRequestStatusEmailHtml(params: {
  recipientName?: string;
  orgName: string;
  amount: string;
  memo?: string;
  status: 'approved' | 'rejected';
  txSignature?: string;
}): string {
  const isApproved = params.status === 'approved';
  const statusColor = isApproved ? '#10b981' : '#ef4444';
  const statusText = isApproved ? 'Approved' : 'Declined';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #12121a; border-radius: 16px; border: 1px solid #27272a;">
          <tr>
            <td style="padding: 40px;">
              <div style="text-align: center; margin-bottom: 32px;">
                <div style="display: inline-block; width: 48px; height: 48px; background-color: ${statusColor}; border-radius: 12px; line-height: 48px; font-size: 24px; font-weight: bold; color: ${isApproved ? 'black' : 'white'};">${isApproved ? '✓' : '✕'}</div>
              </div>
              
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 600; text-align: center; margin: 0 0 8px 0;">
                Payment Request ${statusText}
              </h1>
              
              <p style="color: #9ca3af; font-size: 14px; text-align: center; margin: 0 0 32px 0;">
                ${params.recipientName ? `Hi ${params.recipientName}, ` : ''}Your payment request to ${params.orgName} has been ${params.status}.
              </p>
              
              <div style="background-color: #1a1a25; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Amount</p>
                <p style="color: ${statusColor}; font-size: 36px; font-weight: 700; margin: 0;">${params.amount}</p>
                ${params.memo ? `<p style="color: #9ca3af; font-size: 14px; margin: 16px 0 0 0;">${params.memo}</p>` : ''}
              </div>
              
              ${
                isApproved && params.txSignature
                  ? `
              <a href="https://explorer.solana.com/tx/${params.txSignature}?cluster=devnet" style="display: block; background-color: #10b981; color: #000000; text-decoration: none; padding: 16px 24px; border-radius: 8px; font-weight: 600; text-align: center; margin-bottom: 24px;">
                View Transaction
              </a>
              `
                  : ''
              }
              
              <p style="color: #6b7280; font-size: 12px; text-align: center; margin: 0;">
                ${isApproved ? 'The payment has been processed to your wallet.' : 'Please contact the organization if you have questions.'}
              </p>
            </td>
          </tr>
        </table>
        
        <p style="color: #4b5563; font-size: 11px; text-align: center; margin-top: 24px;">
          Powered by Zurpay - Confidential Payroll on Solana
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export const emailService = {
  sendClaimLink: sendClaimLinkEmail,
  sendPayrunReady: sendPayrunReadyEmail,
  sendPaymentRequestToOrg: sendPaymentRequestToOrgEmail,
  sendPaymentRequestStatus: sendPaymentRequestStatusEmail,
  isConfigured: () => resend !== null,
};
