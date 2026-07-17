export default function EulaPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-full bg-[#1a4d1a] flex items-center justify-center">
            <span className="text-white font-bold text-sm">HP</span>
          </div>
          <span className="font-semibold text-gray-900">High Plains Property Maintenance</span>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">End-User License Agreement</h1>
        <p className="text-sm text-gray-500 mb-8">Effective date: January 1, 2025</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
          <p>
            This End-User License Agreement ("Agreement") is a legal agreement between you ("User") and
            High Plains Property Maintenance ("Company") governing your use of the High Plains CRM
            software application ("Application").
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">1. License Grant</h2>
          <p>
            The Company grants you a limited, non-exclusive, non-transferable, revocable license to
            access and use the Application solely for your internal business operations in connection
            with the services provided by the Company.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">2. Restrictions</h2>
          <p>You may not:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Copy, modify, or distribute the Application or any portion thereof</li>
            <li>Reverse engineer, decompile, or disassemble the Application</li>
            <li>Use the Application for any unlawful purpose</li>
            <li>Transfer your account credentials to any third party</li>
            <li>Use the Application in any manner that could damage or impair its operation</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">3. QuickBooks Online Integration</h2>
          <p>
            The Application integrates with Intuit QuickBooks Online. Your use of that integration is
            also subject to Intuit's terms of service and privacy policy. The Company does not store
            your Intuit credentials; authentication is handled through Intuit's OAuth 2.0 service.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">4. Ownership</h2>
          <p>
            The Application and all intellectual property rights therein remain the exclusive property
            of the Company. This Agreement does not transfer any ownership rights to you.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">5. Disclaimer of Warranties</h2>
          <p>
            THE APPLICATION IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
            THE COMPANY DOES NOT WARRANT THAT THE APPLICATION WILL BE ERROR-FREE OR UNINTERRUPTED.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">6. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE COMPANY SHALL NOT BE LIABLE FOR
            ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR
            RELATED TO YOUR USE OF THE APPLICATION.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">7. Termination</h2>
          <p>
            This Agreement is effective until terminated. The Company may terminate your access to the
            Application at any time, with or without cause. Upon termination, you must cease all use
            of the Application.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">8. Governing Law</h2>
          <p>
            This Agreement shall be governed by the laws of the State of Colorado, without regard to
            its conflict of law provisions.
          </p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8">9. Contact</h2>
          <p>
            If you have questions about this Agreement, contact us at:{" "}
            <a href="mailto:info@highplainsprop.com" className="text-[#1a4d1a] underline">
              info@highplainsprop.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
