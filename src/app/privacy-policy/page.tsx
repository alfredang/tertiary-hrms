import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Tertiary HRMS",
  description: "Privacy Policy for Tertiary HRMS mobile and web application",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300 px-4 py-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
          <p className="text-gray-400">
            Tertiary HRMS — Human Resources Management System
          </p>
          <p className="text-gray-500 text-sm">
            Last updated: 27 February 2026
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 md:p-8 space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">1. Introduction</h2>
            <p>
              Tertiary Infotech Academy Pte. Ltd. (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates
              the Tertiary HRMS application (the &quot;Service&quot;), available as a web application
              and mobile application for iOS and Android. This Privacy Policy explains how we
              collect, use, disclose, and safeguard your information when you use our Service.
            </p>
            <p>
              By using the Service, you agree to the collection and use of information in
              accordance with this policy. If you do not agree with this policy, please do not
              use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">2. Information We Collect</h2>

            <h3 className="text-lg font-medium text-gray-200">2.1 Personal Information</h3>
            <p>When your employer registers you on the Service, we may collect:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Full name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Date of birth</li>
              <li>Gender</li>
              <li>Nationality</li>
              <li>NRIC / National ID number</li>
              <li>Residential address</li>
              <li>Education level</li>
              <li>Employment details (position, department, start date, employment type)</li>
              <li>Profile photo (if uploaded)</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-200">2.2 Financial Information</h3>
            <p>For payroll and expense processing, we may collect:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Salary information</li>
              <li>Bank account details (bank name, account number, PayNow ID)</li>
              <li>CPF contribution rates</li>
              <li>Expense claim details and receipt images</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-200">2.3 Usage Data</h3>
            <p>We may automatically collect:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Device type and operating system</li>
              <li>IP address</li>
              <li>Browser type</li>
              <li>Pages visited and features used</li>
              <li>Date and time of access</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-200">2.4 Authentication Data</h3>
            <p>
              If you sign in with Google, we receive your Google email address and basic
              profile information. We do not access your Google contacts, calendar, or other
              Google services.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">3. How We Use Your Information</h2>
            <p>We use the collected information to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Provide and maintain the HR management service</li>
              <li>Process leave requests and approvals</li>
              <li>Generate and manage payroll and payslips</li>
              <li>Process expense claims</li>
              <li>Manage employee records and organizational structure</li>
              <li>Send notifications related to your employment (leave approvals, payslip availability)</li>
              <li>Authenticate your identity and secure your account</li>
              <li>Comply with legal obligations (e.g., CPF contributions, tax reporting)</li>
              <li>Improve the Service and fix technical issues</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">4. Data Sharing and Disclosure</h2>
            <p>We do not sell your personal information. We may share your information with:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>
                <strong className="text-gray-200">Your employer</strong> — HR administrators and
                managers within your organization who need access to perform their duties
              </li>
              <li>
                <strong className="text-gray-200">Service providers</strong> — Third-party services
                that help us operate the application (e.g., cloud hosting, database services,
                file storage). These providers are bound by confidentiality agreements.
              </li>
              <li>
                <strong className="text-gray-200">Legal requirements</strong> — When required by law,
                regulation, legal process, or governmental request
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">5. Data Storage and Security</h2>
            <p>
              Your data is stored on secure servers with encryption in transit (TLS/SSL) and
              at rest. We implement appropriate technical and organizational measures to protect
              your personal data against unauthorized access, alteration, disclosure, or
              destruction.
            </p>
            <p>
              Passwords are stored using industry-standard one-way hashing (bcrypt). We never
              store passwords in plain text.
            </p>
            <p>
              While we strive to protect your information, no method of electronic storage or
              transmission is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">6. Data Retention</h2>
            <p>
              We retain your personal information for as long as your employment relationship
              with your employer is active and for a reasonable period thereafter as required by
              applicable laws (e.g., employment records retention requirements in Singapore).
            </p>
            <p>
              When data is no longer required, it will be securely deleted or anonymized.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">7. Your Rights</h2>
            <p>Under the Singapore Personal Data Protection Act (PDPA), you have the right to:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li>Access your personal data held by us</li>
              <li>Request correction of inaccurate personal data</li>
              <li>Withdraw consent for the collection, use, or disclosure of your data</li>
              <li>Request information about how your data has been used or disclosed in the past year</li>
            </ul>
            <p>
              To exercise these rights, please contact your HR administrator or reach out to us
              using the contact information below.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">8. Cookies and Tracking</h2>
            <p>
              The Service uses essential cookies for authentication and session management.
              These cookies are necessary for the Service to function and cannot be disabled.
              We do not use advertising or tracking cookies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">9. Third-Party Services</h2>
            <p>The Service may use the following third-party services:</p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong className="text-gray-200">Google OAuth</strong> — For authentication (sign-in with Google)</li>
              <li><strong className="text-gray-200">UploadThing</strong> — For file and receipt uploads</li>
              <li><strong className="text-gray-200">AI Services</strong> — For the built-in chat assistant (queries are not stored permanently)</li>
            </ul>
            <p>
              Each third-party service has its own privacy policy governing the use of your information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">10. Children&apos;s Privacy</h2>
            <p>
              The Service is intended for use by employees of registered organizations and is
              not directed at individuals under the age of 18. We do not knowingly collect
              personal information from children.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify users of any
              material changes by posting the new policy on this page and updating the
              &quot;Last updated&quot; date. Your continued use of the Service after changes are posted
              constitutes acceptance of the revised policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-white">12. Contact Us</h2>
            <p>
              If you have questions or concerns about this Privacy Policy or our data practices,
              please contact us:
            </p>
            <div className="bg-gray-800 rounded-lg p-4 space-y-1">
              <p className="text-white font-medium">Tertiary Infotech Academy Pte. Ltd.</p>
              <p>Email: info@tertiaryinfo.tech</p>
              <p>Website: https://tertiaryinfo.tech</p>
              <p>Singapore</p>
            </div>
          </section>
        </div>

        <p className="text-center text-xs text-gray-600">
          &copy; {new Date().getFullYear()} Tertiary Infotech Academy Pte. Ltd. All rights reserved.
        </p>
      </div>
    </div>
  );
}
