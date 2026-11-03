/**
 * Firebase Cloud Messaging (FCM) HTTP v1 Client for Cloudflare Workers
 * Uses native Web Crypto API (SubtleCrypto) to sign Google Service Account JWTs.
 * Zero external npm dependencies required!
 */

interface FCMNotificationPayload {
  token: string;
  title: string;
  body: string;
  symbol: string;
  targetPrice: number;
  triggeredPrice: number;
  condition: string;
  priceType: string;
  alertId: string;
  url?: string;
}

// In-memory token cache to minimize OAuth roundtrips
let cachedOAuthToken: { token: string; expiresAt: number } | null = null;

/**
 * Base64URL encoder
 */
function base64UrlEncode(data: string | Uint8Array): string {
  let base64 = '';
  if (typeof data === 'string') {
    const bytes = new TextEncoder().encode(data);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  } else {
    let binary = '';
    for (let i = 0; i < data.byteLength; i++) {
      binary += String.fromCharCode(data[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Parses PEM formatted PKCS#8 private key to ArrayBuffer
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Replace escaped \n with actual newlines
  const cleanPem = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  const binaryString = atob(cleanPem);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates an OAuth2 access token for Google Firebase Messaging API using Service Account
 */
async function getGoogleOAuth2AccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if valid for at least 5 more minutes
  if (cachedOAuthToken && cachedOAuthToken.expiresAt > now + 300) {
    return cachedOAuthToken.token;
  }

  // 1. JWT Header
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // 2. JWT Claim Set
  const claimSet = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, // 1 hour
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

  // 3. Import RS256 Private Key
  const binaryKey = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['sign']
  );

  // 4. Sign JWT
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  const signedJwt = `${signatureInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  // 5. Exchange JWT for Google OAuth2 Access Token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Failed to obtain Google OAuth2 token: ${tokenResponse.status} ${errorBody}`);
  }

  const tokenData = (await tokenResponse.json()) as { access_token: string; expires_in: number };
  cachedOAuthToken = {
    token: tokenData.access_token,
    expiresAt: now + (tokenData.expires_in || 3600),
  };

  return tokenData.access_token;
}

/**
 * Sends a high-priority FCM HTTP v1 push notification to an Android / PWA device
 */
export async function sendFcmNotification(
  payload: FCMNotificationPayload,
  projectId: string,
  clientEmail: string,
  privateKey: string
): Promise<{ success: boolean; isUnregisteredToken: boolean; error?: string }> {
  try {
    const accessToken = await getGoogleOAuth2AccessToken(clientEmail, privateKey);
    const targetUrl = payload.url || `/?symbol=${payload.symbol}`;

    const fcmMessage = {
      message: {
        token: payload.token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          symbol: payload.symbol,
          targetPrice: String(payload.targetPrice),
          triggeredPrice: String(payload.triggeredPrice),
          condition: payload.condition,
          priceType: payload.priceType,
          alertId: payload.alertId,
          timestamp: String(Date.now()),
          url: targetUrl,
        },
        webpush: {
          headers: {
            Urgency: 'high',
            TTL: '86400', // 24 hours
          },
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: `alert-${payload.alertId}-${Math.floor(Date.now() / 60000)}`, // Groups rapid alerts
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 400],
            data: {
              url: targetUrl,
              symbol: payload.symbol,
              alertId: payload.alertId,
            },
            actions: [
              {
                action: 'open_chart',
                title: `Open ${payload.symbol} Chart`,
              },
            ],
          },
          fcm_options: {
            link: targetUrl,
          },
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            click_action: targetUrl,
            channel_id: 'binance_price_alerts',
          },
        },
      },
    };

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmMessage),
      }
    );

    if (response.ok) {
      return { success: true, isUnregisteredToken: false };
    }

    const errorJson = (await response.json().catch(() => ({}))) as any;
    const errorCode = errorJson?.error?.details?.[0]?.errorCode || errorJson?.error?.status || '';

    // Detect if device token is expired/invalid (UNREGISTERED or NOT_FOUND)
    const isUnregistered =
      response.status === 404 ||
      errorCode === 'UNREGISTERED' ||
      errorCode === 'NOT_FOUND' ||
      errorJson?.error?.message?.includes('not a valid FCM registration token');

    return {
      success: false,
      isUnregisteredToken: isUnregistered,
      error: errorJson?.error?.message || `HTTP ${response.status}`,
    };
  } catch (err: any) {
    return {
      success: false,
      isUnregisteredToken: false,
      error: err.message || 'Unknown FCM error',
    };
  }
}
