/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.data.repo

import app.opentv.data.db.MovieRowState
import app.opentv.data.db.SeriesRowState
import app.opentv.data.model.Movie
import app.opentv.data.model.Series

/**
 * Re-applies on-device VOD curation onto a freshly downloaded catalogue row.
 *
 * Xtream `get_vod_streams` / `get_series` always arrive with `favourite = false` and often
 * without plot/cast. A raw Room upsert would wipe the star the user set on the detail screen
 * and any TMDB / `get_vod_info` enrichment. Live channels already merge this way in
 * [app.opentv.data.db.ChannelDao.replaceCatalogue]; movies and series did not, which is why a
 * starred film vanished from "favourites" after the next library refresh.
 */
object VodSyncMerge {

    fun movie(incoming: Movie, existing: MovieRowState?): Movie {
        if (existing == null) return incoming
        return incoming.copy(
            id = existing.id,
            favourite = existing.favourite,
            posterUrl = incoming.posterUrl ?: existing.posterUrl,
            plot = incoming.plot ?: existing.plot,
            backdropUrl = incoming.backdropUrl ?: existing.backdropUrl,
            cast = incoming.cast ?: existing.cast,
            director = incoming.director ?: existing.director,
            genre = incoming.genre ?: existing.genre,
            tmdbId = incoming.tmdbId ?: existing.tmdbId,
        )
    }

    fun series(incoming: Series, existing: SeriesRowState?): Series {
        if (existing == null) return incoming
        return incoming.copy(
            id = existing.id,
            favourite = existing.favourite,
            posterUrl = incoming.posterUrl ?: existing.posterUrl,
            plot = incoming.plot ?: existing.plot,
            backdropUrl = incoming.backdropUrl ?: existing.backdropUrl,
            cast = incoming.cast ?: existing.cast,
            genre = incoming.genre ?: existing.genre,
            tmdbId = incoming.tmdbId ?: existing.tmdbId,
        )
    }
}
