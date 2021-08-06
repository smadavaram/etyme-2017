jQuery(function () {
  $(".chat-content-scroll").data("ajaxready", true);
  $(".chat-content-scroll").on("scroll", function (e) {
    checkForScrollEvent($(this));
  });
  $(".company-conversation-scorll").data("ajaxready", true);
  $(".company-conversation-scorll").on("scroll", function (e) {
    checkForConScrollEvent($(this));
  });
});

$("#conversation-users-search").on("keydown", function () {
  $("#company-conversation-list").html("");
});

listenForScrollEvent = function (el) {
  el.on("scroll", function () {
    checkForScrollEvent($(this));
  });
};

checkForScrollEvent = function (el) {
  var more_users_url;
  more_users_url = void 0;
  if ($(".chat-content-scroll").data("ajaxready") === false) {
    return;
  }
  more_users_url = $(
    "#all-infinite-scrolling-msg .pagination a[rel=next]"
  ).attr("href");
  if (more_users_url && el.scrollTop() === 0) {
    $("#loading").removeClass("hidden");
    $(".chat-content-scroll").data("ajaxready", false);
    $.getScript(more_users_url + "&prev_date=" + $("#prev_date").val());
  }
};

checkForConScrollEvent = function (el) {
  var more_users_url;
  more_users_url = void 0;
  if ($(".company-conversation-scorll").data("ajaxready") === false) {
    return;
  }
  more_users_url = $(
    "#all-infinite-scrolling-con .pagination a[rel=next]"
  ).attr("href");
  var requestable_height =
    $(".company-conversation-scorll")[0].scrollHeight -
    $(".company-conversation-scorll").height() -
    el.scrollTop();
  if (more_users_url && requestable_height === 0) {
    $("#loading").removeClass("hidden");
    $(".company-conversation-scorll").data("ajaxready", false);
    console.log(more_users_url);
    $.getScript(more_users_url);
  }
};
