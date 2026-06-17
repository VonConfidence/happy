import { describe, expect, it } from 'vitest';
import { profileDefaults, profileParse } from './profile';

describe('profileParse', () => {
    it('accepts nullable GitHub fields returned by the server', () => {
        const result = profileParse({
            id: 'user-1',
            timestamp: 123,
            firstName: 'Test',
            lastName: null,
            avatar: null,
            github: {
                id: 1,
                login: 'octocat',
                name: null,
                avatar_url: 'https://example.com/avatar.png',
                email: null,
                bio: null,
            },
            connectedServices: ['github'],
        });

        expect(result.github).toEqual({
            id: 1,
            login: 'octocat',
            name: null,
            avatar_url: 'https://example.com/avatar.png',
            email: null,
            bio: null,
        });
    });

    it('accepts avatar objects missing optional image metadata', () => {
        const result = profileParse({
            id: 'user-1',
            timestamp: 123,
            firstName: null,
            lastName: null,
            avatar: {
                path: 'avatars/user-1.png',
                url: 'https://example.com/avatars/user-1.png',
            },
            github: null,
            connectedServices: [],
        });

        expect(result.avatar).toEqual({
            path: 'avatars/user-1.png',
            url: 'https://example.com/avatars/user-1.png',
            width: undefined,
            height: undefined,
            thumbhash: undefined,
        });
    });

    it('drops only an invalid nested profile block instead of resetting the whole profile', () => {
        const result = profileParse({
            id: 'user-1',
            timestamp: 123,
            firstName: 'Test',
            lastName: 'User',
            avatar: null,
            github: {
                id: 'bad-id',
                login: 'octocat',
            },
            connectedServices: ['github'],
        });

        expect(result).toEqual({
            ...profileDefaults,
            id: 'user-1',
            timestamp: 123,
            firstName: 'Test',
            lastName: 'User',
            github: null,
            connectedServices: ['github'],
        });
    });
});
