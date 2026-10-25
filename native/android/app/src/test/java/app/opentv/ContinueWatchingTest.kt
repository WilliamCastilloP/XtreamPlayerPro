/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.model.Episode
import app.opentv.data.model.PlaybackPosition
import app.opentv.player.vod.ContinueWatching
import app.opentv.player.vod.WatchProgress
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ContinueWatchingTest {

    @Test
    fun `an unfinished watch stays on the shelf`() {
        val mark = position("ep:1", position = 1_000, duration = 10_000)
        assertThat(ContinueWatching.actionFor(mark))
            .isEqualTo(ContinueWatching.Action.Keep(mark))
    }

    @Test
    fun `a finished episode asks for the next chapter`() {
        val mark = position("ep:1", position = 9_600, duration = 10_000)
        assertThat(mark.isFinished).isTrue()
        assertThat(ContinueWatching.actionFor(mark))
            .isEqualTo(ContinueWatching.Action.NextEpisode(mark))
    }

    @Test
    fun `a finished film drops out of continue watching`() {
        val mark = position("movie:9", position = 9_600, duration = 10_000)
        assertThat(ContinueWatching.actionFor(mark)).isEqualTo(ContinueWatching.Action.Drop)
    }

    @Test
    fun `next after a finished chapter is the following episode`() {
        val episodes = listOf(
            episode(1, season = 1, number = 1),
            episode(2, season = 1, number = 2),
            episode(3, season = 2, number = 1),
        )
        assertThat(ContinueWatching.nextAfter(1, episodes)?.id).isEqualTo(2L)
        assertThat(ContinueWatching.nextAfter(2, episodes)?.id).isEqualTo(3L)
        assertThat(ContinueWatching.nextAfter(3, episodes)).isNull()
    }

    @Test
    fun `watch progress is full when finished and blank without a mark`() {
        assertThat(WatchProgress.fraction(9_600, 10_000, finished = true)).isEqualTo(1f)
        assertThat(WatchProgress.fraction(4_000, 10_000, finished = false)).isEqualTo(0.4f)
        assertThat(WatchProgress.fraction(0, 10_000, finished = false)).isNull()
        assertThat(WatchProgress.fraction(1_000, 0, finished = false)).isNull()
    }

    private fun position(key: String, position: Long, duration: Long) = PlaybackPosition(
        profileId = 1,
        mediaKey = key,
        positionMillis = position,
        durationMillis = duration,
        updatedAtMillis = 1,
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
