type OAuthProvider = "google" | "microsoft";

interface OAuthProfile {
  provider: OAuthProvider;
  providerId: string;
  email: string;
  name: string;
}

const providerConfig = {
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile"
  },
  microsoft: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    scope: "openid email profile offline_access"
  }
} satisfies Record<OAuthProvider, { authUrl: string; tokenUrl: string; userInfoUrl: string; scope: string }>;

export function supportedOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "microsoft";
}

export function oauthStartUrl(provider: OAuthProvider, state: string, env = process.env) {
  const config = providerConfig[provider];
  const clientId = requireProviderEnv(provider, "CLIENT_ID", env);
  const redirectUri = redirectUriFor(provider, env);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: config.scope,
    state,
    prompt: "select_account"
  });

  return `${config.authUrl}?${params.toString()}`;
}

export async function exchangeOAuthCode(provider: OAuthProvider, code: string, env = process.env): Promise<OAuthProfile> {
  const config = providerConfig[provider];
  const clientId = requireProviderEnv(provider, "CLIENT_ID", env);
  const clientSecret = requireProviderEnv(provider, "CLIENT_SECRET", env);
  const redirectUri = redirectUriFor(provider, env);
  const tokenResponse = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`${provider} token exchange failed with ${tokenResponse.status}`);
  }

  const tokenPayload = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    throw new Error(`${provider} token response did not include an access token`);
  }

  const profileResponse = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`
    }
  });

  if (!profileResponse.ok) {
    throw new Error(`${provider} profile request failed with ${profileResponse.status}`);
  }

  const profile = (await profileResponse.json()) as {
    sub?: string;
    id?: string;
    email?: string;
    preferred_username?: string;
    name?: string;
  };
  const email = profile.email ?? profile.preferred_username;

  if (!email) {
    throw new Error(`${provider} profile did not include an email`);
  }

  return {
    provider,
    providerId: profile.sub ?? profile.id ?? email,
    email,
    name: profile.name ?? email
  };
}

function redirectUriFor(provider: OAuthProvider, env: NodeJS.ProcessEnv) {
  const explicit = provider === "google" ? env.GOOGLE_OAUTH_REDIRECT_URI : env.MICROSOFT_OAUTH_REDIRECT_URI;
  if (explicit) {
    return explicit;
  }

  const baseUrl = env.PUBLIC_API_URL ?? `http://127.0.0.1:${env.PORT ?? 3001}`;
  return `${baseUrl.replace(/\/+$/, "")}/api/auth/oauth/${provider}/callback`;
}

function requireProviderEnv(provider: OAuthProvider, suffix: "CLIENT_ID" | "CLIENT_SECRET", env: NodeJS.ProcessEnv) {
  const key = provider === "google" ? `GOOGLE_OAUTH_${suffix}` : `MICROSOFT_OAUTH_${suffix}`;
  const legacyKey =
    provider === "google" && suffix === "CLIENT_ID"
      ? "GOOGLE_CLASSROOM_CLIENT_ID"
      : provider === "google" && suffix === "CLIENT_SECRET"
        ? "GOOGLE_CLASSROOM_CLIENT_SECRET"
        : undefined;
  const value = env[key] ?? (legacyKey ? env[legacyKey] : undefined);

  if (!value) {
    throw new Error(`${key} is not configured`);
  }

  return value;
}
