/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.parser.FavouriteWatchOrder
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FavouriteWatchOrderTest {

    @Test
    fun `the most recent watch comes first and never watched sinks`() {
        val sorted = FavouriteWatchOrder.sort(
            items = listOf("Old", "Fresh", "Idle"),
            lastWatchedMillis = {
                when (it) {
                    "Fresh" -> 90L
                    "Old" -> 10L
                    else -> 0L
                }
            },
            name = { it },
        )
        assertThat(sorted).containsExactly("Fresh", "Old", "Idle").inOrder()
    }

    @Test
    fun `equal watch times fall back to the name`() {
        val sorted = FavouriteWatchOrder.sort(
            items = listOf("Zed", "Amy"),
            lastWatchedMillis = { 5L },
            name = { it },
        )
        assertThat(sorted).containsExactly("Amy", "Zed").inOrder()
    }
}
