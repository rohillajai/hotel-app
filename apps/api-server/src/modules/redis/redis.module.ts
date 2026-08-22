import { Module, Global } from '@nestjs/common';
import Redis from 'ioredis';
import { loadConfig } from '@hotel-app/config';

export const REDIS_TOKEN = 'REDIS_CLIENT';

/**
 * Global RedisModule — provides a shared ioredis client to all modules.
 * Handles reconnection automatically.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_TOKEN,
      useFactory: () => {
        const config = loadConfig();
        const client = new Redis(config.REDIS_URL, {
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });

        client.on('error', (err) => {
          console.error('[redis] Connection error:', err.message);
        });

        client.on('connect', () => {
          console.warn('[redis] Connected');
        });

        return client;
      },
    },
  ],
  exports: [REDIS_TOKEN],
})
export class RedisModule {}
