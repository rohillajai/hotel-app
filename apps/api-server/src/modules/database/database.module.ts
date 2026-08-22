import { Module, Global } from '@nestjs/common';
import { db } from '@hotel-app/db';

export const PRISMA_TOKEN = 'PRISMA_CLIENT';

/**
 * Global DatabaseModule — provides the PrismaClient singleton to all modules.
 * Import once in AppModule; inject with @Inject(PRISMA_TOKEN) elsewhere.
 */
@Global()
@Module({
  providers: [
    {
      provide: PRISMA_TOKEN,
      useValue: db,
    },
  ],
  exports: [PRISMA_TOKEN],
})
export class DatabaseModule {}
