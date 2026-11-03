import { Env, DbAlert, ScheduledEvent, ExecutionContext } from './types';
import { runAlertMonitorCycle } from './monitor';
import { sendFcmNotification } from './fcm';

/**
 * Returns CORS headers matching origin
 */
function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: any, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export default {
  /**
   * Cloudflare Cron Trigger (Runs once every minute: "* * * * *")
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runAlertMonitorCycle(env).then((res) => {
        console.log(`Cron Cycle completed: ${res.alertsChecked} checked, ${res.alertsTriggered} triggered, ${res.pushNotificationsSent} pushes sent.`);
        if (res.errors.length > 0) {
          console.warn('Cron Cycle errors:', res.errors);
        }
      })
    );
  },

  /**
   * REST API Router for Frontend PWA
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const userId = request.headers.get('X-User-Id') || 'anonymous_user';

    try {
      // 1. Health check
      if (path === '/api/health') {
        return jsonResponse(
          {
            status: 'ok',
            service: 'Binance Futures Alert Engine',
            version: '2.0.0',
            cron: '* * * * *',
            timestamp: Date.now(),
          },
          200,
          corsHeaders
        );
      }

      // 2. Manual trigger monitor cycle (useful for instant testing or webhook)
      if (path === '/api/cron/trigger' && request.method === 'POST') {
        const cycleResult = await runAlertMonitorCycle(env);
        return jsonResponse(cycleResult, 200, corsHeaders);
      }

      // 3. Register user (ensure user exists in D1)
      const now = Date.now();
      await env.DB.prepare(
        `INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?, ?, ?)`
      )
        .bind(userId, now, now)
        .run();

      // 4. Alerts API
      if (path === '/api/alerts') {
        // List alerts for user
        if (request.method === 'GET') {
          const { results } = await env.DB.prepare(
            `SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC`
          )
            .bind(userId)
            .all<DbAlert>();

          return jsonResponse({ alerts: results || [] }, 200, corsHeaders);
        }

        // Create new alert
        if (request.method === 'POST') {
          const body = (await request.json()) as any;
          if (!body.symbol || !body.price || !body.condition) {
            return jsonResponse({ error: 'Missing required fields: symbol, price, condition' }, 400, corsHeaders);
          }

          const alertId = body.id || `alert_${now}_${Math.random().toString(36).substring(2, 7)}`;
          const createdPrice = Number(body.createdPrice || body.price);
          const price = Number(body.price);

          await env.DB.prepare(
            `INSERT INTO alerts (
              id, user_id, symbol, condition, price, created_price, last_checked_price,
              status, repeat, price_type, timeframe, name, note, sound, vibrate,
              push_enabled, triggered, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              alertId,
              userId,
              body.symbol.toUpperCase(),
              body.condition,
              price,
              createdPrice,
              createdPrice,
              body.status || 'active',
              body.repeat || 'once',
              body.priceType || 'last',
              body.timeframe || '15m',
              body.name || null,
              body.note || null,
              body.sound || 'price_reach',
              body.vibrate !== false ? 1 : 0,
              body.pushNotification !== false && body.push_enabled !== 0 ? 1 : 0,
              0,
              now,
              now
            )
            .run();

          return jsonResponse({ success: true, alertId }, 201, corsHeaders);
        }
      }

      // 5. Update or Delete Alert by ID: /api/alerts/:id
      const alertIdMatch = path.match(/^\/api\/alerts\/([^/]+)$/);
      if (alertIdMatch) {
        const id = alertIdMatch[1];

        if (request.method === 'PUT') {
          const body = (await request.json()) as any;
          await env.DB.prepare(
            `UPDATE alerts 
             SET price = COALESCE(?, price),
                 condition = COALESCE(?, condition),
                 status = COALESCE(?, status),
                 repeat = COALESCE(?, repeat),
                 name = COALESCE(?, name),
                 note = COALESCE(?, note),
                 push_enabled = COALESCE(?, push_enabled),
                 updated_at = ?
             WHERE id = ? AND user_id = ?`
          )
            .bind(
              body.price !== undefined ? Number(body.price) : null,
              body.condition || null,
              body.status || null,
              body.repeat || null,
              body.name || null,
              body.note || null,
              body.push_enabled !== undefined ? (body.push_enabled ? 1 : 0) : null,
              now,
              id,
              userId
            )
            .run();

          return jsonResponse({ success: true }, 200, corsHeaders);
        }

        if (request.method === 'DELETE') {
          await env.DB.prepare(`DELETE FROM alerts WHERE id = ? AND user_id = ?`)
            .bind(id, userId)
            .run();
          return jsonResponse({ success: true }, 200, corsHeaders);
        }
      }

      // 6. Push Subscription Registration: /api/push/register
      if (path === '/api/push/register' && request.method === 'POST') {
        const body = (await request.json()) as any;
        if (!body.fcmToken) {
          return jsonResponse({ error: 'Missing fcmToken' }, 400, corsHeaders);
        }

        const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await env.DB.prepare(
          `INSERT INTO push_subscriptions (id, user_id, fcm_token, device_name, user_agent, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(fcm_token) DO UPDATE SET 
             user_id = excluded.user_id,
             is_active = 1,
             updated_at = excluded.updated_at`
        )
          .bind(
            subId,
            userId,
            body.fcmToken,
            body.deviceName || 'Android Device',
            request.headers.get('User-Agent') || null,
            now,
            now
          )
          .run();

        return jsonResponse({ success: true, registered: true }, 200, corsHeaders);
      }

      // 7. Unregister Push Device: /api/push/unregister
      if (path === '/api/push/unregister' && request.method === 'POST') {
        const body = (await request.json()) as any;
        if (body.fcmToken) {
          await env.DB.prepare(`UPDATE push_subscriptions SET is_active = 0, updated_at = ? WHERE fcm_token = ?`)
            .bind(now, body.fcmToken)
            .run();
        }
        return jsonResponse({ success: true, unregistered: true }, 200, corsHeaders);
      }

      // 8. Send Test Notification to Android Phone: /api/push/test
      if (path === '/api/push/test' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as any;
        const targetToken = body.fcmToken;

        if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
          return jsonResponse(
            {
              error: 'Firebase service account credentials not configured in Cloudflare Worker secrets',
              configured: false,
            },
            500,
            corsHeaders
          );
        }

        // If specific token provided, test directly; otherwise fetch user's active tokens
        const tokensToTest: string[] = [];
        if (targetToken) {
          tokensToTest.push(targetToken);
        } else {
          const { results } = await env.DB.prepare(
            `SELECT fcm_token FROM push_subscriptions WHERE user_id = ? AND is_active = 1`
          )
            .bind(userId)
            .all<{ fcm_token: string }>();

          if (results) {
            tokensToTest.push(...results.map((r: any) => r.fcm_token));
          }
        }

        if (tokensToTest.length === 0) {
          return jsonResponse(
            { error: 'No active registered push device found for this user', sentCount: 0 },
            404,
            corsHeaders
          );
        }

        let sent = 0;
        const sendErrors: string[] = [];

        for (const token of tokensToTest) {
          const pushRes = await sendFcmNotification(
            {
              token,
              title: 'BTCUSDT — Test Alert Triggered',
              body: 'Test alert from Cloudflare Worker! Background notifications on Android are functional.',
              symbol: 'BTCUSDT',
              targetPrice: 100000,
              triggeredPrice: 100050,
              condition: 'crossing_up',
              priceType: 'last',
              alertId: 'test_alert',
              url: '/?symbol=BTCUSDT',
            },
            env.FIREBASE_PROJECT_ID,
            env.FIREBASE_CLIENT_EMAIL,
            env.FIREBASE_PRIVATE_KEY
          );

          if (pushRes.success) {
            sent++;
          } else {
            sendErrors.push(pushRes.error || 'Failed to send');
          }
        }

        return jsonResponse(
          {
            success: sent > 0,
            sentCount: sent,
            errors: sendErrors,
          },
          200,
          corsHeaders
        );
      }

      // 9. Fetch Trigger History: /api/alerts/history
      if (path === '/api/alerts/history' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT * FROM alert_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
        )
          .bind(userId)
          .all();

        return jsonResponse({ history: results || [] }, 200, corsHeaders);
      }

      // 10. Device Settings API: /api/settings
      if (path === '/api/settings') {
        if (request.method === 'GET') {
          const row = await env.DB.prepare(`SELECT * FROM device_settings WHERE user_id = ?`)
            .bind(userId)
            .first();
          return jsonResponse({ settings: row || null }, 200, corsHeaders);
        }

        if (request.method === 'POST') {
          const body = (await request.json()) as any;
          await env.DB.prepare(
            `INSERT INTO device_settings (user_id, push_enabled, sound_enabled, vibration_enabled, volume, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               push_enabled = excluded.push_enabled,
               sound_enabled = excluded.sound_enabled,
               vibration_enabled = excluded.vibration_enabled,
               volume = excluded.volume,
               updated_at = excluded.updated_at`
          )
            .bind(
              userId,
              body.push_enabled !== false ? 1 : 0,
              body.sound_enabled !== false ? 1 : 0,
              body.vibration_enabled !== false ? 1 : 0,
              body.volume !== undefined ? Number(body.volume) : 0.8,
              now
            )
            .run();
          return jsonResponse({ success: true }, 200, corsHeaders);
        }
      }

      return jsonResponse({ error: 'Endpoint not found' }, 404, corsHeaders);
    } catch (err: any) {
      console.error('API Error:', err);
      return jsonResponse({ error: err.message || 'Internal server error' }, 500, corsHeaders);
    }
  },
};
