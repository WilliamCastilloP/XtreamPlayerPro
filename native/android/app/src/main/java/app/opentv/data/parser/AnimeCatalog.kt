/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.data.parser

import app.opentv.data.model.Category
import app.opentv.data.model.Channel
import app.opentv.data.model.Episode
import app.opentv.data.model.Movie
import app.opentv.data.model.Series
import app.opentv.data.model.StreamKind

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
        "manga",
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

    /**
     * Groups an already-filtered anime catalogue into the shelves the tab can open.
     * Categories become facets only when the category name itself is anime, so a one-off title
     * inside "Comedia" stays searchable without turning that whole category into an anime one.
     */
    fun build(
        movies: List<Movie>,
        series: List<Series>,
        channels: List<Channel>,
        categories: List<Category>,
        watchedGenres: Set<String>,
    ): AnimeIndex {
        val names = categories.associateBy { Triple(it.sourceId, it.id, it.kind) }
        val movieCategories = facetsFor(AnimeKind.MOVIE, movies.map { it.sourceId to it.categoryId }, names)
        val seriesCategories = facetsFor(AnimeKind.SERIES, series.map { it.sourceId to it.categoryId }, names)
        val liveCategories = facetsFor(AnimeKind.LIVE, channels.map { it.sourceId to it.categoryId }, names)
        val years = yearFacets(movies, series)
        val genres = genreFacets(movies, series)
        val recommended = recommend(series, watchedGenres, 6)
        val movieSlides = movies.sortedByDescending { it.rating ?: 0.0 }.take(4)
        val slides = (recommended.map { AnimeSlide.SeriesSlide(it) } + movieSlides.map { AnimeSlide.MovieSlide(it) })
            .take(8)
        return AnimeIndex(
            movies = movies,
            series = series,
            channels = channels,
            liveCategories = liveCategories,
            movieCategories = movieCategories,
            seriesCategories = seriesCategories,
            years = years,
            genres = genres,
            slides = slides,
            recommended = recommended,
        )
    }

    /** Titles, channels and whole anime categories whose name contains [query]. Blank under 2 letters. */
    fun search(index: AnimeIndex, query: String): AnimeHits {
        val q = query.trim().lowercase()
        if (q.length < 2) return AnimeHits.EMPTY
        val categories = index.liveCategories + index.movieCategories + index.seriesCategories
        val categoryHit = categories.filter { it.label.lowercase().contains(q) }.map { it.key }.toSet()
        return AnimeHits(
            channels = index.channels.filter {
                categoryKey(it.sourceId, it.categoryId, AnimeKind.LIVE) in categoryHit ||
                    it.displayName.lowercase().contains(q) || it.name.lowercase().contains(q)
            },
            movies = index.movies.filter {
                categoryKey(it.sourceId, it.categoryId, AnimeKind.MOVIE) in categoryHit ||
                    it.name.lowercase().contains(q) || it.genre.orEmpty().lowercase().contains(q)
            },
            series = index.series.filter {
                categoryKey(it.sourceId, it.categoryId, AnimeKind.SERIES) in categoryHit ||
                    it.name.lowercase().contains(q) || it.genre.orEmpty().lowercase().contains(q)
            },
        )
    }

    fun categoryKey(sourceId: Long, categoryId: String?, kind: AnimeKind): String? =
        categoryId?.takeIf { it.isNotBlank() }?.let { "$kind:$sourceId:$it" }

    /** The episode after [currentId] in season, then episode-number order. Null at the end. */
    fun nextEpisode(currentId: Long, episodes: List<Episode>): Episode? {
        val ordered = episodes.sortedWith(compareBy({ it.season }, { it.episodeNumber }, { it.id }))
        val index = ordered.indexOfFirst { it.id == currentId }
        if (index < 0) return null
        return ordered.getOrNull(index + 1)
    }

    private fun facetsFor(
        kind: AnimeKind,
        membership: List<Pair<Long, String?>>,
        names: Map<Triple<Long, String, StreamKind>, Category>,
    ): List<AnimeFacet> {
        val streamKind = when (kind) {
            AnimeKind.LIVE -> StreamKind.LIVE
            AnimeKind.MOVIE -> StreamKind.MOVIE
            AnimeKind.SERIES -> StreamKind.SERIES
        }
        val counts = LinkedHashMap<String, Int>()
        val labels = LinkedHashMap<String, String>()
        for ((sourceId, categoryId) in membership) {
            val key = categoryKey(sourceId, categoryId, kind) ?: continue
            val category = names[Triple(sourceId, categoryId!!, streamKind)] ?: continue
            if (!matches(category.name)) continue
            counts[key] = (counts[key] ?: 0) + 1
            labels.putIfAbsent(key, category.name.trim())
        }
        return counts.entries
            .map { AnimeFacet(kind, it.key, labels.getValue(it.key), it.value) }
            .sortedBy { it.label.lowercase() }
    }

    private fun yearFacets(movies: List<Movie>, series: List<Series>): List<AnimeFacet> {
        val counts = LinkedHashMap<Int, Int>()
        for (movie in movies) {
            val year = movie.year?.takeIf { it >= 1900 } ?: continue
            counts[year] = (counts[year] ?: 0) + 1
        }
        for (show in series) {
            val year = show.listedYear?.takeIf { it >= 1900 } ?: continue
            counts[year] = (counts[year] ?: 0) + 1
        }
        return counts.entries
            .sortedByDescending { it.key }
            .map { AnimeFacet(AnimeKind.MOVIE, "year:${it.key}", it.key.toString(), it.value) }
    }

    private fun genreFacets(movies: List<Movie>, series: List<Series>): List<AnimeFacet> {
        val counts = LinkedHashMap<String, Int>()
        val labels = LinkedHashMap<String, String>()
        fun add(raw: String?) {
            for (part in raw?.split(',', '|', '/').orEmpty()) {
                val label = part.trim()
                if (label.isEmpty()) continue
                val key = label.lowercase()
                counts[key] = (counts[key] ?: 0) + 1
                labels.putIfAbsent(key, label)
            }
        }
        movies.forEach { add(it.genre) }
        series.forEach { add(it.genre) }
        return counts.entries
            .sortedByDescending { it.value }
            .map { AnimeFacet(AnimeKind.MOVIE, "genre:${it.key}", labels.getValue(it.key), it.value) }
    }
}

