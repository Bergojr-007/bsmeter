import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/privacy')({
  component: Privacy,
})

function Privacy() {
  return (
    <div style={{ background: '#1a1635', minHeight: '100vh', padding: '40px 20px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <a href="/" style={{ color: '#7F77DD', fontSize: 14, textDecoration: 'none' }}>← Back to BS Meter</a>
          <h1 style={{ color: '#ffffff', fontSize: 32, fontWeight: 900, marginTop: 16, marginBottom: 8 }}>
            Privacy Policy
          </h1>
          <p style={{ color: '#7F77DD', fontSize: 14 }}>Last updated: April 2026</p>
        </div>

        {/* Content */}
        {[
          {
            title: 'Overview',
            body: 'BS Meter (bsmeter.org) and the BS Meter browser extension are committed to protecting your privacy. We do not collect, store, or sell any personally identifiable information.',
          },
          {
            title: 'Information We Do Not Collect',
            body: 'We do not collect your name, email address, IP address, location, browsing history, or any other personal data. The claims you submit for fact-checking are sent directly to our AI provider to generate a response and are not stored on our servers.',
          },
          {
            title: 'Browser Extension',
            body: 'The BS Meter browser extension does not collect any user data. It uses browser storage only to save your local preferences (such as theme settings) on your own device. This data never leaves your browser and is never transmitted to us or any third party.',
          },
          {
            title: 'AI Analysis',
            body: 'When you submit a claim for fact-checking, it is processed by an AI model to generate an analysis. We do not log or store the content of your queries beyond what is necessary to return a response.',
          },
          {
            title: 'Third Party Services',
            body: 'We use Stripe for payment processing. Stripe has its own privacy policy and handles all payment data. We never see or store your payment information. We use Netlify to host this website.',
          },
          {
            title: 'Cookies',
            body: 'We do not use tracking cookies or advertising cookies. We may use essential cookies required for the site to function, such as session management.',
          },
          {
            title: 'Changes to This Policy',
            body: 'We may update this privacy policy from time to time. Any changes will be posted on this page with an updated date.',
          },
          {
            title: 'Contact',
            body: 'If you have any questions about this privacy policy, please contact us at bsmeter.org.',
          },
        ].map((section) => (
          <div key={section.title} style={{
            background: '#26215C',
            border: '0.5px solid #534AB7',
            borderRadius: 12,
            padding: '24px 28px',
            marginBottom: 16,
          }}>
            <h2 style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              {section.title}
            </h2>
            <p style={{ color: '#AFA9EC', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
              {section.body}
            </p>
          </div>
        ))}

        <p style={{ color: '#534AB7', fontSize: 12, textAlign: 'center', marginTop: 40 }}>
          © 2026 BS Meter · bsmeter.org
        </p>
      </div>
    </div>
  )
}
