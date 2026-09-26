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
 * Guards the Fire Stick rebrand. 0.12.0 hardcoded "OpenTV" in the nav rail and shipped only
 * an adaptive XML launcher — Fire OS kept showing the upstream TV-set. These files are what
 * the Apps row and the rail actually read.
 */
class XtreamBrandingTest {

    private val res = File("src/main/res")
    private val main = File("src/main/java")

    @Test
    fun appNameIsXtreamInDefaultAndSpanish() {
        for (name in listOf("values/strings.xml", "values-es/strings.xml")) {
            val text = File(res, name).readText()
            assertThat(text).contains("<string name=\"app_name\">XTREAM</string>")
            assertThat(text).doesNotContain("<string name=\"app_name\">OpenTV</string>")
        }
    }

    @Test
    fun fireTvLauncherPngsAndBannerExist() {
        for (density in listOf("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi")) {
            val icon = File(res, "mipmap-$density/ic_xtream.png")
            assertThat(icon.exists()).isTrue()
            assertThat(icon.length()).isGreaterThan(500)
            assertThat(File(res, "mipmap-$density/ic_xtream_round.png").exists()).isTrue()
        }
        val banner = File(res, "drawable-nodpi/banner.png")
        assertThat(banner.exists()).isTrue()
        assertThat(banner.length()).isGreaterThan(1000)
    }

    @Test
    fun navRailUsesAppNameNotHardcodedOpenTv() {
        val src = File(main, "app/opentv/ui/MainScreen.kt").readText()
        assertThat(src).contains("stringResource(R.string.app_name)")
        assertThat(Regex("""Text\(\s*"OpenTV"""").containsMatchIn(src)).isFalse()
    }
}
