interface CheckoutInput {
  userId: string;
  email?: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

function requireStripeSecret() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  return process.env.STRIPE_SECRET_KEY;
}

async function stripeRequest(path: string, body: URLSearchParams) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireStripeSecret()}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Stripe request failed with ${response.status}: ${detail.slice(0, 500)}`);
  }

  return response.json();
}

export function billingStatus() {
  return {
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    defaultPriceConfigured: Boolean(process.env.STRIPE_PRICE_ID)
  };
}

export async function createCheckoutSession(input: CheckoutInput) {
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": "1",
    "metadata[userId]": input.userId
  });

  if (input.email) {
    body.set("customer_email", input.email);
  }

  return stripeRequest("/checkout/sessions", body);
}

export async function createBillingPortalSession(input: { customerId: string; returnUrl: string }) {
  return stripeRequest(
    "/billing_portal/sessions",
    new URLSearchParams({
      customer: input.customerId,
      return_url: input.returnUrl
    })
  );
}
