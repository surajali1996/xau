import { Env, DbAlert, DbPushSubscription } from './types';
import { fetchBinanceFuturesPrices, getLatestClosedCandle } from './binance';
import { sendFcmNotification } from './fcm';

export interface MonitorResult {
  alertsChecked: number;
  alertsTriggered: number;
  pushNotificationsSent: number;
  errors: string[];
}

/**
 * Evaluates all active alerts in D1 against real-time Binance USD-M Futures prices.
 * Runs once per minute on Cloudflare Cron.
 */
export async function runAlertMonitorCycle(env: Env): Promise<MonitorResult> {
  const result: MonitorResult = {
    alertsChecked: 0,
    alertsTriggered: 0,
    pushNotificationsSent: 0,
    errors: [],
  };

  try {
    // 1. Fetch all active alerts from D1
    const { results: activeAlerts } = await env.DB.prepare(
      `SELECT * FROM alerts WHERE status = 'active'`
    ).all<DbAlert>();

    if (!activeAlerts || activeAlerts.length === 0) {
      return result;
    }

    result.alertsChecked = activeAlerts.length;

    // 2. Collect unique symbols
    const symbols = new Set<string>();
    for (const alert of activeAlerts) {
      symbols.add(alert.symbol.toUpperCase());
    }

    // 3. Batch fetch prices from Binance Futures public endpoints
    const marketPrices = await fetchBinanceFuturesPrices(symbols);

    // Cache closed candles for candle-close conditions to avoid repeating kline requests
    const closedCandleCache = new Map<string, number>();

    // 4. Evaluate each alert
    for (const alert of activeAlerts) {
      try {
        const symbolPrices = marketPrices.get(alert.symbol.toUpperCase());
        if (!symbolPrices) continue;

        // Select the price source requested by the alert: 'last' | 'mark' | 'index'
        let currentPrice: number | undefined;
        if (alert.price_type === 'mark') {
          currentPrice = symbolPrices.markPrice || symbolPrices.lastPrice;
        } else if (alert.price_type === 'index') {
          currentPrice = symbolPrices.indexPrice || symbolPrices.lastPrice;
        } else {
          currentPrice = symbolPrices.lastPrice;
        }

        if (currentPrice === undefined || isNaN(currentPrice) || currentPrice <= 0) {
          continue;
        }

        const targetPrice = alert.price;
        const prevPrice = alert.last_checked_price !== null && alert.last_checked_price !== undefined
          ? alert.last_checked_price
          : alert.created_price;

        let isTriggered = false;
        let triggerMessage = '';

        // 5. Evaluate conditions
        switch (alert.condition) {
          case 'crossing_up':
            if (prevPrice < targetPrice && currentPrice >= targetPrice) {
              isTriggered = true;
              triggerMessage = `${alert.symbol} crossed ABOVE ${targetPrice.toLocaleString()} USDT (Observed: ${currentPrice.toLocaleString()})`;
            }
            break;

          case 'crossing_down':
            if (prevPrice > targetPrice && currentPrice <= targetPrice) {
              isTriggered = true;
              triggerMessage = `${alert.symbol} crossed BELOW ${targetPrice.toLocaleString()} USDT (Observed: ${currentPrice.toLocaleString()})`;
            }
            break;

          case 'greater_than':
            if (currentPrice >= targetPrice) {
              isTriggered = true;
              triggerMessage = `${alert.symbol} is GREATER than ${targetPrice.toLocaleString()} USDT (Current: ${currentPrice.toLocaleString()})`;
            }
            break;

          case 'less_than':
            if (currentPrice <= targetPrice) {
              isTriggered = true;
              triggerMessage = `${alert.symbol} is LESS than ${targetPrice.toLocaleString()} USDT (Current: ${currentPrice.toLocaleString()})`;
            }
            break;

          case 'price_reach':
            const crossed =
              (prevPrice < targetPrice && currentPrice >= targetPrice) ||
              (prevPrice > targetPrice && currentPrice <= targetPrice);
            const closeDelta = Math.abs(currentPrice - targetPrice) / targetPrice <= 0.0005; // 0.05% proximity
            if (crossed || closeDelta) {
              isTriggered = true;
              triggerMessage = `${alert.symbol} REACHED ${targetPrice.toLocaleString()} USDT (Current: ${currentPrice.toLocaleString()})`;
            }
            break;

          case 'candle_close_above': {
            const cacheKey = `${alert.symbol}_${alert.timeframe || '15m'}`;
            let candleClose = closedCandleCache.get(cacheKey);
            if (candleClose === undefined) {
              const closedCandle = await getLatestClosedCandle(alert.symbol, alert.timeframe || '15m');
              if (closedCandle && closedCandle.isClosed) {
                candleClose = closedCandle.closePrice;
                closedCandleCache.set(cacheKey, candleClose);
              }
            }
            if (candleClose !== undefined && candleClose >= targetPrice) {
              isTriggered = true;
              triggerMessage = `${alert.symbol} ${alert.timeframe || '15m'} candle CLOSED ABOVE ${targetPrice.toLocaleString()} USDT (${candleClose.toLocaleString()})`;
            }
            break;
          }

          case 'candle_close_below': {
            const cacheKey = `${alert.symbol}_${alert.timeframe || '15m'}`;
            let candleClose = closedCandleCache.get(cacheKey);
            if (candleClose === undefined) {
              const closedCandle = await getLatestClosedCandle(alert.symbol, alert.timeframe || '15m');
              if (closedCandle && closedCandle.isClosed) {
                candleClose = closedCandle.closePrice;
                closedCandleCache.set(cacheKey, candleClose);
              }
            }
            if (candleClose !== undefined && candleClose <= targetPrice) {
              isTriggered = true;
              triggerMessage = `${alert.symbol} ${alert.timeframe || '15m'} candle CLOSED BELOW ${targetPrice.toLocaleString()} USDT (${candleClose.toLocaleString()})`;
            }
            break;
          }
        }

        const now = Date.now();

        if (isTriggered) {
          result.alertsTriggered++;

          // Determine new status for alert
          const isRepeatable = alert.repeat !== 'once';
          const newStatus = isRepeatable ? 'active' : 'triggered';

          // Update alert state in D1
          await env.DB.prepare(
            `UPDATE alerts 
             SET status = ?, triggered = 1, triggered_at = ?, last_checked_price = ?, updated_at = ?
             WHERE id = ?`
          )
            .bind(newStatus, now, currentPrice, now, alert.id)
            .run();

          // Log trigger event in alert_events table
          const eventId = `event_${now}_${Math.random().toString(36).substring(2, 7)}`;
          await env.DB.prepare(
            `INSERT INTO alert_events (id, alert_id, user_id, symbol, condition, target_price, triggered_price, price_type, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              eventId,
              alert.id,
              alert.user_id,
              alert.symbol,
              alert.condition,
              targetPrice,
              currentPrice,
              alert.price_type,
              triggerMessage,
              now
            )
            .run();

          // Send FCM Push Notification if push is enabled
          if (
            alert.push_enabled !== 0 &&
            env.FIREBASE_PROJECT_ID &&
            env.FIREBASE_CLIENT_EMAIL &&
            env.FIREBASE_PRIVATE_KEY
          ) {
            // Fetch user's active push subscriptions
            const { results: subscriptions } = await env.DB.prepare(
              `SELECT * FROM push_subscriptions WHERE user_id = ? AND is_active = 1`
            )
              .bind(alert.user_id)
              .all<DbPushSubscription>();

            if (subscriptions && subscriptions.length > 0) {
              for (const sub of subscriptions) {
                const pushRes = await sendFcmNotification(
                  {
                    token: sub.fcm_token,
                    title: `${alert.symbol} — Price Alert Triggered!`,
                    body: triggerMessage,
                    symbol: alert.symbol,
                    targetPrice,
                    triggeredPrice: currentPrice,
                    condition: alert.condition,
                    priceType: alert.price_type,
                    alertId: alert.id,
                    url: `/?symbol=${alert.symbol}`,
                  },
                  env.FIREBASE_PROJECT_ID,
                  env.FIREBASE_CLIENT_EMAIL,
                  env.FIREBASE_PRIVATE_KEY
                );

                if (pushRes.success) {
                  result.pushNotificationsSent++;
                } else if (pushRes.isUnregisteredToken) {
                  // Clean up invalid or expired token
                  await env.DB.prepare(
                    `UPDATE push_subscriptions SET is_active = 0, updated_at = ? WHERE id = ?`
                  )
                    .bind(now, sub.id)
                    .run();
                } else if (pushRes.error) {
                  result.errors.push(`Push failed for ${alert.id}: ${pushRes.error}`);
                }
              }
            }
          }
        } else {
          // Update last_checked_price so crossing is tracked on next execution
          await env.DB.prepare(
            `UPDATE alerts SET last_checked_price = ?, updated_at = ? WHERE id = ?`
          )
            .bind(currentPrice, now, alert.id)
            .run();
        }
      } catch (alertErr: any) {
        result.errors.push(`Error checking alert ${alert.id}: ${alertErr.message}`);
      }
    }
  } catch (cycleErr: any) {
    result.errors.push(`Fatal cycle error: ${cycleErr.message}`);
  }

  return result;
}
