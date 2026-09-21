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
 * channel change does not hoard a minute of the previous mux. VOD is the opposite: a movie is a
 * long finite download from a bursty panel, and starting at 2.5s is what looks like "my internet
 * is fine but it keeps pausing".
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
     * Movies and episodes. Wait a bit longer than Live before the first frame so a bursty panel
     * does not stall immediately — but do **not** hoard 2 minutes / 64 MiB. Fire TV HDMI + Xtream
     * muxes (MP4/TS with sloppy PTS) drift lipsync when the video queue is that deep; 0.16.0
     * proved it. ~30–50 s is Media3's own neighbourhood and still larger than the old 15 s live
     * pool.
     */
    fun vod(): BufferPolicy = BufferPolicy(
        minMs = 30_000,
        maxMs = 50_000,
        forPlaybackMs = 5_000,
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
