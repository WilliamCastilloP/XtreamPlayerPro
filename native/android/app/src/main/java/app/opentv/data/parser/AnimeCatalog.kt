/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.data.parser

import app.opentv.data.model.Episode
import app.opentv.data.model.Series

/**
 * Which catalogue rows belong on the anime shelf.
 *
 * Panels file this content in a category named anime (or a close label) more often than they
 * set a genre, so both are accepted. The word has to appear as itself: "animation" is not anime.
 */
object AnimeCatalog {

    private val NEEDLES = listOf(
        "anime",
        "animé",
        "animes",
        "アニメ",
        "donghua",
        "otaku",
        "crunchyroll",
    )

    fun matches(text: String?): Boolean {
        if (text.isNullOrBlank()) return false
        val folded = text.lowercase()
        return NEEDLES.any { folded.contains(it) }
    }

    fun genres(raw: String?): Set<String> =
        raw?.split(',', '|', '/')
            ?.map { it.trim().lowercase() }
            ?.filter { it.isNotEmpty() }
            ?.toSet()
            .orEmpty()

    /**
     * Series to put on the recommendations row. Shared genres with what this profile already
     * watched come first. With no overlap, the highest-rated titles in the shelf are the fallback.
     */
    fun recommend(series: List<Series>, watchedGenres: Set<String>, limit: Int): List<Series> {
        if (series.isEmpty() || limit <= 0) return emptyList()
        val scored = series.map { show ->
            val overlap = genres(show.genre).count { it in watchedGenres }
            show to overlap
        }
        val ranked = if (scored.any { it.second > 0 }) {
            scored.filter { it.second > 0 }
        } else {
            scored
        }
        return ranked
            .sortedWith(compareByDescending<Pair<Series, Int>> { it.second }.thenByDescending { it.first.rating ?: 0.0 })
            .map { it.first }
            .take(limit)
    }

    /** The episode after [currentId] in season, then episode-number order. Null at the end. */
    fun nextEpisode(currentId: Long, episodes: List<Episode>): Episode? {
        val ordered = episodes.sortedWith(compareBy({ it.season }, { it.episodeNumber }, { it.id }))
        val index = ordered.indexOfFirst { it.id == currentId }
        if (index < 0) return null
        return ordered.getOrNull(index + 1)
    }
}
