/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player

/**
 * ExoPlayer [androidx.media3.exoplayer.DefaultLoadControl] durations per playback mode.
 *
 * Media3's own defaults are 50s/50s with a 2.5s start. The live path keeps a shallower pool so a
 * channel change does not hoard a minute of the previous mux. VOD holds a deeper pool than that
 * start threshold: a movie is a long finite download from a bursty panel, and a queue that only
 * covers a few seconds drains and pauses. The cap stays near 50s so Fire TV lipsync does not drift.
 *
 * [DefaultLoadControl] requires min ≥ both playback thresholds and max ≥ min. The constructor
 * checks that so a bad edit fails in tests, not on a Stick.
 */
internal data class BufferPolicy(
    val minMs: Int,
    val maxMs: Int,
    val forPlaybackMs: Int,
    val afterRebufferMs: Int,
    val backBufferMs: Int = 0,
    /** Null leaves Media3 to size the pool from the tracks. */
    val targetBufferBytes: Int? = null,
) {
    init {
        require(minMs >= forPlaybackMs) { "min $minMs < start $forPlaybackMs" }
        require(minMs >= afterRebufferMs) { "min $minMs < rebuffer $afterRebufferMs" }
        require(maxMs >= minMs) { "max $maxMs < min $minMs" }
        require(backBufferMs >= 0)
    }
}

internal object PlaybackBuffers {
    fun live(): BufferPolicy = BufferPolicy(
        minMs = 15_000,
        maxMs = 60_000,
        forPlaybackMs = 2_500,
        afterRebufferMs = 5_000,
    )

    /**
     * Movies and episodes.
     *
     * 0.16.1 waited ~8s then tried to hold 50–120s / 64 MiB: long spinner, then a stall while the
     * queue kept filling, and on Fire TV the deep queue drifted lipsync. 0.17.0 swung the other
     * way (start at 2.5s, only 18–28s ahead) and a bursty Xtream file drained that pool constantly,
     * so the film "stopped all the time".
     *
     * Start once ~3s is buffered (still a short spinner). Keep ~40–50s ahead while playing — enough
     * runway for a panel that sends data in bursts, short of the 2-minute queue that desynced A/V.
     * After a hitch, rebuild 8s before resuming so it does not stutter every few seconds.
     */
    fun vod(): BufferPolicy = BufferPolicy(
        minMs = 40_000,
        maxMs = 50_000,
        forPlaybackMs = 3_000,
        afterRebufferMs = 8_000,
    )

    fun preview(): BufferPolicy = BufferPolicy(
        minMs = 5_000,
        maxMs = 15_000,
        forPlaybackMs = 1_000,
        afterRebufferMs = 1_500,
    )

    fun liveRecording(): BufferPolicy = BufferPolicy(
        minMs = 15_000,
        maxMs = 60_000,
        forPlaybackMs = 8_000,
        afterRebufferMs = 8_000,
    )

    fun forMode(
        preview: Boolean,
        dvr: Boolean,
        liveRecording: Boolean,
        vod: Boolean,
    ): BufferPolicy = when {
        preview -> preview()
        liveRecording -> liveRecording()
        vod -> vod()
        dvr -> live().copy(maxMs = 120_000, backBufferMs = 120_000)
        else -> live()
    }
}
