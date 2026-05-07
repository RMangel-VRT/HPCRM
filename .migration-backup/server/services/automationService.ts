import { storage } from '../storage';
import type { CommunicationAutomationRule, InsertCommunication } from '@shared/schema';
import { sendEmail } from './emailService';

export interface AutomationRunResult {
  ruleId: string;
  ruleName: string;
  draftsCreated: number;
  errors: string[];
}

export function getTriggerSummary(rule: CommunicationAutomationRule): string {
  if (rule.triggerType === 'recurring') {
    return `Every ${rule.recurringIntervalDays ?? '?'} days`;
  }
  const direction = rule.triggerType === 'time_after_event' ? 'after' : 'before';
  const eventLabels: Record<string, string> = {
    proposal_created: 'Proposal Created',
    work_order_closed: 'Work Order Closed',
    invoice_due_date: 'Invoice Due Date',
    service_date: 'Service Date',
  };
  const eventLabel = rule.eventKey ? (eventLabels[rule.eventKey] ?? rule.eventKey) : '?';
  return `${rule.delayDays ?? '?'} days ${direction} ${eventLabel}`;
}

interface SourceRecord {
  type: string;
  id: string;
  customerId: string;
  customerName: string;
  referenceDate: Date;
}

async function getSourceRecords(
  rule: CommunicationAutomationRule,
  companyId: string
): Promise<SourceRecord[]> {
  const records: SourceRecord[] = [];

  if (rule.triggerType === 'recurring') {
    const customers = await storage.getCustomers(companyId);
    for (const customer of customers) {
      if (customer.status !== 'active') continue;
      records.push({
        type: 'customer',
        id: customer.id,
        customerId: customer.id,
        customerName: customer.name,
        referenceDate: new Date(),
      });
    }
    return records;
  }

  const eventKey = rule.eventKey;
  if (!eventKey) return records;

  const customers = await storage.getCustomers(companyId);

  if (eventKey === 'proposal_created') {
    for (const customer of customers) {
      const proposals = await storage.getProposalsByCustomer(customer.id, companyId);
      for (const proposal of proposals) {
        records.push({
          type: 'proposal',
          id: proposal.id,
          customerId: customer.id,
          customerName: customer.name,
          referenceDate: new Date(proposal.createdAt),
        });
      }
    }
  } else if (eventKey === 'work_order_closed') {
    for (const customer of customers) {
      const customerTickets = await storage.getTicketsByCustomerId(customer.id, companyId);
      for (const ticket of customerTickets) {
        if (ticket.workCompletedDate) {
          records.push({
            type: 'ticket_closed',
            id: ticket.id,
            customerId: customer.id,
            customerName: customer.name,
            referenceDate: new Date(ticket.workCompletedDate),
          });
        }
      }
    }
  } else if (eventKey === 'service_date') {
    for (const customer of customers) {
      const customerTickets = await storage.getTicketsByCustomerId(customer.id, companyId);
      for (const ticket of customerTickets) {
        if (ticket.dueDate) {
          records.push({
            type: 'ticket_service',
            id: ticket.id,
            customerId: customer.id,
            customerName: customer.name,
            referenceDate: new Date(ticket.dueDate),
          });
        }
      }
    }
  } else if (eventKey === 'invoice_due_date') {
    // Use ticket dueDate as a proxy for invoice due dates
    // (a dedicated invoice entity store method is not yet available)
    for (const customer of customers) {
      const customerTickets = await storage.getTicketsByCustomerId(customer.id, companyId);
      for (const ticket of customerTickets) {
        if (ticket.dueDate) {
          records.push({
            type: 'ticket_invoice_due',
            id: ticket.id,
            customerId: customer.id,
            customerName: customer.name,
            referenceDate: new Date(ticket.dueDate),
          });
        }
      }
    }
  }

  return records;
}

function isRecordDue(
  record: SourceRecord,
  rule: CommunicationAutomationRule
): boolean {
  const now = new Date();

  if (rule.triggerType === 'recurring') {
    if (!rule.lastRunAt) return true;
    const intervalMs = (rule.recurringIntervalDays ?? 1) * 24 * 60 * 60 * 1000;
    return now.getTime() - new Date(rule.lastRunAt).getTime() >= intervalMs;
  }

  const delayMs = (rule.delayDays ?? 0) * 24 * 60 * 60 * 1000;

  if (rule.triggerType === 'time_after_event') {
    const targetDate = new Date(record.referenceDate.getTime() + delayMs);
    return now >= targetDate;
  }

  if (rule.triggerType === 'time_before_event') {
    // Fire when we are delayDays before the event (targetDate = referenceDate - delayDays)
    const targetDate = new Date(record.referenceDate.getTime() - delayMs);
    return now >= targetDate && now <= record.referenceDate;
  }

  return false;
}

