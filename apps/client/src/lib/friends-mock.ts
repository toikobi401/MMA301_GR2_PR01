import type { Friend } from '@app/shared';

export type SearchPerson = {
  userId: string;
  displayName: string;
};

export type FriendsTab = 'friends' | 'requests' | 'search';

export const mockPeople: SearchPerson[] = [
  { userId: 'mock-user-ada', displayName: 'Ada' },
  { userId: 'mock-user-boris', displayName: 'Boris' },
  { userId: 'mock-user-cleo', displayName: 'Cleo' },
  { userId: 'mock-user-diego', displayName: 'Diego' },
  { userId: 'mock-user-elena', displayName: 'Elena' },
  { userId: 'mock-user-felix', displayName: 'Felix' },
  { userId: 'mock-user-greta', displayName: 'Greta' },
  { userId: 'mock-user-hugo', displayName: 'Hugo' },
  { userId: 'mock-user-iris', displayName: 'Iris' },
  { userId: 'mock-user-jonas', displayName: 'Jonas' },
  { userId: 'mock-user-kira', displayName: 'Kira' },
  { userId: 'mock-user-luca', displayName: 'Luca' },
  { userId: 'mock-user-marta', displayName: 'Marta' },
  { userId: 'mock-user-nikolai', displayName: 'Nikolai' },
];

export const initialFriends: Friend[] = [
  {
    userId: 'mock-friend-boris',
    displayName: 'Boris',
    status: 'accepted',
    outgoing: true,
    online: true,
    createdAt: '2026-10-01T12:00:00.000Z',
  },
  {
    userId: 'mock-friend-cleo',
    displayName: 'Cleo',
    status: 'accepted',
    outgoing: false,
    online: false,
    createdAt: '2026-09-12T12:00:00.000Z',
  },
  {
    userId: 'mock-friend-iris',
    displayName: 'Iris',
    status: 'pending',
    outgoing: false,
    online: true,
    createdAt: '2026-10-14T12:00:00.000Z',
  },
  {
    userId: 'mock-friend-jonas',
    displayName: 'Jonas',
    status: 'pending',
    outgoing: true,
    online: false,
    createdAt: '2026-10-13T12:00:00.000Z',
  },
];

export const friendsTabs: { id: FriendsTab; label: string }[] = [
  { id: 'friends', label: 'Bạn bè' },
  { id: 'requests', label: 'Lời mời' },
  { id: 'search', label: 'Tìm người' },
];
