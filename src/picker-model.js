const ADULT_RATING_PATTERN = /^(mature|adult|adultonly|18\+|r18)$/i;
const PG13_RATING_PATTERN = /^(pg13|pg-13|pg ?13|questionable)$/i;

function isUploadedWallpaper(w) {
  return Boolean(w && w.id && w.id.indexOf("up-") === 0);
}

function isDirWallpaper(w) {
  return Boolean(w && w.id && w.id.indexOf("up-dir-") === 0);
}

function ratingOf(w) {
  const rating = typeof w.contentrating === "string" ? w.contentrating.trim() : "";

  if (!rating) return isUploadedWallpaper(w) ? "everyone" : "unrated";
  if (/^(everyone|general|g)$/i.test(rating)) return "everyone";
  if (PG13_RATING_PATTERN.test(rating)) return "pg13";
  if (ADULT_RATING_PATTERN.test(rating)) return "mature";
  return "unrated";
}

function matchesRatingFilter(w, filter) {
  if (filter === "all") return true;
  return ratingOf(w) === filter;
}

function matchesTypeFilter(w, filter) {
  if (filter === "all") return true;
  return w.type === filter;
}

function isPlayableType(w) {

  if (!w) return false;
  if (w.playable && (w.type === "video" || w.type === "web" || w.type === "image")) return true;
  return w.type === "scene" && Boolean(w.frameUrl);
}

function isRotatableWallpaper(w, ratingFilter, typeFilter) {
  return isPlayableType(w) && matchesRatingFilter(w, ratingFilter) && matchesTypeFilter(w, typeFilter);
}

function keepPlayingWallpaper(w, ratingFilter) {
  return Boolean(w) && isPlayableType(w) && matchesRatingFilter(w, ratingFilter);
}

function isHiddenWallpaper(id, hiddenIds) {
  return Boolean(id) && hiddenIds.includes(id);
}

const PICKER_PAGE_SIZE = 24;

function pageSlice(list, page) {
  const pages = Math.max(1, Math.ceil(list.length / PICKER_PAGE_SIZE));
  const p = Math.min(Math.max(0, page | 0), pages - 1);
  return { items: list.slice(p * PICKER_PAGE_SIZE, (p + 1) * PICKER_PAGE_SIZE), page: p, pages };
}

function playableWallpapers(wallpapers, ratingFilter, typeFilter, hiddenIds) {
  return wallpapers.filter(
    (w) => isRotatableWallpaper(w, ratingFilter, typeFilter) && !isHiddenWallpaper(w.id, hiddenIds),
  );
}

function hiddenWallpapers(wallpapers, hiddenIds) {
  return wallpapers.filter((w) => isHiddenWallpaper(w.id, hiddenIds));
}

function pickerModel(input) {
  const list = input.wallpapers || [];
  const hiddenIds = input.hiddenIds || [];
  const ratingFilter = input.ratingFilter;
  const typeFilter = input.typeFilter;

  const query = (input.search || "").trim().toLowerCase();

  const playableList = list.filter((w) =>
    isRotatableWallpaper(w, ratingFilter, typeFilter) && !isHiddenWallpaper(w.id, hiddenIds)
    && (!query || String(w.title || "").toLowerCase().indexOf(query) !== -1));

  const basePlayable = list.filter((w) => isPlayableType(w) && !isHiddenWallpaper(w.id, hiddenIds));

  const ratingCounts = { everyone: 0, pg13: 0, mature: 0, unrated: 0 };
  const typeCounts = { video: 0, web: 0, image: 0, scene: 0 };
  for (const w of basePlayable) {
    const r = ratingOf(w);
    ratingCounts[r] = (ratingCounts[r] || 0) + 1;
    typeCounts[w.type] = (typeCounts[w.type] || 0) + 1;
  }
  const editorList = playableWallpapers(list, ratingFilter, typeFilter, hiddenIds);
  const hiddenList = hiddenWallpapers(list, hiddenIds);
  return {
    query,
    playableList,
    basePlayable,
    ratingCounts,
    typeCounts,
    editorList,
    hiddenList,
    normalPage: pageSlice(playableList, input.page),
    hiddenPageView: pageSlice(hiddenList, input.hiddenPage),
    editorPageView: pageSlice(editorList, input.editorPage),
  };
}

export {
  isUploadedWallpaper,
  isDirWallpaper,
  ratingOf,
  matchesRatingFilter,
  matchesTypeFilter,
  isPlayableType,
  isRotatableWallpaper,
  keepPlayingWallpaper,
  isHiddenWallpaper,
  PICKER_PAGE_SIZE,
  pageSlice,
  playableWallpapers,
  pickerModel,
};
