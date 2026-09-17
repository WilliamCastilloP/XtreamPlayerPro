/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * A deliberately dark, low-chroma palette.
 *
 * This is a living-room app: it is looked at in a dark room, from three metres away, often
 * for hours. Bright surfaces and saturated accents that read well on a phone in daylight are
 * actively unpleasant on a 55" panel at night, so everything here is anchored near-black with
 * a single restrained accent used only for focus and selection.
 */
private val Accent = Color(0xFF2EE6A6)
private val AccentDim = Color(0xFF0D9F6E)

private val DarkScheme = darkColorScheme(
    primary = Accent,
    onPrimary = Color(0xFF0B0F14),
    primaryContainer = AccentDim,
    onPrimaryContainer = Color(0xFFEEF3F8),
    secondary = Color(0xFF8B9AAB),
    background = Color(0xFF0B0F14),
    onBackground = Color(0xFFEEF3F8),
    surface = Color(0xFF121820),
    onSurface = Color(0xFFEEF3F8),
    surfaceVariant = Color(0xFF1A222D),
    onSurfaceVariant = Color(0xFF8B9AAB),
    outline = Color(0xFF243040),
    error = Color(0xFFFF6B7A),
    onError = Color(0xFF1A0505),
)

/**
 * Light mode for anyone who wants it. By default TV boxes stay dark (a white living-room
 * screen at night is nobody's friend) — that default lives at the call site, so a user who
 * explicitly picks Light in settings gets it on any device.
 */
private val LightScheme = lightColorScheme(
    primary = Color(0xFF0D9F6E),
    onPrimary = Color.White,
    background = Color(0xFFF3F6F9),
    onBackground = Color(0xFF0B0F14),
    surface = Color.White,
    onSurface = Color(0xFF0B0F14),
    surfaceVariant = Color(0xFFEEF3F8),
    onSurfaceVariant = Color(0xFF5A6B7D),
    outline = Color(0xFFD3D7E2),
)

/** Scaled up from the Material defaults: ten-foot viewing needs bigger text than a phone. */
private val OpenTvTypography = Typography(
    displaySmall = TextStyle(fontSize = 34.sp, fontWeight = FontWeight.SemiBold),
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.SemiBold),
    headlineSmall = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Medium),
    titleMedium = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.Medium),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun OpenTvTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        typography = OpenTvTypography,
        content = content,
    )
}
