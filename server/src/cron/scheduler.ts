import cron from 'node-cron';
import { triggerAllImports } from '../services/index.js';

export function scheduleCron(): void {
    // Run every hour at minute 0
    cron.schedule('0 * * * *', async () => {
        console.log('⏰ Cron triggered: Starting hourly import...');
        try {
            await triggerAllImports();
        } catch (error) {
            console.error('❌ Cron job failed:', error);
        }
    });

    console.log('⏰ Cron scheduler started (runs every hour)');
}
