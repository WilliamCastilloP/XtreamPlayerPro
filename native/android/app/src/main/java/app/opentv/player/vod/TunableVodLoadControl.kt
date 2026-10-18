/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.analytics.PlayerId
import androidx.media3.exoplayer.source.TrackGroupArray
import androidx.media3.exoplayer.trackselection.ExoTrackSelection
import androidx.media3.exoplayer.upstream.DefaultAllocator
import app.opentv.player.BufferPolicy
import app.opentv.player.PlaybackBuffers
import java.util.concurrent.atomic.AtomicReference

/**
 * VOD load control whose target moves when a throughput sample arrives.
 *
 * Media3's [LoadControl] defaults throw [IllegalStateException] ("onPrepared not implemented",
 * and the same for back-buffer and track selection). [androidx.media3.exoplayer.DefaultLoadControl]
 * overrides them. This class has to as well: ExoPlayer calls them from its constructor, so a
 * missing override kills the process the moment a movie or episode screen opens. Live TV does
 * not use this class.
 */
@UnstableApi
internal class TunableVodLoadControl(
    private val policy: AtomicReference<BufferPolicy>,
) : LoadControl {

    private val allocator = DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE)

    override fun getAllocator() = allocator

    override fun onPrepared(playerId: PlayerId) = Unit

    override fun onTracksSelected(
        parameters: LoadControl.Parameters,
        trackGroups: TrackGroupArray,
        trackSelections: Array<ExoTrackSelection?>,
    ) {
        // Time thresholds decide when to stop. Give the allocator room for the ceiling so it
        // does not trim the queue out from under a 50s VOD buffer.
        allocator.setTargetBufferSize(VodPlaybackTuning.BUFFER_CEILING_MS * 64 * 1024 / 1000)
    }

    override fun onStopped(playerId: PlayerId) = Unit

    override fun onReleased(playerId: PlayerId) = Unit

    override fun getBackBufferDurationUs(playerId: PlayerId): Long = 0L

    override fun retainBackBufferFromKeyframe(playerId: PlayerId): Boolean = false

    override fun shouldContinueLoading(parameters: LoadControl.Parameters): Boolean {
        val bufferedMs = parameters.bufferedDurationUs / 1000L
        return bufferedMs < policy.get().maxMs
    }

    override fun shouldStartPlayback(parameters: LoadControl.Parameters): Boolean {
        val current = policy.get()
        val needed = if (parameters.rebuffering) current.afterRebufferMs else current.forPlaybackMs
        return parameters.bufferedDurationUs / 1000L >= needed
    }

    companion object {
        fun initialPolicy(): AtomicReference<BufferPolicy> =
            AtomicReference(PlaybackBuffers.vod())
    }
}
