/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.player.vod.NextEpisodePrompt
import app.opentv.player.vod.PlaybackLanguage
import app.opentv.player.vod.PlaybackLanguage.ListedTrack
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PlaybackLanguageTest {

    @Test
    fun `spanish two letter and three letter codes are the same choice`() {
        val stored = PlaybackLanguage.token("es", "Español")
        assertThat(stored).isEqualTo("lang:es")
        assertThat(PlaybackLanguage.matches(stored!!, "spa", null)).isTrue()
        assertThat(PlaybackLanguage.matches(stored, "es-MX", null)).isTrue()
        assertThat(PlaybackLanguage.matches(stored, "eng", "English")).isFalse()
    }

    @Test
    fun `a track with no language code can match the stored label`() {
        val stored = PlaybackLanguage.token("spa", null)
        assertThat(PlaybackLanguage.matches(stored!!, null, "Español Latino")).isTrue()
        assertThat(PlaybackLanguage.matches(stored, null, "English")).isFalse()
        assertThat(PlaybackLanguage.matches(stored, "en", "Español")).isFalse()
    }

    @Test
    fun `subtitles stay off until the user picks a language`() {
        val tracks = listOf(track(language = "es", selected = true))
        assertThat(PlaybackLanguage.textAction(null, tracks))
            .isEqualTo(PlaybackLanguage.Action.None)
        assertThat(PlaybackLanguage.textAction(PlaybackLanguage.OFF, tracks))
            .isEqualTo(PlaybackLanguage.Action.DisableText)
        assertThat(PlaybackLanguage.textAction(PlaybackLanguage.OFF, listOf(track(language = "es", selected = false))))
            .isEqualTo(PlaybackLanguage.Action.None)
    }

    @Test
    fun `a saved language is selected once and then left alone`() {
        val spanish = track(language = "spa", selected = false)
        val english = track(groupIndex = 0, trackIndex = 1, language = "en", selected = true)
        assertThat(PlaybackLanguage.audioAction("lang:es", listOf(english, spanish)))
            .isEqualTo(PlaybackLanguage.Action.Select(0, 0))
        val already = spanish.copy(selected = true)
        assertThat(PlaybackLanguage.audioAction("lang:es", listOf(already)))
            .isEqualTo(PlaybackLanguage.Action.None)
    }

    @Test
    fun `a label only choice matches the same label on the next episode`() {
        val stored = PlaybackLanguage.token(null, "AAC 5.1")
        assertThat(stored).isEqualTo("label:aac 5.1")
        assertThat(PlaybackLanguage.matches(stored!!, null, "AAC 5.1")).isTrue()
        assertThat(PlaybackLanguage.matches(stored, null, "AAC Stereo")).isFalse()
    }

    @Test
    fun `next episode prompt is the last minute and not the credits instant`() {
        assertThat(NextEpisodePrompt.remainingInWindow(durationMs = 40 * 60_000L, positionMs = 39 * 60_000L + 1)).isTrue()
        assertThat(NextEpisodePrompt.remainingInWindow(durationMs = 40 * 60_000L, positionMs = 30 * 60_000L)).isFalse()
        assertThat(NextEpisodePrompt.remainingInWindow(durationMs = 40 * 60_000L, positionMs = 40 * 60_000L)).isFalse()
        assertThat(NextEpisodePrompt.remainingInWindow(durationMs = 0L, positionMs = 0L)).isFalse()
    }

    private fun track(
        groupIndex: Int = 0,
        trackIndex: Int = 0,
        language: String?,
        label: String? = null,
        selected: Boolean,
    ) = ListedTrack(groupIndex, trackIndex, language, label, selected)
}