enum class AnimeKind { LIVE, MOVIE, SERIES }

data class AnimeFacet(val kind: AnimeKind, val key: String, val label: String, val count: Int)

sealed interface AnimeSlide {
    val title: String
    val imageUrl: String?

    data class MovieSlide(val movie: Movie) : AnimeSlide {
        override val title: String get() = movie.displayTitle
        override val imageUrl: String? get() = movie.backdropUrl ?: movie.posterUrl
    }

    data class SeriesSlide(val series: Series) : AnimeSlide {
        override val title: String get() = series.displayTitle
        override val imageUrl: String? get() = series.backdropUrl ?: series.posterUrl
    }
}

data class AnimeHits(
    val channels: List<Channel>,
    val movies: List<Movie>,
    val series: List<Series>,
) {
    val isEmpty: Boolean get() = channels.isEmpty() && movies.isEmpty() && series.isEmpty()

    companion object {
        val EMPTY = AnimeHits(emptyList(), emptyList(), emptyList())
    }
}

data class AnimeIndex(
    val movies: List<Movie>,
    val series: List<Series>,
    val channels: List<Channel>,
    val liveCategories: List<AnimeFacet>,
    val movieCategories: List<AnimeFacet>,
    val seriesCategories: List<AnimeFacet>,
    val years: List<AnimeFacet>,
    val genres: List<AnimeFacet>,
    val slides: List<AnimeSlide>,
    val recommended: List<Series>,
) {
    val isEmpty: Boolean get() = movies.isEmpty() && series.isEmpty() && channels.isEmpty()

    fun moviesIn(categoryKey: String): List<Movie> =
        movies.filter { AnimeCatalog.categoryKey(it.sourceId, it.categoryId, AnimeKind.MOVIE) == categoryKey }

    fun seriesIn(categoryKey: String): List<Series> =
        series.filter { AnimeCatalog.categoryKey(it.sourceId, it.categoryId, AnimeKind.SERIES) == categoryKey }

    fun channelsIn(categoryKey: String): List<Channel> =
        channels.filter { AnimeCatalog.categoryKey(it.sourceId, it.categoryId, AnimeKind.LIVE) == categoryKey }

    fun moviesInYear(year: Int): List<Movie> = movies.filter { it.year == year }

    fun seriesInYear(year: Int): List<Series> = series.filter { it.listedYear == year }

    fun moviesInGenre(key: String): List<Movie> = movies.filter { key in AnimeCatalog.genres(it.genre) }

    fun seriesInGenre(key: String): List<Series> = series.filter { key in AnimeCatalog.genres(it.genre) }

    companion object {
        val EMPTY = AnimeIndex(
            emptyList(), emptyList(), emptyList(),
            emptyList(), emptyList(), emptyList(),
            emptyList(), emptyList(), emptyList(),
            emptyList(),
        )
    }
}
