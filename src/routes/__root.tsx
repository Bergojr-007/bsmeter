import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Bullshit Meter — Political fact-checker for news, social media & videos' },
      { name: 'description', content: "Paste any political claim, tweet, headline, YouTube video, or TikTok. The Bullshit Meter shows exactly how much BS you're dealing with — 😇 angels for truth, 😈 devils for BS." },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body style={{ background: '#1a1635', margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 20, background: '#26215C', borderBottom: '0.5px solid #534AB7', backdropFilter: 'blur(8px)' }}>
          <div style={{ maxWidth: 1024, margin: '0 auto', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <span style={{ fontSize: 26, filter: 'drop-shadow(0 0 6px #ef4444)' }}>😈</span>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
                  Bullshit Meter
                </span>
                <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7F77DD' }}>
                  bsmeter.org
                </span>
              </div>
            </a>
            <nav style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <a href="/#how" style={{ fontSize: 12, color: '#AFA9EC', textDecoration: 'none', fontWeight: 500 }}>
                How it works
              </a>
              <a
                href="https://www.poynter.org/ifcn-fact-checkers-code-of-principles/"
                target="_blank"
                rel="noreferrer noopener"
                style={{ fontSize: 12, color: '#AFA9EC', textDecoration: 'none', fontWeight: 500 }}
              >
                Code of principles
              </a>
              <span style={{ fontSize: 9, fontWeight: 700, background: '#ef4444', color: '#fff', padding: '3px 10px', borderRadius: 20, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Beta
              </span>
            </nav>
          </div>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
