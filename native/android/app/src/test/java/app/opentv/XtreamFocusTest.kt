/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import androidx.compose.ui.graphics.Color
import app.opentv.ui.theme.XtreamFocus
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class XtreamFocusTest {

    @Test
    fun `navigation focus is purple and not the mint selection accent`() {
        val focus = XtreamFocus.fill
        val mint = Color(0xFF2EE6A6)
        assertThat(focus).isNotEqualTo(mint)
        assertThat(focus.blue).isGreaterThan(focus.green)
        assertThat(focus.red).isGreaterThan(0.3f)
        assertThat(XtreamFocus.onFill).isEqualTo(Color.White)
    }
}
