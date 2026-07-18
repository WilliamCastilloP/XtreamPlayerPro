export type Playlist = {
  id: string;
  name: string;
  serverUrl: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt?: number;
};

export type PlaylistDraft = {
  name: string;
  serverUrl: string;
  username: string;
  password: string;
};
