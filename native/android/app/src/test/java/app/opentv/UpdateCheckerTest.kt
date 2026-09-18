/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.update.UpdateChecker
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class UpdateCheckerTest {

    @Test
    fun `android-v tag is newer than the matching dotted versionName`() {
        assertThat(UpdateChecker.isNewer("android-v0.13.0", "0.12.0")).isTrue()
        assertThat(UpdateChecker.isNewer("android-v0.12.0", "0.12.0")).isFalse()
        assertThat(UpdateChecker.isNewer("android-v0.12.0", "0.13.0")).isFalse()
    }

    @Test
    fun `plain v-prefix tags still compare`() {
        assertThat(UpdateChecker.isNewer("v0.13.0", "0.12.0")).isTrue()
        assertThat(UpdateChecker.isNewer("v0.12.0", "0.12.0")).isFalse()
    }
}
