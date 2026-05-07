import { storage } from '../storage';
import { sendEmail } from './emailService';

export interface SendResult {
  success: boolean;
  deliveryStatus: 'sent' | 'failed';
  providerMessageId?: string | null;
  failureReason?: string | null;
  communication: Awaited<ReturnType<typeof storage.getCommunicationById>>;
}

async function sendEmailCommunication(
  communicationId: string,
  companyId: string,
  recipientEmail: string,
  subject: string,
  body: string,
  sentById: string
): Promise<{ success: boolean; providerMessageId?: string | null; failureReason?: string | null }> {
  try {
    const emailLog = await sendEmail(
      recipientEmail,
      subject || '(No subject)',
      `<pre style="font-family:sans-serif;white-space:pre-wrap">${body}</pre>`,
      body,
      {
        companyId,
        sentById,
        variables: {},
      }
    );

    if (emailLog.status === 'sent') {
      return { success: true, providerMessageId: emailLog.providerMessageId ?? null };
    } else {
      const errorInfo = emailLog.errorJson as { message?: string } | null;
      return { success: false, failureReason: errorInfo?.message ?? 'Unknown error' };
    }
  } catch (err: any) {
    return { success: false, failureReason: err?.message ?? 'Unknown error' };
  }
}

export async function sendCommunication(
  communicationId: string,
  companyId: string
): Promise<SendResult> {
  const comm = await storage.getCommunicationById(communicationId, companyId);
  if (!comm) {
    throw new Error(`Communication ${communicationId} not found`);
  }

  if (comm.type === 'email') {
    if (!comm.recipientEmail) {
      const updated = await storage.updateCommunication(communicationId, companyId, {
        deliveryProvider: 'sendgrid',
        deliveryStatus: 'failed',
        failureReason: 'No recipient email address provided',
        status: 'failed',
      });
      return {
        success: false,
        deliveryStatus: 'failed',
        failureReason: 'No recipient email address provided',
        communication: await storage.getCommunicationById(communicationId, companyId),
      };
    }

    await storage.updateCommunication(communicationId, companyId, {
      deliveryProvider: 'sendgrid',
      deliveryStatus: 'pending',
    });

    const result = await sendEmailCommunication(
      communicationId,
      companyId,
      comm.recipientEmail,
      comm.subject ?? '',
      comm.body,
      comm.sentById ?? ''
    );

    if (result.success) {
      await storage.updateCommunication(communicationId, companyId, {
        deliveryStatus: 'sent',
        providerMessageId: result.providerMessageId ?? null,
        status: 'sent',
        sentAt: new Date(),
        recipientEmail: comm.recipientEmail,
      });
    } else {
      await storage.updateCommunication(communicationId, companyId, {
        deliveryStatus: 'failed',
        failureReason: result.failureReason ?? null,
        status: 'failed',
      });
    }

    const updatedComm = await storage.getCommunicationById(communicationId, companyId);
    return {
      success: result.success,
      deliveryStatus: result.success ? 'sent' : 'failed',
      providerMessageId: result.providerMessageId,
      failureReason: result.failureReason,
      communication: updatedComm,
    };
  }

  const updated = await storage.updateCommunication(communicationId, companyId, {
    status: 'sent',
    sentAt: new Date(),
  });

  return {
    success: true,
    deliveryStatus: 'sent',
    communication: await storage.getCommunicationById(communicationId, companyId),
  };
}
