/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

import app.opentv.player.BufferPolicy

/**
 * VOD buffer length from measured throughput ÷ file bitrate.
 *
 * A link that is barely faster than the file holds the ceiling (more runway). A link that is
 * several times faster holds the floor (less queue, less lipsync drift). Live TV does not call this.
 */
internal object VodBufferMath {

    fun targetBufferMs(
        throughputBps: Long,
        bitrateBps: Long,
        floorMs: Int = VodPlaybackTuning.BUFFER_FLOOR_MS,
        ceilingMs: Int = VodPlaybackTuning.BUFFER_CEILING_MS,
        comfortableRatio: Double = VodPlaybackTuning.COMFORTABLE_RATIO,
    ): Int {
        if (throughputBps <= 0L || bitrateBps <= 0L || ceilingMs <= floorMs) return ceilingMs
        val ratio = throughputBps.toDouble() / bitrateBps.toDouble()
        val span = (comfortableRatio - 1.0).coerceAtLeast(0.01)
        val t = ((ratio - 1.0) / span).coerceIn(0.0, 1.0)
        val ms = ceilingMs - ((ceilingMs - floorMs) * t)
        return ms.toInt().coerceIn(floorMs, ceilingMs)
    }

    fun policyFor(throughputBps: Long, bitrateBps: Long): BufferPolicy {
        val maxMs = targetBufferMs(throughputBps, bitrateBps)
        val start = VodPlaybackTuning.START_PLAYBACK_MS
        val rebuffer = VodPlaybackTuning.AFTER_REBUFFER_MS
        val minMs = maxOf(start, rebuffer, (maxMs * 4) / 5).coerceAtMost(maxMs)
        return BufferPolicy(
            minMs = minMs,
            maxMs = maxMs,
            forPlaybackMs = start.coerceAtMost(minMs),
            afterRebufferMs = rebuffer.coerceAtMost(minMs),
        )
    }

    fun preloadBytes(bitrateBps: Long): Long {
        val bps = bitrateBps.coerceAtLeast(1L)
        val raw = bps / 8L * VodPlaybackTuning.PRELOAD_AHEAD_MS / 1000L
        return raw.coerceIn(
            VodPlaybackTuning.PRELOAD_MIN_BYTES.toLong(),
            VodPlaybackTuning.PRELOAD_MAX_BYTES.toLong(),
        )
    }
}
