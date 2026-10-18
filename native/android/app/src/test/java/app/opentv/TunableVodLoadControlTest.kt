/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Timeline
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.analytics.PlayerId
import androidx.media3.exoplayer.source.TrackGroupArray
import androidx.media3.exoplayer.trackselection.ExoTrackSelection
import app.opentv.player.PlaybackBuffers
import app.opentv.player.vod.TunableVodLoadControl
import app.opentv.player.vod.VodPlaybackTuning
import com.google.common.truth.Truth.assertThat
import java.util.concurrent.atomic.AtomicReference
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * 0.18.0 built the VOD player with a LoadControl that left Media3's throwing defaults in place.
 * ExoPlayer calls them from its constructor, so opening a movie or episode killed the process.
 * Live TV never used that class.
 */
@OptIn(UnstableApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = android.app.Application::class)
class TunableVodLoadControlTest {

    @Test
    fun `building a player with the vod load control does not throw`() {
        val context = RuntimeEnvironment.getApplication() as Context
        val control = TunableVodLoadControl(AtomicReference(PlaybackBuffers.vod()))
        val player = ExoPlayer.Builder(context).setLoadControl(control).build()
        try {
            player.setMediaItem(MediaItem.fromUri("http://127.0.0.1:9/movie/u/p/1.mp4"))
            player.prepare()
            assertThat(player.playerError).isNull()
        } finally {
            player.release()
        }
    }

    @Test
    fun `exoplayer callbacks that used to throw are implemented`() {
        val control: LoadControl = TunableVodLoadControl(AtomicReference(PlaybackBuffers.vod()))
        val id = PlayerId.UNSET
        control.onPrepared(id)
        control.onTracksSelected(
            LoadControl.Parameters(
                id,
                Timeline.EMPTY,
                LoadControl.EMPTY_MEDIA_PERIOD_ID,
                0L,
                0L,
                1f,
                true,
                false,
                0L,
            ),
            TrackGroupArray.EMPTY,
            arrayOfNulls<ExoTrackSelection>(0),
        )
        assertThat(control.getBackBufferDurationUs(id)).isEqualTo(0L)
        assertThat(control.retainBackBufferFromKeyframe(id)).isFalse()
        control.onStopped(id)
        control.onReleased(id)
    }

    @Test
    fun `playback waits for the start threshold and stops at the ceiling`() {
        val control = TunableVodLoadControl(AtomicReference(PlaybackBuffers.vod()))
        val id = PlayerId.UNSET
        fun params(bufferedMs: Long, rebuffering: Boolean) = LoadControl.Parameters(
            id,
            Timeline.EMPTY,
            LoadControl.EMPTY_MEDIA_PERIOD_ID,
            0L,
            bufferedMs * 1000L,
            1f,
            true,
            rebuffering,
            0L,
        )
        assertThat(control.shouldStartPlayback(params(VodPlaybackTuning.START_PLAYBACK_MS - 1L, false))).isFalse()
        assertThat(control.shouldStartPlayback(params(VodPlaybackTuning.START_PLAYBACK_MS.toLong(), false))).isTrue()
        assertThat(control.shouldContinueLoading(params(VodPlaybackTuning.BUFFER_CEILING_MS.toLong(), false))).isFalse()
        assertThat(control.shouldContinueLoading(params(VodPlaybackTuning.BUFFER_CEILING_MS.toLong() - 1, false))).isTrue()
    }
}
