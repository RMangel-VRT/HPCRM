import sgMail from '@sendgrid/mail';
import { storage } from '../storage';
import type { EmailLog, InsertEmailLog, EmailRule } from '@shared/schema';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email };
}

async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
  };
}

export interface EmailContext {
  companyId: string;
  customerId?: string;
  ticketId?: string;
  templateId?: string;
  sentById?: string;
  variables: Record<string, string>;
}

function substituteVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
}

export async function sendEmail(
  toEmail: string,
  subject: string,
  htmlBody: string,
  textBody: string | null,
  context: EmailContext
): Promise<EmailLog> {
  const resolvedSubject = substituteVariables(subject, context.variables);
  const resolvedHtml = substituteVariables(htmlBody, context.variables);
  const resolvedText = textBody ? substituteVariables(textBody, context.variables) : undefined;

  const logEntry = await storage.createEmailLog({
    companyId: context.companyId,
    customerId: context.customerId || null,
    ticketId: context.ticketId || null,
    templateId: context.templateId || null,
    toEmail,
    subject: resolvedSubject,
    htmlBody: resolvedHtml,
    status: 'pending',
    sentById: context.sentById || null,
    providerMessageId: null,
    errorJson: null,
    sentAt: null,
  });

  try {
    const { client, fromEmail } = await getUncachableSendGridClient();

    const msg: sgMail.MailDataRequired = {
      to: toEmail,
      from: fromEmail,
      subject: resolvedSubject,
      html: resolvedHtml,
      ...(resolvedText && { text: resolvedText }),
    };

    const [response] = await client.send(msg);

    const providerMessageId = response?.headers?.['x-message-id'] || null;

    const updated = await storage.updateEmailLog(logEntry.id, {
      status: 'sent',
      providerMessageId,
      sentAt: new Date(),
    });

    console.log(`Email sent successfully to ${toEmail}, log ID: ${logEntry.id}`);
    return updated || logEntry;
  } catch (error: any) {
    console.error(`Failed to send email to ${toEmail}:`, error?.message || error);

    const errorInfo = {
      message: error?.message || 'Unknown error',
      code: error?.code,
      response: error?.response?.body,
    };

    const updated = await storage.updateEmailLog(logEntry.id, {
      status: 'failed',
      errorJson: errorInfo,
    });

    return updated || logEntry;
  }
}

export async function processEmailEvent(
  eventKey: string,
  companyId: string,
  variables: Record<string, string>,
  options: {
    customerId?: string;
    ticketId?: string;
    toEmail?: string;
    sentById?: string;
  }
): Promise<EmailLog[]> {
  const rules = await storage.getEmailRulesByEvent(eventKey, companyId);
  const results: EmailLog[] = [];

  for (const rule of rules) {
    try {
      const template = await storage.getEmailTemplateById(rule.templateId, companyId);
      if (!template || !template.isActive) {
        console.log(`Skipping rule ${rule.id}: template not found or inactive`);
        continue;
      }

      if (!options.toEmail) {
        console.log(`Skipping rule ${rule.id}: no recipient email address`);
        continue;
      }

      const context: EmailContext = {
        companyId,
        customerId: options.customerId,
        ticketId: options.ticketId,
        templateId: template.id,
        sentById: options.sentById,
        variables,
      };

      const log = await sendEmail(
        options.toEmail,
        template.subject,
        template.htmlBody,
        template.textBody,
        context
      );
      results.push(log);
    } catch (err) {
      console.error(`Error processing email rule ${rule.id}:`, err);
    }
  }

  return results;
}

export async function resendEmail(emailLogId: string, companyId: string, sentById: string): Promise<EmailLog | null> {
  const existingLog = await storage.getEmailLogById(emailLogId, companyId);
  if (!existingLog) return null;

  const context: EmailContext = {
    companyId,
    customerId: existingLog.customerId || undefined,
    ticketId: existingLog.ticketId || undefined,
    templateId: existingLog.templateId || undefined,
    sentById,
    variables: {},
  };

  return sendEmail(
    existingLog.toEmail,
    existingLog.subject,
    existingLog.htmlBody || '',
    null,
    context
  );
}

export function getDefaultWorkCompletedTemplate() {
  return {
    name: 'Work Completed Notification',
    subject: 'Work Completed: {{ticketTitle}}',
    htmlBody: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background-color: #1a5632; padding: 24px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
    .content { padding: 32px 24px; }
    .content h2 { color: #1a5632; margin-top: 0; }
    .detail-row { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-label { color: #6b7280; font-size: 13px; text-transform: uppercase; }
    .detail-value { color: #111827; font-size: 15px; margin-top: 2px; }
    .footer { padding: 16px 24px; background-color: #f9fafb; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{companyName}}</h1>
    </div>
    <div class="content">
      <h2>Work Completed</h2>
      <p>The following work has been completed at your property:</p>
      <div class="detail-row">
        <div class="detail-label">Work Description</div>
        <div class="detail-value">{{ticketTitle}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Property</div>
        <div class="detail-value">{{customerName}}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Completed On</div>
        <div class="detail-value">{{completionDate}}</div>
      </div>
      {{#if ticketDescription}}
      <div class="detail-row">
        <div class="detail-label">Details</div>
        <div class="detail-value">{{ticketDescription}}</div>
      </div>
      {{/if}}
      <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">
        If you have any questions about this work, please contact us.
      </p>
    </div>
    <div class="footer">
      <p>{{companyName}} - Property Maintenance Services</p>
    </div>
  </div>
</body>
</html>`,
    textBody: `Work Completed: {{ticketTitle}}\n\nThe following work has been completed at your property:\n\nWork: {{ticketTitle}}\nProperty: {{customerName}}\nCompleted On: {{completionDate}}\n\nIf you have any questions about this work, please contact us.\n\n{{companyName}} - Property Maintenance Services`,
    category: 'transactional' as const,
    isActive: true,
  };
}
