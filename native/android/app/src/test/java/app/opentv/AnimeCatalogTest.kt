/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.model.Episode
import app.opentv.data.model.Series
import app.opentv.data.parser.AnimeCatalog
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

    private fun show(id: Long, genre: String, rating: Double? = null) = Series(
        id = id,
        sourceId = 1,
        seriesId = "s$id",
        name = "Show $id",
        categoryId = "anime",
        posterUrl = null,
        rating = rating,
        year = 2024,
        plot = null,
        genre = genre,
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
