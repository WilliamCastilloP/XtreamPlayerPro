/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.update

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

/**
 * Thrown when Android O+ has not yet allowed this app to install packages. The UI should send
 * the user to the per-app unknown-sources screen and retry — never ask them to uninstall.
 */
class NeedsUnknownSourcesException : IllegalStateException("unknown-sources")

/**
 * Downloads an update APK and hands it to the system installer.
 *
 * The download lands in the app's own cache (no storage permission, cleaned up by the OS
 * under pressure) and is handed through a [FileProvider] uri — a raw `file://` uri throws
 * `FileUriExposedException` on modern Android. The system then shows its own install screen.
 * That is an **upgrade in place**: same `applicationId`, higher `versionCode`, same signing
 * key. Providers, favourites and watch history stay on the device.
 *
 * Fire TV / Fire OS often ignore `ACTION_INSTALL_PACKAGE`, so we prefer `ACTION_VIEW` with
 * the APK MIME type and grant the uri to every package that can handle it.
 */
class ApkInstaller(private val http: OkHttpClient) {

    /** Progress as a 0f..1f fraction, or -1f when the total size is unknown. */
    fun interface Progress {
        fun onProgress(fraction: Float)
    }

    /**
     * Downloads [url] and launches the installer. Returns true once the installer intent has
     * been fired; throws on a download failure so the caller can show a retry.
     */
    suspend fun downloadAndInstall(
        context: Context,
        url: String,
        expectedBytes: Long,
        progress: Progress,
    ): Boolean {
        ensureCanInstall(context)
        val apk = download(context, url, expectedBytes, progress)
        launchInstaller(context, apk)
        return true
    }

    /**
     * True when this app is allowed to hand an APK to the system installer. Pre-O there is no
     * per-app toggle. On firmwares that lack the API we assume yes and let the installer fail
     * loudly rather than trap the user on a settings screen that does not exist.
     */
    fun canInstall(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        return runCatching { context.packageManager.canRequestPackageInstalls() }.getOrDefault(true)
    }

    /**
     * Opens the per-app "install unknown apps" screen. Returns false when this firmware has
     * no such activity (some Fire OS builds) — the caller should then try the installer anyway.
     */
    fun openUnknownSourcesSettings(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        } catch (_: SecurityException) {
            false
        }
    }

    private fun ensureCanInstall(context: Context) {
        if (canInstall(context)) return
        if (openUnknownSourcesSettings(context)) throw NeedsUnknownSourcesException()
    }

    private suspend fun download(
        context: Context,
        url: String,
        expectedBytes: Long,
        progress: Progress,
    ): File = withContext(Dispatchers.IO) {
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        // A fixed name means each download overwrites the last rather than piling up copies.
        val out = File(dir, "xtream-update.apk")

        val request = Request.Builder().url(url).header("User-Agent", "XTREAM").build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("Download failed: HTTP ${response.code}")
            val bodyStream = response.body?.byteStream() ?: error("Empty download")
            val total = if (expectedBytes > 0) expectedBytes else (response.body?.contentLength() ?: -1L)

            out.outputStream().use { sink ->
                val buffer = ByteArray(64 * 1024)
                var read: Int
                var written = 0L
                while (bodyStream.read(buffer).also { read = it } != -1) {
                    sink.write(buffer, 0, read)
                    written += read
                    progress.onProgress(if (total > 0) (written.toFloat() / total) else -1f)
                }
            }
        }
        out
    }

    private fun launchInstaller(context: Context, apk: File) {
        val uri: Uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apk,
        )
        val mime = "application/vnd.android.package-archive"
        // ACTION_VIEW is what Fire TV's package installer actually answers. INSTALL_PACKAGE is
        // deprecated and often unresolved on Amazon firmware.
        val view = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        grantUriToHandlers(context, view, uri)

        val launched = runCatching { context.startActivity(view) }.isSuccess
        if (launched) return

        val install = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            putExtra(Intent.EXTRA_RETURN_RESULT, false)
        }
        grantUriToHandlers(context, install, uri)
        context.startActivity(install)
    }

    private fun grantUriToHandlers(context: Context, intent: Intent, uri: Uri) {
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
        val matches = context.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        for (resolve in matches) {
            context.grantUriPermission(resolve.activityInfo.packageName, uri, flags)
        }
    }
}
