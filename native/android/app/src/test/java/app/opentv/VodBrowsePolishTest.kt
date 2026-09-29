/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.parser.VodLanguages
import app.opentv.ui.vod.GridAnchor
import app.opentv.ui.vod.cardCanFocus
import app.opentv.ui.vod.isEpisodeResume
import app.opentv.ui.vod.isMovieResume
import app.opentv.ui.vod.matchingAnchor
import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class VodBrowsePolishTest {

    @Test
    fun `a saved scroll anchor only restores the same category`() {
        val saved = GridAnchor("series:cat:netflix", index = 240, offset = 12)
        assertThat(matchingAnchor(saved, "series:cat:netflix")?.index).isEqualTo(240)
        assertThat(matchingAnchor(saved, "series:cat:hbo")).isNull()
        assertThat(matchingAnchor(null, "series:cat:netflix")).isNull()
    }

    @Test
    fun `only the opened poster can take focus while returning`() {
        assertThat(cardCanFocus(blockedExcept = 9L, itemId = 9L)).isTrue()
        assertThat(cardCanFocus(blockedExcept = 9L, itemId = 3L)).isFalse()
        assertThat(cardCanFocus(blockedExcept = null, itemId = 3L)).isTrue()
    }

    @Test
    fun `continue watching keys split movies from episodes`() {
        assertThat(isMovieResume("movie:4")).isTrue()
        assertThat(isMovieResume("ep:4")).isFalse()
        assertThat(isEpisodeResume("ep:8")).isTrue()
        assertThat(isEpisodeResume("movie:8")).isFalse()
    }

    @Test
    fun `title language tags are collected and a real title is left alone`() {
        assertThat(VodLanguages.codesInTitle("ES|LAT - Dune (2024)"))
            .containsExactly("es", "lat")
            .inOrder()
        assertThat(VodLanguages.codesInTitle("4K-EN - Barbie (2023)"))
            .containsExactly("en")
        assertThat(VodLanguages.codesInTitle("NF - Our Sticky Love (2026) (KR)"))
            .containsExactly("ko")
        assertThat(VodLanguages.codesInTitle("FBI: Most Wanted")).isEmpty()
        assertThat(VodLanguages.codesInTitle("Dune Latino")).containsExactly("lat")
    }

    @Test
    fun `panel info audio language is read and a codec name is not`() {
        val json = Json.parseToJsonElement(
            """
            {"audio":{"codec_name":"aac","tags":{"language":"eng"}},"plot":"hello"}
            """.trimIndent(),
        )
        assertThat(VodLanguages.codesInJson(json)).containsExactly("en")
        val codecOnly = Json.parseToJsonElement("""{"audio":"aac"}""")
        assertThat(VodLanguages.codesInJson(codecOnly)).isEmpty()
    }
}
