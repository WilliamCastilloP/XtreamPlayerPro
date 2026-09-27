/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.db.MovieRowState
import app.opentv.data.db.SeriesRowState
import app.opentv.data.model.Movie
import app.opentv.data.model.Series
import app.opentv.data.repo.VodSyncMerge
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VodSyncMergeTest {

    @Test
    fun `new movie is stored as the provider sent it`() {
        val incoming = movie(streamId = "10", plot = "Fresh")
        assertThat(VodSyncMerge.movie(incoming, existing = null)).isEqualTo(incoming)
    }

    @Test
    fun `refresh keeps the starred flag and the room id`() {
        val incoming = movie(streamId = "10", id = 0, favourite = false, plot = null)
        val existing = MovieRowState(
            streamId = "10",
            id = 99L,
            favourite = true,
            posterUrl = "http://old/poster.jpg",
            plot = "Kept plot",
            backdropUrl = "http://old/back.jpg",
            cast = "A, B",
            director = "Dir",
            genre = "Action",
            tmdbId = "123",
        )

        val merged = VodSyncMerge.movie(incoming, existing)

        assertThat(merged.id).isEqualTo(99L)
        assertThat(merged.favourite).isTrue()
        assertThat(merged.plot).isEqualTo("Kept plot")
        assertThat(merged.posterUrl).isEqualTo("http://old/poster.jpg")
        assertThat(merged.backdropUrl).isEqualTo("http://old/back.jpg")
        assertThat(merged.cast).isEqualTo("A, B")
        assertThat(merged.director).isEqualTo("Dir")
        assertThat(merged.genre).isEqualTo("Action")
        assertThat(merged.tmdbId).isEqualTo("123")
    }

    @Test
    fun `incoming plot wins over a previously stored one`() {
        val incoming = movie(streamId = "10", plot = "New plot")
        val existing = MovieRowState(
            streamId = "10",
            id = 1L,
            favourite = false,
            posterUrl = null,
            plot = "Old plot",
            backdropUrl = null,
            cast = null,
            director = null,
            genre = null,
            tmdbId = null,
        )

        assertThat(VodSyncMerge.movie(incoming, existing).plot).isEqualTo("New plot")
    }

    @Test
    fun `series refresh keeps the starred flag`() {
        val incoming = Series(
            id = 0,
            sourceId = 1,
            seriesId = "s1",
            name = "Show",
            categoryId = "5",
            posterUrl = null,
            rating = null,
            year = 2021,
            plot = null,
            favourite = false,
        )
        val existing = SeriesRowState(
            seriesId = "s1",
            id = 7L,
            favourite = true,
            posterUrl = "http://old/s.jpg",
            plot = "Pilot",
            backdropUrl = null,
            cast = null,
            genre = "Drama",
            tmdbId = null,
        )

        val merged = VodSyncMerge.series(incoming, existing)
        assertThat(merged.id).isEqualTo(7L)
        assertThat(merged.favourite).isTrue()
        assertThat(merged.plot).isEqualTo("Pilot")
        assertThat(merged.genre).isEqualTo("Drama")
    }

    private fun movie(
        streamId: String,
        id: Long = 0,
        favourite: Boolean = false,
        plot: String? = null,
    ) = Movie(
        id = id,
        sourceId = 1,
        streamId = streamId,
        name = "Film",
        categoryId = "10",
        posterUrl = null,
        rating = null,
        year = 2020,
        plot = plot,
        durationSeconds = null,
        containerExtension = "mkv",
        streamUrl = "http://example.com/movie/u/p/$streamId.mkv",
        favourite = favourite,
    )
}
