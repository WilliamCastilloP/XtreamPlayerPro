/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

/**
 * Which title to warm, and from where.
 *
 * ## Criterion 1b — chosen on purpose
 *
 * When nothing is in progress, the target is the **first episode that is not finished, in
 * season + episode-number order**.
 *
 * It is **not** "the episode after the highest one marked finished". Those differ as soon as
 * someone watches out of order: finished S1E5 with S1E1 still open must warm S1E1 from 0, not
 * S1E6. The out-of-order case is the reason this file exists as its own rule.
 *
 * (d) is the same pick as (b) when the series has no marks at all: the first episode, from 0.
 * The [TargetReason] still says [TargetReason.FIRST_EPISODE] so a log can tell them apart.
 */
object VodResumePlanner {

    data class WatchMark(
        val mediaKey: String,
        val positionMillis: Long,
        val durationMillis: Long,
        val updatedAtMillis: Long,
    )

    data class EpisodeCandidate(
        val mediaKey: String,
        val season: Int,
        val episodeNumber: Int,
        val title: String,
        val streamUrl: String,
    )

    enum class TargetReason {
        IN_PROGRESS,
        FIRST_UNFINISHED_IN_ORDER,
        FIRST_EPISODE,
    }

    data class PreloadTarget(
        val mediaKey: String,
        val title: String,
        val streamUrl: String,
        val startPositionMillis: Long,
        val reason: TargetReason,
    )

    fun seriesTarget(
        episodes: List<EpisodeCandidate>,
        marks: List<WatchMark>,
    ): PreloadTarget? {
        if (episodes.isEmpty()) return null
        val ordered = episodes.sortedWith(compareBy({ it.season }, { it.episodeNumber }, { it.mediaKey }))
        val byKey = ordered.associateBy { it.mediaKey }
        val relevant = marks.filter { it.mediaKey in byKey }

        val inProgress = relevant
            .filter { inProgress(it) }
            .maxByOrNull { it.updatedAtMillis }
        if (inProgress != null) {
            val episode = byKey.getValue(inProgress.mediaKey)
            return target(episode, inProgress.positionMillis, TargetReason.IN_PROGRESS)
        }

        val finishedKeys = relevant.filter { finished(it) }.map { it.mediaKey }.toSet()
        val next = ordered.firstOrNull { it.mediaKey !in finishedKeys } ?: return null
        val reason = if (relevant.isEmpty()) TargetReason.FIRST_EPISODE
        else TargetReason.FIRST_UNFINISHED_IN_ORDER
        return target(next, 0L, reason)
    }

    /**
     * Same in-progress vs new rule as series, without a "next episode" step.
     * A finished film is not warmed: pressing play starts it from 0 on purpose, and preloading
     * a title the viewer already completed spends a connection for nothing.
     */
    fun movieTarget(
        mediaKey: String,
        title: String,
        streamUrl: String,
        mark: WatchMark?,
    ): PreloadTarget? {
        if (mark != null && mark.mediaKey == mediaKey && finished(mark)) return null
        if (mark != null && mark.mediaKey == mediaKey && inProgress(mark)) {
            return PreloadTarget(
                mediaKey = mediaKey,
                title = title,
                streamUrl = streamUrl,
                startPositionMillis = mark.positionMillis,
                reason = TargetReason.IN_PROGRESS,
            )
        }
        return PreloadTarget(
            mediaKey = mediaKey,
            title = title,
            streamUrl = streamUrl,
            startPositionMillis = 0L,
            reason = TargetReason.FIRST_EPISODE,
        )
    }

    /**
     * Next-episode preload while something is already playing. The current item is removed first,
     * then [seriesTarget] runs, so 1b still applies to whatever is left.
     */
    fun nextAfter(
        currentMediaKey: String,
        episodes: List<EpisodeCandidate>,
        marks: List<WatchMark>,
    ): PreloadTarget? = seriesTarget(
        episodes.filter { it.mediaKey != currentMediaKey },
        marks.filter { it.mediaKey != currentMediaKey },
    )

    fun inProgress(mark: WatchMark): Boolean {
        if (mark.durationMillis <= 0L || mark.positionMillis <= 0L) return false
        val fraction = mark.positionMillis.toDouble() / mark.durationMillis
        return fraction > 0.0 && fraction < VodPlaybackTuning.FINISHED_FRACTION
    }

    fun finished(mark: WatchMark): Boolean {
        if (mark.durationMillis <= 0L) return false
        return mark.positionMillis.toDouble() / mark.durationMillis >= VodPlaybackTuning.FINISHED_FRACTION
    }

    private fun target(
        episode: EpisodeCandidate,
        startMillis: Long,
        reason: TargetReason,
    ) = PreloadTarget(
        mediaKey = episode.mediaKey,
        title = episode.title,
        streamUrl = episode.streamUrl,
        startPositionMillis = startMillis.coerceAtLeast(0L),
        reason = reason,
    )
}
