/*
 * This file is part of OpenTV.
 * Copyright (C) 2026 The OpenTV Contributors
 * Licensed under the GNU General Public License v3.0 or later.
 */
package app.opentv.data.parser

import app.opentv.data.model.Series

/**
 * How a series shelf is ordered.
 *
 * The release year is the newer of the premiere and a later season. 2026 comes before 2025.
 * Inside one year, a show that premiered that year comes before an older show that only reached
 * it with new episodes. The badge does not move a 2025 season ahead of a 2026 premiere.
 * [Series.addedMillis] only breaks a tie. It is the panel's last edit, not a release date.
 *
 * The same order is inlined in the series SQL queries. Keep those in step with [COMPARATOR].
 */
object SeriesReleaseOrder {
    val COMPARATOR: Comparator<Series> = compareByDescending<Series> { it.listedYear ?: 0 }
        .thenBy { it.hasNewEpisodes }
        .thenByDescending { it.addedMillis }
        .thenBy { it.name.lowercase() }
}
