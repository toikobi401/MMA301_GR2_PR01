export type FriendsTab = 'friends' | 'requests' | 'search';

export const friendsTabs: { id: FriendsTab; label: string }[] = [
  { id: 'friends', label: 'Bạn bè' },
  { id: 'requests', label: 'Lời mời' },
  { id: 'search', label: 'Tìm người' },
];
