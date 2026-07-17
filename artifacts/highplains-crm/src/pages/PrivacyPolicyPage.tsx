export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-full bg-[#1a4d1a] flex items-center justify-center">
            <span className="text-white font-bold text-sm">HP</span>
          </div>
          <span className="font-semibold text-gray-900">High Plains Property Maintenance</span>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Effective date: January 1, 2025</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
          <p>
            High Plains Property Maintenance ("Company," "we," "us," or "our") operates the High
            Plains CRM application ("Application"). This Privacy Policy explains how we collect, use,
            and protect information when you use our Application.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">1. Information We Collect</h2>
          <p>We collect the following types of information:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Account information:</strong> Name, email address, and role within the
              organization provided during account setup.
            </li>
            <li>
              <strong>Business data:</strong> Customer records, property details, service tickets,
              contracts, and other information entered into the Application in connection with your
              property maintenance operations.
            </li>
            <li>
              <strong>Usage data:</strong> Log data including IP address, browser type, pages
              accessed, and timestamps.
            </li>
            <li>
              <strong>QuickBooks data:</strong> When you connect a QuickBooks Online account, we
              receive an OAuth token and sync customer and financial data between the Application
              and QuickBooks. We do not store your Intuit password.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">2. How We Use Your Information</h2>
          <p>We use collected information to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Operate, maintain, and improve the Application</li>
            <li>Sync data with QuickBooks Online at your direction</li>
            <li>Communicate with you about your account and service updates</li>
            <li>Detect and prevent fraud or unauthorized access</li>
            <li>Comply with applicable legal obligations</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">3. QuickBooks Online Integration</h2>
          <p>
            Our Application connects to Intuit QuickBooks Online using OAuth 2.0. When you authorize
            this connection:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>We store an encrypted OAuth access token and refresh token on your behalf</li>
            <li>We use these tokens only to read and write data you explicitly request</li>
            <li>You can disconnect the integration at any time from the Application settings, which revokes our access</li>
            <li>We do not sell or share your QuickBooks data with third parties</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">4. Data Sharing</h2>
          <p>
            We do not sell your personal information. We may share information only with:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Service providers who help us operate the Application (e.g., hosting, database)</li>
            <li>Intuit Inc., as required to operate the QuickBooks integration</li>
            <li>Law enforcement or regulators when required by applicable law</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">5. Data Security</h2>
          <p>
            We implement reasonable technical and organizational measures to protect your data,
            including encryption of OAuth tokens at rest and in transit. No method of transmission
            over the Internet is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">6. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active or as needed to provide
            services. You may request deletion of your data by contacting us at the address below.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">7. Your Rights</h2>
          <p>
            Depending on your location, you may have rights to access, correct, or delete your
            personal information. To exercise these rights, contact us at the address below.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">8. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of significant
            changes by posting the new policy on this page with an updated effective date.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">9. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at:{" "}
            <a href="mailto:info@highplainsprop.com" className="text-[#1a4d1a] underline">
              info@highplainsprop.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
