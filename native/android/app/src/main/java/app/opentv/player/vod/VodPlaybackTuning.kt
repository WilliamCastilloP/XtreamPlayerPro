/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

/**
 * Knobs for VOD and series only. Live TV does not read this object.
 *
 * Change a threshold here. They are not exposed in Settings; a Stick build picks these up as-is.
 * The ceiling stays at 50s because a deeper queue drifted lipsync on Fire TV (0.16.x).
 */
object VodPlaybackTuning {
    /** Same cut the resume shelf already uses: the last 5% counts as finished. */
    const val FINISHED_FRACTION = 0.95

    /** Fire "next episode" preload once playback crosses this, and not after [nextEpisodeFractionEnd]. */
    const val NEXT_EPISODE_FRACTION_START = 0.70
    const val NEXT_EPISODE_FRACTION_END = 0.80

    /** Bytes read from the stream URL itself. Not a generic speed-test host. */
    const val PROBE_BYTES = 256 * 1024

    /** Require throughput ≥ bitrate × this before spending bandwidth on a preload. */
    const val BANDWIDTH_MARGIN = 1.25

    /** Used only until ExoPlayer reports a real track bitrate. 4 Mbit/s ≈ a typical 1080p file. */
    const val ASSUMED_BITRATE_BPS = 4_000_000L

    const val BUFFER_FLOOR_MS = 15_000
    const val BUFFER_CEILING_MS = 50_000
    const val START_PLAYBACK_MS = 3_000
    const val AFTER_REBUFFER_MS = 8_000

    /**
     * throughput/bitrate at which the buffer sits on the floor. At 1.0× (barely keeping up) it
     * sits on the ceiling.
     */
    const val COMFORTABLE_RATIO = 2.5

    /** How much of the target to have cached before the preload connection closes. */
    const val PRELOAD_AHEAD_MS = 12_000
    const val PRELOAD_MAX_BYTES = 8 * 1024 * 1024
    const val PRELOAD_MIN_BYTES = 512 * 1024

    /** Preload may start only when the active player is at least this far ahead. */
    const val HEALTHY_BUFFER_MS = 20_000L

    /** Cancel an in-flight preload when the active player falls below this. */
    const val PAUSE_PRELOAD_BELOW_MS = 8_000L

    const val REBUFFER_WINDOW_MS = 60_000L
    const val REBUFFER_TRIP_COUNT = 3

    const val PROBE_TIMEOUT_MS = 8_000
    const val PRELOAD_PLAYER_TIMEOUT_MS = 12_000L
    const val LOG_MAX_BYTES = 256 * 1024L
    const val CACHE_MAX_BYTES = 48L * 1024 * 1024
}
