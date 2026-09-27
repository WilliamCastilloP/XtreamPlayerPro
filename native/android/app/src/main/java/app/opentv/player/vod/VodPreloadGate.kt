/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

/**
 * Whether a VOD preload is allowed to open a connection. Live playback never asks.
 *
 * [bufferedAheadMs] null means nothing is playing (detail page): a single bounded preload is fine.
 * While something plays, preload starts only above the healthy line and must stop below the pause line.
 */
object VodPreloadGate {

    fun appliesTo(isLive: Boolean): Boolean = !isLive

    fun bandwidthAllows(
        throughputBps: Long,
        bitrateBps: Long,
        margin: Double = VodPlaybackTuning.BANDWIDTH_MARGIN,
    ): Boolean {
        if (throughputBps <= 0L || bitrateBps <= 0L) return false
        return throughputBps >= bitrateBps * margin
    }

    fun mayStart(bufferedAheadMs: Long?): Boolean {
        val ahead = bufferedAheadMs ?: return true
        return ahead >= VodPlaybackTuning.HEALTHY_BUFFER_MS
    }

    fun mustPause(bufferedAheadMs: Long?): Boolean {
        val ahead = bufferedAheadMs ?: return false
        return ahead < VodPlaybackTuning.PAUSE_PRELOAD_BELOW_MS
    }
}
