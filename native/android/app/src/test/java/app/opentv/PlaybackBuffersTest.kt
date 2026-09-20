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
    fun `vod waits for a real reservoir before the first frame`() {
        val vod = PlaybackBuffers.vod()
        val live = PlaybackBuffers.live()
        assertThat(vod.forPlaybackMs).isAtLeast(8_000)
        assertThat(vod.forPlaybackMs).isGreaterThan(live.forPlaybackMs)
        assertThat(vod.afterRebufferMs).isGreaterThan(live.afterRebufferMs)
    }

    @Test
    fun `vod min buffer matches Media3 default instead of the old 15s live pool`() {
        val vod = PlaybackBuffers.vod()
        assertThat(vod.minMs).isAtLeast(50_000)
        assertThat(vod.maxMs).isAtLeast(120_000)
        assertThat(vod.targetBufferBytes).isEqualTo(64 * 1024 * 1024)
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
