export type XtreamCredentials = {
  serverUrl: string;
  username: string;
  password: string;
};

export type XtreamUserInfo = {
  username?: string;
  auth?: number | string;
  status?: string;
  exp_date?: string;
  is_trial?: string;
  active_cons?: string;
  created_at?: string;
  max_connections?: string;
  allowed_output_formats?: string[];
};

export type XtreamServerInfo = {
  url?: string;
  port?: string;
  https_port?: string;
  server_protocol?: string;
  timezone?: string;
};

export type XtreamAuthResponse = {
  user_info?: XtreamUserInfo;
  server_info?: XtreamServerInfo;
};

export type XtreamCategory = {
  category_id: string;
  category_name: string;
  parent_id?: number;
};

export type LiveStream = {
  num?: number;
  name: string;
  title?: string;
  stream_type?: string;
  stream_id: number;
  stream_icon?: string;
  epg_channel_id?: string | null;
  category_id?: string;
  tv_archive?: number;
  tv_archive_duration?: number;
};

export type VodStream = {
  num?: number;
  name: string;
  /** Cleaner display name when the panel provides it */
  title?: string;
  stream_type?: string;
  stream_id: number;
  stream_icon?: string;
  rating?: string;
  rating_5based?: number;
  category_id?: string;
  container_extension?: string;
  added?: string;
  plot?: string;
  /** Comma-separated string or array from the panel */
  genre?: string | string[];
};

export type SeriesItem = {
  num?: number;
  name: string;
  /** Cleaner display name when the panel provides it */
  title?: string;
  series_id: number;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  /** Comma-separated string or array from the panel */
  genre?: string | string[];
  releaseDate?: string;
  rating?: string;
  rating_5based?: number;
  category_id?: string;
  last_modified?: string;
};

export type VodInfo = {
  info?: {
    name?: string;
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string | string[];
    releasedate?: string;
    rating?: string;
    duration?: string;
    movie_image?: string;
    youtube_trailer?: string;
  };
  movie_data?: {
    stream_id?: number;
    name?: string;
    container_extension?: string;
  };
};

export type SeriesEpisode = {
  id: string;
  episode_num: number;
  title?: string;
  container_extension?: string;
  info?: {
    movie_image?: string;
    plot?: string;
    duration?: string;
    rating?: number | string;
  };
  custom_sid?: string;
  added?: string;
  season?: number;
  direct_source?: string;
};

export type SeriesInfo = {
  seasons?: Array<{
    season_number?: number;
    name?: string;
    cover?: string;
    episode_count?: number;
  }>;
  info?: {
    name?: string;
    cover?: string;
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string | string[];
    releaseDate?: string;
    rating?: string;
  };
  episodes?: Record<string, SeriesEpisode[]>;
};

export type ShortEpgListing = {
  id?: string;
  epg_id?: string;
  title?: string;
  lang?: string;
  start?: string;
  end?: string;
  description?: string;
  channel_id?: string;
  start_timestamp?: number;
  stop_timestamp?: number;
};

export type ShortEpgResponse = {
  epg_listings?: ShortEpgListing[];
};

export type StreamKind = "live" | "movie" | "series";
