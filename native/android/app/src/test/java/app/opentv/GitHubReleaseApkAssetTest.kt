/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv

import app.opentv.data.remote.GitHubAsset
import app.opentv.data.remote.GitHubRelease
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GitHubReleaseApkAssetTest {

    @Test
    fun `prefers the stable XTREAM apk name used by Downloader`() {
        val release = GitHubRelease(
            assets = listOf(
                GitHubAsset(name = "XTREAM-v0.14.0.apk", browserDownloadUrl = "https://example/tagged.apk"),
                GitHubAsset(name = "XTREAM.apk", browserDownloadUrl = "https://example/XTREAM.apk"),
            ),
        )
        assertThat(release.apkAsset()?.browserDownloadUrl).isEqualTo("https://example/XTREAM.apk")
    }

    @Test
    fun `falls back to any apk when the stable name is missing`() {
        val release = GitHubRelease(
            assets = listOf(
                GitHubAsset(name = "notes.txt", browserDownloadUrl = "https://example/notes"),
                GitHubAsset(name = "XTREAM-android-v0.13.0.apk", browserDownloadUrl = "https://example/old.apk"),
            ),
        )
        assertThat(release.apkAsset()?.name).isEqualTo("XTREAM-android-v0.13.0.apk")
    }
}
