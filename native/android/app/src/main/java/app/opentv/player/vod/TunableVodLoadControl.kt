/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.LoadControl
import androidx.media3.exoplayer.upstream.DefaultAllocator
import app.opentv.player.BufferPolicy
import app.opentv.player.PlaybackBuffers
import java.util.concurrent.atomic.AtomicReference

/**
 * VOD load control whose target moves when a throughput sample arrives.
 * Constructed only for the movie/episode player. Live keeps [androidx.media3.exoplayer.DefaultLoadControl].
 */
@UnstableApi
internal class TunableVodLoadControl(
    private val policy: AtomicReference<BufferPolicy>,
) : LoadControl {

    private val allocator = DefaultAllocator(true, C.DEFAULT_BUFFER_SEGMENT_SIZE)

    override fun getAllocator() = allocator

    override fun shouldContinueLoading(parameters: LoadControl.Parameters): Boolean {
        val bufferedMs = parameters.bufferedDurationUs / 1000L
        val max = policy.get().maxMs.toLong()
        val min = policy.get().minMs.toLong()
        if (bufferedMs >= max) return false
        if (bufferedMs < min) return true
        return true
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
