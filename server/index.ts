import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, migrateProjectSchedulingStatus, migrateFirstBankHierarchy, migrateExtraBillableTicketType, removeProjectInvoicingFields, fixExtraBillableDoneOrder, fixEstimateRequestBillingBehavior, fixProjectDisplayOrders, migrateEstimateSentToProposalWorkflow, migrateProjectNoEstimateTicketType, migrateUserLanguageColumn, migrateUserPhoneColumn, backfillCustomerType, migrateEquipmentProfilePhotoColumn, migrateProposalNumbers, migrateCommunicationTemplatesSchema, migrateCommunicationsTable, seedCommunicationsBootstrap, seedCommunicationTemplatesBootstrap, migrateAutomationRulesTable, seedAutomationRulesBootstrap, migrateCampaignItemExceptionType, migrateCampaignItemsNewColumns, migrateCampaignAssignedToId2, migrateCustomerRankingColumn, migrateTicketTypeStatusActionType, backfillStatusActionTypes, migrateVisualScopeLayerDefsColumn } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { runDueDateNotifications } from "./due-date-notifications";
import { runAllAutomationRules } from "./services/automationService";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);
  
  // Run startup migrations
  await migrateProjectSchedulingStatus(); // Ensure Ready to Schedule status exists
  await migrateFirstBankHierarchy(); // Link 1st Bank branches to parent account
  await migrateExtraBillableTicketType(); // Ensure Extra Billable ticket type exists and migrate old tickets
  await removeProjectInvoicingFields(); // Remove duplicate invoice data fields from Project Invoicing status
  await fixExtraBillableDoneOrder(); // Fix Extra Billable Done status order after Ready for Billing insertion
  await fixProjectDisplayOrders(); // Fix Project ticket type display orders (Ready to Schedule / Work Completed collision)
  await fixEstimateRequestBillingBehavior(); // Fix billing_behavior for Project tickets from estimate_requests
  await migrateEstimateSentToProposalWorkflow(); // Replace Estimate Sent with Create Proposal + Proposal Sent
  await migrateProjectNoEstimateTicketType(); // Ensure Project (No Estimate) ticket type exists for all companies
  await migrateUserLanguageColumn(); // Ensure language column exists on users table
  await migrateUserPhoneColumn(); // Ensure phone column exists and email is nullable on users table
  await backfillCustomerType(); // Backfill customer_type for existing customers
  await migrateEquipmentProfilePhotoColumn(); // Ensure profile_photo_path column exists on equipment table
  await migrateProposalNumbers(); // Add proposal_number column and backfill existing proposals
  await migrateCommunicationTemplatesSchema(); // Create communications tables and extend communication_templates schema with slice-6 columns
  await seedCommunicationsBootstrap(); // Seed sample communications for companies with none
  await seedCommunicationTemplatesBootstrap(); // Seed sample communication templates for companies with none
  await migrateAutomationRulesTable(); // Create automation rules table
  await seedAutomationRulesBootstrap(); // Seed five High Plains automation rules for companies with none
  await migrateCampaignItemExceptionType(); // Ensure exception_type column exists on campaign_items table
  await migrateCampaignItemsNewColumns(); // Ensure property_id and service_plan_category columns exist on campaign_items table
  await migrateCampaignAssignedToId2(); // Ensure assigned_to_id2 column exists on campaigns table
  await migrateCustomerRankingColumn(); // Ensure ranking column exists on customers table
  await migrateTicketTypeStatusActionType(); // Ensure action_type and waiting_category columns exist on ticket_type_statuses
  await backfillStatusActionTypes(); // Backfill correct action_type/waiting_category for existing default statuses
  await migrateVisualScopeLayerDefsColumn(); // Ensure layer_defs column exists on visual_scope_sheets table

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    
    // Start the due date notification service only in development
    // Autoscale deployments cannot run background tasks
    if (app.get("env") === "development") {
      runDueDateNotifications();
    } else {
      log("Due date notification service disabled in production (Autoscale)");
    }
    // Run automation rules evaluator hourly in all environments
    setInterval(() => {
      runAllAutomationRules().catch((err: Error) => log(`Automation rules error: ${err?.message}`));
    }, 60 * 60 * 1000);
    log("Automation rules evaluator started (hourly interval)");
  });
})();
