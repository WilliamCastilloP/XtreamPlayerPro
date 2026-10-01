/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.model.Category
import app.opentv.data.model.Channel
import app.opentv.data.model.Episode
import app.opentv.data.model.Movie
import app.opentv.data.model.Series
import app.opentv.data.model.StreamKind
import app.opentv.data.parser.AnimeCatalog
import app.opentv.data.parser.AnimeKind
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AnimeCatalogTest {

    @Test
    fun `anime labels match and ordinary titles do not`() {
        assertThat(AnimeCatalog.matches("ANIME | Subtitulado")).isTrue()
        assertThat(AnimeCatalog.matches("Animé")).isTrue()
        assertThat(AnimeCatalog.matches("アニメ")).isTrue()
        assertThat(AnimeCatalog.matches("Crunchyroll")).isTrue()
        assertThat(AnimeCatalog.matches("Action, Anime")).isTrue()
        assertThat(AnimeCatalog.matches("Manga")).isTrue()
        assertThat(AnimeCatalog.matches("One Piece")).isFalse()
        assertThat(AnimeCatalog.matches("Animation")).isFalse()
        assertThat(AnimeCatalog.matches(null)).isFalse()
    }

    @Test
    fun `recommendations prefer a shared genre`() {
        val action = show(1, "Action")
        val romance = show(2, "Romance")
        val ranked = AnimeCatalog.recommend(listOf(romance, action), setOf("action"), limit = 2)
        assertThat(ranked.map { it.id }).containsExactly(1L).inOrder()
    }

    @Test
    fun `without a shared genre the higher rating wins`() {
        val low = show(1, "Action", rating = 6.0)
        val high = show(2, "Drama", rating = 9.0)
        val ranked = AnimeCatalog.recommend(listOf(low, high), emptySet(), limit = 1)
        assertThat(ranked.single().id).isEqualTo(2L)
    }

    @Test
    fun `an anime category is a facet and a one-off title is not`() {
        val animeMovie = movie(1, "Spirited Away", categoryId = "a", year = 2001, genre = "Fantasy")
        val stray = movie(2, "Naruto Anime Special", categoryId = "c", year = 2020, genre = "Action")
        val show = show(3, "Action", year = 2025, contentYear = 2026, categoryId = "s")
        val categories = listOf(
            Category("a", 1, "ANIME HD", StreamKind.MOVIE),
            Category("c", 1, "Comedia", StreamKind.MOVIE),
            Category("s", 1, "Anime Series", StreamKind.SERIES),
        )
        val index = AnimeCatalog.build(
            movies = listOf(animeMovie, stray),
            series = listOf(show),
            channels = emptyList(),
            categories = categories,
            watchedGenres = emptySet(),
        )
        assertThat(index.movieCategories.map { it.label }).containsExactly("ANIME HD")
        assertThat(index.seriesCategories.map { it.label }).containsExactly("Anime Series")
        assertThat(index.movies.map { it.id }).containsExactly(1L, 2L)
        assertThat(index.years.map { it.label }).containsExactly("2026", "2020", "2001").inOrder()
        assertThat(index.seriesInYear(2026).map { it.id }).containsExactly(3L)
        val byCategory = AnimeCatalog.search(index, "anime hd")
        assertThat(byCategory.movies.map { it.id }).containsExactly(1L)
        val byTitle = AnimeCatalog.search(index, "naruto")
        assertThat(byTitle.movies.map { it.id }).containsExactly(2L)
        assertThat(AnimeCatalog.search(index, "comedia").isEmpty).isTrue()
    }

    @Test
    fun `a live anime category is a facet and a sports channel is not`() {
        val listed = channel(1, "Toonami", categoryId = "live")
        val named = channel(2, "Crunchyroll TV", categoryId = "sports")
        val categories = listOf(
            Category("live", 1, "Anime TV", StreamKind.LIVE),
            Category("sports", 1, "Sports", StreamKind.LIVE),
        )
        val index = AnimeCatalog.build(
            movies = emptyList(),
            series = emptyList(),
            channels = listOf(listed, named),
            categories = categories,
            watchedGenres = emptySet(),
        )
        assertThat(index.liveCategories.map { it.label }).containsExactly("Anime TV")
        assertThat(index.liveCategories.single().kind).isEqualTo(AnimeKind.LIVE)
        assertThat(index.channelsIn(index.liveCategories.single().key).map { it.id }).containsExactly(1L)
        assertThat(AnimeCatalog.search(index, "toonami").channels.map { it.id }).containsExactly(1L)
        assertThat(AnimeCatalog.search(index, "anime tv").channels.map { it.id }).containsExactly(1L)
    }

    @Test
    fun `next episode is the following chapter in season order`() {
        val episodes = listOf(
            episode(1, season = 1, number = 1),
            episode(2, season = 1, number = 2),
            episode(3, season = 2, number = 1),
        )
        assertThat(AnimeCatalog.nextEpisode(2, episodes)?.id).isEqualTo(3L)
        assertThat(AnimeCatalog.nextEpisode(3, episodes)).isNull()
        assertThat(AnimeCatalog.nextEpisode(9, episodes)).isNull()
    }

    private fun show(
        id: Long,
        genre: String,
        rating: Double? = null,
        year: Int? = 2024,
        contentYear: Int? = null,
        categoryId: String = "anime",
    ) = Series(
        id = id,
        sourceId = 1,
        seriesId = "s$id",
        name = "Show $id",
        categoryId = categoryId,
        posterUrl = null,
        rating = rating,
        year = year,
        plot = null,
        genre = genre,
        contentYear = contentYear,
    )

    private fun movie(id: Long, name: String, categoryId: String, year: Int, genre: String) = Movie(
        id = id,
        sourceId = 1,
        streamId = "m$id",
        name = name,
        categoryId = categoryId,
        posterUrl = null,
        rating = null,
        year = year,
        plot = null,
        durationSeconds = null,
        containerExtension = null,
        streamUrl = "http://example/$id",
        genre = genre,
    )

    private fun channel(id: Long, name: String, categoryId: String) = Channel(
        id = id,
        sourceId = 1,
        streamId = "c$id",
        name = name,
        categoryId = categoryId,
        logoUrl = null,
        epgChannelId = null,
        number = null,
        streamUrl = "http://example/$id",
    )

    private fun episode(id: Long, season: Int, number: Int) = Episode(
        id = id,
        sourceId = 1,
        seriesId = "s",
        episodeId = "$id",
        season = season,
        episodeNumber = number,
        title = "E$number",
        plot = null,
        durationSeconds = null,
        stillUrl = null,
        streamUrl = "http://example/$id",
    )
}
