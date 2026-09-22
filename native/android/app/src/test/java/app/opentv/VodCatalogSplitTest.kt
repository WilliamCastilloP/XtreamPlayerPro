/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.repo.HOME_FEED_SAMPLE
import app.opentv.ui.VodBrowse
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VodCatalogSplitTest {

    @Test
    fun `home shelves never scan the whole 40k table`() {
        assertThat(HOME_FEED_SAMPLE).isAtMost(2_000)
        assertThat(HOME_FEED_SAMPLE).isAtLeast(200)
    }

    @Test
    fun `browse destinations are distinct so Back can restore a category`() {
        val home = VodBrowse.Home
        val favs = VodBrowse.Favourites
        val action = VodBrowse.Category("action")
        val comedy = VodBrowse.Category("comedy")
        assertThat(home).isNotEqualTo(favs)
        assertThat(action).isNotEqualTo(comedy)
        assertThat(action).isEqualTo(VodBrowse.Category("action"))
    }
}
