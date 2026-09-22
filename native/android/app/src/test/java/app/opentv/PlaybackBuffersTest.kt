/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.player.PlaybackBuffers
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlaybackBuffersTest {

    @Test
    fun `vod starts as soon as live so Watch is not a long spinner`() {
        val vod = PlaybackBuffers.vod()
        val live = PlaybackBuffers.live()
        assertThat(vod.forPlaybackMs).isEqualTo(live.forPlaybackMs)
        assertThat(vod.forPlaybackMs).isEqualTo(2_500)
        assertThat(vod.afterRebufferMs).isAtMost(5_000)
        assertThat(vod.afterRebufferMs).isLessThan(live.afterRebufferMs + 1)
    }

    @Test
    fun `vod keeps a modest reservoir without a 2-minute queue that stalls then fills`() {
        val vod = PlaybackBuffers.vod()
        assertThat(vod.minMs).isAtLeast(15_000)
        assertThat(vod.minMs).isAtMost(25_000)
        assertThat(vod.maxMs).isGreaterThan(vod.minMs)
        assertThat(vod.maxMs).isAtMost(40_000)
        assertThat(vod.maxMs).isLessThan(120_000)
        assertThat(vod.targetBufferBytes).isNull()
    }

    @Test
    fun `live tuning is unchanged so channel zapping does not hoard the previous mux`() {
        val live = PlaybackBuffers.live()
        assertThat(live.minMs).isEqualTo(15_000)
        assertThat(live.maxMs).isEqualTo(60_000)
        assertThat(live.forPlaybackMs).isEqualTo(2_500)
        assertThat(live.afterRebufferMs).isEqualTo(5_000)
        assertThat(live.targetBufferBytes).isNull()
    }

    @Test
    fun `vod mode is selected for movies and skipped for live recording`() {
        val movie = PlaybackBuffers.forMode(
            preview = false, dvr = false, liveRecording = false, vod = true,
        )
        val rec = PlaybackBuffers.forMode(
            preview = false, dvr = false, liveRecording = true, vod = true,
        )
        assertThat(movie).isEqualTo(PlaybackBuffers.vod())
        assertThat(rec).isEqualTo(PlaybackBuffers.liveRecording())
    }
}
