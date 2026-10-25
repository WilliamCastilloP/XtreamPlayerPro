/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.player.vod

import app.opentv.data.model.Episode
import app.opentv.data.model.PlaybackPosition
import app.opentv.data.parser.AnimeCatalog

/**
 * What Continuar viendo should do with one recent watch mark.
 *
 * An unfinished title stays. A finished episode becomes the next chapter, even at progress 0, so
 * finishing S1E1 keeps the show on the shelf as S1E2. A finished film drops out. The shelf still
 * keeps one card per title after this step.
 */
object ContinueWatching {

    sealed interface Action {
        data class Keep(val position: PlaybackPosition) : Action
        data class NextEpisode(val finished: PlaybackPosition) : Action
        data object Drop : Action
    }

    fun actionFor(position: PlaybackPosition): Action = when {
        !position.isFinished -> Action.Keep(position)
        position.mediaKey.startsWith("ep:") -> Action.NextEpisode(position)
        else -> Action.Drop
    }

    /** The chapter after a finished one, or null when the series ends. */
    fun nextAfter(finishedEpisodeId: Long, episodes: List<Episode>): Episode? =
        AnimeCatalog.nextEpisode(finishedEpisodeId, episodes)
}
