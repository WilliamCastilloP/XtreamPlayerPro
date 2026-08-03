-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "streamId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "itemId"),
    CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Continue" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "streamId" TEXT NOT NULL,
    "seriesId" TEXT,
    "season" INTEGER,
    "episode" INTEGER,
    "extension" TEXT,
    "position" REAL,
    "duration" REAL,
    "audioTrack" INTEGER,
    "subtitleTrack" INTEGER,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "itemId"),
    CONSTRAINT "Continue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Preference" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "locale" TEXT NOT NULL DEFAULT 'es',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE INDEX "Continue_userId_idx" ON "Continue"("userId");