async function isDuplicate(
  companyId: string,
  ruleId: string,
  sourceRecordType: string,
  sourceRecordId: string
): Promise<boolean> {
  const existing = await storage.getCommunications(companyId, {});
  return existing.some(
    (c) =>
      c.automationRuleId === ruleId &&
      c.automationSourceRecordType === sourceRecordType &&
      c.automationSourceRecordId === sourceRecordId
  );
}

async function trySendAutomationEmail(
  companyId: string,
  customerId: string,
  communicationId: string,
  toEmail: string,
  subject: string,
  body: string
): Promise<void> {
  try {
    await sendEmail(toEmail, subject, body, null, {
      companyId,
      customerId,
      variables: {},
    });
    await storage.updateCommunication(communicationId, companyId, { status: 'sent', sentAt: new Date() });
  } catch (_sendErr) {
    // SendGrid not configured or other send error — leave communication as draft
  }
}

async function runRule(
  rule: CommunicationAutomationRule,
  companyId: string
): Promise<{ draftsCreated: number; errors: string[] }> {
  const errors: string[] = [];
  let draftsCreated = 0;

  try {
    const template = rule.templateId
      ? await storage.getCommunicationTemplates(companyId).then((ts) => ts.find((t) => t.id === rule.templateId))
      : null;

    const subject = template?.subject ?? `Automated: ${rule.name}`;
    const body = template?.body ?? `This is an automated communication generated by the rule: ${rule.name}`;
    const type = template?.type ?? 'email';

    const sourceRecords = await getSourceRecords(rule, companyId);

    for (const record of sourceRecords) {
      if (!isRecordDue(record, rule)) continue;

      const alreadyGenerated = await isDuplicate(
        companyId,
        rule.id,
        record.type,
        record.id
      );
      if (alreadyGenerated) continue;

      const comm: InsertCommunication = {
        companyId,
        customerId: record.customerId,
        type,
        status: 'draft',
        direction: 'outbound',
        followUpStatus: 'none',
        toAddresses: [],
        ccAddresses: [],
        bccAddresses: [],
        subject,
        body,
        automationRuleId: rule.id,
        automationRuleName: rule.name,
        automationSourceRecordType: record.type,
        automationSourceRecordId: record.id,
      };

      const created = await storage.createCommunication(comm);
      draftsCreated++;

      if (rule.autoSend && type === 'email') {
        const contacts = await storage.getContactsByCustomerId(record.customerId, companyId);
        const primaryContact =
          contacts.find((c) => c.isPrimary === 'true') ?? contacts[0];
        const primaryEmail = primaryContact?.emails?.[0];
        if (primaryEmail) {
          await trySendAutomationEmail(
            companyId,
            record.customerId,
            created.id,
            primaryEmail,
            subject,
            body
          );
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    errors.push(message);
  }

  return { draftsCreated, errors };
}

export async function runAutomationRule(
  ruleId: string,
  companyId: string
): Promise<AutomationRunResult> {
  const rule = await storage.getCommunicationAutomationRuleById(ruleId, companyId);
  if (!rule) {
    return { ruleId, ruleName: 'Unknown', draftsCreated: 0, errors: ['Rule not found'] };
  }

  const { draftsCreated, errors } = await runRule(rule, companyId);
  await storage.updateCommunicationAutomationRuleLastRun(ruleId, companyId);

  return { ruleId, ruleName: rule.name, draftsCreated, errors };
}

export async function runAllAutomationRules(): Promise<void> {
  try {
    const companies = await storage.getCompanies();
    for (const company of companies) {
      const rules = await storage.getCommunicationAutomationRules(company.id);
      for (const rule of rules) {
        if (!rule.isEnabled) continue;
        try {
          await runRule(rule, company.id);
          await storage.updateCommunicationAutomationRuleLastRun(rule.id, company.id);
        } catch (err) {
          console.error(`Error running automation rule ${rule.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Error running automation rules:', err);
  }
}
