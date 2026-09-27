/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

/**
 * CI used a fresh ~/.android/debug.keystore per job, so 0.16.0 could not overlay 0.15.0.
 * The sideload keystore must stay in the Android project root.
 */
class SideloadKeystoreTest {

    @Test
    fun debugKeystoreIsCheckedInAtTheAndroidRoot() {
        val store = File("../debug.keystore")
        assertThat(store.isFile).isTrue()
        assertThat(store.length()).isGreaterThan(1000)
    }
}
