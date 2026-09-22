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
     * Movies and episodes. Start as soon as Live would (first ~2.5 s of media) so Watch is not a
     * long spinner. Keep a modest reservoir ahead so a bursty panel hitch does not freeze the
     * film — but do **not** wait 5–8 s before the first frame, and do **not** hoard 50–120 s /
     * 64 MiB. 0.16.0–0.16.1 did that as “preload”; it felt like a wait, then stalled anyway
     * while the queue kept filling. A second ExoPlayer on the detail page would also count
     * against Xtream `max_connections`, so preload is this on-player buffer, not a hidden stream.
     */
    fun vod(): BufferPolicy = BufferPolicy(
        minMs = 18_000,
        maxMs = 28_000,
        forPlaybackMs = 2_500,
        afterRebufferMs = 4_000,
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
