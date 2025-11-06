import { createHmac, timingSafeEqual } from "crypto";

type GoCardlessEnvironment = "live" | "sandbox";

const API_VERSION = "2015-07-06";

const API_BASE: Record<GoCardlessEnvironment, string> = {
  live: "https://api.gocardless.com",
  sandbox: "https://api-sandbox.gocardless.com",
};

const resolveEnvironment = (): GoCardlessEnvironment => {
  const value = (process.env.GOCARDLESS_ENVIRONMENT || "").toLowerCase();
  return value === "live" ? "live" : "sandbox";
};

const getAccessToken = () => {
  const token = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GOCARDLESS_ACCESS_TOKEN is not configured");
  }
  return token;
};

const request = async <T>(
  method: string,
  path: string,
  body?: Record<string, unknown> | null,
  extraHeaders: Record<string, string> = {}
): Promise<T> => {
  const environment = resolveEnvironment();
  const url = `${API_BASE[environment]}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "GoCardless-Version": API_VERSION,
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (json as any)?.error?.message ||
      (json as any)?.error ||
      response.statusText ||
      "GoCardless request failed";
    const error = new Error(message);
    (error as any).status = response.status;
    (error as any).details = json;
    throw error;
  }

  return json as T;
};

export type RedirectFlow = {
  id: string;
  redirect_url: string;
  session_token?: string;
  links?: {
    mandate?: string;
    customer?: string;
  };
};

export type SubscriptionResponse = {
  id: string;
  status: string;
  links: {
    mandate: string;
  };
};

export const createRedirectFlow = async ({
  description,
  sessionToken,
  successRedirectUrl,
  prefilledCustomer,
  metadata,
}: {
  description: string;
  sessionToken: string;
  successRedirectUrl: string;
  prefilledCustomer?: Record<string, unknown>;
  metadata?: Record<string, string>;
}) => {
  const result = await request<{ redirect_flows: RedirectFlow }>("POST", "/redirect_flows", {
    redirect_flows: {
      description,
      session_token: sessionToken,
      success_redirect_url: successRedirectUrl,
      prefilled_customer: prefilledCustomer,
      metadata,
    },
  });

  return result.redirect_flows;
};

export const completeRedirectFlow = async (flowId: string, sessionToken: string) => {
  const result = await request<{ redirect_flows: RedirectFlow }>(
    "POST",
    `/redirect_flows/${flowId}/actions/complete`,
    {
      data: {
        session_token: sessionToken,
      },
    }
  );

  return result.redirect_flows;
};

export const createSubscription = async ({
  mandateId,
  amount,
  currency,
  name,
  intervalUnit,
  interval,
  metadata,
}: {
  mandateId: string;
  amount: number;
  currency: string;
  name: string;
  intervalUnit: string;
  interval: number;
  metadata?: Record<string, string>;
}) => {
  const result = await request<{ subscriptions: SubscriptionResponse }>("POST", "/subscriptions", {
    subscriptions: {
      amount,
      currency,
      name,
      interval_unit: intervalUnit,
      interval,
      metadata,
      links: {
        mandate: mandateId,
      },
    },
  });

  return result.subscriptions;
};

export const cancelSubscription = async (subscriptionId: string) => {
  await request("POST", `/subscriptions/${subscriptionId}/actions/cancel`, {
    data: {},
  });
};

export const cancelMandate = async (mandateId: string) => {
  await request("POST", `/mandates/${mandateId}/actions/cancel`, {
    data: {},
  });
};

export const verifyWebhookSignature = (payload: string, signatureHeader: string, secret: string) => {
  if (!signatureHeader) return false;
  const match = signatureHeader.match(/sha256=([\w\d]+)/i);
  if (!match) return false;
  const received = match[1];

  const expected = createHmac("sha256", secret).update(payload, "utf8").digest("hex");

  try {
    return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
};
