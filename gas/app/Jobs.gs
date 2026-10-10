/**
 * 시간 트리거로 도는 일(기획서 5장 guard, 6-1 운영).
 */

var BACKUP_FOLDER = '한 아이 곁에 다섯 사람 백업';
var BACKUP_KEEP = 8;
var GUARD_KEEP_DAYS = 30;

/** 시트 사본을 백업 폴더에 만들고 최근 8개만 남긴다(나머지는 휴지통으로). */
function weeklyBackup() {
  var ss = ss_();
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(BACKUP_FOLDER);
  DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + ' 백업 ' + kstDate_(), folder);
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(BACKUP_KEEP).forEach(function (f) { f.setTrashed(true); });
  Logger.log('백업 끝. 보관 %s개', Math.min(files.length, BACKUP_KEEP));
}

/** 30일 지난 guard 행을 정리한다. 한 줄씩 지우지 않고 남길 행만 골라 한 번에 다시 쓴다. */
function dailyGuardCleanup() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var cut = kstDate_(new Date(Date.now() - GUARD_KEEP_DAYS * 86400000));
    var rows = table_('guard');
    var keep = rows.filter(function (g) { return g.date >= cut; });
    if (keep.length !== rows.length) rewriteTable_('guard', keep);
    Logger.log('guard 정리: %s행 중 %s행 남김', rows.length, keep.length);
  } finally {
    lock.releaseLock();
  }
}
