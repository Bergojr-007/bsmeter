import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/stripe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY
        if (!STRIPE_SECRET) {
          return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
          })
        }
        const body = await request.json()
        const { action } = body
        if (action === 'create_checkout') {
          const origin = request.headers.get('origin') || 'https://bsmeter.org'
          const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${STRIPE_SECRET}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              'mode': 'subscription',
              'payment_method_types[]': 'card',
              'line_items[0][price_data][currency]': 'usd',
              'line_items[0][price_data][product_data][name]': 'Bullshit Meter Pro',
              'line_items[0][price_data][product_data][description]': 'Unlimited fact-checks, YouTube & TikTok analysis, full history',
              'line_items[0][price_data][recurring][interval]': 'month',
              'line_items[0][price_data][unit_amount]': '499',
              'success_url': `${origin}/?pro=success`,
