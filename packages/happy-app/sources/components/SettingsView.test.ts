import { describe, expect, it } from 'vitest';

describe('settings view visibility', () => {
    it('hides the hero and support us sections', async () => {
        const { settingsViewVisibility } = await import('./settingsVisibility');

        expect(settingsViewVisibility).toEqual({
            showHero: false,
            showSupportUs: false,
        });
    });
});
