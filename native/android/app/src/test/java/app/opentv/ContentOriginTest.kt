/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.parser.ContentOrigin
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ContentOriginTest {

    @Test
    fun `a leading service code names the studio`() {
        assertThat(ContentOrigin.from("NF - Stranger Things", null)).isEqualTo("Netflix")
        assertThat(ContentOrigin.from("AMZ - The Boys", "Series")).isEqualTo("Prime Video")
        assertThat(ContentOrigin.from("D+ - Andor", null)).isEqualTo("Disney+")
    }

    @Test
    fun `a trailing service name names the studio`() {
        assertThat(ContentOrigin.from("Stranger Things - Netflix", null)).isEqualTo("Netflix")
        assertThat(ContentOrigin.from("The Penguin | HBO", null)).isEqualTo("Max")
        assertThat(ContentOrigin.from("Fallout — Prime Video", null)).isEqualTo("Prime Video")
    }

    @Test
    fun `a category can name the studio when the title does not`() {
        assertThat(ContentOrigin.from("Stranger Things", "Netflix Series")).isEqualTo("Netflix")
        assertThat(ContentOrigin.from("One Piece", "Anime")).isNull()
    }

    @Test
    fun `language prefixes and ordinary titles stay blank`() {
        assertThat(ContentOrigin.from("EN - One Piece", null)).isNull()
        assertThat(ContentOrigin.from("Max Payne", null)).isNull()
        assertThat(ContentOrigin.from("Max Payne", "Action")).isNull()
        assertThat(ContentOrigin.from("Something - Max Payne", null)).isNull()
    }
}
