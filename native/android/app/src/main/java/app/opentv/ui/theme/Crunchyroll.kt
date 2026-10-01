/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Orange-on-black shelf used only by the anime tab, its detail pages, and its player chrome.
 * Live TV, Movies and Shows keep [XtreamFocus] and the mint accent.
 *
 * Orange `#F47521`, near-black `#141519` and card `#23252B` are the public dark-orange palette
 * associated with that kind of anime app. This is a colour theme, not their name or logo.
 */
object CrunchyrollColors {
    val orange = Color(0xFFF47521)
    val black = Color(0xFF000000)
    val surface = Color(0xFF141519)
    val card = Color(0xFF23252B)
    val ring = Color(0xFFFFC29A)
}

data class ShelfChrome(
    val iconOnly: Boolean,
    val focusFill: Color,
    val onFocus: Color,
    val focusRing: Color,
)

val LocalShelfChrome = staticCompositionLocalOf {
    ShelfChrome(
        iconOnly = false,
        focusFill = XtreamFocus.fill,
        onFocus = XtreamFocus.onFill,
        focusRing = XtreamFocus.ring,
    )
}

private val CrunchyrollScheme = darkColorScheme(
    primary = CrunchyrollColors.orange,
    onPrimary = Color.White,
    primaryContainer = CrunchyrollColors.orange,
    onPrimaryContainer = Color.White,
    secondary = CrunchyrollColors.orange,
    background = CrunchyrollColors.black,
    onBackground = Color.White,
    surface = CrunchyrollColors.surface,
    onSurface = Color.White,
    surfaceVariant = CrunchyrollColors.card,
    onSurfaceVariant = Color(0xFFDADADA),
    outline = Color(0xFF3A3C41),
)

@Composable
fun CrunchyrollTheme(content: @Composable () -> Unit) {
    val chrome = ShelfChrome(
        iconOnly = true,
        focusFill = CrunchyrollColors.orange,
        onFocus = Color.White,
        focusRing = CrunchyrollColors.ring,
    )
    CompositionLocalProvider(LocalShelfChrome provides chrome) {
        MaterialTheme(
            colorScheme = CrunchyrollScheme,
            typography = MaterialTheme.typography,
            content = content,
        )
    }
}
