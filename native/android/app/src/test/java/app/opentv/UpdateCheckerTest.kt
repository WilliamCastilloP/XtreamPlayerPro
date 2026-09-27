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

    @Test
    fun `v0_14 is newer than both 0_12 and 0_13 so old and new installs upgrade`() {
        assertThat(UpdateChecker.isNewer("v0.14.0", "0.12.0")).isTrue()
        assertThat(UpdateChecker.isNewer("v0.14.0", "0.13.0")).isTrue()
        assertThat(UpdateChecker.isNewer("v0.14.0", "0.14.0")).isFalse()
    }

    @Test
    fun `displayVersion strips android and v prefixes`() {
        assertThat(UpdateChecker.displayVersion("android-v0.14.0")).isEqualTo("0.14.0")
        assertThat(UpdateChecker.displayVersion("v0.14.0")).isEqualTo("0.14.0")
        assertThat(UpdateChecker.displayVersion("0.14.0")).isEqualTo("0.14.0")
    }
}
