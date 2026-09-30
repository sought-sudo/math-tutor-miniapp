// student-web/js/rewards.js — 星星、连续打卡、徽章（localStorage，零依赖）
// 星星：做对 +1，变形题成功 +2；打卡：每天练习一次记一天；徽章四枚
(function () {
  'use strict';

  var KEY_STARS = 'stu_stars';
  var KEY_DAYS = 'stu_star_days';
  var KEY_BADGES = 'stu_badges';
  var KEY_STREAK = 'stu_streak';

  function get(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v === null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  }
  function set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function yesterdayStr() {
    var y = new Date();
    y.setDate(y.getDate() - 1);
    return y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
  }

  var BADGES = {
    first_win: { name: '首战告捷', desc: '第一次做对题目', icon: '🎯' },
    wrong_clear: { name: '错题清零', desc: '错题本全部复习完', icon: '🧹' },
    variant_hero: { name: '变形题勇士', desc: '挑战变形题成功', icon: '🧩' },
    streak_3: { name: '坚持之星', desc: '连续练习 3 天', icon: '🔥' }
  };

  var onBadgeCb = null;

  function stars() { return get(KEY_STARS, 0); }
  function badges() { return get(KEY_BADGES, []); }

  function streak() {
    var s = get(KEY_STREAK, { count: 0, last: '' });
    if (s.last === today() || s.last === yesterdayStr()) return s.count;
    return 0;
  }

  function addStars(n) {
    set(KEY_STARS, stars() + n);
    var days = get(KEY_DAYS, {});
    days[today()] = (days[today()] || 0) + n;
    set(KEY_DAYS, days);
    checkBadges();
  }

  // 每日练习打卡：连续天数 +1（断档则重置）
  function checkIn() {
    var s = get(KEY_STREAK, { count: 0, last: '' });
    if (s.last === today()) return s.count;
    s.count = s.last === yesterdayStr() ? s.count + 1 : 1;
    s.last = today();
    set(KEY_STREAK, s);
    checkBadges();
    return s.count;
  }

  function unlock(id) {
    var b = badges();
    if (b.indexOf(id) > -1) return false;
    b.push(id);
    set(KEY_BADGES, b);
    if (onBadgeCb && BADGES[id]) onBadgeCb(BADGES[id]);
    return true;
  }

  function checkBadges() {
    if (stars() >= 1) unlock('first_win');
    if (streak() >= 3) unlock('streak_3');
  }

  window.Rewards = {
    stars: stars,
    streak: streak,
    badges: badges,
    addStars: addStars,
    checkIn: checkIn,
    unlock: unlock,
    checkBadges: checkBadges,
    BADGES: BADGES,
    onBadge: function (cb) { onBadgeCb = cb; }
  };
})();
