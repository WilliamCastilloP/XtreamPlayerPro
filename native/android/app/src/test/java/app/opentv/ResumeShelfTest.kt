/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.ui.VodViewModel
import app.opentv.ui.latestResumePerContent
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ResumeShelfTest {

    @Test
    fun `the newest watch of a series replaces the older episodes`() {
        val older = item("ep:1", "Show · S1E1", "series:1:naruto")
        val newer = item("ep:9", "Show · S1E9", "series:1:naruto")
        val other = item("ep:3", "Other · S1E2", "series:1:other")
        val kept = latestResumePerContent(listOf(newer, older, other))
        assertThat(kept.map { it.mediaKey }).containsExactly("ep:9", "ep:3").inOrder()
    }

    @Test
    fun `two copies of one film keep the latest watch`() {
        val first = item("movie:1", "Film", "movie:1:film")
        val second = item("movie:2", "Film", "movie:1:film")
        val kept = latestResumePerContent(listOf(second, first))
        assertThat(kept.map { it.mediaKey }).containsExactly("movie:2")
    }

    private fun item(key: String, title: String, contentKey: String) = VodViewModel.ResumeItem(
        mediaKey = key,
        title = title,
        posterUrl = null,
        streamUrl = "http://example/$key",
        progress = 0.4f,
        contentKey = contentKey,
    )
}
