/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.data.db

/**
 * The columns a VOD catalogue refresh must not clobber: the Room id (so upsert hits the
 * existing row), the user's favourite star, and any detail fields already back-filled from
 * `get_vod_info` / TMDB. Loaded once per source before streaming the new list.
 */
data class MovieRowState(
    val streamId: String,
    val id: Long,
    val favourite: Boolean,
    val posterUrl: String?,
    val plot: String?,
    val backdropUrl: String?,
    val cast: String?,
    val director: String?,
    val genre: String?,
    val tmdbId: String?,
)

/** Same idea as [MovieRowState], keyed by the provider's series id (series have no stream URL). */
data class SeriesRowState(
    val seriesId: String,
    val id: Long,
    val favourite: Boolean,
    val posterUrl: String?,
    val plot: String?,
    val backdropUrl: String?,
    val cast: String?,
    val genre: String?,
    val tmdbId: String?,
)
